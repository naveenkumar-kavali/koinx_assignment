const Transaction = require('../models/Transaction');
const Result = require('../models/Result');
const Run = require('../models/Run');

const TYPE_EQUIVALENTS = {
  'BUY': 'BUY',
  'SELL': 'SELL',
  'TRANSFER_OUT': 'TRANSFER_IN',
  'TRANSFER_IN': 'TRANSFER_OUT'
};

function getEquivalentExchangeType(userType) {
  return TYPE_EQUIVALENTS[userType] || userType;
}

/**
 * Executes the reconciliation matching logic for a specific run.
 * @param {string} runId - Mongoose ObjectId string representing the Run.
 * @param {object} tolerances - { timestampToleranceSeconds, quantityTolerancePct, proximityWindowSeconds }
 */
async function runMatchingEngine(runId, tolerances) {
  const { timestampToleranceSeconds, quantityTolerancePct, proximityWindowSeconds } = tolerances;

  // 1. Fetch valid transactions
  const userTxs = await Transaction.find({ runId, source: 'user', isValid: true }).sort({ parsedTimestamp: 1 }).lean();
  const exchangeTxs = await Transaction.find({ runId, source: 'exchange', isValid: true }).sort({ parsedTimestamp: 1 }).lean();

  // 2. Fetch invalid transactions to log them as unmatched
  const invalidUserTxs = await Transaction.find({ runId, source: 'user', isValid: false }).lean();
  const invalidExchangeTxs = await Transaction.find({ runId, source: 'exchange', isValid: false }).lean();

  const matchedUserIds = new Set();
  const matchedExchangeIds = new Set();
  const resultsToInsert = [];

  // 3. Match user transactions chronologically
  for (const userTx of userTxs) {
    const equivalentType = getEquivalentExchangeType(userTx.parsedType);
    
    // Find unmatched candidates from exchange matching the same asset and type
    const candidates = exchangeTxs.filter(exTx => 
      exTx.parsedAsset === userTx.parsedAsset &&
      exTx.parsedType === equivalentType &&
      !matchedExchangeIds.has(exTx._id.toString())
    );

    if (candidates.length === 0) {
      // No exchange transaction found for this user transaction
      resultsToInsert.push({
        runId,
        category: 'unmatched_user',
        userTransaction: userTx._id,
        exchangeTransaction: null,
        reason: `No unmatched exchange transaction found for asset "${userTx.parsedAsset}" and type "${userTx.parsedType}" within proximity window.`
      });
      continue;
    }

    // Evaluate candidates to find the best match
    let bestStrictMatch = null;
    let minStrictTimeDiff = Infinity;

    let bestProximityMatch = null;
    let minProximityTimeDiff = Infinity;

    for (const exTx of candidates) {
      const timeDiffSeconds = Math.abs(userTx.parsedTimestamp.getTime() - exTx.parsedTimestamp.getTime()) / 1000;
      const qtyDiffPct = (Math.abs(userTx.parsedQuantity - exTx.parsedQuantity) / userTx.parsedQuantity) * 100;

      const isTimeWithinTolerance = timeDiffSeconds <= timestampToleranceSeconds;
      const isQtyWithinTolerance = qtyDiffPct <= quantityTolerancePct;

      if (isTimeWithinTolerance && isQtyWithinTolerance) {
        // Strict Match candidate
        if (timeDiffSeconds < minStrictTimeDiff) {
          minStrictTimeDiff = timeDiffSeconds;
          bestStrictMatch = { exTx, timeDiffSeconds, qtyDiffPct };
        }
      } else if (timeDiffSeconds <= proximityWindowSeconds) {
        // Proximity Match candidate (potential conflict)
        if (timeDiffSeconds < minProximityTimeDiff) {
          minProximityTimeDiff = timeDiffSeconds;
          bestProximityMatch = { exTx, timeDiffSeconds, qtyDiffPct, isTimeWithinTolerance, isQtyWithinTolerance };
        }
      }
    }

    if (bestStrictMatch) {
      // Perfect match found
      const { exTx, timeDiffSeconds, qtyDiffPct } = bestStrictMatch;
      matchedUserIds.add(userTx._id.toString());
      matchedExchangeIds.add(exTx._id.toString());

      resultsToInsert.push({
        runId,
        category: 'matched',
        userTransaction: userTx._id,
        exchangeTransaction: exTx._id,
        reason: `Matched successfully: Timestamp difference is ${timeDiffSeconds}s (tolerance: ${timestampToleranceSeconds}s), Quantity difference is ${qtyDiffPct.toFixed(4)}% (tolerance: ${quantityTolerancePct}%).`
      });
    } else if (bestProximityMatch) {
      // Conflicting match found
      const { exTx, timeDiffSeconds, qtyDiffPct, isTimeWithinTolerance, isQtyWithinTolerance } = bestProximityMatch;
      matchedUserIds.add(userTx._id.toString());
      matchedExchangeIds.add(exTx._id.toString());

      const reasons = [];
      if (!isTimeWithinTolerance) {
        reasons.push(`timestamp difference of ${timeDiffSeconds}s exceeds tolerance of ${timestampToleranceSeconds}s`);
      }
      if (!isQtyWithinTolerance) {
        reasons.push(`quantity difference of ${qtyDiffPct.toFixed(4)}% (User: ${userTx.parsedQuantity}, Exchange: ${exTx.parsedQuantity}) exceeds tolerance of ${quantityTolerancePct}%`);
      }

      resultsToInsert.push({
        runId,
        category: 'conflicting',
        userTransaction: userTx._id,
        exchangeTransaction: exTx._id,
        reason: `Conflict detected: ${reasons.join(' and ')}.`
      });
    } else {
      // Candidates exist, but none are within the proximity window
      resultsToInsert.push({
        runId,
        category: 'unmatched_user',
        userTransaction: userTx._id,
        exchangeTransaction: null,
        reason: `Candidate exchange transactions found, but all exceed the proximity window of ${proximityWindowSeconds}s.`
      });
    }
  }

  // 4. Any valid exchange transactions that are still unmatched
  for (const exTx of exchangeTxs) {
    if (!matchedExchangeIds.has(exTx._id.toString())) {
      resultsToInsert.push({
        runId,
        category: 'unmatched_exchange',
        userTransaction: null,
        exchangeTransaction: exTx._id,
        reason: `No matching user transaction found for asset "${exTx.parsedAsset}" and type "${exTx.parsedType}" in the user dataset.`
      });
    }
  }

  // 5. Log invalid user transactions
  for (const userTx of invalidUserTxs) {
    resultsToInsert.push({
      runId,
      category: 'unmatched_user',
      userTransaction: userTx._id,
      exchangeTransaction: null,
      reason: `Ingestion failed: ${userTx.validationErrors.join('; ')}`
    });
  }

  // 6. Log invalid exchange transactions
  for (const exTx of invalidExchangeTxs) {
    resultsToInsert.push({
      runId,
      category: 'unmatched_exchange',
      userTransaction: null,
      exchangeTransaction: exTx._id,
      reason: `Ingestion failed: ${exTx.validationErrors.join('; ')}`
    });
  }

  // 7. Write Results to DB
  if (resultsToInsert.length > 0) {
    await Result.insertMany(resultsToInsert);
  }

  // 8. Bulk update all matched Transactions
  const allMatchedIds = [...matchedUserIds, ...matchedExchangeIds];
  if (allMatchedIds.length > 0) {
    await Transaction.updateMany(
      { _id: { $in: allMatchedIds } },
      { $set: { isMatched: true } }
    );
  }

  // 9. Compile summary counts
  const summary = {
    matchedCount: resultsToInsert.filter(r => r.category === 'matched').length,
    conflictingCount: resultsToInsert.filter(r => r.category === 'conflicting').length,
    unmatchedUserCount: resultsToInsert.filter(r => r.category === 'unmatched_user').length,
    unmatchedExchangeCount: resultsToInsert.filter(r => r.category === 'unmatched_exchange').length,
    invalidUserCount: invalidUserTxs.length,
    invalidExchangeCount: invalidExchangeTxs.length
  };

  // 10. Update the Run document
  await Run.findByIdAndUpdate(runId, {
    status: 'completed',
    summary
  });

  return summary;
}

module.exports = {
  runMatchingEngine
};
