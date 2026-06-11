const mongoose = require('mongoose');
const Run = require('./models/Run');
const Transaction = require('./models/Transaction');
const Result = require('./models/Result');
const { ingestCsv } = require('./services/ingestion');
const { runMatchingEngine } = require('./services/matching');
const config = require('./config/config');
const path = require('path');

async function testReconciliation() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('Connected.');

    // Cleanup previous test data
    console.log('Cleaning up old records...');
    await Run.deleteMany({});
    await Transaction.deleteMany({});
    await Result.deleteMany({});

    // Create a new run with default config
    console.log('Creating run...');
    const run = new Run({
      status: 'running',
      config: {
        timestampToleranceSeconds: config.defaults.timestampToleranceSeconds,
        quantityTolerancePct: config.defaults.quantityTolerancePct,
        proximityWindowSeconds: config.defaults.proximityWindowSeconds
      }
    });
    await run.save();
    console.log(`Run created with ID: ${run._id}`);

    // Ingest User Transactions
    const userCsvPath = path.join(__dirname, 'user_transactions.csv');
    console.log(`Ingesting user transactions from: ${userCsvPath}`);
    const userIngest = await ingestCsv(run._id, 'user', userCsvPath);
    console.log('User Ingestion summary:', userIngest);

    // Ingest Exchange Transactions
    const exchangeCsvPath = path.join(__dirname, 'exchange_transactions.csv');
    console.log(`Ingesting exchange transactions from: ${exchangeCsvPath}`);
    const exchangeIngest = await ingestCsv(run._id, 'exchange', exchangeCsvPath);
    console.log('Exchange Ingestion summary:', exchangeIngest);

    // Run Matching Engine
    console.log('Running matching engine...');
    const matchSummary = await runMatchingEngine(run._id, run.config);
    console.log('Matching complete. Summary:', matchSummary);

    // Verify key test results
    console.log('\n--- VERIFYING KEY TEST CASES ---');
    
    const results = await Result.find({ runId: run._id })
      .populate('userTransaction')
      .populate('exchangeTransaction');

    console.log(`Total results in DB: ${results.length}`);

    // 1. Verify USR-001 (Match)
    const res001 = results.find(r => r.userTransaction && r.userTransaction.transactionId === 'USR-001' && r.category === 'matched');
    if (res001) {
      console.log(' USR-001: Correctly Matched with', res001.exchangeTransaction.transactionId);
      console.log(`   Reason: ${res001.reason}`);
    } else {
      console.log('USR-001: Expected Matched but not found.');
    }

    // 2. Verify USR-005 (bitcoin -> BTC Alias Match)
    const res005 = results.find(r => r.userTransaction && r.userTransaction.transactionId === 'USR-005');
    if (res005 && res005.category === 'matched') {
      console.log(' USR-005 (bitcoin): Correctly Matched with', res005.exchangeTransaction.transactionId, '(Asset alias resolution successful)');
      console.log(`   Reason: ${res005.reason}`);
    } else {
      console.log('USR-005: Expected Matched (alias resolution) but category is:', res005 ? res005.category : 'not found');
    }

    // 3. Verify USR-012 (Conflicting quantity: 0.3 vs 0.3001)
    const res012 = results.find(r => r.userTransaction && r.userTransaction.transactionId === 'USR-012');
    if (res012 && res012.category === 'conflicting') {
      console.log(' USR-012: Correctly Flagged as Conflicting with', res012.exchangeTransaction.transactionId, '(Quantity difference exceeds tolerance)');
      console.log(`   Reason: ${res012.reason}`);
    } else {
      console.log(' USR-012: Expected Conflicting but category is:', res012 ? res012.category : 'not found');
    }

    // 4. Verify USR-018, USR-019, USR-024 (Invalid User rows unmatched with errors)
    const invalidIds = ['USR-018', 'USR-019', 'USR-024'];
    for (const id of invalidIds) {
      const resInvalid = results.find(r => r.userTransaction && r.userTransaction.transactionId === id);
      if (resInvalid && resInvalid.category === 'unmatched_user') {
        console.log(` ${id}: Correctly Flagged as Unmatched User with reason:`);
        console.log(`   Reason: ${resInvalid.reason}`);
      } else {
        console.log(` ${id}: Expected Unmatched User due to validation failure but category is:`, resInvalid ? resInvalid.category : 'not found');
      }
    }

    // 5. Verify Unmatched Exchange rows (EXC-1024, EXC-1025)
    const unmatchedExIds = ['EXC-1024', 'EXC-1025'];
    for (const id of unmatchedExIds) {
      const resEx = results.find(r => r.exchangeTransaction && r.exchangeTransaction.transactionId === id);
      if (resEx && resEx.category === 'unmatched_exchange') {
        console.log(` ${id}: Correctly Flagged as Unmatched Exchange.`);
        console.log(`   Reason: ${resEx.reason}`);
      } else {
        console.log(` ${id}: Expected Unmatched Exchange but category is:`, resEx ? resEx.category : 'not found');
      }
    }

    console.log('\n--- VERIFICATION COMPLETE ---');

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

testReconciliation();
