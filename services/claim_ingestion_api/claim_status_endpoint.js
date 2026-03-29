const express = require('express');
const router = express.Router();
const { run, get } = require('./db');

const ALLOWED_STATUSES = [
  'pending',
  'pending_review',
  'under_review',
  'reviewed',
  'corrected',
  'submitted',
  'accepted',
  'approved',
  'denied',
  'rejected',
  'not_recoverable'
];

router.post('/api/claims/status', async (req, res) => {
  try {
    const { claim_id, status } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    const existing = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'claim not found' });
    }

    await run(
      `UPDATE claims SET status = ?, updated_at = ? WHERE claim_id = ?`,
      [status, Date.now(), claim_id]
    );

    const updated = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    res.json({ ok: true, claim: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
