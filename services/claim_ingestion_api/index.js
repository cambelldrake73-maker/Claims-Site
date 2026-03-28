const express = require('express');
const router = express.Router();

const claimStatusRouter = require('./claim_status_endpoint');
const claimSummaryRouter = require('./claim_summary_endpoint');
const claimExplanationRouter = require('./claim_explanation_endpoint');
const claimIngestRouter = require('./claim_ingest_endpoint');
const reviewQueueRouter = require('./review_queue_endpoint');
const claimSearchRouter = require('./claim_search_endpoint');
const claimStatsRouter = require('./claim_stats_endpoint');
const claimsIntelligenceRouter = require('./claims_intelligence_endpoint');
const batchNormalizeRouter = require('./batch_normalize_endpoint');
const listEndpointRouter = require('./list_endpoint');
const detailEndpointRouter = require('./detail_endpoint');

router.use(claimStatusRouter);
router.use(claimSummaryRouter);
router.use(claimExplanationRouter);
router.use(claimIngestRouter);
router.use(reviewQueueRouter);
router.use(claimSearchRouter);
router.use(claimStatsRouter);
router.use(claimsIntelligenceRouter);
router.use(batchNormalizeRouter);
router.use(listEndpointRouter);
router.use(detailEndpointRouter);

module.exports = router;
