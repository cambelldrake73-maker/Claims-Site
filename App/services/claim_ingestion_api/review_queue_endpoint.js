const express = require('express');
const router = express.Router();
const { run, all, get } = require('./db');
const { normalizeClaimStatus } = require('./claim_model');
const { attachHumanActionToClaimDecisions } = require('./intelligence_decision_log');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const { applyClaimLifecycle } = require('../pipeline/intake_pipeline');

function parseJsonSafely(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
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

async function applyReviewDecision(claim_id, decision, identity = null) {
  await run('BEGIN TRANSACTION');

  try {
    const updated_at = Date.now();
    const claimRow = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    if (!claimRow) {
      throw new Error('Claim not found');
    }

    const queueRow = await get(
      `SELECT id FROM review_queue WHERE claim_id = ?`,
      [claim_id]
    );

    if (!queueRow) {
      throw new Error('Review queue entry not found');
    }

    await attachHumanActionToClaimDecisions({
      claimId: claim_id,
      decisionTypes: ['recommendation'],
      humanAction: decision,
      userId: identity?.user_id || null,
      metadata: {
        via: 'review_queue'
      },
      timestamp: updated_at
    });

    await applyClaimLifecycle({
      claimId: claim_id,
      claim: {
        ...claimRow,
        status: normalizeClaimStatus(claimRow.status)
      },
      context: { review_decision: decision },
      timestamp: updated_at,
      options: {
        trigger: 'review',
        context: { review_decision: decision },
        reviewQueue: decision === 'reject'
          ? { assignment_status: 'rejected' }
          : {}
      }
    });

    await run('COMMIT');

    await logAuditEventBestEffort({
      identity,
      action: 'review_decision_made',
      resource_type: 'claim',
      resource_id: claim_id,
      metadata: {
        decision
      }
    });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (rollbackErr) {
      // Preserve the original error for the response.
    }

    throw err;
  }
}

router.post('/api/review-queue', async (req, res) => {
  try {
    const { claim_id, reviewer_notes = '', reviewer_id = '' } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    const claimRow = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    if (!claimRow) {
      return res.status(404).json({ ok: false, error: 'Claim not found' });
    }

    const assignment_status = reviewer_id ? 'assigned' : 'unassigned';
    const updated_at = Date.now();

    await applyClaimLifecycle({
      claimId: claim_id,
      claim: {
        ...claimRow,
        status: normalizeClaimStatus(claimRow.status)
      },
      context: { review_requested: true },
      timestamp: updated_at,
      options: {
        trigger: 'review',
        context: { review_requested: true },
        reviewQueue: {
          reviewer_id,
          reviewer_notes,
          assignment_status
        }
      }
    });

    const persistedReview = await get(
      `SELECT *
       FROM review_queue
       WHERE claim_id = ?`,
      [claim_id]
    );

    res.json({
      ok: true,
      review: {
        id: persistedReview?.id ?? null,
        claim_id,
        reviewer_id: persistedReview?.reviewer_id ?? reviewer_id,
        reviewer_notes: persistedReview?.reviewer_notes ?? reviewer_notes,
        assignment_status: persistedReview?.assignment_status ?? assignment_status,
        created_at: persistedReview?.created_at ?? updated_at,
        updated_at: persistedReview?.updated_at ?? updated_at
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/review-queue/:claim_id/approve', async (req, res) => {
  try {
    const { claim_id } = req.params;
    await applyReviewDecision(claim_id, 'approve', req.identity);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/review-queue/:claim_id/reject', async (req, res) => {
  try {
    const { claim_id } = req.params;
    await applyReviewDecision(claim_id, 'reject', req.identity);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/review-queue', async (req, res) => {
  try {
    const queue = await all(`
      SELECT
        rq.id,
        rq.claim_id,
        rq.reviewer_id,
        rq.reviewer_notes,
        rq.assignment_status,
        rq.created_at,
        rq.updated_at,

        c.patient,
        c.payer,
        c.status,
        c.denial_reason,
        c.amount,
        c.date_of_service,
        c.source_file,

        ce.confidence,
        ce.recovery_route,
        ce.likely_fix_type,
        ce.denial_type,
        ce.required_fields,
        ce.required_field_status,
        ce.missing_fields,
        ce.missing_elements,
        ce.coding_flags,
        ce.warnings,
        ce.recommended_actions,
        ce.fix_plan

      FROM review_queue rq
      LEFT JOIN claims c
        ON rq.claim_id = c.claim_id
      LEFT JOIN claims_enrichment ce
        ON rq.claim_id = ce.claim_id
      WHERE LOWER(COALESCE(c.status, '')) = 'in_review'
      ORDER BY rq.created_at ASC
    `);
    const latestRecommendationDecisions = await all(`
      SELECT t.claim_id, t.suggested_value_json, t.evidence_json, t.rationale_json
      FROM intelligence_decision_log t
      INNER JOIN (
        SELECT claim_id, MAX(decision_id) AS latest_decision_id
        FROM intelligence_decision_log
        WHERE decision_type = 'recommendation'
          AND claim_id IS NOT NULL
        GROUP BY claim_id
      ) latest
        ON latest.latest_decision_id = t.decision_id
    `);
    const recommendationDecisionByClaimId = new Map(
      (Array.isArray(latestRecommendationDecisions) ? latestRecommendationDecisions : [])
        .filter(item => item && item.claim_id)
        .map(item => [item.claim_id, shapeLatestRecommendationDecision(item)])
    );

    const formattedQueue = queue.map(item => {
      const recommendationDecision = recommendationDecisionByClaimId.get(item.claim_id)
        || shapeLatestRecommendationDecision(null);

      return {
        id: item.id,
        claim_id: item.claim_id,
        reviewer_id: item.reviewer_id,
        reviewer_notes: item.reviewer_notes,
        assignment_status: item.assignment_status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        recommendation_decision: recommendationDecision,
        claim: {
          patient: item.patient,
          payer: item.payer,
          status: normalizeClaimStatus(item.status),
          denial_reason: item.denial_reason,
          amount: item.amount,
          date_of_service: item.date_of_service,
          source_file: item.source_file
        },
        enrichment: item.confidence !== null ? {
          confidence: item.confidence,
          recovery_route: item.recovery_route,
          likely_fix_type: item.likely_fix_type,
          denial_type: item.denial_type ?? null,
          required_fields: parseJsonSafely(item.required_fields, []),
          required_field_status: parseJsonSafely(item.required_field_status, []),
          missing_fields: parseJsonSafely(item.missing_fields, []),
          missing_elements: parseJsonSafely(item.missing_elements, []),
          coding_flags: parseJsonSafely(item.coding_flags, []),
          warnings: parseJsonSafely(item.warnings, []),
          recommended_actions: parseJsonSafely(item.recommended_actions, []),
          fix_plan: parseJsonSafely(item.fix_plan, {}),
          recommendation_decision: recommendationDecision
        } : null
      };
    });

    res.json({ ok: true, queue: formattedQueue });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
