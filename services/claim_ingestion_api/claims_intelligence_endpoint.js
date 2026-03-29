const express = require('express');
const router = express.Router();
const { all } = require('./db');

router.get('/api/claims/intelligence', async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM claims`);

    const byReason = {};
    const byPayer = {};
    const byStatus = {};

    rows.forEach(c => {
      const reason = c.denial_reason || 'unspecified';
      const payer = c.payer || 'Unknown Payer';
      const status = c.status || 'unknown';

      byReason[reason] = (byReason[reason] || 0) + 1;
      byPayer[payer] = (byPayer[payer] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    res.json({
      ok: true,
      totals: {
        claims: rows.length
      },
      denial_reasons: byReason,
      payers: byPayer,
      statuses: byStatus
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
