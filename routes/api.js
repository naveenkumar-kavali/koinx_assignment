const express = require('express');
const router = express.Router();
const reconcileController = require('../controllers/reconcile');

// Trigger reconciliation run
router.post('/reconcile', reconcileController.reconcile);

// Fetch full reconciliation report (supports ?format=csv or Accept: text/csv)
router.get('/report/:runId', reconcileController.getReport);

// Fetch run summary statistics
router.get('/report/:runId/summary', reconcileController.getSummary);

// Fetch only unmatched/conflicting records
router.get('/report/:runId/unmatched', reconcileController.getUnmatched);

module.exports = router;
