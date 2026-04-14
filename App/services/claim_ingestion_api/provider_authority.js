const crypto = require('crypto');

const { get, run } = require('./db');
const { decryptSecret, encryptSecret } = require('../security/secret_crypto');
const {
  loadUploadContextsForClaim,
  resolveProviderContextFromUploads
} = require('./upload_context');

const PROVIDER_CONNECTION_METADATA_COLUMNS = [
  'id',
  'provider_id',
  'provider_name',
  'clearinghouse_name',
  'connection_type',
  'provider_npi',
  'tax_id',
  'submitter_id',
  'receiver_id',
  'credential_status',
  'is_active',
  'created_at',
  'updated_at'
];

function buildProviderConnectionSelect({ includeSecrets = false } = {}) {
  const columns = includeSecrets
    ? PROVIDER_CONNECTION_METADATA_COLUMNS.concat([
        'config_json',
        'encrypted_config',
        'encrypted_config_iv',
        'encrypted_config_tag'
      ])
    : PROVIDER_CONNECTION_METADATA_COLUMNS;

  return `SELECT ${columns.join(', ')} FROM provider_clearinghouse_connections`;
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }

  const normalized = normalizeString(value);

  if (!normalized) {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(normalized)) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(normalized)) {
    return false;
  }

  return fallback;
}

function buildProviderKey(providerName) {
  const normalized = normalizeString(providerName);
  return normalized ? normalized.toLowerCase() : null;
}

function generateProviderId() {
  return `prov_${crypto.randomBytes(8).toString('hex')}`;
}

function shapeProvider(row) {
  if (!row) {
    return null;
  }

  return {
    provider_id: normalizeString(row.provider_id),
    provider_name: normalizeString(row.provider_name),
    provider_key: normalizeString(row.provider_key),
    provider_npi: normalizeString(row.provider_npi),
    tax_id: normalizeString(row.tax_id),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

async function getProviderById(providerId) {
  const normalizedProviderId = normalizeString(providerId);

  if (!normalizedProviderId) {
    return null;
  }

  const row = await get(
    `SELECT * FROM providers WHERE provider_id = ?`,
    [normalizedProviderId]
  );

  return shapeProvider(row);
}

async function getProviderByName(providerName) {
  const providerKey = buildProviderKey(providerName);

  if (!providerKey) {
    return null;
  }

  const row = await get(
    `SELECT * FROM providers WHERE provider_key = ?`,
    [providerKey]
  );

  return shapeProvider(row);
}

async function resolveStableProviderRecord(providerContext = {}) {
  const providerId = normalizeString(providerContext.provider_id);

  if (providerId) {
    const providerById = await getProviderById(providerId);

    if (providerById) {
      return providerById;
    }
  }

  return null;
}

async function ensureProviderRecord(input = {}, options = {}) {
  const providerId = normalizeString(input.provider_id);
  const providerName = normalizeString(input.provider_name);
  const providerKey = buildProviderKey(providerName);
  const providerNpi = normalizeString(input.provider_npi);
  const taxId = normalizeString(input.tax_id);
  const timestamp = Number.isFinite(Number(options.timestamp))
    ? Number(options.timestamp)
    : Date.now();

  if (!providerId && !providerKey) {
    return null;
  }

  let existing = providerId
    ? await getProviderById(providerId)
    : await getProviderByName(providerName);

  if (!existing && providerId && providerKey) {
    existing = await getProviderByName(providerName);
  }

  if (existing) {
    const nextProviderName = providerName || existing.provider_name;
    const nextProviderKey = buildProviderKey(nextProviderName);
    const nextProviderNpi = providerNpi || existing.provider_npi;
    const nextTaxId = taxId || existing.tax_id;

    const hasChanges = (
      nextProviderName !== existing.provider_name
      || nextProviderKey !== existing.provider_key
      || nextProviderNpi !== existing.provider_npi
      || nextTaxId !== existing.tax_id
    );

    if (hasChanges) {
      await run(
        `UPDATE providers
         SET provider_name = ?,
             provider_key = ?,
             provider_npi = ?,
             tax_id = ?,
             updated_at = ?
         WHERE provider_id = ?`,
        [
          nextProviderName,
          nextProviderKey,
          nextProviderNpi,
          nextTaxId,
          timestamp,
          existing.provider_id
        ]
      );
    }

    return getProviderById(existing.provider_id);
  }

  if (!providerKey || !providerName) {
    return null;
  }

  const nextProviderId = providerId || generateProviderId();

  await run(
    `INSERT INTO providers (
      provider_id,
      provider_name,
      provider_key,
      provider_npi,
      tax_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      nextProviderId,
      providerName,
      providerKey,
      providerNpi,
      taxId,
      timestamp,
      timestamp
    ]
  );

  return getProviderById(nextProviderId);
}

function getClaimVersionMarker(claim = {}) {
  const updatedAt = Number(claim.updated_at);

  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    return updatedAt;
  }

  const createdAt = Number(claim.created_at);
  return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null;
}

async function loadProviderSubmissionContextForClaim(claimRow) {
  const uploadContexts = await loadUploadContextsForClaim(claimRow);
  const uploadProviderContext = resolveProviderContextFromUploads(uploadContexts);
  const provider = await resolveStableProviderRecord(uploadProviderContext);

  if (
    provider?.provider_id
    && uploadProviderContext.upload_id
    && !normalizeString(uploadProviderContext.provider_id)
  ) {
    await run(
      `UPDATE uploads
       SET provider_id = ?
       WHERE upload_id = ?
         AND (provider_id IS NULL OR TRIM(provider_id) = '')`,
      [
        provider.provider_id,
        uploadProviderContext.upload_id
      ]
    );
  }

  return {
    upload_contexts: uploadContexts,
    provider: provider || null,
    provider_context: {
      upload_id: uploadProviderContext.upload_id ?? null,
      provider_id: uploadProviderContext.provider_id || provider?.provider_id || null,
      provider_name: uploadProviderContext.provider_name || provider?.provider_name || null,
      upload_name: uploadProviderContext.upload_name ?? null,
      niche: uploadProviderContext.niche ?? null,
      created_at: uploadProviderContext.created_at ?? null,
      source: uploadProviderContext.source || (provider ? 'provider_record' : null)
    }
  };
}

async function backfillProviderConnectionIds(providerId, providerName) {
  const normalizedProviderId = normalizeString(providerId);
  const normalizedProviderName = normalizeString(providerName);

  if (!normalizedProviderId || !normalizedProviderName) {
    return;
  }

  await run(
    `UPDATE provider_clearinghouse_connections
     SET provider_id = ?
     WHERE (provider_id IS NULL OR TRIM(provider_id) = '')
       AND LOWER(TRIM(COALESCE(provider_name, ''))) = LOWER(TRIM(?))`,
    [
      normalizedProviderId,
      normalizedProviderName
    ]
  );
}

async function loadActiveProviderClearinghouseConnection(providerContext = {}) {
  const stableProvider = await resolveStableProviderRecord(providerContext);
  const providerId = normalizeString(providerContext.provider_id) || stableProvider?.provider_id;

  if (!providerId) {
    return null;
  }

  const row = await get(
    `${buildProviderConnectionSelect()}
     WHERE provider_id = ?
       AND is_active = 1
       AND LOWER(COALESCE(credential_status, '')) = 'connected'
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [providerId]
  );

  if (row) {
    return row;
  }

  return null;
}

function parseConnectionSecretConfig(plaintext) {
  const normalized = normalizeString(plaintext);

  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (err) {
    return { value: normalized };
  }
}

async function loadProviderConnectionSecretConfig(connectionInput, options = {}) {
  const connectionId = Number(
    typeof connectionInput === 'object'
      ? connectionInput?.id
      : connectionInput
  );

  if (!Number.isFinite(connectionId)) {
    return null;
  }

  const row = await get(
    `${buildProviderConnectionSelect({ includeSecrets: true })}
     WHERE id = ?`,
    [connectionId]
  );

  if (!row) {
    return null;
  }

  if (
    normalizeString(row.encrypted_config)
    && normalizeString(row.encrypted_config_iv)
    && normalizeString(row.encrypted_config_tag)
  ) {
    return parseConnectionSecretConfig(decryptSecret(row));
  }

  const legacyPlaintext = normalizeString(row.config_json);

  if (!legacyPlaintext) {
    return null;
  }

  const parsedLegacyConfig = parseConnectionSecretConfig(legacyPlaintext);

  if (options.migrateLegacy !== false) {
    const encrypted = encryptSecret(legacyPlaintext);
    await run(
      `UPDATE provider_clearinghouse_connections
       SET encrypted_config = ?,
           encrypted_config_iv = ?,
           encrypted_config_tag = ?,
           config_json = NULL,
           updated_at = ?
       WHERE id = ?`,
      [
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        Date.now(),
        connectionId
      ]
    );
  }

  return parsedLegacyConfig;
}

function shapeProviderSubmissionApproval(row) {
  if (!row) {
    return null;
  }

  return {
    approval_id: Number.isFinite(Number(row.approval_id))
      ? Number(row.approval_id)
      : null,
    claim_id: normalizeString(row.claim_id),
    provider_id: normalizeString(row.provider_id),
    approved_by_user_id: normalizeString(row.approved_by_user_id),
    approved_at: Number.isFinite(Number(row.approved_at))
      ? Number(row.approved_at)
      : null,
    claim_updated_at: Number.isFinite(Number(row.claim_updated_at))
      ? Number(row.claim_updated_at)
      : null,
    provider_connection_id: Number.isFinite(Number(row.provider_connection_id))
      ? Number(row.provider_connection_id)
      : null,
    fee_acknowledged: normalizeBoolean(row.fee_acknowledged, false),
    status: normalizeString(row.status),
    created_at: Number.isFinite(Number(row.created_at))
      ? Number(row.created_at)
      : null,
    updated_at: Number.isFinite(Number(row.updated_at))
      ? Number(row.updated_at)
      : null
  };
}

async function loadLatestProviderSubmissionApproval(claimId, providerId) {
  const normalizedClaimId = normalizeString(claimId);
  const normalizedProviderId = normalizeString(providerId);

  if (!normalizedClaimId || !normalizedProviderId) {
    return null;
  }

  const row = await get(
    `SELECT *
     FROM provider_submission_approvals
     WHERE claim_id = ?
       AND provider_id = ?
     ORDER BY approved_at DESC, approval_id DESC
     LIMIT 1`,
    [normalizedClaimId, normalizedProviderId]
  );

  return shapeProviderSubmissionApproval(row);
}

function evaluateProviderSubmissionApproval({
  approval,
  providerContext = {},
  providerConnection = null,
  claimVersionMarker = null
} = {}) {
  const providerId = normalizeString(providerContext.provider_id);

  if (!providerId) {
    return {
      valid: false,
      issue: 'missing_provider_identity',
      approval: null
    };
  }

  if (!approval) {
    return {
      valid: false,
      issue: 'missing_provider_approval',
      approval: null
    };
  }

  if (approval.provider_id !== providerId) {
    return {
      valid: false,
      issue: 'provider_approval_provider_mismatch',
      approval
    };
  }

  if (approval.status !== 'approved') {
    return {
      valid: false,
      issue: 'provider_approval_not_active',
      approval
    };
  }

  if (
    Number.isFinite(Number(claimVersionMarker))
    && Number(approval.claim_updated_at) !== Number(claimVersionMarker)
  ) {
    return {
      valid: false,
      issue: 'provider_approval_stale',
      approval
    };
  }

  if (providerConnection) {
    const providerConnectionId = Number(providerConnection.id);

    if (
      !Number.isFinite(Number(approval.provider_connection_id))
      || Number(approval.provider_connection_id) !== providerConnectionId
    ) {
      return {
        valid: false,
        issue: 'provider_approval_connection_mismatch',
        approval
      };
    }
  }

  if (approval.fee_acknowledged !== true) {
    return {
      valid: false,
      issue: 'provider_approval_fee_acknowledgment_required',
      approval
    };
  }

  return {
    valid: true,
    issue: null,
    approval
  };
}

async function storeProviderSubmissionApproval({
  claimId,
  providerId,
  approvedByUserId,
  claimUpdatedAt,
  providerConnectionId,
  feeAcknowledged,
  timestamp = Date.now()
}) {
  await run(
    `UPDATE provider_submission_approvals
     SET status = 'superseded',
         updated_at = ?
     WHERE claim_id = ?
       AND provider_id = ?
       AND status = 'approved'`,
    [timestamp, claimId, providerId]
  );

  const result = await run(
    `INSERT INTO provider_submission_approvals (
      claim_id,
      provider_id,
      approved_by_user_id,
      approved_at,
      claim_updated_at,
      provider_connection_id,
      fee_acknowledged,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      claimId,
      providerId,
      approvedByUserId,
      timestamp,
      claimUpdatedAt,
      providerConnectionId,
      normalizeBoolean(feeAcknowledged, false) ? 1 : 0,
      'approved',
      timestamp,
      timestamp
    ]
  );

  return get(
    `SELECT *
     FROM provider_submission_approvals
     WHERE approval_id = ?`,
    [result.id]
  ).then(shapeProviderSubmissionApproval);
}

module.exports = {
  buildProviderKey,
  ensureProviderRecord,
  evaluateProviderSubmissionApproval,
  getClaimVersionMarker,
  getProviderById,
  getProviderByName,
  loadActiveProviderClearinghouseConnection,
  loadProviderConnectionSecretConfig,
  loadLatestProviderSubmissionApproval,
  loadProviderSubmissionContextForClaim,
  normalizeString,
  shapeProviderSubmissionApproval,
  storeProviderSubmissionApproval
};
