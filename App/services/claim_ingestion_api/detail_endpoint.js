const express = require('express');
const router = express.Router();

const { get, run, all } = require('./db');
const { CLAIM_SCHEMA } = require('./claim_model');
const { applyClaimLifecycle } = require('../pipeline/intake_pipeline');
const { buildSubmissionPreview } = require('../pipeline/submission_builder');

function requireIdentity(req, res) {
  if (!req.identity || !req.identity.customer_id) {
    res.status(401).json({
      ok: false,
      error: 'UNAUTHENTICATED'
    });
    return false;
  }
  return true;
}

function shapeClaim(claimRow) {
  const claim = {};

  Object.keys(CLAIM_SCHEMA).forEach(key => {
    if (claimRow[key] !== undefined) {
      claim[key] = claimRow[key];
    }
  });

  if (claimRow.applied_fixes !== undefined) {
    try {
      claim.applied_fixes = JSON.parse(claimRow.applied_fixes || '[]');
    } catch {
      claim.applied_fixes = [];
    }
  }

  return claim;
}

async function loadClaimRow(claimId, customerId) {
  return get(
    `SELECT * FROM claims WHERE claim_id = ? AND customer_id = ?`,
    [claimId, customerId]
  );
}

async function loadClaimSubmissionContext(claimId, customerId) {
  const claim = await get(
    `SELECT
       c.*,
       ce.recovery_route,
       ce.likely_fix_type,
       ce.required_field_status
     FROM claims c
     LEFT JOIN claims_enrichment ce
       ON ce.claim_id = c.claim_id
     WHERE c.claim_id = ?
       AND c.customer_id = ?`,
    [claimId, customerId]
  );

  if (!claim) {
    return null;
  }

  const documentCountRow = await get(
    `SELECT COUNT(*) AS document_count
     FROM claim_documents
     WHERE claim_id = ?`,
    [claimId]
  );

  return {
    claim,
    enrichment: {
      recovery_route: claim.recovery_route ?? null,
      likely_fix_type: claim.likely_fix_type ?? null,
      required_field_status: claim.required_field_status ?? null
    },
    document_count: Number(documentCountRow?.document_count ?? 0)
  };
}

async function reapplyLifecycleForClaimIds(claimIds = [], customerId) {
  const uniqueClaimIds = Array.from(new Set(
    (Array.isArray(claimIds) ? claimIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));

  for (const claimId of uniqueClaimIds) {
    const claimRow = await loadClaimRow(claimId, customerId);

    if (!claimRow) {
      continue;
    }

    await applyClaimLifecycle({
      claimId,
      claim: shapeClaim(claimRow),
      timestamp: Date.now(),
      options: {
        trigger: 'document_link_change',
        context: {
          source: 'detail_endpoint'
        }
      }
    });
  }
}

router.get('/api/claims/:id', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const claimRow = await get(
      `SELECT * FROM claims WHERE claim_id = ? AND customer_id = ?`,
      [req.params.id, req.identity.customer_id]
    );

    if (!claimRow) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found'
      });
    }

    return res.json({
      ok: true,
      claim: shapeClaim(claimRow)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/claims/:id/history', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const rows = await all(
      `SELECT * FROM submissions WHERE claim_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    );

    return res.json({
      ok: true,
      submissions: rows.map(row => ({
        ...row,
        payload: row.payload ? JSON.parse(row.payload) : null,
        response: row.response ? JSON.parse(row.response) : null
      }))
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/claims/:id/submission', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const submissionContext = await loadClaimSubmissionContext(
      req.params.id,
      req.identity.customer_id
    );

    if (!submissionContext?.claim) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found'
      });
    }

    let submission;

    try {
      submission = buildSubmissionPreview({
        claim: shapeClaim(submissionContext.claim),
        enrichment: submissionContext.enrichment,
        documentCount: submissionContext.document_count,
        allowHistorical: true
      });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.status))
        ? Number(err.status)
        : 409;

      return res.status(statusCode).json({
        ok: false,
        error: err.message,
        code: err.code || 'CLAIM_NOT_READY_FOR_SUBMISSION',
        details: err.details || null
      });
    }

    return res.json({
      ok: true,
      submission
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/api/claims/:id/fix-decision', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const { index, decision } = req.body;

    const existing = await get(
      `SELECT applied_fixes FROM claims WHERE claim_id = ? AND customer_id = ?`,
      [req.params.id, req.identity.customer_id]
    );

    let fixes = [];
    try {
      fixes = JSON.parse(existing?.applied_fixes || '[]');
    } catch {
      fixes = [];
    }

    if (fixes[index]) {
      fixes[index].decision = decision;
      fixes[index].timestamp = Date.now();
    }

    await run(
      `UPDATE claims SET applied_fixes = ?, updated_at = ? WHERE claim_id = ?`,
      [JSON.stringify(fixes), Date.now(), req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/api/claims/:id', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const { id } = req.params;
    const updates = req.body || {};

    const editableFields = [
      'patient',
      'payer',
      'denial_reason',
      'amount',
      'date_of_service'
    ];

    const setClauses = [];
    const values = [];

    editableFields.forEach(field => {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (setClauses.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No valid fields provided'
      });
    }

    setClauses.push(`updated_at = ?`);
    values.push(Date.now());
    values.push(id);

    await run(
      `UPDATE claims SET ${setClauses.join(', ')} WHERE claim_id = ? AND customer_id = ?`,
      [...values, req.identity.customer_id]
    );

    const freshRow = await get(
      `SELECT * FROM claims WHERE claim_id = ? AND customer_id = ?`,
      [id, req.identity.customer_id]
    );

    if (!freshRow) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found after update'
      });
    }

    const shaped = shapeClaim(freshRow);
    const orchestration = await applyClaimLifecycle({
      claimId: id,
      claim: shaped,
      timestamp: Date.now()
    });

    return res.json({
      ok: true,
      claim: {
        ...shaped,
        status: orchestration.status,
        confidence: orchestration.confidence,
        enrichment: orchestration.enrichment,
        recommended_actions: orchestration.recommended_actions
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/claims/:id/documents', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const claimId = req.params.id;

    const rows = await all(`
      SELECT 
        cd.file_id,
        cd.match_confidence,
        cd.created_at,
        f.filename,
        f.uploaded_at
      FROM claim_documents cd
      JOIN intake_files f
        ON cd.file_id = f.file_id
      JOIN claims c
        ON c.claim_id = cd.claim_id
      WHERE cd.claim_id = ? AND c.customer_id = ?
      ORDER BY cd.created_at DESC
    `, [claimId, req.identity.customer_id]);

    return res.json({
      ok: true,
      documents: rows
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// DELETE endpoint for unlinking a document
router.delete('/api/claims/:id/documents/:fileId', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const { id, fileId } = req.params;

    await run(
      `DELETE FROM claim_documents 
       WHERE claim_id = ? 
       AND file_id = ?
       AND claim_id IN (SELECT claim_id FROM claims WHERE customer_id = ?)`,
      [id, fileId, req.identity.customer_id]
    );

    await reapplyLifecycleForClaimIds([id], req.identity.customer_id);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST endpoint for reassigning a document
router.post('/api/claims/:id/documents/:fileId/reassign', async (req, res) => {
  try {
    if (!requireIdentity(req, res)) return;

    const { id, fileId } = req.params;
    const { new_claim_id } = req.body;

    if (!new_claim_id) {
      return res.status(400).json({ ok: false, error: 'new_claim_id required' });
    }

    // remove existing link
    await run(
      `DELETE FROM claim_documents WHERE claim_id = ? AND file_id = ?`,
      [id, fileId]
    );

    // create new link
    await run(
      `INSERT INTO claim_documents (claim_id, file_id, match_confidence, created_at)
       SELECT ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM claims 
         WHERE claim_id = ? AND customer_id = ?
      )`,
      [new_claim_id, fileId, 0.5, Date.now(), new_claim_id, req.identity.customer_id]
    );

    await reapplyLifecycleForClaimIds(
      [id, new_claim_id],
      req.identity.customer_id
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
