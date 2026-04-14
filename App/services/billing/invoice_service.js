const { run } = require('../claim_ingestion_api/db');
const { getInvoiceableAmount } = require('./revenue_definition');

async function createInvoice(revenue = {}) {
  const amount_due = getInvoiceableAmount(revenue);

  if (amount_due <= 0) {
    return null;
  }

  const created_at = Number.isFinite(Number(revenue.created_at))
    ? Number(revenue.created_at)
    : Date.now();
  const claim_id = revenue.claim_id ? String(revenue.claim_id) : null;
  const revenue_id = Number.isFinite(Number(revenue.id))
    ? Number(revenue.id)
    : null;
  const amount_paid = 0;
  const remaining_balance = amount_due;
  const due_date = null;

  const result = await run(
    `INSERT OR IGNORE INTO invoices (
      claim_id,
      revenue_id,
      amount_due,
      amount_paid,
      remaining_balance,
      due_date,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      claim_id,
      revenue_id,
      amount_due,
      amount_paid,
      remaining_balance,
      due_date,
      'pending',
      created_at
    ]
  );

  if (!result.changes) {
    return null;
  }

  return {
    id: result.id,
    claim_id,
    revenue_id,
    amount_due,
    amount_paid,
    remaining_balance,
    due_date,
    status: 'pending',
    created_at
  };
}

module.exports = {
  createInvoice
};
