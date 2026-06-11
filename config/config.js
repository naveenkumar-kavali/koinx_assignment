require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reconciliation',
  defaults: {
    timestampToleranceSeconds: parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS, 10) || 300,
    quantityTolerancePct: parseFloat(process.env.QUANTITY_TOLERANCE_PCT) || 0.01,
    proximityWindowSeconds: parseInt(process.env.PROXIMITY_WINDOW_SECONDS, 10) || 86400 // 24 hours
  }
};
