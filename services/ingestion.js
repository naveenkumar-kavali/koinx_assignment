const fs = require('fs');
const csvParser = require('csv-parser');
const Transaction = require('../models/Transaction');

const ASSET_ALIASES = {
  'bitcoin': 'BTC',
  'btc': 'BTC',
  'ethereum': 'ETH',
  'eth': 'ETH',
  'tether': 'USDT',
  'usdt': 'USDT',
  'solana': 'SOL',
  'sol': 'SOL',
  'polygon': 'MATIC',
  'matic': 'MATIC',
  'chainlink': 'LINK',
  'link': 'LINK'
};

function canonicalizeAsset(assetStr) {
  if (!assetStr) return null;
  const lower = assetStr.trim().toLowerCase();
  if (ASSET_ALIASES[lower]) {
    return ASSET_ALIASES[lower];
  }
  return assetStr.toUpperCase().trim();
}

function normalizeType(typeStr) {
  if (!typeStr) return null;
  return typeStr.trim().toUpperCase();
}

/**
 * Ingests a CSV file and stores transactions in the database.
 * @param {string} runId - Mongoose ObjectId string representing the Run.
 * @param {string} source - 'user' or 'exchange'.
 * @param {string} filePath - Path to the CSV file on disk.
 * @returns {Promise<{total: number, valid: number, invalid: number}>}
 */
async function ingestCsv(runId, source, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at path: ${filePath}`);
  }

  const transactions = [];
  let totalCount = 0;
  let validCount = 0;
  let invalidCount = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
      .on('data', (row) => {
        totalCount++;
        const validationErrors = [];
        
        // Raw data extraction
        const transactionId = row.transaction_id || '';
        const rawTimestamp = row.timestamp || '';
        const rawType = row.type || '';
        const rawAsset = row.asset || '';
        const rawQuantity = row.quantity || '';
        const rawPriceUsd = row.price_usd || '';
        const rawFee = row.fee || '';
        const note = row.note || '';

        // 1. Transaction ID validation
        if (!transactionId.trim()) {
          validationErrors.push('Missing transaction_id');
        }

        // 2. Timestamp validation
        let parsedTimestamp = null;
        if (!rawTimestamp.trim()) {
          validationErrors.push('Missing timestamp');
        } else {
          const parsedTime = Date.parse(rawTimestamp.trim());
          if (isNaN(parsedTime)) {
            validationErrors.push(`Malformed timestamp: "${rawTimestamp}"`);
          } else {
            parsedTimestamp = new Date(parsedTime);
          }
        }

        // 3. Type validation
        let parsedType = null;
        if (!rawType.trim()) {
          validationErrors.push('Missing type');
        } else {
          parsedType = normalizeType(rawType);
          const allowedTypes = source === 'user' 
            ? ['BUY', 'SELL', 'TRANSFER_OUT', 'TRANSFER_IN'] 
            : ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'];
          if (!allowedTypes.includes(parsedType)) {
            validationErrors.push(`Invalid type for ${source}: "${rawType}"`);
          }
        }

        // 4. Asset validation
        let parsedAsset = null;
        if (!rawAsset.trim()) {
          validationErrors.push('Missing asset');
        } else {
          parsedAsset = canonicalizeAsset(rawAsset);
        }

        // 5. Quantity validation
        let parsedQuantity = null;
        if (!rawQuantity.trim()) {
          validationErrors.push('Missing quantity');
        } else {
          const parsedQty = parseFloat(rawQuantity);
          if (isNaN(parsedQty)) {
            validationErrors.push(`Malformed quantity (not a number): "${rawQuantity}"`);
          } else if (parsedQty <= 0) {
            validationErrors.push(`Quantity must be a positive number: ${parsedQty}`);
          } else {
            parsedQuantity = parsedQty;
          }
        }

        // 6. Optional Price USD validation
        let parsedPriceUsd = null;
        if (rawPriceUsd.trim()) {
          const parsedPrice = parseFloat(rawPriceUsd);
          if (isNaN(parsedPrice)) {
            validationErrors.push(`Malformed price_usd: "${rawPriceUsd}"`);
          } else {
            parsedPriceUsd = parsedPrice;
          }
        }

        // 7. Optional Fee validation
        let parsedFee = null;
        if (rawFee.trim()) {
          const parsedF = parseFloat(rawFee);
          if (isNaN(parsedF)) {
            validationErrors.push(`Malformed fee: "${rawFee}"`);
          } else {
            parsedFee = parsedF;
          }
        }

        const isValid = validationErrors.length === 0;
        if (isValid) {
          validCount++;
        } else {
          invalidCount++;
        }

        transactions.push({
          runId,
          source,
          transactionId: transactionId.trim(),
          rawTimestamp,
          rawQuantity,
          rawPriceUsd,
          rawFee,
          rawType,
          rawAsset,
          note: note.trim(),
          parsedTimestamp,
          parsedType,
          parsedAsset,
          parsedQuantity,
          parsedPriceUsd,
          parsedFee,
          isValid,
          validationErrors,
          isMatched: false
        });
      })
      .on('end', async () => {
        try {
          if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
          }
          resolve({ total: totalCount, valid: validCount, invalid: invalidCount });
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

module.exports = {
  ingestCsv,
  canonicalizeAsset,
  normalizeType
};
