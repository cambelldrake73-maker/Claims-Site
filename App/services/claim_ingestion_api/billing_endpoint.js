const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { getCustomerVisibleStatus } = require('./claim_model');
const {
  requireOperatorRole,
  requireCustomerRole
} = require('./role_middleware');
const {
  getInvoiceAmountPaid,
  getInvoicePaymentStatus,
  getRemainingBalance,
  getRecoverySummary
} = require('../billing/revenue_definition');

function shapeOperatorPayment(row) {
  if (!row) {
    return null;
  }

  return {
    reference: row.payment_reference ?? null,
    amount: normalizeAmount(row.amount),
    method: row.method ?? null,
    paid_at: row.paid_at ?? null
  };
}

function shapeOperatorInvoice(row, paymentHistory = []) {
  const recoverySummary = getRecoverySummary(row);
  const amount_due = recoverySummary.invoiceable_amount;
  const amount_paid = getInvoiceAmountPaid(row);
  const remaining_balance = getRemainingBalance({
    ...row,
    amount_due,
    amount_paid
  });
  const payment_status = getInvoicePaymentStatus({
    ...row,
    amount_due,
    amount_paid,
    remaining_balance
  });

  return {
    invoice_id: row.id,
    claim_id: row.claim_id ?? null,
    revenue_id: row.revenue_id ?? null,
    upload: {
      upload_id: row.upload_id ?? null,
      upload_name: row.upload_name ?? null,
      provider_name: row.provider_name ?? null,
      niche: row.niche ?? null
    },
    recovered_amount: recoverySummary.recovered_amount,
    clearinghouse_cost: recoverySummary.clearinghouse_cost,
    platform_fee_percent: recoverySummary.platform_fee_percent,
    platform_fee_amount: recoverySummary.platform_fee_amount,
    amount_due,
    amount_paid,
    remaining_balance,
    invoice_status: row.status ?? null,
    payment_status,
    due_date: row.due_date ?? null,
    paid_at: row.paid_at ?? null,
    payment_method: row.payment_method ?? null,
    payment_reference: row.payment_reference ?? null,
    payment_history: Array.isArray(paymentHistory) ? paymentHistory : [],
    created_at: row.created_at ?? null
  };
}

function shapeCustomerInvoice(row) {
  const amount_due = getRecoverySummary(row).invoiceable_amount;
  const amount_paid = getInvoiceAmountPaid(row);
  const remaining_balance = getRemainingBalance({
    ...row,
    amount_due,
    amount_paid
  });
  const payment_status = getInvoicePaymentStatus({
    ...row,
    amount_due,
    amount_paid,
    remaining_balance
  });

  return {
    invoice_id: row.id,
    upload_reference: row.upload_name || row.upload_id || null,
    upload_name: row.upload_name || null,
    amount_due,
    amount_paid,
    remaining_balance,
    invoice_status: row.status ?? null,
    payment_status,
    created_at: row.created_at ?? null,
    paid_at: row.paid_at ?? null,
    due_date: row.due_date ?? null
  };
}

async function loadInvoiceRows() {
  return all(
    `SELECT
       i.*,
       cr.recovered_amount,
       cr.clearinghouse_cost,
       cr.platform_fee_percent,
       cr.platform_fee_amount,
       cr.net_due,
       c.customer_id,
       c.status AS claim_status,
       c.upload_id,
       u.upload_name,
       u.provider_name,
       u.niche
     FROM invoices i
     LEFT JOIN claim_revenue cr
       ON cr.id = i.revenue_id
     LEFT JOIN claims c
       ON c.claim_id = i.claim_id
     LEFT JOIN uploads u
       ON u.upload_id = c.upload_id
     ORDER BY i.created_at DESC, i.id DESC`
  );
}

async function loadInvoicePaymentRows() {
  return all(
    `SELECT
       invoice_id,
       payment_reference,
       amount,
       method,
       paid_at
     FROM invoice_payments
     ORDER BY paid_at DESC, id DESC`
  );
}

router.get('/api/billing/invoices', requireOperatorRole, async (req, res) => {
  try {
    const [rows, paymentRows] = await Promise.all([
      loadInvoiceRows(),
      loadInvoicePaymentRows()
    ]);
    const paymentHistoryByInvoiceId = new Map();

    (Array.isArray(paymentRows) ? paymentRows : []).forEach(row => {
      const invoiceId = Number(row.invoice_id);

      if (!Number.isFinite(invoiceId)) {
        return;
      }

      if (!paymentHistoryByInvoiceId.has(invoiceId)) {
        paymentHistoryByInvoiceId.set(invoiceId, []);
      }

      paymentHistoryByInvoiceId.get(invoiceId).push(shapeOperatorPayment(row));
    });

    const invoices = Array.isArray(rows)
      ? rows.map(row => shapeOperatorInvoice(
          row,
          paymentHistoryByInvoiceId.get(Number(row.id)) || []
        ))
      : [];

    res.json({
      ok: true,
      count: invoices.length,
      invoices
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/customer/billing/invoices', requireCustomerRole, async (req, res) => {
  try {
    const customerId = req.identity?.customer_id;

    const rows = await loadInvoiceRows();
    const invoices = Array.isArray(rows)
      ? rows
        .filter(row => row.customer_id === customerId)
        .filter(row => Boolean(getCustomerVisibleStatus(row.claim_status)))
        .map(shapeCustomerInvoice)
      : [];

    res.json({
      ok: true,
      count: invoices.length,
      invoices
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
