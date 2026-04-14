const express = require('express');
const router = express.Router();
const { get } = require('./db');
const { listIntelligenceDecisions } = require('./intelligence_decision_log');

function parseRecommendedActions(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

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

router.post('/api/claims/explanation', async (req, res) => {
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

    const denialType = claim.denial_type || 'other';
    const denialReason = claim.denial_reason || 'unspecified';
    const recommendedActions = parseRecommendedActions(claim.recommended_actions);
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
    const recommendedText = recommendedActions.length
      ? recommendedActions
        .map(action => action?.message || action?.type || 'Review claim')
        .join(' ')
      : 'Review the claim using the orchestrator recommendations.';
    const blockerText = recommendationDecision.blocker_types.length
      ? recommendationDecision.blocker_types.join(', ')
      : 'review';

    let explanation =
      `Claim ${claim.claim_id} for ${claim.patient} with ${claim.payer} is currently ${claim.status}. ` +
      `The denial reason is ${denialReason}. ` +
      `The denial type is ${denialType}. ` +
      `The billed amount is $${claim.amount || 0}. `;

    if (recommendationDecision.recommendation_state) {
      if (recommendationDecision.actionable === true) {
        explanation +=
          `The current recommendation state is ${recommendationDecision.recommendation_state}, and the recommended path is actionable now. `;
      } else if (recommendationDecision.blocked === true) {
        explanation +=
          `The current recommendation state is ${recommendationDecision.recommendation_state}, and the claim is blocked pending ${blockerText}. `;
      } else {
        explanation +=
          `The current recommendation state is ${recommendationDecision.recommendation_state}. `;
      }

      if (recommendationDecision.prerequisites_met === false) {
        explanation += 'Required prerequisites are not yet met. ';
      }

      if (recommendationDecision.recoverable_now === false) {
        explanation += 'The claim is not yet recoverable now with the currently available evidence. ';
      }
    }

    explanation += `Recommended action: ${recommendedText}`;

    res.json({
      ok: true,
      claim_id,
      explanation,
      recommendation_decision: recommendationDecision
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
