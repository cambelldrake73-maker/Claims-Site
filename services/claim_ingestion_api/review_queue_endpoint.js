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
    const queue = await all(
      `SELECT * FROM review_queue ORDER BY created_at ASC`
    );
    res.json({ ok: true, queue });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

