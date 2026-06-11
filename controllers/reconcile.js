const Run = require('../models/Run');
const Transaction = require('../models/Transaction');
const Result = require('../models/Result');
const { ingestCsv } = require('../services/ingestion');
const { runMatchingEngine } = require('../services/matching');
const config = require('../config/config');
const path = require('path');

// Helper to escape CSV cell values
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let stringified = String(val);
  if (stringified.includes(',') || stringified.includes('\n') || stringified.includes('"')) {
    stringified = stringified.replace(/"/g, '""');
    return `"${stringified}"`;
  }
  return stringified;
}

// Convert populated Result documents into CSV format
function convertResultsToCsv(results) {
  const headers = [
    'category',
    'reason',
    'user_transaction_id',
    'user_timestamp',
    'user_type',
    'user_asset',
    'user_quantity',
    'user_price_usd',
    'user_fee',
    'user_note',
    'exchange_transaction_id',
    'exchange_timestamp',
    'exchange_type',
    'exchange_asset',
    'exchange_quantity',
    'exchange_price_usd',
    'exchange_fee',
    'exchange_note'
  ];

  const csvRows = [headers.join(',')];

  for (const r of results) {
    const user = r.userTransaction || {};
    const ex = r.exchangeTransaction || {};

    const userTime = user.rawTimestamp || (user.parsedTimestamp ? user.parsedTimestamp.toISOString() : '');
    const exTime = ex.rawTimestamp || (ex.parsedTimestamp ? ex.parsedTimestamp.toISOString() : '');

    const row = [
      r.category,
      r.reason,
      user.transactionId || '',
      userTime,
      user.rawType || user.parsedType || '',
      user.rawAsset || user.parsedAsset || '',
      user.rawQuantity || user.parsedQuantity || '',
      user.rawPriceUsd || user.parsedPriceUsd || '',
      user.rawFee || user.parsedFee || '',
      user.note || '',
      ex.transactionId || '',
      exTime,
      ex.rawType || ex.parsedType || '',
      ex.rawAsset || ex.parsedAsset || '',
      ex.rawQuantity || ex.parsedQuantity || '',
      ex.rawPriceUsd || ex.parsedPriceUsd || '',
      ex.rawFee || ex.parsedFee || '',
      ex.note || ''
    ];

    csvRows.push(row.map(escapeCsvValue).join(','));
  }

  return csvRows.join('\n');
}

/**
 * Trigger reconciliation run
 */
async function reconcile(req, res) {
  let run;
  try {
    const {
      timestampToleranceSeconds,
      quantityTolerancePct,
      proximityWindowSeconds,
      userCsvPath,
      exchangeCsvPath
    } = req.body;

    // Resolve CSV paths, defaulting to the files in project directory
    const resolvedUserPath = userCsvPath 
      ? path.resolve(userCsvPath) 
      : path.join(__dirname, '../user_transactions.csv');
    const resolvedExchangePath = exchangeCsvPath 
      ? path.resolve(exchangeCsvPath) 
      : path.join(__dirname, '../exchange_transactions.csv');

    // Create a new run record in DB
    run = new Run({
      status: 'running',
      config: {
        timestampToleranceSeconds: timestampToleranceSeconds !== undefined 
          ? parseInt(timestampToleranceSeconds, 10) 
          : config.defaults.timestampToleranceSeconds,
        quantityTolerancePct: quantityTolerancePct !== undefined 
          ? parseFloat(quantityTolerancePct) 
          : config.defaults.quantityTolerancePct,
        proximityWindowSeconds: proximityWindowSeconds !== undefined 
          ? parseInt(proximityWindowSeconds, 10) 
          : config.defaults.proximityWindowSeconds
      }
    });
    await run.save();

    console.log(`Starting run ID: ${run._id}`);
    console.log(`Ingesting User CSV: ${resolvedUserPath}`);
    console.log(`Ingesting Exchange CSV: ${resolvedExchangePath}`);

    // Ingest User Transactions
    const userSummary = await ingestCsv(run._id, 'user', resolvedUserPath);
    console.log(`User ingestion complete:`, userSummary);

    // Ingest Exchange Transactions
    const exchangeSummary = await ingestCsv(run._id, 'exchange', resolvedExchangePath);
    console.log(`Exchange ingestion complete:`, exchangeSummary);

    // Run Matching engine
    const matchSummary = await runMatchingEngine(run._id, run.config);
    console.log(`Matching engine complete. Summary:`, matchSummary);

    // Fetch the updated run record
    const completedRun = await Run.findById(run._id);

    return res.status(200).json({
      message: 'Reconciliation run completed successfully',
      run: completedRun
    });

  } catch (err) {
    console.error('Error running reconciliation:', err);
    if (run) {
      run.status = 'failed';
      run.errorMessage = err.message;
      await run.save().catch(saveErr => console.error('Failed to update run status to failed:', saveErr));
    }
    return res.status(500).json({
      error: 'Reconciliation run failed',
      details: err.message
    });
  }
}

/**
 * Fetch the full reconciliation report for a run
 */
async function getReport(req, res) {
  try {
    const { runId } = req.params;
    const { format } = req.query;

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: `Reconciliation run not found for ID: ${runId}` });
    }

    const results = await Result.find({ runId })
      .populate('userTransaction')
      .populate('exchangeTransaction')
      .exec();

    // Check if client requested CSV format (either via query parameter or Accept header)
    const isCsvRequested = format === 'csv' || req.headers['accept'] === 'text/csv';

    if (isCsvRequested) {
      const csvString = convertResultsToCsv(results);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=reconciliation_report_${runId}.csv`);
      return res.status(200).send(csvString);
    }

    return res.status(200).json({
      runId,
      status: run.status,
      config: run.config,
      summary: run.summary,
      results
    });
  } catch (err) {
    console.error('Error fetching report:', err);
    return res.status(500).json({ error: 'Failed to fetch report', details: err.message });
  }
}

/**
 * Fetch just the summary statistics/counts
 */
async function getSummary(req, res) {
  try {
    const { runId } = req.params;

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: `Reconciliation run not found for ID: ${runId}` });
    }

    return res.status(200).json({
      runId,
      status: run.status,
      config: run.config,
      summary: run.summary,
      createdAt: run.createdAt
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    return res.status(500).json({ error: 'Failed to fetch summary', details: err.message });
  }
}

/**
 * Fetch only unmatched rows (user only, exchange only, and invalid records)
 */
async function getUnmatched(req, res) {
  try {
    const { runId } = req.params;
    const { format } = req.query;

    const run = await Run.findById(runId);
    if (!run) {
      return res.status(404).json({ error: `Reconciliation run not found for ID: ${runId}` });
    }

    const results = await Result.find({ 
      runId, 
      category: { $in: ['unmatched_user', 'unmatched_exchange', 'conflicting'] } 
    })
      .populate('userTransaction')
      .populate('exchangeTransaction')
      .exec();

    const isCsvRequested = format === 'csv' || req.headers['accept'] === 'text/csv';

    if (isCsvRequested) {
      const csvString = convertResultsToCsv(results);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=unmatched_report_${runId}.csv`);
      return res.status(200).send(csvString);
    }

    return res.status(200).json({
      runId,
      status: run.status,
      summary: run.summary,
      unmatchedResults: results
    });
  } catch (err) {
    console.error('Error fetching unmatched report:', err);
    return res.status(500).json({ error: 'Failed to fetch unmatched report', details: err.message });
  }
}

module.exports = {
  reconcile,
  getReport,
  getSummary,
  getUnmatched
};
