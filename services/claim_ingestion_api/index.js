const express = require('express');
const router = express.Router();

const claimSummaryRouter = require('./claim_summary_endpoint');
const claimExplanationRouter = require('./claim_explanation_endpoint');
const claimIngestRouter = require('./claim_ingest_endpoint');
router.use(claimIngestRouter);
router.post('/ingest', async (req, res) => {
  return res.status(501).json({ message: 'claim ingestion not implemented yet' });
});

router.use(claimSummaryRouter);
router.use(claimExplanationRouter);

module.exports = router;

