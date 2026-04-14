const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { normalizeClaimStatus, parseAdditionalData } = require('./claim_model');
const {
  buildUploadMetadata,
  mergeUploadContexts,
  loadLinkedUploadsByClaimIds
} = require('./upload_context');

function parseJsonSafely(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function shapeLatestRecommendationDecision(row) {
  if (!row) {
    return {
      recommendation_state: null,
      actionable: null,
      blocked: null,
      blocker_types: [],
      recoverable_now: null,
      prerequisites_met: null
    };
  }

  const suggestedValue = parseJsonSafely(row.suggested_value_json, {});
  const evidence = parseJsonSafely(row.evidence_json, {});
  const rationale = parseJsonSafely(row.rationale_json, {});

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

router.get('/api/claims', async (req, res) => {
  try {
    const customerId = typeof req.query.customer_id === 'string'
      ? req.query.customer_id.trim()
      : '';

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        error: 'customer_id is required'
      });
    }

    const claims = await all(
      `SELECT
         c.*,
         ce.confidence,
         ce.denial_type,
         ce.recommended_actions,
         ce.fix_plan,
         u.provider_name AS upload_provider_name,
         u.upload_name AS upload_upload_name,
         u.niche AS upload_niche,
         u.created_at AS upload_created_at
       FROM claims c
       LEFT JOIN claims_enrichment ce
         ON c.claim_id = ce.claim_id
       LEFT JOIN uploads u
         ON u.upload_id = c.upload_id
       WHERE c.customer_id = ?
       ORDER BY c.created_at DESC`,
      [customerId]
    );
    const linkedUploadsByClaimId = await loadLinkedUploadsByClaimIds(
      claims.map(claim => claim.claim_id)
    );
    const latestRecommendationDecisions = claims.length
      ? await all(
        `SELECT t.claim_id, t.suggested_value_json, t.evidence_json, t.rationale_json
         FROM intelligence_decision_log t
         INNER JOIN (
           SELECT claim_id, MAX(decision_id) AS latest_decision_id
           FROM intelligence_decision_log
           WHERE decision_type = 'recommendation'
             AND claim_id IS NOT NULL
           GROUP BY claim_id
         ) latest
           ON latest.latest_decision_id = t.decision_id
         WHERE t.claim_id IN (${claims.map(() => '?').join(', ')})`,
        claims.map(claim => claim.claim_id)
      )
      : [];
    const recommendationDecisionByClaimId = new Map(
      (Array.isArray(latestRecommendationDecisions) ? latestRecommendationDecisions : [])
        .filter(item => item && item.claim_id)
        .map(item => [item.claim_id, shapeLatestRecommendationDecision(item)])
    );

    res.json({
      ok: true,
      count: claims.length,
      claims: claims.map(claim => {
        const {
          upload_provider_name: _uploadProviderName,
          upload_upload_name: _uploadUploadName,
          upload_niche: _uploadNiche,
          upload_created_at: _uploadCreatedAt,
          ...claimData
        } = claim;
        const fixPlan = parseJsonSafely(claim.fix_plan, {});
        const recommended_actions = parseJsonSafely(claim.recommended_actions, []);
        const primaryUpload = buildUploadMetadata(claim);
        const linked_uploads = mergeUploadContexts(
          primaryUpload,
          linkedUploadsByClaimId.get(claim.claim_id) || []
        );

        return {
          ...claimData,
          additional_data: parseAdditionalData(claimData.additional_data),
          status: normalizeClaimStatus(claimData.status),
          confidence: claim.confidence ?? null,
          denial_type: claim.denial_type ?? null,
          recommended_actions,
          recommendation_decision: recommendationDecisionByClaimId.get(claim.claim_id)
            || shapeLatestRecommendationDecision(null),
          priority_score: fixPlan.priority_score ?? null,
          estimated_recovery: fixPlan.estimated_recovery ?? null,
          upload: primaryUpload || linked_uploads[0] || null,
          linked_uploads
        };
      })
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
