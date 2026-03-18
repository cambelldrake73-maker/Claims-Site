const express = require('express');
const router = express.Router();

const claimSummaryRouter = require('./claim_summary_endpoint');
const claimExplanationRouter = require('./claim_explanation_endpoint');
const claimIngestRouter = require('./claim_ingest_endpoint');
const reviewQueueRouter = require('./review_queue_endpoint');
const claimSearchRouter = require('./claim_search_endpoint');
const claimStatsRouter = require('./claim_stats_endpoint');

router.use(claimSummaryRouter);
router.use(claimExplanationRouter);
router.use(claimIngestRouter);
router.use(reviewQueueRouter);
router.use(claimSearchRouter);
router.use(claimStatsRouter);

module.exports = router;
