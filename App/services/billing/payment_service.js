const { get, run } = require('../claim_ingestion_api/db');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const {
  normalizeAmount,
  getInvoiceAmountPaid,
  getInvoicePaymentStatus,
  getRemainingBalance,
  getInvoiceableAmount
} = require('./revenue_definition');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return Date.now();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function shapeInvoice(row) {
  if (!row) {
    return null;
  }

  const amount_due = getInvoiceableAmount(row);
  const amount_paid = getInvoiceAmountPaid(row);
  const remaining_balance = getRemainingBalance({
    ...row,
    amount_due,
    amount_paid
  });

  return {
    id: row.id,
    claim_id: row.claim_id,
    revenue_id: row.revenue_id,
    amount_due,
    amount_paid,
    remaining_balance,
    due_date: row.due_date ?? null,
    status: row.status,
    paid_at: row.paid_at ?? null,
    payment_method: row.payment_method ?? null,
    payment_reference: row.payment_reference ?? null,
    created_at: row.created_at
  };
}

function shapePayment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    invoice_id: Number.isFinite(Number(row.invoice_id))
      ? Number(row.invoice_id)
      : null,
    payment_reference: row.payment_reference ?? null,
    amount: normalizeAmount(row.amount) || 0,
    method: row.method ?? null,
    paid_at: row.paid_at ?? null,
    raw_payment: row.raw_payment ?? null,
    created_at: row.created_at ?? null
  };
}

async function loadInvoicePaymentSummary(invoiceId) {
  const summary = await get(
    `SELECT
       COALESCE(SUM(amount), 0) AS total_paid,
       MAX(paid_at) AS latest_paid_at
     FROM invoice_payments
     WHERE invoice_id = ?`,
    [invoiceId]
  );

  const latestPayment = await get(
    `SELECT payment_reference, method, paid_at
     FROM invoice_payments
     WHERE invoice_id = ?
     ORDER BY paid_at DESC, id DESC
     LIMIT 1`,
    [invoiceId]
  );

  return {
    total_paid: normalizeAmount(summary?.total_paid) || 0,
    latest_paid_at: latestPayment && Number.isFinite(Number(latestPayment.paid_at))
      ? Number(latestPayment.paid_at)
      : null,
    latest_payment_reference: normalizeString(latestPayment?.payment_reference),
    latest_payment_method: normalizeString(latestPayment?.method)
  };
}

async function markInvoicePaid(invoice_id, payment = {}) {
  const normalizedInvoiceId = Number(invoice_id);

  if (!Number.isFinite(normalizedInvoiceId)) {
    return {
      ok: false,
      error: 'Invalid invoice_id'
    };
  }

  const existingInvoice = await get(
    `SELECT * FROM invoices WHERE id = ?`,
    [normalizedInvoiceId]
  );

  if (!existingInvoice) {
    return {
      ok: false,
      error: 'Invoice not found'
    };
  }

  const payment_amount = normalizeAmount(payment.amount);
  if (payment_amount === null || payment_amount <= 0) {
    return {
      ok: false,
      error: 'payment.amount must be greater than 0'
    };
  }

  const payment_method = normalizeString(payment.method);
  const payment_reference = normalizeString(payment.reference);
  const paid_at = normalizeTimestamp(payment.paid_at);
  const raw_payment = JSON.stringify(
    payment && typeof payment === 'object' && !Array.isArray(payment)
      ? payment
      : {}
  );

  if (payment_reference) {
    const existingPayment = await get(
      `SELECT * FROM invoice_payments WHERE payment_reference = ?`,
      [payment_reference]
    );

    if (existingPayment) {
      if (Number(existingPayment.invoice_id) !== normalizedInvoiceId) {
        return {
          ok: false,
          error: 'payment reference already exists for another invoice'
        };
      }

      const currentInvoice = await get(
        `SELECT * FROM invoices WHERE id = ?`,
        [normalizedInvoiceId]
      );

      return {
        ok: true,
        invoice: shapeInvoice(currentInvoice),
        payment: shapePayment(existingPayment),
        duplicate: true,
        skipped: true
      };
    }
  }

  try {
    await run('BEGIN TRANSACTION');

    await run(
      `INSERT INTO invoice_payments (
        invoice_id,
        payment_reference,
        amount,
        method,
        paid_at,
        raw_payment,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedInvoiceId,
        payment_reference,
        payment_amount,
        payment_method,
        paid_at,
        raw_payment,
        Date.now()
      ]
    );

    const amount_due = getInvoiceableAmount(existingInvoice);
    const paymentSummary = await loadInvoicePaymentSummary(normalizedInvoiceId);
    const amount_paid = Number((paymentSummary.total_paid || 0).toFixed(2));
    const remaining_balance = getRemainingBalance({
      amount_due,
      amount_paid
    });
    const nextStatus = getInvoicePaymentStatus({
      amount_due,
      amount_paid,
      remaining_balance
    });
    const invoicePaidAt = nextStatus === 'paid'
      ? paymentSummary.latest_paid_at
      : null;
    const invoicePaymentMethod = amount_paid > 0
      ? paymentSummary.latest_payment_method
      : null;
    const invoicePaymentReference = amount_paid > 0
      ? paymentSummary.latest_payment_reference
      : null;

    await run(
      `UPDATE invoices
       SET status = ?,
           amount_paid = ?,
           remaining_balance = ?,
           paid_at = ?,
           payment_method = ?,
           payment_reference = ?
       WHERE id = ?`,
      [
        nextStatus,
        amount_paid,
        remaining_balance,
        invoicePaidAt,
        invoicePaymentMethod,
        invoicePaymentReference,
        normalizedInvoiceId
      ]
    );

    await run('COMMIT');
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (rollbackErr) {
      // Preserve the original payment failure.
    }

    if (payment_reference && /UNIQUE constraint failed: invoice_payments\.payment_reference/i.test(err.message)) {
      const existingPayment = await get(
        `SELECT * FROM invoice_payments WHERE payment_reference = ?`,
        [payment_reference]
      );

      if (existingPayment && Number(existingPayment.invoice_id) === normalizedInvoiceId) {
        const currentInvoice = await get(
          `SELECT * FROM invoices WHERE id = ?`,
          [normalizedInvoiceId]
        );

        return {
          ok: true,
          invoice: shapeInvoice(currentInvoice),
          payment: shapePayment(existingPayment),
          duplicate: true,
          skipped: true
        };
      }
    }

    throw err;
  }

  const updatedInvoice = await get(
    `SELECT * FROM invoices WHERE id = ?`,
    [normalizedInvoiceId]
  );
  const latestPayment = payment_reference
    ? await get(
        `SELECT * FROM invoice_payments WHERE payment_reference = ?`,
        [payment_reference]
      )
    : await get(
        `SELECT *
         FROM invoice_payments
         WHERE invoice_id = ?
         ORDER BY paid_at DESC, id DESC
         LIMIT 1`,
        [normalizedInvoiceId]
      );

  await logAuditEventBestEffort({
    identity: payment.identity || payment.audit_context || null,
    action: 'invoice_marked_paid',
    resource_type: 'invoice',
    resource_id: String(normalizedInvoiceId),
    metadata: {
      payment_reference: latestPayment?.payment_reference ?? null,
      amount: normalizeAmount(latestPayment?.amount),
      method: latestPayment?.method ?? null,
      invoice_status: updatedInvoice?.status ?? null,
      remaining_balance: normalizeAmount(updatedInvoice?.remaining_balance)
    }
  });

  return {
    ok: true,
    invoice: shapeInvoice(updatedInvoice),
    payment: shapePayment(latestPayment),
    duplicate: false
  };
}

module.exports = {
  markInvoicePaid
};
