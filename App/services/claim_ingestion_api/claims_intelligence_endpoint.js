const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { normalizeClaimStatus } = require('./claim_model');
const {
  listIntelligenceDecisions,
  evaluateIntelligenceDecisions
} = require('./intelligence_decision_log');

router.get('/api/claims/intelligence/decisions', async (req, res) => {
  try {
    const decisions = await listIntelligenceDecisions({
      claimId: req.query?.claim_id,
      fileId: req.query?.file_id,
      decisionType: req.query?.decision_type,
      decisionKey: req.query?.decision_key,
      providerId: req.query?.provider_id,
      dateFrom: req.query?.date_from,
      dateTo: req.query?.date_to,
      minConfidence: req.query?.min_confidence,
      maxConfidence: req.query?.max_confidence,
      confidenceBand: req.query?.confidence_band,
      humanAction: req.query?.human_action,
      finalOutcomeStatus: req.query?.final_outcome_status,
      limit: req.query?.limit
    });

    res.json({
      ok: true,
      decisions
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/claims/intelligence/evaluation', async (req, res) => {
  try {
    const evaluation = await evaluateIntelligenceDecisions({
      decisionType: req.query?.decision_type,
      providerId: req.query?.provider_id,
      dateFrom: req.query?.date_from,
      dateTo: req.query?.date_to,
      minConfidence: req.query?.min_confidence,
      maxConfidence: req.query?.max_confidence,
      confidenceBand: req.query?.confidence_band,
      humanAction: req.query?.human_action,
      finalOutcomeStatus: req.query?.final_outcome_status
    });

    res.json({
      ok: true,
      evaluation
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/claims/intelligence', async (req, res) => {
  try {
    const rows = await all(`
      SELECT
        c.*,
        ce.denial_type
      FROM claims c
      LEFT JOIN claims_enrichment ce
        ON c.claim_id = ce.claim_id
    `);

    const byDenialType = {};
    const byPayer = {};
    const byStatus = {};

    rows.forEach(c => {
      const denialType = c.denial_type || 'other';
      const payer = c.payer || 'Unknown Payer';
      const status = normalizeClaimStatus(c.status, 'uploaded');

      byDenialType[denialType] = (byDenialType[denialType] || 0) + 1;
      byPayer[payer] = (byPayer[payer] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    res.json({
      ok: true,
      totals: {
        claims: rows.length
      },
      denial_types: byDenialType,
      payers: byPayer,
      statuses: byStatus
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
