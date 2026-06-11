const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  runId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Run', 
    required: true,
    index: true 
  },
  category: { 
    type: String, 
    enum: ['matched', 'conflicting', 'unmatched_user', 'unmatched_exchange'], 
    required: true 
  },
  userTransaction: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction',
    default: null
  },
  exchangeTransaction: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction',
    default: null
  },
  reason: { 
    type: String, 
    required: true 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Result', ResultSchema);
