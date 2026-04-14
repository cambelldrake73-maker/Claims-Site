const { run } = require('../claim_ingestion_api/db');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeRole(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function serializeMetadata(metadata) {
  if (metadata === undefined) {
    return null;
  }

  if (metadata === null) {
    return JSON.stringify(null);
  }

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return JSON.stringify(metadata);
  }

  const filteredEntries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined);

  return JSON.stringify(Object.fromEntries(filteredEntries));
}

function buildAuditRecord(event = {}) {
  const identity = event.identity && typeof event.identity === 'object'
    ? event.identity
    : null;

  const user_id = normalizeString(identity?.user_id);
  const role = normalizeRole(identity?.role);
  const customer_id = normalizeString(identity?.customer_id);
  const action = normalizeString(event.action);
  const resource_type = normalizeString(event.resource_type);
  const resource_id = normalizeString(event.resource_id);
  const created_at = Number.isFinite(Number(event.created_at))
    ? Number(event.created_at)
    : Date.now();

  if (!action) {
    throw new Error('action is required');
  }

  return {
    user_id,
    role,
    customer_id,
    action,
    resource_type,
    resource_id,
    metadata: serializeMetadata(event.metadata),
    created_at
  };
}

async function logAuditEvent(event = {}) {
  const record = buildAuditRecord(event);

  const result = await run(
    `INSERT INTO audit_logs (
      user_id,
      role,
      customer_id,
      action,
      resource_type,
      resource_id,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.user_id,
      record.role,
      record.customer_id,
      record.action,
      record.resource_type,
      record.resource_id,
      record.metadata,
      record.created_at
    ]
  );

  return {
    id: result.id,
    ...record
  };
}

async function logAuditEventBestEffort(event = {}) {
  try {
    return await logAuditEvent(event);
  } catch (err) {
    console.error('Audit log write failed', err);
    return null;
  }
}

module.exports = {
  logAuditEvent,
  logAuditEventBestEffort
};
