const express = require('express');
const router = express.Router();

const { get, all } = require('./db');
const { requireOperatorRole } = require('./role_middleware');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const {
  getFileAccessDescriptor,
  readStoredFile
} = require('../storage/file_storage');

router.use(requireOperatorRole);

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

async function loadFileRecord(fileId) {
  return get(
    `SELECT
       file_id,
       filename,
       original_filename,
       file_type,
       mime_type,
       file_size,
       storage_status,
       storage_key,
       storage_backend,
       access_level,
       stored_at,
       encryption_status,
       encryption_iv,
       encryption_tag,
       original_path
     FROM intake_files
     WHERE file_id = ?`,
    [fileId]
  );
}

async function loadLinkedClaimIds(fileId) {
  const rows = await all(
    `SELECT claim_id
     FROM claim_documents
     WHERE file_id = ?`,
    [fileId]
  );

  return Array.isArray(rows)
    ? rows.map(row => normalizeString(row.claim_id)).filter(Boolean)
    : [];
}

router.get('/api/files/:file_id/access', async (req, res) => {
  try {
    const fileId = normalizeString(req.params.file_id);

    if (!fileId) {
      return res.status(400).json({
        ok: false,
        error: 'file_id is required'
      });
    }

    const fileRecord = await loadFileRecord(fileId);

    if (!fileRecord) {
      return res.status(404).json({
        ok: false,
        error: 'File not found'
      });
    }

    const descriptor = await getFileAccessDescriptor(fileRecord);
    const linkedClaimIds = await loadLinkedClaimIds(fileId);
    const claimId = normalizeString(req.query?.claim_id);
    const accessUrl = descriptor.access_url
      ? `${descriptor.access_url}${claimId ? `?claim_id=${encodeURIComponent(claimId)}` : ''}`
      : null;
    const downloadUrl = descriptor.download_url
      ? `${descriptor.download_url}${claimId ? `&claim_id=${encodeURIComponent(claimId)}` : ''}`
      : null;

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'file_accessed',
      resource_type: 'intake_file',
      resource_id: fileId,
      metadata: {
        access_kind: 'descriptor',
        claim_id: claimId,
        linked_claim_ids: linkedClaimIds
      }
    });

    return res.json({
      ok: true,
      file: {
        ...descriptor,
        access_url: accessUrl,
        download_url: downloadUrl
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/files/:file_id/content', async (req, res) => {
  try {
    const fileId = normalizeString(req.params.file_id);

    if (!fileId) {
      return res.status(400).json({
        ok: false,
        error: 'file_id is required'
      });
    }

    const fileRecord = await loadFileRecord(fileId);

    if (!fileRecord) {
      return res.status(404).json({
        ok: false,
        error: 'File not found'
      });
    }

    const descriptor = await getFileAccessDescriptor(fileRecord);

    if (!descriptor.access_available || !fileRecord.storage_key) {
      return res.status(404).json({
        ok: false,
        error: 'Stored file content not found'
      });
    }

    const shouldDownload = /^(1|true|yes)$/i.test(String(req.query?.download || '').trim());
    const dispositionType = shouldDownload || !descriptor.preview_supported
      ? 'attachment'
      : 'inline';
    const filename = descriptor.original_filename || fileRecord.filename || `${fileId}.bin`;
    const linkedClaimIds = await loadLinkedClaimIds(fileId);
    const claimId = normalizeString(req.query?.claim_id);

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'file_accessed',
      resource_type: 'intake_file',
      resource_id: fileId,
      metadata: {
        access_kind: 'content',
        claim_id: claimId,
        linked_claim_ids: linkedClaimIds,
        download: shouldDownload
      }
    });

    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${filename.replace(/"/g, '')}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');

    if (descriptor.mime_type) {
      res.type(descriptor.mime_type);
    } else {
      res.type(filename);
    }
    const fileBuffer = await readStoredFile(fileRecord);
    return res.send(fileBuffer);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
