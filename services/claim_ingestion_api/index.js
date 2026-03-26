const express = require('express');
const router = express.Router();

const claimStatusRouter = require('./claim_status_endpoint');
const claimSummaryRouter = require('./claim_summary_endpoint');
const claimExplanationRouter = require('./claim_explanation_endpoint');
const claimIngestRouter = require('./claim_ingest_endpoint');
const reviewQueueRouter = require('./review_queue_endpoint');
const claimSearchRouter = require('./claim_search_endpoint');
const claimStatsRouter = require('./claim_stats_endpoint');
const { getClaimsIntelligenceSummary } = require('../ai/claims_intelligence_service');

router.use(claimStatusRouter);
router.use(claimSummaryRouter);
router.use(claimExplanationRouter);
router.use(claimIngestRouter);
router.use(reviewQueueRouter);
router.use(claimSearchRouter);
router.use(claimStatsRouter);
router.get('/intelligence', async (req, res) => {
  try {
    const data = await getClaimsIntelligenceSummary();
    res.json({ ok: true, intelligence: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
module.exports = router;
