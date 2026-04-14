const express = require('express');
const router = express.Router();

const { get, run, all } = require('./db');
const { storeMatchReasoningSnapshot } = require('./match_reasoning_snapshot');
const {
  upsertMatchDecision,
  attachMatchHumanOutcome
} = require('./intelligence_decision_log');
const { BASE_WEIGHTS, computeAdaptiveWeights } = require('../intake/match_learning');

const FEEDBACK_WINDOW_SIZE = 100;

function normalizeReasons(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(item => typeof item === 'string');
}

function parseJsonSafely(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function parseBooleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isDevModeEnabled() {
  return parseBooleanEnv(process.env.DEV_MODE);
}

function normalizeFlags(value) {
  const parsed = typeof value === 'string'
    ? parseJsonSafely(value, null)
    : value;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const normalizedFlags = {
    duplicate: parsed.duplicate === true,
    already_submitted: parsed.already_submitted === true,
    already_recovered: parsed.already_recovered === true
  };

  return Object.values(normalizedFlags).some(Boolean)
    ? normalizedFlags
    : null;
}

function buildWeightDelta(previousWeights, newWeights) {
  const keys = new Set([
    ...Object.keys(BASE_WEIGHTS),
    ...Object.keys(previousWeights || {}),
    ...Object.keys(newWeights || {})
  ]);
  const delta = {};

  keys.forEach(key => {
    const previousValue = Number(previousWeights?.[key] ?? 0);
    const newValue = Number(newWeights?.[key] ?? 0);
    delta[key] = newValue - previousValue;
  });

  return delta;
}

async function loadRecentFeedbackRows() {
  const rows = await all(
    `SELECT action, reasons
     FROM match_feedback
     ORDER BY created_at DESC
     LIMIT ?`,
    [FEEDBACK_WINDOW_SIZE]
  );

  return Array.isArray(rows) ? rows : [];
}

async function loadExplicitFileAssociation(fileId, matchedClaimId) {
  if (!fileId || !matchedClaimId) {
    return null;
  }

  const fileRecord = await get(
    `SELECT file_id
     FROM intake_files
     WHERE file_id = ?`,
    [fileId]
  );

  if (!fileRecord) {
    return {
      valid: false,
      error: 'file_id is invalid'
    };
  }

  const claimDocument = await get(
    `SELECT file_id, match_confidence, created_at
     FROM claim_documents
     WHERE file_id = ?
       AND claim_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [fileId, matchedClaimId]
  );

  if (claimDocument) {
    return {
      valid: true,
      file_id: fileId,
      confidence: claimDocument.match_confidence,
      evidence_type: 'claim_document'
    };
  }

  const reviewCandidate = await get(
    `SELECT file_id, confidence, created_at
     FROM match_review_queue
     WHERE file_id = ?
       AND suggested_claim_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [fileId, matchedClaimId]
  );

  if (reviewCandidate) {
    return {
      valid: true,
      file_id: fileId,
      confidence: reviewCandidate.confidence,
      evidence_type: 'match_review_queue'
    };
  }

  const snapshot = await get(
    `SELECT file_id, confidence, created_at
     FROM match_reasoning_snapshot
     WHERE file_id = ?
       AND claim_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [fileId, matchedClaimId]
  );

  if (snapshot) {
    return {
      valid: true,
      file_id: fileId,
      confidence: snapshot.confidence,
      evidence_type: 'match_reasoning_snapshot'
    };
  }

  return {
    valid: false,
    error: 'file_id is not associated with matched_claim_id'
  };
}

async function resolveDevFallbackAssociation(matchedClaimId) {
  const rows = await all(
    `SELECT file_id, confidence, evidence_type, created_at
     FROM (
       SELECT
         file_id,
         match_confidence AS confidence,
         'claim_document' AS evidence_type,
         created_at
       FROM claim_documents
       WHERE claim_id = ?
         AND file_id IS NOT NULL

       UNION ALL

       SELECT
         file_id,
         confidence,
         'match_review_queue' AS evidence_type,
         created_at
       FROM match_review_queue
       WHERE suggested_claim_id = ?
         AND file_id IS NOT NULL

       UNION ALL

       SELECT
         file_id,
         confidence,
         'match_reasoning_snapshot' AS evidence_type,
         created_at
       FROM match_reasoning_snapshot
       WHERE claim_id = ?
         AND file_id IS NOT NULL
     ) associations
     ORDER BY created_at DESC`,
    [matchedClaimId, matchedClaimId, matchedClaimId]
  );

  const associations = Array.isArray(rows)
    ? rows.filter(row => String(row?.file_id || '').trim())
    : [];
  const distinctFileIds = Array.from(new Set(
    associations.map(row => String(row.file_id).trim())
  ));

  if (distinctFileIds.length !== 1) {
    return {
      valid: false,
      error: 'file_id is required'
    };
  }

  return {
    valid: true,
    file_id: distinctFileIds[0],
    confidence: associations[0]?.confidence ?? null,
    evidence_type: associations[0]?.evidence_type || 'fallback'
  };
}

async function resolveFeedbackFlags({
  requestFlags,
  fileId,
  claimId,
  matchedClaimId
}) {
  const directFlags = normalizeFlags(requestFlags);

  if (directFlags) {
    return directFlags;
  }

  if (fileId && matchedClaimId) {
    const reviewRow = await get(
      `SELECT note
       FROM match_review_queue
       WHERE file_id = ?
         AND suggested_claim_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [fileId, matchedClaimId]
    );
    const reviewFlags = normalizeFlags(parseJsonSafely(reviewRow?.note, null)?.flags);

    if (reviewFlags) {
      return reviewFlags;
    }
  }

  const snapshotClaimId = matchedClaimId || claimId;

  if (!snapshotClaimId) {
    return null;
  }

  const snapshotRow = await get(
    `SELECT flags
     FROM match_reasoning_snapshot
     WHERE claim_id = ?
       AND (
         (file_id = ?)
         OR (file_id IS NULL AND ? IS NULL)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [snapshotClaimId, fileId ?? null, fileId ?? null]
  );

  return normalizeFlags(snapshotRow?.flags);
}

async function ensurePendingMatchReview({
  claimId,
  matchedClaimId,
  fileId,
  confidence,
  reasons,
  note
}) {
  const normalizedNote = typeof note === 'string' && note.trim()
    ? note.trim()
    : null;

  const existingPendingReview = await get(
    `SELECT id
     FROM match_review_queue
     WHERE claim_id = ?
       AND suggested_claim_id = ?
       AND status = 'pending'
       AND (
         (file_id = ?)
         OR (file_id IS NULL AND ? IS NULL)
       )
     ORDER BY id DESC
     LIMIT 1`,
    [claimId, matchedClaimId, fileId, fileId]
  );

  if (existingPendingReview) {
    return {
      reviewId: existingPendingReview.id,
      created: false
    };
  }

  const result = await run(
    `INSERT INTO match_review_queue (
      claim_id,
      file_id,
      suggested_claim_id,
      confidence,
      reasons,
      note,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      claimId,
      fileId,
      matchedClaimId,
      confidence,
      JSON.stringify(reasons),
      normalizedNote,
      'pending',
      Date.now()
    ]
  );

  return {
    reviewId: result.id,
    created: true
  };
}

router.post('/api/match-feedback', async (req, res) => {
  try {
    const claimId = typeof req.body?.claim_id === 'string'
      ? req.body.claim_id.trim()
      : '';
    const matchedClaimId = typeof req.body?.matched_claim_id === 'string'
      ? req.body.matched_claim_id.trim()
      : '';
    const action = typeof req.body?.action === 'string'
      ? req.body.action.trim().toLowerCase()
      : '';
    const reasons = normalizeReasons(req.body?.reasons);
    const confidenceValue = Number(req.body?.confidence);
    const confidence = Number.isFinite(confidenceValue) ? confidenceValue : null;
    const requestedFileId = typeof req.body?.file_id === 'string'
      ? req.body.file_id.trim()
      : '';

    if (!claimId) {
      return res.status(400).json({
        ok: false,
        error: 'claim_id is required'
      });
    }

    if (!matchedClaimId) {
      return res.status(400).json({
        ok: false,
        error: 'matched_claim_id is required'
      });
    }

    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({
        ok: false,
        error: 'action must be accept or reject'
      });
    }

    const claim = await get(
      `SELECT claim_id FROM claims WHERE claim_id = ?`,
      [claimId]
    );

    if (!claim) {
      return res.status(404).json({
        ok: false,
        error: 'claim not found'
      });
    }

    const matchedClaim = await get(
      `SELECT claim_id FROM claims WHERE claim_id = ?`,
      [matchedClaimId]
    );

    if (!matchedClaim) {
      return res.status(404).json({
        ok: false,
        error: 'matched claim not found'
      });
    }

    if (!requestedFileId && !isDevModeEnabled()) {
      return res.status(400).json({
        ok: false,
        error: 'file_id is required'
      });
    }

    const fileAssociation = requestedFileId
      ? await loadExplicitFileAssociation(requestedFileId, matchedClaimId)
      : await resolveDevFallbackAssociation(matchedClaimId);

    if (!fileAssociation?.valid) {
      return res.status(400).json({
        ok: false,
        error: fileAssociation?.error || 'file_id is required'
      });
    }

    const fileId = fileAssociation.file_id;
    const storedConfidence = Number(fileAssociation.confidence);
    const effectiveConfidence = confidence !== null
      ? confidence
      : Number.isFinite(storedConfidence)
        ? storedConfidence
        : null;
    const feedbackFlags = await resolveFeedbackFlags({
      requestFlags: req.body?.flags,
      fileId,
      claimId,
      matchedClaimId
    });
    const previousFeedbackRows = await loadRecentFeedbackRows();
    const previousLearning = computeAdaptiveWeights(previousFeedbackRows);

    let reviewQueued = false;
    let reviewId = null;
    let feedbackId = null;

    await run('BEGIN TRANSACTION');

    try {
      const result = await run(
        `INSERT INTO match_feedback (
          file_id,
          claim_id,
          matched_claim_id,
          action,
          confidence,
          reasons,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fileId,
          claimId,
          matchedClaimId,
          action,
          effectiveConfidence,
          JSON.stringify(reasons),
          Date.now()
        ]
      );

      feedbackId = result.id;

      if (action === 'accept') {
        await storeMatchReasoningSnapshot({
          claimId: matchedClaimId || claimId,
          fileId,
          confidence: effectiveConfidence,
          reasons,
          competingMatches: null,
          flags: feedbackFlags,
          skipIfExists: true
        });
      }

      if (action === 'reject') {
        const reviewTask = await ensurePendingMatchReview({
          claimId,
          matchedClaimId,
          fileId,
          confidence: effectiveConfidence,
          reasons,
          note: fileId ? null : 'manual review required (no file linked)'
        });

        reviewQueued = true;
        reviewId = reviewTask.reviewId;
      }

      await upsertMatchDecision({
        fileId,
        suggestedClaimId: matchedClaimId,
        candidateClaimIds: [matchedClaimId],
        confidence: effectiveConfidence,
        requiresReview: action === 'reject',
        reasons,
        competingMatches: [],
        flags: feedbackFlags,
        engine: 'match_feedback_seed',
        source: 'match_feedback'
      });

      await attachMatchHumanOutcome({
        fileId,
        suggestedClaimId: matchedClaimId,
        humanAction: action,
        userId: req.identity?.user_id || null,
        metadata: {
          via: 'match_feedback',
          claim_id: claimId,
          review_id: reviewId
        }
      });

      await run('COMMIT');
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original feedback error.
      }

      throw err;
    }

    const updatedFeedbackRows = await loadRecentFeedbackRows();
    const updatedLearning = computeAdaptiveWeights(updatedFeedbackRows);
    const learningImpact = {
      previous_weights: previousLearning.weights,
      new_weights: updatedLearning.weights,
      delta: buildWeightDelta(previousLearning.weights, updatedLearning.weights),
      previous_sample_size: previousLearning.sample_size,
      new_sample_size: updatedLearning.sample_size
    };

    const feedback = await get(
      `SELECT *
       FROM match_feedback
       WHERE id = ?`,
      [feedbackId]
    );

    return res.json({
      ok: true,
      feedback: feedback
        ? {
            ...feedback,
            reasons
          }
        : {
            claim_id: claimId,
            matched_claim_id: matchedClaimId,
            action,
            confidence: effectiveConfidence,
            reasons
          },
      review_queued: reviewQueued,
      review_id: reviewId,
      learning_impact: learningImpact
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
