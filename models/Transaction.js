const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  runId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Run', 
    required: true,
    index: true 
  },
  source: { 
    type: String, 
    enum: ['user', 'exchange'], 
    required: true 
  },
  transactionId: { 
    type: String, 
    required: true 
  },
  rawTimestamp: String,
  rawQuantity: String,
  rawPriceUsd: String,
  rawFee: String,
  rawType: String,
  rawAsset: String,
  note: String,
  
  // Normalized and validated fields
  parsedTimestamp: { type: Date },
  parsedType: { type: String },
  parsedAsset: { type: String },
  parsedQuantity: { type: Number },
  parsedPriceUsd: { type: Number },
  parsedFee: { type: Number },
  
  isValid: { 
    type: Boolean, 
    default: true 
  },
  validationErrors: { 
    type: [String], 
    default: [] 
  },
  isMatched: { 
    type: Boolean, 
    default: false,
    index: true 
  }
}, { 
  timestamps: true 
});

// Compound index to speed up matching queries
TransactionSchema.index({ runId: 1, source: 1, parsedAsset: 1, parsedType: 1, isMatched: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
