const express = require('express');
const router = express.Router();
const { get } = require('./db');
const { listIntelligenceDecisions } = require('./intelligence_decision_log');

function shapeLatestRecommendationDecision(decision) {
  if (!decision) {
    return {
      recommendation_state: null,
      actionable: null,
      blocked: null,
      blocker_types: [],
      recoverable_now: null,
      prerequisites_met: null
    };
  }

  const suggestedValue = decision.suggested_value && typeof decision.suggested_value === 'object'
    ? decision.suggested_value
    : {};
  const evidence = decision.evidence && typeof decision.evidence === 'object'
    ? decision.evidence
    : {};
  const rationale = decision.rationale && typeof decision.rationale === 'object'
    ? decision.rationale
    : {};

  return {
    recommendation_state: suggestedValue.recommendation_state || rationale.recommendation_state || null,
    actionable: suggestedValue.actionable === true || evidence.actionable === true
      ? true
      : (
        suggestedValue.actionable === false || evidence.actionable === false
          ? false
          : null
      ),
    blocked: suggestedValue.blocked === true || evidence.blocked === true
      ? true
      : (
        suggestedValue.blocked === false || evidence.blocked === false
          ? false
          : null
      ),
    blocker_types: Array.isArray(suggestedValue.blocker_types)
      ? suggestedValue.blocker_types
      : (Array.isArray(rationale.blocker_types) ? rationale.blocker_types : []),
    recoverable_now: suggestedValue.recoverable_now === true || evidence.recoverable_now === true
      ? true
      : (
        suggestedValue.recoverable_now === false || evidence.recoverable_now === false
          ? false
          : null
      ),
    prerequisites_met: suggestedValue.prerequisites_met === true || evidence.prerequisites_met === true
      ? true
      : (
        suggestedValue.prerequisites_met === false || evidence.prerequisites_met === false
          ? false
          : null
      )
  };
}

function buildDeterministicClaimSummary(claim = {}, recommendationDecision = {}) {
  const patient = claim.patient || 'Unknown patient';
  const payer = claim.payer || 'Unknown payer';
  const status = claim.status || 'unknown';
  const denialType = claim.denial_type || 'other';
  const denialReason = claim.denial_reason || 'unspecified';
  const recommendationState = recommendationDecision.recommendation_state || 'needs_manual_review';
  const blockerText = Array.isArray(recommendationDecision.blocker_types)
    && recommendationDecision.blocker_types.length
    ? recommendationDecision.blocker_types.join(', ')
    : null;

  const summaryParts = [
    `Claim ${claim.claim_id} for ${patient} with ${payer} is currently ${status}.`,
    `Denial type: ${denialType}.`,
    `Denial reason: ${denialReason}.`,
    `Recommendation state: ${recommendationState}.`
  ];

  if (recommendationDecision.actionable === true) {
    summaryParts.push('The claim is actionable now for the next recovery step.');
  } else if (recommendationDecision.blocked === true && blockerText) {
    summaryParts.push(`The claim is blocked by ${blockerText}.`);
  }

  if (recommendationDecision.prerequisites_met === false) {
    summaryParts.push('Prerequisites still need to be completed before submission.');
  }

  if (recommendationDecision.recoverable_now === false) {
    summaryParts.push('The current evidence does not support immediate recovery action.');
  }

  return summaryParts.join(' ');
}

router.post('/api/claims/summary', async (req, res) => {
  try {
    const { claim_id } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    const claim = await get(
      `SELECT
         c.*,
         ce.denial_type,
         ce.recommended_actions
       FROM claims c
       LEFT JOIN claims_enrichment ce
         ON ce.claim_id = c.claim_id
       WHERE c.claim_id = ?`,
      [claim_id]
    );

    if (!claim) {
      return res.status(404).json({ ok: false, error: 'claim not found' });
    }

    const latestRecommendationDecision = await listIntelligenceDecisions({
      claimId: claim_id,
      decisionType: 'recommendation',
      limit: 1
    });
    const recommendationDecision = shapeLatestRecommendationDecision(
      Array.isArray(latestRecommendationDecision)
        ? latestRecommendationDecision[0]
        : null
    );
    const summary = buildDeterministicClaimSummary(claim, recommendationDecision);

    res.json({
      ok: true,
      claim_id,
      summary,
      recommendation_decision: recommendationDecision
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
