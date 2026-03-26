const { db } = require('../claim_ingestion_api/db');

function queryAll(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getClaimsIntelligenceSummary() {
  const rows = await queryAll(`SELECT status, amount FROM claims`);

  const summary = {
    total_cases: rows.length,
    under_review_count: 0,
    submitted_count: 0,
    not_recoverable_count: 0,
    submitted_recovery_value: 0,
    average_amount_by_status: {
      denied: 0,
      approved: 0,
      pending: 0
    },
    top_denial_reasons: [],
    payer_denials: []
  };

  const sums = {
    denied: 0,
    approved: 0,
    pending: 0
  };
rows.forEach(row => {
  const status = String(row.status || '').toLowerCase();
  const amount = Number(row.amount || 0);

  // UNDER REVIEW BUCKET (your main working pool)
  if (
    status === 'denied' ||
    status === 'pending' ||
    status === 'under_review'
  ) {
    summary.under_review_count += 1;

    // track only DENIED value here (this is your opportunity pool)
    if (status === 'denied') {
      sums.denied += amount;
    }

  // SUBMITTED (this is your actual business value)
  } else if (
    status === 'submitted' ||
    status === 'approved'
  ) {
    summary.submitted_count += 1;
    summary.submitted_recovery_value += amount;

    if (status === 'approved') {
      sums.approved += amount;
    }

  // DEAD / NOT WORTH IT
  } else if (
    status === 'not_recoverable' ||
    status === 'rejected'
  ) {
    summary.not_recoverable_count += 1;
  }
});
  const deniedCount = rows.filter(r => String(r.status || '').toLowerCase() === 'denied').length;
  const approvedCount = rows.filter(r => String(r.status || '').toLowerCase() === 'approved').length;
  const pendingCount = rows.filter(r => String(r.status || '').toLowerCase() === 'pending').length;

  if (deniedCount) {
    summary.average_amount_by_status.denied = sums.denied / deniedCount;
  }
  if (approvedCount) {
    summary.average_amount_by_status.approved = sums.approved / approvedCount;
  }
  if (pendingCount) {
    summary.average_amount_by_status.pending = sums.pending / pendingCount;
  }

  const denialRows = await queryAll(`
    SELECT denial_reason, COUNT(*) as count
    FROM claims
    WHERE status = 'denied'
    GROUP BY denial_reason
    ORDER BY count DESC
    LIMIT 5
  `);

  summary.top_denial_reasons = denialRows;

  const payerRows = await queryAll(`
    SELECT payer, COUNT(*) as count
    FROM claims
    WHERE status = 'denied'
    GROUP BY payer
    ORDER BY count DESC
  `);

  summary.payer_denials = payerRows;

  return summary;
}

module.exports = {
  getClaimsIntelligenceSummary
};
