const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { normalizeClaimStatus } = require('./claim_model');

function getStatsStatusBucket(status) {
  const normalized = normalizeClaimStatus(status, 'uploaded');
  return normalized === 'uploaded' ? 'processing' : normalized;
}

router.get('/api/claims/stats', async (req, res) => {
  try {
    const rows = await all('SELECT status, amount FROM claims');

    const stats = {
      total_claims: rows.length,
      failed_count: 0,
      approved_count: 0,
      needs_review_count: 0,
      status_counts: {
        processing: 0,
        in_review: 0,
        ready_for_submission: 0,
        submitted: 0,
        recovered: 0,
        not_recoverable: 0
      },
      average_amount: 0,
      average_amount_by_status: {
        processing: 0,
        in_review: 0,
        ready_for_submission: 0,
        submitted: 0,
        recovered: 0,
        not_recoverable: 0
      }
    };

    let totalAmount = 0;
    const sums = {
      processing: 0,
      in_review: 0,
      ready_for_submission: 0,
      submitted: 0,
      recovered: 0,
      not_recoverable: 0
    };

    rows.forEach(row => {
      const status = getStatsStatusBucket(row.status);
      const amount = Number(row.amount || 0);

      totalAmount += amount;

      if (Object.prototype.hasOwnProperty.call(stats.status_counts, status)) {
        stats.status_counts[status] += 1;
        sums[status] += amount;
      }
    });

    stats.failed_count = stats.status_counts.not_recoverable;
    stats.approved_count = stats.status_counts.ready_for_submission;
    stats.needs_review_count = stats.status_counts.in_review;

    if (rows.length) {
      stats.average_amount = totalAmount / rows.length;
    }

    Object.entries(stats.status_counts).forEach(([status, count]) => {
      if (count > 0) {
        stats.average_amount_by_status[status] = sums[status] / count;
      }
    });

    stats.average_amount_by_status.failed = stats.average_amount_by_status.not_recoverable;
    stats.average_amount_by_status.approved = stats.average_amount_by_status.ready_for_submission;
    stats.average_amount_by_status.needs_review = stats.average_amount_by_status.in_review;

    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
