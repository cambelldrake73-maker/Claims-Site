const express = require('express');
const router = express.Router();
const { all, get, run } = require('./db');
const { requireOperatorRole } = require('./role_middleware');
const { ensureProviderRecord } = require('./provider_authority');
const { encryptSecret } = require('../security/secret_crypto');

const ALLOWED_CONNECTION_TYPES = new Set(['api', 'sftp', 'manual']);
const ALLOWED_CREDENTIAL_STATUSES = new Set([
  'connected',
  'disconnected',
  'pending',
  'invalid'
]);
const SAFE_CONNECTION_SELECT = `
  SELECT
    id,
    provider_id,
    provider_name,
    clearinghouse_name,
    connection_type,
    provider_npi,
    tax_id,
    submitter_id,
    receiver_id,
    credential_status,
    is_active,
    created_at,
    updated_at
  FROM provider_clearinghouse_connections
`;

router.use(requireOperatorRole);

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeConnectionType(value, fallback = 'manual') {
  if (value === undefined) {
    return fallback;
  }

  const normalized = normalizeString(value);
  const lowered = normalized ? normalized.toLowerCase() : null;

  if (!lowered) {
    return fallback;
  }

  if (!ALLOWED_CONNECTION_TYPES.has(lowered)) {
    throw new Error(`connection_type must be one of: ${Array.from(ALLOWED_CONNECTION_TYPES).join(', ')}`);
  }

  return lowered;
}

function normalizeCredentialStatus(value, fallback = 'pending') {
  if (value === undefined) {
    return fallback;
  }

  const normalized = normalizeString(value);
  const lowered = normalized ? normalized.toLowerCase() : null;

  if (!lowered) {
    return fallback;
  }

  if (!ALLOWED_CREDENTIAL_STATUSES.has(lowered)) {
    throw new Error(`credential_status must be one of: ${Array.from(ALLOWED_CREDENTIAL_STATUSES).join(', ')}`);
  }

  return lowered;
}

function normalizeBooleanInteger(value, fallback = 0) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  const normalized = normalizeString(value);

  if (normalized === null) {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(normalized)) {
    return 1;
  }

  if (/^(0|false|no|off)$/i.test(normalized)) {
    return 0;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? 1 : 0;
}

function normalizeConfigJson(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch (err) {
      return JSON.stringify({ value: trimmed });
    }
  }

  return JSON.stringify(value);
}

function buildEncryptedConfigFields(configJson) {
  if (configJson === undefined) {
    return {};
  }

  if (configJson === null) {
    return {
      config_json: null,
      encrypted_config: null,
      encrypted_config_iv: null,
      encrypted_config_tag: null
    };
  }

  const encrypted = encryptSecret(configJson);

  return {
    config_json: null,
    encrypted_config: encrypted.ciphertext,
    encrypted_config_iv: encrypted.iv,
    encrypted_config_tag: encrypted.tag
  };
}

function shapeProviderConnection(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider_id: row.provider_id ?? null,
    provider_name: row.provider_name ?? null,
    clearinghouse_name: row.clearinghouse_name ?? null,
    connection_type: row.connection_type ?? null,
    provider_npi: row.provider_npi ?? null,
    tax_id: row.tax_id ?? null,
    submitter_id: row.submitter_id ?? null,
    receiver_id: row.receiver_id ?? null,
    credential_status: row.credential_status ?? null,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

function buildConnectionFields(body = {}, { partial = false } = {}) {
  const provider_name = normalizeString(body.provider_name);

  if (!partial && !provider_name) {
    throw new Error('provider_name is required');
  }

  const fields = {};

  if (!partial || body.provider_name !== undefined) {
    fields.provider_name = provider_name;
  }

  if (!partial || body.clearinghouse_name !== undefined) {
    fields.clearinghouse_name = normalizeString(body.clearinghouse_name);
  }

  if (!partial || body.connection_type !== undefined) {
    fields.connection_type = normalizeConnectionType(body.connection_type, partial ? null : 'manual');
  }

  if (!partial || body.provider_npi !== undefined) {
    fields.provider_npi = normalizeString(body.provider_npi);
  }

  if (!partial || body.tax_id !== undefined) {
    fields.tax_id = normalizeString(body.tax_id);
  }

  if (!partial || body.submitter_id !== undefined) {
    fields.submitter_id = normalizeString(body.submitter_id);
  }

  if (!partial || body.receiver_id !== undefined) {
    fields.receiver_id = normalizeString(body.receiver_id);
  }

  if (!partial || body.credential_status !== undefined) {
    fields.credential_status = normalizeCredentialStatus(body.credential_status, partial ? null : 'pending');
  }

  if (!partial || body.is_active !== undefined) {
    fields.is_active = normalizeBooleanInteger(body.is_active, partial ? 0 : 0);
  }

  const config_json = normalizeConfigJson(body.config_json);
  if (!partial || body.config_json !== undefined) {
    fields.config_json = config_json;
  }

  return fields;
}

router.get('/api/provider-connections', async (req, res) => {
  try {
    const rows = await all(
      `${SAFE_CONNECTION_SELECT}
       ORDER BY provider_name ASC, updated_at DESC, id DESC`
    );

    res.json({
      ok: true,
      count: Array.isArray(rows) ? rows.length : 0,
      connections: Array.isArray(rows)
        ? rows.map(shapeProviderConnection)
        : []
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/api/provider-connections', async (req, res) => {
  try {
    const fields = buildConnectionFields(req.body || {});
    Object.assign(fields, buildEncryptedConfigFields(fields.config_json));
    const timestamp = Date.now();
    let result;

    await run('BEGIN TRANSACTION');

    try {
      const provider = await ensureProviderRecord({
        provider_name: fields.provider_name,
        provider_npi: fields.provider_npi,
        tax_id: fields.tax_id
      }, { timestamp });
      result = await run(
        `INSERT INTO provider_clearinghouse_connections (
          provider_id,
          provider_name,
          clearinghouse_name,
          connection_type,
          provider_npi,
          tax_id,
          submitter_id,
          receiver_id,
          credential_status,
          is_active,
          config_json,
          encrypted_config,
          encrypted_config_iv,
          encrypted_config_tag,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          provider?.provider_id ?? null,
          fields.provider_name,
          fields.clearinghouse_name,
          fields.connection_type,
          fields.provider_npi,
          fields.tax_id,
          fields.submitter_id,
          fields.receiver_id,
          fields.credential_status,
          fields.is_active,
          fields.config_json ?? null,
          fields.encrypted_config ?? null,
          fields.encrypted_config_iv ?? null,
          fields.encrypted_config_tag ?? null,
          timestamp,
          timestamp
        ]
      );

      await run('COMMIT');
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original provider connection error.
      }

      throw err;
    }

    const row = await get(
      `${SAFE_CONNECTION_SELECT}
       WHERE id = ?`,
      [result.id]
    );

    res.json({
      ok: true,
      connection: shapeProviderConnection(row)
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

router.put('/api/provider-connections/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid provider connection id'
      });
    }

    const existing = await get(
      `SELECT * FROM provider_clearinghouse_connections WHERE id = ?`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: 'Provider connection not found'
      });
    }

    const fields = buildConnectionFields(req.body || {}, { partial: true });
    Object.assign(fields, buildEncryptedConfigFields(fields.config_json));
    const timestamp = Date.now();
    const setClauses = [];
    const values = [];

    await run('BEGIN TRANSACTION');

    try {
      if (fields.provider_name !== undefined || fields.provider_npi !== undefined || fields.tax_id !== undefined) {
        const provider = await ensureProviderRecord({
          provider_name: fields.provider_name !== undefined
            ? fields.provider_name
            : existing.provider_name,
          provider_npi: fields.provider_npi !== undefined
            ? fields.provider_npi
            : existing.provider_npi,
          tax_id: fields.tax_id !== undefined
            ? fields.tax_id
            : existing.tax_id
        }, { timestamp });
        fields.provider_id = provider?.provider_id ?? existing.provider_id ?? null;
        if (fields.provider_name === undefined) {
          fields.provider_name = existing.provider_name;
        }
      }

      Object.entries(fields).forEach(([field, value]) => {
        if (value !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(value);
        }
      });

      if (setClauses.length === 0) {
        await run('ROLLBACK');
        return res.json({
          ok: true,
          connection: shapeProviderConnection(existing)
        });
      }

      setClauses.push('updated_at = ?');
      values.push(timestamp);
      values.push(id);

      await run(
        `UPDATE provider_clearinghouse_connections
         SET ${setClauses.join(', ')}
         WHERE id = ?`,
        values
      );

      await run('COMMIT');
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original provider connection error.
      }

      throw err;
    }

    const updated = await get(
      `${SAFE_CONNECTION_SELECT}
       WHERE id = ?`,
      [id]
    );

    res.json({
      ok: true,
      connection: shapeProviderConnection(updated)
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
