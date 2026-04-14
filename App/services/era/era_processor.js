const crypto = require('crypto');
const { get, run } = require('../claim_ingestion_api/db');
const { recordClaimRevenue } = require('../revenue/revenue_tracker');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const { applyClaimLifecycle } = require('../pipeline/intake_pipeline');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[$,\s]/g, '');
  if (normalized === '') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function generateEraId(createdAt) {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERA-${createdAt}-${randomPart}`;
}

function normalizeIdentityTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return 'missing';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? String(parsed) : 'missing';
}

function formatIdentityAmount(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return String(value);
}

function computeExternalEventId(era, normalized) {
  const explicitEventId = normalizeString(
    era?.external_event_id
    || era?.event_id
    || era?.reference
    || era?.era_reference
    || era?.transaction_id
  );

  if (explicitEventId) {
    return explicitEventId;
  }

  const identityPayload = [
    normalizeString(normalized.claim_id) || 'missing',
    normalizeString(normalized.status) || 'missing',
    formatIdentityAmount(normalized.paid_amount),
    formatIdentityAmount(normalized.billed_amount),
    normalizeIdentityTimestamp(era?.processed_at)
  ].join('|');

  const digest = crypto
    .createHash('sha256')
    .update(identityPayload)
    .digest('hex');

  return `era_${digest}`;
}

async function processERA(era = {}, options = {}) {
  const claim_id = normalizeString(era.claim_id);
  if (!claim_id) {
    return {
      ok: false,
      error: 'claim_id is required'
    };
  }

  const claim = await get(
    `SELECT * FROM claims WHERE claim_id = ?`,
    [claim_id]
  );

  if (!claim) {
    return {
      ok: false,
      error: 'Claim not found'
    };
  }

  const status = normalizeString(era.status);
  const normalizedStatus = status ? status.toLowerCase() : null;
  const derivedClaimStatus = normalizedStatus === 'paid' || normalizedStatus === 'partial'
    ? 'paid'
    : normalizedStatus === 'denied'
      ? 'failed'
      : null;

  if (!derivedClaimStatus) {
    return {
      ok: false,
      error: 'Invalid ERA status'
    };
  }

  const paid_amount = normalizeAmount(era.paid_amount);
  const billed_amount = normalizeAmount(era.billed_amount);
  const payer = normalizeString(era.payer);
  const created_at = normalizeTimestamp(era.processed_at);
  const external_event_id = computeExternalEventId(era, {
    claim_id,
    status: normalizedStatus,
    paid_amount,
    billed_amount
  });
  const existingEra = await get(
    `SELECT * FROM eras WHERE external_event_id = ?`,
    [external_event_id]
  );

  if (existingEra) {
    return {
      ok: true,
      duplicate: true,
      skipped: true,
      era: existingEra
    };
  }

  const era_id = generateEraId(created_at);
  const raw_payload = JSON.stringify({
    external_event_id,
    claim_id,
    paid_amount,
    billed_amount,
    status: normalizedStatus,
    payer,
    processed_at: created_at
  });

  await run('BEGIN TRANSACTION');

  try {
    await run(
      `INSERT INTO eras (
        era_id,
        external_event_id,
        claim_id,
        paid_amount,
        billed_amount,
        status,
        raw_payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        era_id,
        external_event_id,
        claim_id,
        paid_amount,
        billed_amount,
        normalizedStatus,
        raw_payload,
        created_at
      ]
    );

    await run(
      `UPDATE claims
       SET recovered_amount = ?,
           updated_at = ?
       WHERE claim_id = ?`,
      [
        paid_amount,
        created_at,
        claim_id
      ]
    );

    await applyClaimLifecycle({
      claimId: claim_id,
      claim: {
        ...claim,
        recovered_amount: paid_amount,
        updated_at: created_at
      },
      context: {
        submission_result: derivedClaimStatus
      },
      timestamp: created_at,
      options: {
        trigger: 'era',
        context: {
          era_status: normalizedStatus,
          external_event_id
        }
      }
    });

    await recordClaimRevenue(
      {
        claim_id,
        recovered_amount: paid_amount,
        status: derivedClaimStatus,
        updated_at: created_at
      },
      {
        ...era,
        claim_id,
        paid_amount,
        billed_amount,
        status: normalizedStatus,
        payer,
        processed_at: created_at
      }
    );

    await run('COMMIT');
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (rollbackErr) {
      // Preserve the original error.
    }

    if (String(err.message || '').includes('idx_eras_external_event_id') || String(err.message || '').includes('external_event_id')) {
      const duplicateEra = await get(
        `SELECT * FROM eras WHERE external_event_id = ?`,
        [external_event_id]
      );

      return {
        ok: true,
        duplicate: true,
        skipped: true,
        era: duplicateEra || {
          external_event_id
        }
      };
    }

    throw err;
  }

  await logAuditEventBestEffort({
    identity: options.identity || null,
    action: 'era_processed',
    resource_type: 'claim',
    resource_id: claim_id,
    metadata: {
      era_id,
      external_event_id,
      status: normalizedStatus,
      paid_amount,
      billed_amount
    }
  });

  return {
    ok: true,
    era: {
      era_id,
      external_event_id,
      claim_id,
      paid_amount,
      billed_amount,
      status: normalizedStatus,
      raw_payload,
      created_at
    },
    claim: {
      claim_id,
      recovered_amount: paid_amount,
      status: derivedClaimStatus,
      updated_at: created_at
    }
  };
}

module.exports = {
  processERA
};
