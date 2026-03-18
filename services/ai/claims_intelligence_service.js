const { all } = require('../claim_ingestion_api/db');

async function getClaimsIntelligenceSummary() {
  const rows = await all(`SELECT status, amount FROM claims`);

  const summary = {
    total_claims: rows.length,
    denied_count: 0,
    approved_count: 0,
    pending_count: 0,
    average_amount_by_status: {
      denied: 0,
      approved: 0,
      pending: 0
    }
  };

  const sums = {
    denied: 0,
    approved: 0,
    pending: 0
  };

  rows.forEach(row => {
    const status = String(row.status || '').toLowerCase();
    const amount = Number(row.amount || 0);

    if (status === 'denied') {
      summary.denied_count += 1;
      sums.denied += amount;
    } else if (status === 'approved') {
      summary.approved_count += 1;
      sums.approved += amount;
    } else if (status === 'pending') {
      summary.pending_count += 1;
      sums.pending += amount;
    }
  });

  if (summary.denied_count) {
    summary.average_amount_by_status.denied = sums.denied / summary.denied_count;
  }
  if (summary.approved_count) {
    summary.average_amount_by_status.approved = sums.approved / summary.approved_count;
  }
  if (summary.pending_count) {
    summary.average_amount_by_status.pending = sums.pending / summary.pending_count;
  }

  return summary;
}

module.exports = {
  getClaimsIntelligenceSummary
};
