const express = require('express');
const router = express.Router();
const { get, all } = require('./db');
const {
  getCustomerVisibleStatus,
  parseAdditionalData
} = require('./claim_model');
const { requireCustomerRole } = require('./role_middleware');
const { logAuditEventBestEffort } = require('../audit/audit_log');

router.use('/api/customer', requireCustomerRole);

function parseJsonSafely(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function shapeCustomerClaim(row) {
  const customerStatus = getCustomerVisibleStatus(row?.status);

  if (!row || !customerStatus) {
    return null;
  }

  return {
    claim_id: row.claim_id,
    customer_id: row.customer_id ?? null,
    patient: row.patient ?? null,
    payer: row.payer ?? null,
    status: customerStatus,
    denial_reason: row.denial_reason ?? null,
    denial_type: row.denial_type ?? null,
    amount: row.amount ?? null,
    recovered_amount: row.recovered_amount ?? null,
    date_of_service: row.date_of_service ?? null,
    additional_data: parseAdditionalData(row.additional_data),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

function formatCustomerHistoryRecord(row) {
  const response = parseJsonSafely(row.response, null);
  const errors = Array.isArray(response && response.errors)
    ? response.errors
    : row.error
      ? [row.error]
      : [];

  return {
    ...row,
    status: getCustomerVisibleStatus(row.status),
    payload: null,
    response: response || null,
    errors,
    clearinghouse_status: row.clearinghouse_status || (response ? response.status : null),
    clearinghouse_id: row.clearinghouse_id || (response ? response.clearinghouse_id : null),
    error: row.error || (response ? response.error : null) || null
  };
}

async function getCustomerClaimRow(claimId, customerId) {
  return get(
    `SELECT
       c.*,
       ce.denial_type
     FROM claims c
     LEFT JOIN claims_enrichment ce
       ON ce.claim_id = c.claim_id
     WHERE c.claim_id = ?
       AND c.customer_id = ?`,
    [claimId, customerId]
  );
}

router.get('/api/customer/claims', async (req, res) => {
  try {
    const customerId = req.identity?.customer_id;

    const rows = await all(
      `SELECT
         c.*,
         ce.denial_type
       FROM claims c
       LEFT JOIN claims_enrichment ce
         ON ce.claim_id = c.claim_id
       WHERE c.customer_id = ?
       ORDER BY c.created_at DESC`,
      [customerId]
    );

    const claims = Array.isArray(rows)
      ? rows
        .map(shapeCustomerClaim)
        .filter(Boolean)
      : [];

    res.json({
      ok: true,
      count: claims.length,
      processing: claims.length === 0 && Array.isArray(rows) && rows.length > 0,
      claims
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/customer/claims/:id', async (req, res) => {
  try {
    const customerId = req.identity?.customer_id;

    const row = await getCustomerClaimRow(req.params.id, customerId);
    const claim = shapeCustomerClaim(row);

    if (!claim) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found'
      });
    }

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'customer_case_viewed',
      resource_type: 'claim',
      resource_id: claim.claim_id,
      metadata: {
        status: claim.status
      }
    });

    res.json({
      ok: true,
      claim
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/customer/claims/:id/history', async (req, res) => {
  try {
    const customerId = req.identity?.customer_id;

    const row = await getCustomerClaimRow(req.params.id, customerId);
    const claim = shapeCustomerClaim(row);

    if (!claim) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found'
      });
    }

    const historyRows = await all(
      `SELECT *
       FROM submissions
       WHERE claim_id = ?
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      ok: true,
      history: Array.isArray(historyRows)
        ? historyRows
          .map(formatCustomerHistoryRecord)
          .filter(entry => Boolean(entry.status))
        : []
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
