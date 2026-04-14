const { run } = require('../claim_ingestion_api/db');
const { createInvoice } = require('../billing/invoice_service');
const { getRecoverySummary } = require('../billing/revenue_definition');

async function recordClaimRevenue(claim = {}, era = {}) {
  const claim_id = claim && claim.claim_id ? String(claim.claim_id) : null;
  const recoverySummary = getRecoverySummary({
    claim,
    event: era
  });
  const created_at = Number.isFinite(Number(era.processed_at))
    ? Number(era.processed_at)
    : Date.now();

  const result = await run(
    `INSERT INTO claim_revenue (
      claim_id,
      recovered_amount,
      clearinghouse_cost,
      platform_fee_percent,
      platform_fee_amount,
      net_due,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      claim_id,
      recoverySummary.recovered_amount,
      recoverySummary.clearinghouse_cost,
      recoverySummary.platform_fee_percent,
      recoverySummary.platform_fee_amount,
      recoverySummary.invoiceable_amount,
      created_at
    ]
  );

  const revenueRow = {
    id: result.id,
    claim_id,
    recovered_amount: recoverySummary.recovered_amount,
    clearinghouse_cost: recoverySummary.clearinghouse_cost,
    platform_fee_percent: recoverySummary.platform_fee_percent,
    platform_fee_amount: recoverySummary.platform_fee_amount,
    net_due: recoverySummary.invoiceable_amount,
    created_at
  };

  if (revenueRow.net_due > 0) {
    await createInvoice(revenueRow);
  }

  return revenueRow;
}

module.exports = {
  recordClaimRevenue
};
