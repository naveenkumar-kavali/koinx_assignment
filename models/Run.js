const mongoose = require('mongoose');

const RunSchema = new mongoose.Schema({
  status: { 
    type: String, 
    enum: ['running', 'completed', 'failed'], 
    default: 'running' 
  },
  config: {
    timestampToleranceSeconds: { type: Number, required: true },
    quantityTolerancePct: { type: Number, required: true },
    proximityWindowSeconds: { type: Number, required: true }
  },
  summary: {
    matchedCount: { type: Number, default: 0 },
    conflictingCount: { type: Number, default: 0 },
    unmatchedUserCount: { type: Number, default: 0 },
    unmatchedExchangeCount: { type: Number, default: 0 },
    invalidUserCount: { type: Number, default: 0 },
    invalidExchangeCount: { type: Number, default: 0 }
  },
  errorMessage: { type: String }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Run', RunSchema);
