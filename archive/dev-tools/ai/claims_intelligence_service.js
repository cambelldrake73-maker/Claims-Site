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
  const rows = await queryAll(`
    SELECT
      c.status,
      c.amount,
      c.payer,
      ce.denial_type
    FROM claims c
    LEFT JOIN claims_enrichment ce
      ON c.claim_id = ce.claim_id
  `);

  const summary = {
    total_cases: rows.length,
    needs_review_count: 0,
    submitted_count: 0,
    failed_count: 0,
    submitted_recovery_value: 0,
    average_amount_by_status: {
      failed: 0,
      approved: 0,
      needs_review: 0
    },
    top_denial_types: [],
    payer_denials: []
  };

  const sums = {
    failed: 0,
    approved: 0,
    needs_review: 0
  };
  rows.forEach(row => {
    const status = String(row.status || '').toLowerCase();
    const amount = Number(row.amount || 0);

    if (status === 'needs_review') {
      summary.needs_review_count += 1;
      sums.needs_review += amount;
    } else if (status === 'submitted' || status === 'approved' || status === 'paid') {
      summary.submitted_count += 1;
      summary.submitted_recovery_value += amount;

      if (status === 'approved') {
        sums.approved += amount;
      }
    } else if (status === 'failed') {
      summary.failed_count += 1;
      sums.failed += amount;
    }
  });

  const failedCount = rows.filter(r => String(r.status || '').toLowerCase() === 'failed').length;
  const approvedCount = rows.filter(r => String(r.status || '').toLowerCase() === 'approved').length;
  const needsReviewCount = rows.filter(r => String(r.status || '').toLowerCase() === 'needs_review').length;

  if (failedCount) {
    summary.average_amount_by_status.failed = sums.failed / failedCount;
  }
  if (approvedCount) {
    summary.average_amount_by_status.approved = sums.approved / approvedCount;
  }
  if (needsReviewCount) {
    summary.average_amount_by_status.needs_review = sums.needs_review / needsReviewCount;
  }

  const denialTypeRows = await queryAll(`
    SELECT ce.denial_type, COUNT(*) as count
    FROM claims c
    LEFT JOIN claims_enrichment ce
      ON c.claim_id = ce.claim_id
    GROUP BY ce.denial_type
    ORDER BY count DESC
    LIMIT 5
  `);

  summary.top_denial_types = denialTypeRows;

  const payerRows = await queryAll(`
    SELECT payer, COUNT(*) as count
    FROM claims
    WHERE status = 'failed'
    GROUP BY payer
    ORDER BY count DESC
  `);

  summary.payer_denials = payerRows;

  return summary;
}

module.exports = {
  getClaimsIntelligenceSummary
};
