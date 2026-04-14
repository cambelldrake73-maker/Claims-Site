const express = require('express');
const router = express.Router();

const { all } = require('./db');
const { requireOperatorRole } = require('./role_middleware');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const {
  createBackup,
  getOperationalIntegritySnapshot
} = require('../operations/backup_service');

router.use(requireOperatorRole);

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseDateFilter(value, { endOfDay = false } = {}) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);

    if (!Number.isFinite(numeric)) {
      const err = new Error('Invalid date filter');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    return numeric;
  }

  const parsed = Date.parse(normalized);

  if (!Number.isFinite(parsed)) {
    const err = new Error('Invalid date filter');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return parsed + 86400000 - 1;
  }

  return parsed;
}

function parseAuditMetadata(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (err) {
    return normalized;
  }
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildAuditExportWhereClause({ dateFrom, dateTo, action }) {
  const clauses = [];
  const params = [];

  if (dateFrom !== null) {
    clauses.push('created_at >= ?');
    params.push(dateFrom);
  }

  if (dateTo !== null) {
    clauses.push('created_at <= ?');
    params.push(dateTo);
  }

  if (action) {
    clauses.push('action = ?');
    params.push(action);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function shapeAuditExportRow(row = {}) {
  return {
    id: row.id,
    user_id: row.user_id ?? null,
    role: row.role ?? null,
    customer_id: row.customer_id ?? null,
    action: row.action ?? null,
    resource_type: row.resource_type ?? null,
    resource_id: row.resource_id ?? null,
    metadata: parseAuditMetadata(row.metadata),
    created_at: row.created_at ?? null,
    created_at_iso: Number.isFinite(Number(row.created_at))
      ? new Date(Number(row.created_at)).toISOString()
      : null
  };
}

function formatAuditRowsAsCsv(rows = []) {
  const header = [
    'id',
    'created_at',
    'created_at_iso',
    'user_id',
    'role',
    'customer_id',
    'action',
    'resource_type',
    'resource_id',
    'metadata'
  ];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      escapeCsvValue(row.id),
      escapeCsvValue(row.created_at),
      escapeCsvValue(row.created_at_iso),
      escapeCsvValue(row.user_id),
      escapeCsvValue(row.role),
      escapeCsvValue(row.customer_id),
      escapeCsvValue(row.action),
      escapeCsvValue(row.resource_type),
      escapeCsvValue(row.resource_id),
      escapeCsvValue(row.metadata === null ? null : JSON.stringify(row.metadata))
    ].join(','));
  }

  return `${lines.join('\n')}\n`;
}

router.get('/api/ops/integrity', async (req, res) => {
  try {
    const integrity = await getOperationalIntegritySnapshot();

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'integrity_checked',
      resource_type: 'system',
      resource_id: 'operational_integrity',
      metadata: {
        ok: integrity.ok,
        warning_count: Array.isArray(integrity.warnings) ? integrity.warnings.length : 0
      }
    });

    return res.json({
      ok: true,
      integrity
    });
  } catch (err) {
    const statusCode = err && err.code === 'BAD_REQUEST'
      ? 400
      : 500;

    return res.status(statusCode).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/api/ops/backup', async (req, res) => {
  try {
    const backup = await createBackup();

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'backup_created',
      resource_type: 'backup',
      resource_id: backup.backup_id,
      metadata: {
        status: backup.status,
        warning_count: Array.isArray(backup.warnings) ? backup.warnings.length : 0
      }
    });

    return res.json({
      ok: true,
      backup
    });
  } catch (err) {
    const statusCode = err && err.code === 'BACKUP_IN_PROGRESS'
      ? 409
      : 500;

    return res.status(statusCode).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/audit/export', async (req, res) => {
  try {
    const format = normalizeString(req.query?.format)?.toLowerCase() || 'json';
    const action = normalizeString(req.query?.action);
    const dateFrom = parseDateFilter(req.query?.date_from);
    const dateTo = parseDateFilter(req.query?.date_to, { endOfDay: true });

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({
        ok: false,
        error: 'format must be json or csv'
      });
    }

    if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) {
      return res.status(400).json({
        ok: false,
        error: 'date_from must be less than or equal to date_to'
      });
    }

    const whereClause = buildAuditExportWhereClause({ dateFrom, dateTo, action });
    const rows = await all(
      `SELECT
         id,
         user_id,
         role,
         customer_id,
         action,
         resource_type,
         resource_id,
         metadata,
         created_at
       FROM audit_logs
       ${whereClause.sql}
       ORDER BY created_at ASC, id ASC`,
      whereClause.params
    );
    const exportedRows = Array.isArray(rows)
      ? rows.map(shapeAuditExportRow)
      : [];

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'audit_exported',
      resource_type: 'audit_logs',
      resource_id: 'audit_logs',
      metadata: {
        format,
        action,
        date_from: dateFrom,
        date_to: dateTo,
        row_count: exportedRows.length
      }
    });

    if (format === 'csv') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-logs-${timestamp}.csv"`
      );
      return res.send(formatAuditRowsAsCsv(exportedRows));
    }

    return res.json({
      ok: true,
      exported_at: Date.now(),
      filters: {
        action,
        date_from: dateFrom,
        date_to: dateTo
      },
      count: exportedRows.length,
      logs: exportedRows
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
