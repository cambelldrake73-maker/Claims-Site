const express = require('express');
const router = express.Router();
const { run, all } = require('./db');

router.post('/api/review-queue', async (req, res) => {
  try {
    const { claim_id, reviewer_notes = '', reviewer_id = '' } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    const created_at = Date.now();
    const updated_at = created_at;
    const assignment_status = reviewer_id ? 'assigned' : 'unassigned';

    const result = await run(
      `INSERT INTO review_queue (
        claim_id, reviewer_id, reviewer_notes, assignment_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [claim_id, reviewer_id, reviewer_notes, assignment_status, created_at, updated_at]
    );

    res.json({
      ok: true,
      review: {
        id: result.id,
        claim_id,
        reviewer_id,
        reviewer_notes,
        assignment_status,
        created_at,
        updated_at
      }
    });
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
      ORDER BY rq.created_at ASC
    `);

    const formattedQueue = queue.map(item => ({
      id: item.id,
      claim_id: item.claim_id,
      reviewer_id: item.reviewer_id,
      reviewer_notes: item.reviewer_notes,
      assignment_status: item.assignment_status,
      created_at: item.created_at,
      updated_at: item.updated_at,
      claim: {
        patient: item.patient,
        payer: item.payer,
        status: item.status,
        denial_reason: item.denial_reason,
        amount: item.amount,
        date_of_service: item.date_of_service,
        source_file: item.source_file
      },
      enrichment: item.confidence !== null ? {
        confidence: item.confidence,
        recovery_route: item.recovery_route,
        likely_fix_type: item.likely_fix_type,
        missing_fields: JSON.parse(item.missing_fields || '[]'),
        missing_elements: JSON.parse(item.missing_elements || '[]'),
        coding_flags: JSON.parse(item.coding_flags || '[]'),
        warnings: JSON.parse(item.warnings || '[]'),
        recommended_actions: JSON.parse(item.recommended_actions || '[]'),
        fix_plan: JSON.parse(item.fix_plan || '{}')
      } : null
    }));

    res.json({ ok: true, queue: formattedQueue });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
