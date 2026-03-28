const express = require('express');
const router = express.Router();
const { all } = require('./db');

router.get('/api/claims/stats', async (req, res) => {
  try {
    const rows = await all('SELECT status, amount FROM claims');

    const stats = {
      total_claims: rows.length,
      denied_count: 0,
      approved_count: 0,
      pending_count: 0,
      average_amount: 0,
      average_amount_by_status: {
        denied: 0,
        approved: 0,
        pending: 0
      }
    };

    let totalAmount = 0;
    const sums = {
      denied: 0,
      approved: 0,
      pending: 0
    };

    rows.forEach(row => {
      const status = String(row.status || '').toLowerCase();
      const amount = Number(row.amount || 0);

      totalAmount += amount;

      if (status === 'denied') {
        stats.denied_count += 1;
        sums.denied += amount;
      } else if (status === 'approved') {
        stats.approved_count += 1;
        sums.approved += amount;
      } else if (status === 'pending') {
        stats.pending_count += 1;
        sums.pending += amount;
      }
    });

    if (rows.length) {
      stats.average_amount = totalAmount / rows.length;
    }

    if (stats.denied_count) {
      stats.average_amount_by_status.denied = sums.denied / stats.denied_count;
    }
    if (stats.approved_count) {
      stats.average_amount_by_status.approved = sums.approved / stats.approved_count;
    }
    if (stats.pending_count) {
      stats.average_amount_by_status.pending = sums.pending / stats.pending_count;
    }

    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
