const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');

const { parseRecords } = require('./simple_parser');
const { normalizeRecords } = require('./normalizer');
const { addNormalizedCases } = require('../claim_ingestion_api/claim_model');
const { db, all, get, run } = require('../claim_ingestion_api/db');
const { requireOperatorRole } = require('../claim_ingestion_api/role_middleware');
const { storeMatchReasoningSnapshot } = require('../claim_ingestion_api/match_reasoning_snapshot');
const {
  upsertMatchDecision,
  attachMatchHumanOutcome
} = require('../claim_ingestion_api/intelligence_decision_log');
const { ensureProviderRecord } = require('../claim_ingestion_api/provider_authority');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const { matchFileToClaim, providerScopeMatches } = require('./file_matcher');
const {
  classifyUploadedFile,
  normalizeClassifiedFileType,
  sniffBinarySignature,
  sniffEra835
} = require('./file_classifier');
const {
  buildDocumentIntelligence,
  applyCaseAssociationEvidence
} = require('./document_intelligence');
const {
  saveUploadedFile,
  deleteStoredFile,
  sanitizeFilename
} = require('../storage/file_storage');
const {
  applyClaimLifecycle,
  processUpload
} = require('../pipeline/intake_pipeline');

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_MULTIPART_FILES = 10;
const DEFAULT_DUPLICATE_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const SUPPORTED_FILES_PER_REQUEST = DEFAULT_MAX_MULTIPART_FILES;
const DANGEROUS_FILE_EXTENSIONS = new Set([
  'app',
  'bat',
  'cmd',
  'com',
  'cpl',
  'dll',
  'dmg',
  'exe',
  'hta',
  'jar',
  'js',
  'jse',
  'msi',
  'msh',
  'ps1',
  'py',
  'rb',
  'scr',
  'sh',
  'vbe',
  'vbs'
]);
const DANGEROUS_MIME_PATTERNS = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-bat',
  'application/x-httpd-php',
  'application/javascript',
  'text/javascript',
  'application/ecmascript',
  'text/ecmascript',
  'text/x-python',
  'application/x-python-code',
  'text/x-shellscript',
  'application/x-shellscript'
];
const ALLOWED_FILE_TYPES = new Set([
  'claim_csv',
  'spreadsheet',
  'json_data',
  'text_report',
  'era_835',
  'pdf_document',
  'image_document'
]);

function parsePositiveIntegerEnv(value, fallback) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const MAX_UPLOAD_BYTES = parsePositiveIntegerEnv(
  process.env.MAX_UPLOAD_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES
);
const MAX_MULTIPART_FILES = parsePositiveIntegerEnv(
  process.env.MAX_UPLOAD_FILES,
  DEFAULT_MAX_MULTIPART_FILES
);
const MAX_FILES_PER_REQUEST = MAX_MULTIPART_FILES;
const DUPLICATE_UPLOAD_WINDOW_MS = parsePositiveIntegerEnv(
  process.env.DUPLICATE_UPLOAD_WINDOW_MS,
  DEFAULT_DUPLICATE_UPLOAD_WINDOW_MS
);
const DURABLE_PARSE_STATUSES = new Set([
  'uploaded',
  'parsing',
  'parsed',
  'metadata_only',
  'parse_failed',
  'unsupported'
]);
const DURABLE_NORMALIZATION_STATUSES = new Set([
  'pending',
  'normalized',
  'manual_review_needed'
]);
const DURABLE_MANUAL_REVIEW_STATUSES = new Set([
  'pending',
  'resolved'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: MAX_FILES_PER_REQUEST,
    parts: MAX_FILES_PER_REQUEST + 20
  }
});

function createUploadError(code, status = 400, message = code, details = null) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    err.details = details;
  }
  return err;
}

function buildUploadErrorResponse(err, overrides = {}) {
  const code = err?.code || 'UPLOAD_VALIDATION_FAILED';
  const status = Number.isFinite(Number(err?.status)) ? Number(err.status) : 400;
  const details = err?.details && typeof err.details === 'object' && !Array.isArray(err.details)
    ? err.details
    : null;

  return {
    status,
    body: {
      ok: false,
      accepted: false,
      error: code,
      code,
      ...(details ? { details } : {}),
      ...overrides
    }
  };
}

function createTrackedIntakeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function createTrackedUploadContext({ niche = null, createdAt = Date.now() } = {}) {
  return {
    upload_id: createTrackedIntakeId('upload'),
    niche: typeof niche === 'string' && niche.trim() ? niche.trim() : null,
    created_at: createdAt
  };
}

function createTrackedIntakeFileRecord({
  upload_id,
  file_name,
  file_type,
  file_size = null,
  created_at = Date.now()
} = {}) {
  if (!upload_id) {
    throw new Error('upload_id is required');
  }

  return {
    file_id: createTrackedIntakeId('file'),
    upload_id,
    file_name: file_name || 'unknown',
    file_type: file_type || 'unknown',
    file_size: normalizeFileSize(file_size),
    created_at,
    updated_at: created_at
  };
}

function hasRecordsPayload(body = {}) {
  return Boolean(
    body
    && typeof body === 'object'
    && Object.prototype.hasOwnProperty.call(body, 'records')
  );
}

function parseJsonSafely(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeCustomerId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeProviderName(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function sanitizeIncomingFilename(value) {
  return sanitizeFilename(value || 'uploaded-file');
}

function parseBooleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isDevModeEnabled() {
  return parseBooleanEnv(process.env.DEV_MODE);
}

function resolveIntakeIdentity(body = {}) {
  const explicitCustomerId = normalizeCustomerId(body.customer_id);
  const explicitProviderName = normalizeProviderName(body.provider_name);

  if (explicitCustomerId && explicitProviderName) {
    return {
      customerId: explicitCustomerId,
      providerName: explicitProviderName
    };
  }

  if (!isDevModeEnabled()) {
    const missing = [];

    if (!explicitCustomerId) {
      missing.push('customer_id');
    }

    if (!explicitProviderName) {
      missing.push('provider_name');
    }

    throw createUploadError(
      'MISSING_INTAKE_IDENTITY',
      400,
      'Missing intake identity',
      {
        missing_fields: missing
      }
    );
  }

  return {
    customerId: explicitCustomerId || 'demo_customer',
    providerName: explicitProviderName || normalizeProviderName(body.org_id) || 'demo_org'
  };
}

function rejectClientProvidedIdentity(body = {}) {
  const forbiddenFields = [
    'customer_id',
    'provider_id',
    'provider_name'
  ].filter(field => normalizeNullableIdentityField(body[field]));

  if (!forbiddenFields.length) {
    return;
  }

  throw createUploadError(
    'CLIENT_CANNOT_SET_IDENTITY_FIELDS',
    400,
    'Client cannot override authenticated identity',
    {
      forbidden_fields: forbiddenFields
    }
  );
}

function normalizeNullableIdentityField(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

async function loadAuthenticatedUploadContext(identity = {}) {
  const customerId = normalizeCustomerId(identity.customer_id);
  const providerId = normalizeCustomerId(identity.provider_id);

  if (!customerId || !providerId) {
    throw createUploadError(
      'UNAUTHENTICATED_OR_INVALID_IDENTITY',
      401,
      'Unauthenticated or invalid identity'
    );
  }

  const providerRecord = await get(
    `SELECT provider_id, provider_name
     FROM providers
     WHERE provider_id = ?`,
    [providerId]
  );

  if (!providerRecord) {
    throw createUploadError(
      'INVALID_PROVIDER_IDENTITY',
      400,
      'Invalid provider identity'
    );
  }

  return {
    customerId,
    providerRecord
  };
}

function parseMatchReviewNote(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (err) {
    return {};
  }
}

function getRejectedCandidateIds(noteValue) {
  const note = parseMatchReviewNote(noteValue);

  return Array.isArray(note.rejected_candidate_ids)
    ? note.rejected_candidate_ids
      .map(item => String(item || '').trim())
      .filter(Boolean)
    : [];
}

function parseMatchFlags(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const normalizedFlags = {
    duplicate: value.duplicate === true,
    already_submitted: value.already_submitted === true,
    already_recovered: value.already_recovered === true
  };

  return Object.values(normalizedFlags).some(Boolean)
    ? normalizedFlags
    : null;
}

function normalizeMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function getFileExtension(filename) {
  return String(path.extname(filename || '') || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
}

function normalizeFileSize(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.round(numeric)
    : null;
}

function normalizeDurableParseStatus(value, fallback = 'uploaded') {
  const normalized = String(value || '').trim().toLowerCase();
  return DURABLE_PARSE_STATUSES.has(normalized)
    ? normalized
    : fallback;
}

function normalizeDurableNormalizationStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase();
  return DURABLE_NORMALIZATION_STATUSES.has(normalized)
    ? normalized
    : fallback;
}

function normalizeManualReviewStatus(value, fallback = null) {
  const normalized = String(value || '').trim().toLowerCase();
  return DURABLE_MANUAL_REVIEW_STATUSES.has(normalized)
    ? normalized
    : fallback;
}

function normalizeManualReviewReason(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function deriveIntakeStatus(fileRecord = {}) {
  const parseStatus = normalizeDurableParseStatus(fileRecord.parse_status, 'uploaded');
  const normalizationStatus = normalizeDurableNormalizationStatus(fileRecord.normalization_status, 'pending');
  const manualReviewStatus = normalizeManualReviewStatus(fileRecord.manual_review_status, null);

  if (manualReviewStatus === 'pending' || normalizationStatus === 'manual_review_needed') {
    if (parseStatus === 'unsupported') {
      return 'unsupported';
    }

    if (parseStatus === 'metadata_only') {
      return 'metadata_only';
    }

    if (parseStatus === 'parse_failed') {
      return 'parse_failed';
    }

    return 'manual_review_needed';
  }

  if (normalizationStatus === 'normalized') {
    return 'normalized';
  }

  if (parseStatus === 'parsed') {
    return 'parsed';
  }

  if (parseStatus === 'parsing') {
    return 'parsing';
  }

  return 'uploaded';
}

function isObjectRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  );
}

function validateJsonRecordsPayload(value) {
  let parsed = value;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      throw createUploadError('INVALID_RECORDS_PAYLOAD', 400);
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw createUploadError('INVALID_RECORDS_PAYLOAD', 400);
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw createUploadError('INVALID_RECORDS_PAYLOAD', 400, 'Invalid records payload', {
      reason: 'records_must_be_non_empty_array'
    });
  }

  for (const [index, item] of parsed.entries()) {
    if (!isObjectRecord(item)) {
      throw createUploadError('INVALID_RECORDS_PAYLOAD', 400, 'Invalid records payload', {
        reason: 'records_items_must_be_objects',
        index
      });
    }
  }

  const serialized = JSON.stringify(parsed);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw createUploadError('FILE_TOO_LARGE', 413, 'File too large', {
      max_upload_bytes: MAX_UPLOAD_BYTES
    });
  }

  return {
    records: parsed,
    serialized,
    sizeBytes
  };
}

function getBufferFromUpload(file) {
  return Buffer.isBuffer(file?.buffer)
    ? file.buffer
    : Buffer.from(file?.buffer || '');
}

function isDangerousMimeType(mimeType) {
  const normalized = normalizeMimeType(mimeType);

  if (!normalized) {
    return false;
  }

  return DANGEROUS_MIME_PATTERNS.some(pattern => normalized.includes(pattern));
}

function hasExecutableBinarySignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return true;
  }

  if (
    buffer[0] === 0x7f
    && buffer[1] === 0x45
    && buffer[2] === 0x4c
    && buffer[3] === 0x46
  ) {
    return true;
  }

  const magic = buffer.readUInt32BE(0);

  return [
    0xFEEDFACE,
    0xFEEDFACF,
    0xCEFAEDFE,
    0xCFFAEDFE,
    0xCAFEBABE
  ].includes(magic);
}

function isLikelyScriptContent(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const sample = buffer.slice(0, 2048).toString('utf8').trimStart().toLowerCase();

  if (!sample) {
    return false;
  }

  return sample.startsWith('#!')
    || sample.startsWith('<?php')
    || sample.startsWith('<script')
    || sample.startsWith('<html')
    || sample.startsWith('powershell');
}

function containsUnexpectedBinaryBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const sample = buffer.slice(0, 4096);

  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }

    if (byte === 0x00 || (byte < 0x20 && byte !== 0x0c)) {
      return true;
    }
  }

  return false;
}

function hasZipContainerSignature(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
    && (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
}

function looksLikeJsonPayload(buffer) {
  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    return Array.isArray(parsed) || (parsed && typeof parsed === 'object');
  } catch (err) {
    return false;
  }
}

function looksLikeStructuredText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || isLikelyScriptContent(buffer)) {
    return false;
  }

  const content = buffer.toString('utf8');

  if (!content.trim()) {
    return false;
  }

  for (const delimiter of [',', '\t', '|']) {
    try {
      const records = parseCsv(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
        delimiter
      });

      if (!Array.isArray(records) || !records.length) {
        continue;
      }

      const firstRecord = records.find(record => record && typeof record === 'object');

      if (firstRecord && Object.keys(firstRecord).length > 0) {
        return true;
      }
    } catch (err) {
      // Try the next delimiter before rejecting.
    }
  }

  return false;
}

function looksLikeSpreadsheetBuffer(buffer) {
  if (!hasZipContainerSignature(buffer)) {
    return false;
  }

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return Array.isArray(workbook?.SheetNames) && workbook.SheetNames.length > 0;
  } catch (err) {
    return false;
  }
}

function getCanonicalMimeType(fileType, fallback = null) {
  switch (fileType) {
    case 'claim_csv':
      return 'text/csv';
    case 'spreadsheet':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'json_data':
      return 'application/json';
    case 'text_report':
      return 'text/plain';
    case 'era_835':
      return 'application/edi-x12';
    case 'pdf_document':
      return 'application/pdf';
    default:
      return fallback;
  }
}

function validateUploadedMultipartFile(file = {}) {
  const buffer = getBufferFromUpload(file);
  const normalizedMimeType = normalizeMimeType(file.mimetype);
  const sanitizedFilename = sanitizeIncomingFilename(file.originalname || file.filename || 'uploaded-file');
  const fileSize = normalizeFileSize(file.size ?? buffer.length);
  const extension = getFileExtension(sanitizedFilename);

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
    throw createUploadError('FILE_TOO_LARGE', 413);
  }

  if (DANGEROUS_FILE_EXTENSIONS.has(extension) || isDangerousMimeType(normalizedMimeType)) {
    throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  if (hasExecutableBinarySignature(buffer) || isLikelyScriptContent(buffer)) {
    throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  const classification = classifyUploadedFile({
    filename: sanitizedFilename,
    mimeType: normalizedMimeType,
    buffer
  });
  const fileType = normalizeClassifiedFileType(classification.file_type);
  const binarySignatureType = sniffBinarySignature(buffer);

  if (!binarySignatureType && containsUnexpectedBinaryBytes(buffer)) {
    throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  if (!ALLOWED_FILE_TYPES.has(fileType)) {
    throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  switch (fileType) {
    case 'era_835':
      if (!sniffEra835(buffer)) {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    case 'claim_csv':
    case 'text_report':
      if (!looksLikeStructuredText(buffer)) {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    case 'json_data':
      if (!looksLikeJsonPayload(buffer)) {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    case 'spreadsheet':
      if (!looksLikeSpreadsheetBuffer(buffer)) {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    case 'pdf_document':
      if (binarySignatureType !== 'pdf_document') {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    case 'image_document':
      if (binarySignatureType !== 'image_document') {
        throw createUploadError('UNSUPPORTED_FILE_TYPE');
      }
      break;
    default:
      throw createUploadError('UNSUPPORTED_FILE_TYPE');
  }

  return {
    ...file,
    buffer,
    size: fileSize,
    originalname: sanitizedFilename,
    mimetype: getCanonicalMimeType(fileType, normalizedMimeType),
    validated_file_type: fileType
  };
}

function multipartUploadMiddleware(req, res, next) {
  upload.any()(req, res, err => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const response = buildUploadErrorResponse(
          createUploadError('FILE_TOO_LARGE', 413, 'File too large', {
            max_upload_bytes: MAX_UPLOAD_BYTES
          })
        );
        return res.status(response.status).json(response.body);
      }

      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_PART_COUNT') {
        const response = buildUploadErrorResponse(
          createUploadError('TOO_MANY_FILES', 400, 'Too many files', {
            max_files_per_request: MAX_FILES_PER_REQUEST
          })
        );
        return res.status(response.status).json(response.body);
      }
    }

    const response = buildUploadErrorResponse(
      createUploadError('UPLOAD_VALIDATION_FAILED', 400)
    );
    return res.status(response.status).json(response.body);
  });
}

function normalizeStorageStatus(value, fallback = 'pending_secure_storage') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['local', 'pending_secure_storage', 'stored'].includes(normalized)
    ? normalized
    : fallback;
}

function computeChecksum(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const buffer = Buffer.isBuffer(value)
    ? value
    : Buffer.from(String(value));

  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function findRecentDuplicateUpload({
  checksum,
  providerId,
  providerName
}) {
  const normalizedChecksum = String(checksum || '').trim().toLowerCase();
  let normalizedProviderId = normalizeCustomerId(providerId);
  const normalizedProviderName = normalizeProviderName(providerName);

  if (!normalizedProviderId && normalizedProviderName) {
    const providerRow = await get(
      `SELECT provider_id
       FROM providers
       WHERE provider_key = ?`,
      [normalizedProviderName.toLowerCase()]
    );
    normalizedProviderId = normalizeCustomerId(providerRow?.provider_id);
  }

  if (!normalizedChecksum || !normalizedProviderId) {
    return null;
  }

  return get(
    `SELECT
       f.file_id,
       f.upload_id,
       f.uploaded_at,
       f.file_type,
       f.parse_status,
       f.normalization_status,
       COALESCE(u.provider_id, p.provider_id) AS resolved_provider_id,
       u.provider_name
     FROM intake_files f
     LEFT JOIN uploads u
       ON u.upload_id = f.upload_id
     LEFT JOIN providers p
       ON p.provider_key = LOWER(TRIM(COALESCE(u.provider_name, '')))
     WHERE LOWER(COALESCE(f.checksum, '')) = ?
       AND LOWER(COALESCE(COALESCE(u.provider_id, p.provider_id), '')) = LOWER(?)
       AND COALESCE(f.uploaded_at, 0) >= ?
     ORDER BY COALESCE(f.uploaded_at, 0) DESC, f.file_id DESC
     LIMIT 1`,
    [
      normalizedChecksum,
      normalizedProviderId,
      Date.now() - DUPLICATE_UPLOAD_WINDOW_MS
    ]
  );
}

function getClassificationForUpload({ filename, mimeType, buffer }) {
  const classification = classifyUploadedFile({
    filename,
    mimeType,
    buffer
  });

  return {
    file_type: normalizeClassifiedFileType(classification.file_type),
    classification_source: classification.source || 'fallback'
  };
}

function buildRecommendationSafeUploadItem(resultBody = {}, fallbackFileName = null) {
  return {
    file_name: fallbackFileName || resultBody.original_filename || resultBody.filename || null,
    upload_id: resultBody.upload_id ?? null,
    file_id: resultBody.file_id ?? null,
    ok: resultBody.ok === true,
    accepted: resultBody.accepted === true,
    error: resultBody.error ?? null,
    code: resultBody.code ?? null,
    file_type: resultBody.file_type ?? null,
    parser_type: resultBody.parser_type ?? null,
    intake_status: resultBody.intake_status ?? null,
    parse_status: resultBody.parse_status ?? null,
    normalization_status: resultBody.normalization_status ?? null,
    manual_review_required: resultBody.manual_review_required === true,
    metadata_only: resultBody.metadata_only === true,
    cases_created: Number.isFinite(Number(resultBody.cases_created))
      ? Number(resultBody.cases_created)
      : 0,
    review_matches: Number.isFinite(Number(resultBody.review_matches))
      ? Number(resultBody.review_matches)
      : 0
  };
}

function buildIntakeFileMetadata({
  filename,
  originalFilename,
  mimeType,
  fileSize,
  buffer,
  checksum,
  storageStatus = 'pending_secure_storage',
  uploadNotes = null
}) {
  const sanitizedFilename = sanitizeIncomingFilename(filename || originalFilename || 'uploaded-file');
  const sanitizedOriginalFilename = sanitizeIncomingFilename(originalFilename || filename || 'uploaded-file');
  const classification = getClassificationForUpload({
    filename: sanitizedOriginalFilename,
    mimeType,
    buffer
  });
  const notes = uploadNotes && typeof uploadNotes === 'object' && !Array.isArray(uploadNotes)
    ? { ...uploadNotes }
    : {};

  notes.classification_source = classification.classification_source;

  return {
    filename: sanitizedFilename,
    original_filename: sanitizedOriginalFilename,
    file_type: classification.file_type,
    mime_type: normalizeMimeType(mimeType),
    file_size: normalizeFileSize(fileSize),
    storage_status: normalizeStorageStatus(storageStatus),
    checksum: checksum || computeChecksum(buffer),
    upload_notes: Object.keys(notes).length ? JSON.stringify(notes) : null
  };
}

function parseUploadNotes(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (err) {
      return {};
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }

  return {};
}

function parseStructuredJson(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (err) {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function normalizeBooleanFlag(value) {
  return value === true || value === 1 || String(value || '').trim() === '1';
}

function shapeIntakeFileIntelligence(row) {
  if (!row) {
    return null;
  }

  return {
    file_id: row.file_id,
    provider_id: row.provider_id ?? null,
    canonical_document_type: row.canonical_document_type ?? 'unknown',
    document_type_source: row.document_type_source ?? null,
    association_status: row.association_status ?? null,
    associated_claim_id: row.associated_claim_id ?? null,
    denial_reason_understood: normalizeBooleanFlag(row.denial_reason_understood),
    coverage_determinable_from_current_docs: normalizeBooleanFlag(row.coverage_determinable_from_current_docs),
    requires_original_claim: normalizeBooleanFlag(row.requires_original_claim),
    requires_additional_documents: normalizeBooleanFlag(row.requires_additional_documents),
    manual_review_required: normalizeBooleanFlag(row.manual_review_required),
    identifiers: parseStructuredJson(row.identifiers_json),
    denial_evidence: parseStructuredJson(row.denial_evidence_json),
    case_evidence: parseStructuredJson(row.case_evidence_json),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

async function loadIntakeFileIntelligence(fileId) {
  if (!fileId) {
    return null;
  }

  const row = await get(
    `SELECT *
     FROM intake_file_intelligence
     WHERE file_id = ?`,
    [fileId]
  );

  return shapeIntakeFileIntelligence(row);
}

async function upsertIntakeFileIntelligence(fileId, intelligence = {}, options = {}) {
  if (!fileId || !intelligence || typeof intelligence !== 'object' || Array.isArray(intelligence)) {
    return null;
  }

  const existing = await loadIntakeFileIntelligence(fileId);
  const timestamp = Number.isFinite(Number(options.timestamp))
    ? Number(options.timestamp)
    : Date.now();
  const payload = {
    file_id: fileId,
    provider_id: intelligence.provider_id ?? existing?.provider_id ?? null,
    canonical_document_type: intelligence.canonical_document_type ?? existing?.canonical_document_type ?? 'unknown',
    document_type_source: intelligence.document_type_source ?? existing?.document_type_source ?? null,
    association_status: intelligence.association_status ?? existing?.association_status ?? null,
    associated_claim_id: intelligence.associated_claim_id ?? existing?.associated_claim_id ?? null,
    denial_reason_understood: intelligence.denial_reason_understood === undefined
      ? existing?.denial_reason_understood === true
      : intelligence.denial_reason_understood === true,
    coverage_determinable_from_current_docs: intelligence.coverage_determinable_from_current_docs === undefined
      ? existing?.coverage_determinable_from_current_docs === true
      : intelligence.coverage_determinable_from_current_docs === true,
    requires_original_claim: intelligence.requires_original_claim === undefined
      ? existing?.requires_original_claim === true
      : intelligence.requires_original_claim === true,
    requires_additional_documents: intelligence.requires_additional_documents === undefined
      ? existing?.requires_additional_documents === true
      : intelligence.requires_additional_documents === true,
    manual_review_required: intelligence.manual_review_required === undefined
      ? existing?.manual_review_required === true
      : intelligence.manual_review_required === true,
    identifiers_json: JSON.stringify(
      intelligence.identifiers && typeof intelligence.identifiers === 'object' && !Array.isArray(intelligence.identifiers)
        ? intelligence.identifiers
        : existing?.identifiers || {}
    ),
    denial_evidence_json: JSON.stringify(
      intelligence.denial_evidence && typeof intelligence.denial_evidence === 'object' && !Array.isArray(intelligence.denial_evidence)
        ? intelligence.denial_evidence
        : existing?.denial_evidence || {}
    ),
    case_evidence_json: JSON.stringify(
      intelligence.case_evidence && typeof intelligence.case_evidence === 'object' && !Array.isArray(intelligence.case_evidence)
        ? intelligence.case_evidence
        : existing?.case_evidence || {}
    ),
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp
  };

  if (existing) {
    await run(
      `UPDATE intake_file_intelligence
       SET provider_id = ?,
           canonical_document_type = ?,
           document_type_source = ?,
           association_status = ?,
           associated_claim_id = ?,
           denial_reason_understood = ?,
           coverage_determinable_from_current_docs = ?,
           requires_original_claim = ?,
           requires_additional_documents = ?,
           manual_review_required = ?,
           identifiers_json = ?,
           denial_evidence_json = ?,
           case_evidence_json = ?,
           updated_at = ?
       WHERE file_id = ?`,
      [
        payload.provider_id,
        payload.canonical_document_type,
        payload.document_type_source,
        payload.association_status,
        payload.associated_claim_id,
        payload.denial_reason_understood ? 1 : 0,
        payload.coverage_determinable_from_current_docs ? 1 : 0,
        payload.requires_original_claim ? 1 : 0,
        payload.requires_additional_documents ? 1 : 0,
        payload.manual_review_required ? 1 : 0,
        payload.identifiers_json,
        payload.denial_evidence_json,
        payload.case_evidence_json,
        payload.updated_at,
        fileId
      ]
    );
  } else {
    await run(
      `INSERT INTO intake_file_intelligence (
        file_id,
        provider_id,
        canonical_document_type,
        document_type_source,
        association_status,
        associated_claim_id,
        denial_reason_understood,
        coverage_determinable_from_current_docs,
        requires_original_claim,
        requires_additional_documents,
        manual_review_required,
        identifiers_json,
        denial_evidence_json,
        case_evidence_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.file_id,
        payload.provider_id,
        payload.canonical_document_type,
        payload.document_type_source,
        payload.association_status,
        payload.associated_claim_id,
        payload.denial_reason_understood ? 1 : 0,
        payload.coverage_determinable_from_current_docs ? 1 : 0,
        payload.requires_original_claim ? 1 : 0,
        payload.requires_additional_documents ? 1 : 0,
        payload.manual_review_required ? 1 : 0,
        payload.identifiers_json,
        payload.denial_evidence_json,
        payload.case_evidence_json,
        payload.created_at,
        payload.updated_at
      ]
    );
  }

  return loadIntakeFileIntelligence(fileId);
}

function normalizeResolutionNote(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

async function updateDurableIntakeFileState(fileId, updates = {}) {
  if (!fileId) {
    return null;
  }

  const existing = await get(
    `SELECT
       file_id,
       upload_id,
       parse_status,
       normalization_status,
       manual_review_status,
       upload_notes,
       parsed_patient,
       parsed_payer,
       parsed_amount,
       parsed_date_of_service
     FROM intake_files
     WHERE file_id = ?`,
    [fileId]
  );

  if (!existing) {
    return null;
  }

  const currentNotes = parseUploadNotes(existing.upload_notes);
  const noteUpdates = updates.note_updates && typeof updates.note_updates === 'object' && !Array.isArray(updates.note_updates)
    ? updates.note_updates
    : {};
  const nextNotes = {
    ...currentNotes,
    ...Object.fromEntries(
      Object.entries(noteUpdates).filter(([, value]) => value !== undefined)
    )
  };
  const parsedClaim = updates.primary_parsed_claim && typeof updates.primary_parsed_claim === 'object'
    ? updates.primary_parsed_claim
    : null;
  const timestamp = Number.isFinite(Number(updates.updated_at))
    ? Number(updates.updated_at)
    : Date.now();

  await run(
    `UPDATE intake_files
     SET parse_status = ?,
         normalization_status = ?,
         manual_review_status = ?,
         manual_review_reason = ?,
         upload_notes = ?,
         parsed_patient = ?,
         parsed_payer = ?,
         parsed_amount = ?,
         parsed_date_of_service = ?,
         updated_at = ?
     WHERE file_id = ?`,
    [
      normalizeDurableParseStatus(updates.parse_status, existing.parse_status || 'uploaded'),
      normalizeDurableNormalizationStatus(updates.normalization_status, existing.normalization_status || 'pending'),
      normalizeManualReviewStatus(updates.manual_review_status, null),
      normalizeManualReviewReason(updates.manual_review_reason),
      Object.keys(nextNotes).length ? JSON.stringify(nextNotes) : null,
      parsedClaim ? (parsedClaim.patient ?? existing.parsed_patient ?? null) : (existing.parsed_patient ?? null),
      parsedClaim ? (parsedClaim.payer ?? existing.parsed_payer ?? null) : (existing.parsed_payer ?? null),
      parsedClaim ? (parsedClaim.amount ?? existing.parsed_amount ?? null) : (existing.parsed_amount ?? null),
      parsedClaim ? (parsedClaim.date_of_service ?? existing.parsed_date_of_service ?? null) : (existing.parsed_date_of_service ?? null),
      timestamp,
      fileId
    ]
  );

  return get(`SELECT * FROM intake_files WHERE file_id = ?`, [fileId]);
}

async function loadManualReviewFileRecord(fileId) {
  return get(
    `SELECT
       f.file_id,
       f.upload_id,
       f.filename,
       f.original_filename,
       f.file_type,
       f.mime_type,
       f.file_size,
       f.parse_status,
       f.normalization_status,
       f.manual_review_status,
       f.manual_review_reason,
       f.upload_notes,
       f.uploaded_at,
       f.updated_at,
       u.provider_id,
       u.provider_name
     FROM intake_files f
     LEFT JOIN uploads u
       ON u.upload_id = f.upload_id
     WHERE f.file_id = ?`,
    [fileId]
  );
}

function getMatchReviewFlags(noteValue) {
  const note = parseMatchReviewNote(noteValue);
  return parseMatchFlags(note.flags);
}

function buildMatchReviewCandidates(row, reasons, noteValue) {
  const rawReasons = Array.isArray(reasons) ? reasons : [];
  const fallbackReasons = rawReasons.filter(item => typeof item === 'string');
  const rejectedCandidateIds = new Set(getRejectedCandidateIds(noteValue));
  const candidates = [];
  const seen = new Set();

  function pushCandidate(candidate) {
    const claimId = String(candidate?.claim_id || '').trim();

    if (!claimId || seen.has(claimId) || rejectedCandidateIds.has(claimId)) {
      return;
    }

    seen.add(claimId);
    candidates.push({
      claim_id: claimId,
      patient: candidate?.patient ?? null,
      payer: candidate?.payer ?? null,
      confidence: Number.isFinite(Number(candidate?.confidence))
        ? Number(candidate.confidence)
        : null,
      reasons: Array.isArray(candidate?.reasons)
        ? candidate.reasons.filter(reason => typeof reason === 'string')
        : fallbackReasons
    });
  }

  if (row?.suggested_claim_id) {
    pushCandidate({
      claim_id: row.suggested_claim_id,
      patient: row.suggested_patient || null,
      payer: row.suggested_payer || null,
      confidence: row.confidence,
      reasons: fallbackReasons
    });
  }

  rawReasons
    .filter(item => item && typeof item === 'object' && item.claim_id)
    .forEach(item => {
      pushCandidate({
        claim_id: item.claim_id,
        patient: item.patient || null,
        payer: item.payer || null,
        confidence: item.confidence,
        reasons: Array.isArray(item.reasons)
          ? item.reasons.filter(reason => typeof reason === 'string')
          : fallbackReasons
      });
    });

  return candidates;
}

async function createUploadRecord({
  uploadId,
  providerId = null,
  providerName = null,
  uploadName = null,
  niche = null,
  createdAt = Date.now()
}) {
  if (!uploadId) {
    throw new Error('uploadId is required');
  }

  const existing = await get(
    `SELECT upload_id FROM uploads WHERE upload_id = ?`,
    [uploadId]
  );

  if (existing) {
    return existing;
  }

  await run(
    `INSERT INTO uploads (
      upload_id,
      provider_id,
      provider_name,
      upload_name,
      niche,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uploadId,
      providerId,
      providerName,
      uploadName,
      niche,
      createdAt
    ]
  );

  return get(
    `SELECT * FROM uploads WHERE upload_id = ?`,
    [uploadId]
  );
}

async function linkFileToClaim(claim_id, file_id, confidence) {
  const existing = await get(
    `SELECT * FROM claim_documents WHERE claim_id = ? AND file_id = ?`,
    [claim_id, file_id]
  );

  if (existing) {
    return {
      row: existing,
      created: false
    };
  }

  const linkedAt = Date.now();
  const result = await run(
    `INSERT INTO claim_documents (claim_id, file_id, match_confidence, created_at)
     VALUES (?, ?, ?, ?)`,
    [claim_id, file_id, confidence, linkedAt]
  );

  await run(
    `UPDATE claims
     SET updated_at = ?
     WHERE claim_id = ?`,
    [linkedAt, claim_id]
  );

  return {
    row: await get(
      `SELECT * FROM claim_documents WHERE id = ?`,
      [result.id]
    ),
    created: true
  };
}

async function ensureClaimUploadAttribution(claim_id, upload_id) {
  if (!claim_id || !upload_id) {
    return {
      assigned: false,
      preserved_existing: false
    };
  }

  const existingClaim = await get(
    `SELECT upload_id
     FROM claims
     WHERE claim_id = ?`,
    [claim_id]
  );

  const existingUploadId = typeof existingClaim?.upload_id === 'string'
    ? existingClaim.upload_id.trim()
    : existingClaim?.upload_id ?? null;

  if (!existingClaim || existingUploadId) {
    return {
      assigned: false,
      preserved_existing: Boolean(existingUploadId)
    };
  }

  const updated_at = Date.now();
  const result = await run(
    `UPDATE claims
     SET upload_id = ?, updated_at = ?
     WHERE claim_id = ?
       AND (upload_id IS NULL OR TRIM(upload_id) = '')`,
    [upload_id, updated_at, claim_id]
  );

  return {
    assigned: Number(result?.changes || 0) > 0,
    preserved_existing: false
  };
}

async function loadClaimWithProviderContext(claimId) {
  if (!claimId) {
    return null;
  }

  return get(
    `SELECT
       c.*,
       u.provider_id AS upload_provider_id,
       u.provider_name AS upload_provider_name
     FROM claims c
     LEFT JOIN uploads u
       ON u.upload_id = c.upload_id
     WHERE c.claim_id = ?`,
    [claimId]
  );
}

async function queueMatchReview(file_id, suggested_claim_id, confidence, reasons, flags = null) {
  const existing = await get(
    `SELECT *
     FROM match_review_queue
     WHERE file_id = ?
       AND suggested_claim_id = ?
       AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [file_id, suggested_claim_id]
  );

  if (existing) {
    const normalizedFlags = parseMatchFlags(flags);

    if (normalizedFlags) {
      const existingNote = parseMatchReviewNote(existing.note);
      const existingFlags = parseMatchFlags(existingNote.flags);
      const nextFlags = existingFlags || normalizedFlags;

      if (!existingFlags) {
        existingNote.flags = nextFlags;
        await run(
          `UPDATE match_review_queue
           SET note = ?
           WHERE id = ?`,
          [JSON.stringify(existingNote), existing.id]
        );

        return get(
          `SELECT * FROM match_review_queue WHERE id = ?`,
          [existing.id]
        );
      }
    }

    return existing;
  }

  const note = {};
  const normalizedFlags = parseMatchFlags(flags);

  if (normalizedFlags) {
    note.flags = normalizedFlags;
  }

  const result = await run(
    `INSERT INTO match_review_queue (
      file_id,
      suggested_claim_id,
      confidence,
      reasons,
      note,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      file_id,
      suggested_claim_id,
      confidence,
      JSON.stringify(reasons || []),
      Object.keys(note).length ? JSON.stringify(note) : null,
      Date.now()
    ]
  );

  return get(
    `SELECT * FROM match_review_queue WHERE id = ?`,
    [result.id]
  );
}

async function storeMatchFeedback(file_id, claim_id, matched_claim_id, action, confidence, reasons) {
  await run(
    `INSERT INTO match_feedback (
      file_id,
      claim_id,
      matched_claim_id,
      action,
      confidence,
      reasons,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      file_id,
      claim_id,
      matched_claim_id,
      action,
      confidence,
      JSON.stringify(Array.isArray(reasons) ? reasons : []),
      Date.now()
    ]
  );
}

function formatMatchReviewRow(row) {
  if (!row) return null;

  const parsedReasons = parseJsonSafely(row.reasons, []);
  const candidates = buildMatchReviewCandidates(row, parsedReasons, row.note);
  const rejectedCandidateIds = getRejectedCandidateIds(row.note);
  const flags = getMatchReviewFlags(row.note);

  return {
    id: row.id,
    claim_id: row.claim_id || null,
    file_id: row.file_id,
    suggested_claim_id: row.suggested_claim_id,
    confidence: row.confidence,
    reasons: parsedReasons,
    note: row.note || null,
    flags,
    rejected_candidate_ids: rejectedCandidateIds,
    candidates,
    manual_review_required: candidates.length === 0,
    status: row.status,
    created_at: row.created_at,
    file: {
      file_id: row.file_id,
      filename: row.filename || null,
      original_filename: row.original_filename || row.filename || null,
      uploaded_at: row.uploaded_at || null,
      file_type: row.file_type || null,
      mime_type: row.mime_type || null,
      file_size: row.file_size ?? null,
      storage_status: row.storage_status || null,
      checksum: row.checksum || null,
      parsed_patient: row.parsed_patient || null,
      parsed_payer: row.parsed_payer || null,
      parsed_amount: row.parsed_amount ?? null,
      parsed_date_of_service: row.parsed_date_of_service || null
    },
    suggested_claim: row.suggested_claim_id
      ? {
          claim_id: row.suggested_claim_id,
          patient: row.suggested_patient || null,
          payer: row.suggested_payer || null,
          amount: row.suggested_amount ?? null,
          date_of_service: row.suggested_date_of_service || null
        }
      : null
  };
}

function buildSnapshotDataFromReviewRow(review) {
  const rawReasons = Array.isArray(review?.reasons) ? review.reasons : [];
  const reasons = rawReasons.filter(item => typeof item === 'string');
  const competingMatches = rawReasons
    .filter(item => item && typeof item === 'object' && item.claim_id)
    .map(item => ({
      claim_id: item.claim_id,
      confidence: Number(item.confidence ?? 0),
      reasons: Array.isArray(item.reasons)
        ? item.reasons.filter(reason => typeof reason === 'string')
        : []
    }));

  return {
    reasons,
    competingMatches: competingMatches.length ? competingMatches : null
  };
}

async function loadMatchReviewRow(id) {
  const row = await get(
    `SELECT
       mrq.*,
       f.filename,
       f.original_filename,
       f.file_type,
       f.mime_type,
       f.file_size,
       f.storage_status,
       f.checksum,
       f.uploaded_at,
       f.parsed_patient,
       f.parsed_payer,
       f.parsed_amount,
       f.parsed_date_of_service,
       c.patient AS suggested_patient,
       c.payer AS suggested_payer,
       c.amount AS suggested_amount,
       c.date_of_service AS suggested_date_of_service
     FROM match_review_queue mrq
     LEFT JOIN intake_files f
       ON f.file_id = mrq.file_id
     LEFT JOIN claims c
       ON c.claim_id = mrq.suggested_claim_id
     WHERE mrq.id = ?`,
    [id]
  );

  return formatMatchReviewRow(row);
}

async function processParsedUpload({
  fileName,
  fileType,
  records,
  orgId,
  customerId,
  providerName,
  niche,
  mimeType = null,
  fileSize = null,
  fileBuffer = null,
  checksum = null,
  storageStatus = 'pending_secure_storage',
  uploadNotes = null,
  metadataOnly = false,
  parserType = null,
  parseStatus = null,
  parseSummary = null,
  uploadContext = null,
  providerRecordOverride = null
}) {
  let fileRecord = null;
  let storedFile = null;
  let durableRecordCreated = false;
  let providerRecord = providerRecordOverride || null;

  try {
    const safeFileName = sanitizeIncomingFilename(fileName || 'uploaded-file');

    if (!fileName || (!Array.isArray(records) && !metadataOnly)) {
      return {
        status: 400,
        body: buildUploadErrorResponse(
          createUploadError('INVALID_UPLOAD_PAYLOAD', 400, 'Invalid upload payload', {
            reason: 'file_name_and_records_are_required'
          })
        ).body
      };
    }

    if (!normalizeCustomerId(customerId)) {
      throw createUploadError('MISSING_INTAKE_IDENTITY', 400, 'Missing intake identity', {
        missing_fields: ['customer_id']
      });
    }

    if (!normalizeProviderName(providerName)) {
      throw createUploadError('MISSING_INTAKE_IDENTITY', 400, 'Missing intake identity', {
        missing_fields: ['provider_name']
      });
    }

    const effectiveUploadContext = (
      uploadContext
      && typeof uploadContext === 'object'
      && uploadContext.upload_id
    )
      ? uploadContext
      : createTrackedUploadContext({
          niche,
          createdAt: Date.now()
        });
    const uploadId = effectiveUploadContext.upload_id;
    const notes = uploadNotes && typeof uploadNotes === 'object' && !Array.isArray(uploadNotes)
      ? { ...uploadNotes }
      : {};
    if (parserType) {
      notes.parser_type = parserType;
    }
    if (parseStatus) {
      notes.parse_status = parseStatus;
    }
    if (parseSummary && typeof parseSummary === 'object' && !Array.isArray(parseSummary)) {
      notes.parse_summary = parseSummary;
    }
    if (metadataOnly) {
      notes.metadata_only = true;
    }
    const intakeFileMetadata = buildIntakeFileMetadata({
      filename: safeFileName,
      originalFilename: safeFileName,
      mimeType,
      fileSize,
      buffer: fileBuffer,
      checksum,
      storageStatus,
      uploadNotes: notes
    });
    fileRecord = createTrackedIntakeFileRecord({
      upload_id: uploadId,
      file_name: safeFileName,
      file_type: intakeFileMetadata.file_type || fileType || 'unknown',
      file_size: intakeFileMetadata.file_size,
      created_at: effectiveUploadContext.created_at || Date.now()
    });
    storedFile = await saveUploadedFile({
      fileId: fileRecord.file_id,
      filename: intakeFileMetadata.filename,
      originalFilename: intakeFileMetadata.original_filename,
      buffer: fileBuffer,
      mimeType: intakeFileMetadata.mime_type,
      storedAt: fileRecord.created_at || Date.now()
    });

    await run('BEGIN TRANSACTION');

    try {
      if (!providerRecord) {
        providerRecord = await ensureProviderRecord({
          provider_name: normalizeProviderName(providerName)
        }, {
          timestamp: effectiveUploadContext.created_at || Date.now()
        });
      }

      await createUploadRecord({
        uploadId,
        providerId: providerRecord?.provider_id || null,
        providerName: normalizeProviderName(providerName),
        uploadName: safeFileName,
        niche: typeof niche === 'string' && niche.trim() ? niche.trim() : null,
        createdAt: effectiveUploadContext.created_at || Date.now()
      });

      await run(
        `INSERT INTO intake_files (
          file_id,
          upload_id,
          filename,
          original_filename,
          file_type,
          mime_type,
          file_size,
          storage_status,
          parse_status,
          normalization_status,
          manual_review_status,
          manual_review_reason,
          storage_key,
          storage_backend,
          access_level,
          stored_at,
          encryption_status,
          encryption_iv,
          encryption_tag,
          original_path,
          checksum,
          upload_notes,
          uploaded_at,
          updated_at,
          parsed_patient,
          parsed_payer,
          parsed_amount,
          parsed_date_of_service
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fileRecord.file_id,
          uploadId,
          intakeFileMetadata.filename,
          intakeFileMetadata.original_filename,
          intakeFileMetadata.file_type,
          intakeFileMetadata.mime_type,
          intakeFileMetadata.file_size,
          storedFile?.storage_status || intakeFileMetadata.storage_status,
          'uploaded',
          'pending',
          null,
          null,
          storedFile?.storage_key || null,
          storedFile?.storage_backend || 'local',
          storedFile?.access_level || 'private',
          storedFile?.stored_at || (fileRecord.created_at || Date.now()),
          storedFile?.encryption_status || null,
          storedFile?.encryption_iv || null,
          storedFile?.encryption_tag || null,
          storedFile?.original_path || null,
          intakeFileMetadata.checksum,
          intakeFileMetadata.upload_notes,
          fileRecord.created_at || Date.now(),
          fileRecord.created_at || Date.now(),
          null,
          null,
          null,
          null
        ]
      );

      await upsertIntakeFileIntelligence(
        fileRecord.file_id,
        buildDocumentIntelligence({
          fileType: intakeFileMetadata.file_type,
          originalFilename: intakeFileMetadata.original_filename,
          records: Array.isArray(records) ? records : [],
          providerRecord,
          metadataOnly,
          parseStatus: parseStatus || (metadataOnly ? 'metadata_only' : 'uploaded')
        }),
        { timestamp: fileRecord.created_at || Date.now() }
      );

      await run('COMMIT');
      durableRecordCreated = true;
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original durable intake record error.
      }

      throw err;
    }

    await updateDurableIntakeFileState(fileRecord.file_id, {
      parse_status: 'parsing',
      normalization_status: 'pending',
      manual_review_status: null,
      manual_review_reason: null,
      note_updates: {
        parse_status: 'parsing',
        normalization_status: 'pending'
      }
    });

    if (metadataOnly) {
      const durableParseStatus = parseStatus === 'unsupported'
        ? 'unsupported'
        : 'metadata_only';
      const manualReviewReason = durableParseStatus === 'unsupported'
        ? 'unsupported_file_requires_manual_intake'
        : 'metadata_only_file_requires_manual_intake';

      await updateDurableIntakeFileState(fileRecord.file_id, {
        parse_status: durableParseStatus,
        normalization_status: 'manual_review_needed',
        manual_review_status: 'pending',
        manual_review_reason: manualReviewReason,
        note_updates: {
          parse_status: durableParseStatus,
          normalization_status: 'manual_review_needed',
          manual_review_required: true
        }
      });

      const currentIntelligence = await loadIntakeFileIntelligence(fileRecord.file_id);

      if (currentIntelligence) {
        await upsertIntakeFileIntelligence(
          fileRecord.file_id,
          applyCaseAssociationEvidence(currentIntelligence, {
            association_status: durableParseStatus === 'unsupported'
              ? 'unsupported'
              : 'metadata_only',
            manual_review_required: true,
            case_evidence: {
              association_status: durableParseStatus === 'unsupported'
                ? 'unsupported'
                : 'metadata_only'
            }
          })
        );
      }

      return {
        status: 200,
        body: {
          ok: true,
          accepted: true,
          upload_id: uploadId,
          file_id: fileRecord.file_id,
          file_type: intakeFileMetadata.file_type,
          parser_type: parserType || null,
          intake_status: deriveIntakeStatus({
            parse_status: durableParseStatus,
            normalization_status: 'manual_review_needed',
            manual_review_status: 'pending'
          }),
          parse_status: durableParseStatus,
          normalization_status: 'manual_review_needed',
          manual_review_required: true,
          metadata_only: true,
          cases_created: 0,
          review_matches: 0
        }
      };
    }

    const rawRecords = parseRecords(records);

    const normalizedCases = normalizeRecords({
      raw_records: rawRecords,
      batch_id: uploadId,
      file_id: fileRecord.file_id
    });

    const claimsForInsert = normalizedCases.map(caseRecord => {
      const { status: _ignoredStatus, ...claimInput } = caseRecord || {};
      return {
        ...claimInput,
        upload_id: uploadId,
        customer_id: customerId
      };
    });

    await upsertIntakeFileIntelligence(
      fileRecord.file_id,
      buildDocumentIntelligence({
        fileType: intakeFileMetadata.file_type,
        originalFilename: intakeFileMetadata.original_filename,
        records: rawRecords,
        providerRecord,
        metadataOnly: false,
        parseStatus: 'parsed'
      })
    );

    if (!claimsForInsert.length) {
      throw createUploadError(
        'AUTO_INTAKE_REQUIRES_MANUAL_REVIEW',
        422,
        'No claims parsed from upload'
      );
    }

    const primaryParsedClaim = claimsForInsert[0] || {};
    let casesCreated = 0;
    let reviewMatchesQueued = 0;
    const associatedClaimIds = new Set();
    const matchedExistingClaimIds = new Set();
    const createdClaimIds = new Set();
    const ambiguousCandidates = [];

    await run('BEGIN TRANSACTION');

    try {
      const existingClaims = await all(
        `SELECT
           c.*,
           u.provider_id AS upload_provider_id,
           u.provider_name AS upload_provider_name
         FROM claims c
         LEFT JOIN uploads u
           ON u.upload_id = c.upload_id
         WHERE c.customer_id = ?
           AND COALESCE(u.provider_id, ?) = ?`,
        [
          identity.customer_id,
          identity.provider_id,
          identity.provider_id
        ]
      );
      const knownClaims = Array.isArray(existingClaims) ? [...existingClaims] : [];
      const linkedClaims = new Set();

      for (const parsedClaim of claimsForInsert) {
        const parsedFile = {
          parsed_claim_id: parsedClaim.claim_id ?? null,
          parsed_patient: parsedClaim.patient ?? null,
          parsed_payer: parsedClaim.payer ?? null,
          parsed_amount: parsedClaim.amount ?? null,
          parsed_date_of_service: parsedClaim.date_of_service ?? null,
          additional_data: parsedClaim.additional_data ?? null,
          provider_id: providerRecord?.provider_id ?? null,
          provider_name: providerRecord?.provider_name ?? null
        };
        const match = await matchFileToClaim(parsedFile, knownClaims, db);
        let claimId = null;
        let matchConfidence = 1;

        if (match) {
          if (match.requires_review) {
            await queueMatchReview(
              fileRecord.file_id,
              match.claim_id,
              match.confidence,
              [
                ...(Array.isArray(match.reasons) ? match.reasons : []),
                ...(Array.isArray(match.competing_matches) ? match.competing_matches : [])
              ],
              match.flags || null
            );
            await upsertMatchDecision({
              fileId: fileRecord.file_id,
              suggestedClaimId: match.claim_id,
              candidateClaimIds: [
                match.claim_id,
                ...(Array.isArray(match.competing_matches)
                  ? match.competing_matches.map(candidate => candidate?.claim_id)
                  : [])
              ],
              confidence: match.confidence,
              requiresReview: true,
              reasons: Array.isArray(match.reasons) ? match.reasons : [],
              competingMatches: Array.isArray(match.competing_matches) ? match.competing_matches : [],
              flags: match.flags || null,
              providerId: providerRecord?.provider_id || null,
              source: 'intake_match_review'
            });
            reviewMatchesQueued += 1;
            ambiguousCandidates.push({
              suggested_claim_id: match.claim_id,
              confidence: match.confidence,
              reasons: Array.isArray(match.reasons) ? match.reasons : [],
              competing_matches: Array.isArray(match.competing_matches) ? match.competing_matches : []
            });
            continue;
          }

          claimId = match.claim_id;
          matchConfidence = match.confidence;
          matchedExistingClaimIds.add(match.claim_id);
        } else {
          const insertResult = await addNormalizedCases([parsedClaim]);
          const createdClaim = Array.isArray(insertResult.claims)
            ? insertResult.claims[0]
            : null;

          casesCreated += insertResult.inserted;

          if (createdClaim && createdClaim.claim_id) {
            claimId = createdClaim.claim_id;
            createdClaimIds.add(createdClaim.claim_id);
            knownClaims.push({
              ...createdClaim,
              upload_provider_id: providerRecord?.provider_id ?? null,
              upload_provider_name: providerRecord?.provider_name ?? null
            });
          } else if (parsedClaim.claim_id) {
            const existingClaim = await loadClaimWithProviderContext(parsedClaim.claim_id);

            if (existingClaim && existingClaim.claim_id && providerScopeMatches(parsedFile, existingClaim)) {
              claimId = existingClaim.claim_id;
              knownClaims.push(existingClaim);
              matchedExistingClaimIds.add(existingClaim.claim_id);
            } else if (existingClaim && existingClaim.claim_id) {
              throw createUploadError(
                'AUTO_INTAKE_REQUIRES_MANUAL_REVIEW',
                422,
                'Provider-scoped claim association requires manual review'
              );
            }
          }
        }

        if (!claimId) {
          throw new Error(`Unable to resolve claim link for file ${fileRecord.file_id}`);
        }

        const linkKey = `${claimId}:${fileRecord.file_id}`;

        if (!linkedClaims.has(linkKey)) {
          await ensureClaimUploadAttribution(claimId, uploadId);
          const linkResult = await linkFileToClaim(claimId, fileRecord.file_id, matchConfidence);
          linkedClaims.add(linkKey);

          if (match && !match.requires_review && linkResult.created) {
            await storeMatchReasoningSnapshot({
              claimId,
              fileId: fileRecord.file_id,
              confidence: Number.isFinite(Number(match.confidence)) ? Number(match.confidence) : null,
              reasons: Array.isArray(match.reasons) ? match.reasons : [],
              competingMatches: Array.isArray(match.competing_matches) ? match.competing_matches : null,
              flags: match.flags || null,
              skipIfExists: true
            });
          }

          if (match && !match.requires_review) {
            await upsertMatchDecision({
              fileId: fileRecord.file_id,
              suggestedClaimId: claimId,
              candidateClaimIds: [claimId],
              confidence: match.confidence,
              requiresReview: false,
              reasons: Array.isArray(match.reasons) ? match.reasons : [],
              competingMatches: Array.isArray(match.competing_matches) ? match.competing_matches : [],
              flags: match.flags || null,
              providerId: providerRecord?.provider_id || null,
              source: 'intake_auto_link'
            });
          }
        }

        associatedClaimIds.add(claimId);
      }

      await run('COMMIT');
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original claim/link processing error.
      }

      throw err;
    }

    await updateDurableIntakeFileState(fileRecord.file_id, {
      parse_status: 'parsed',
      normalization_status: 'normalized',
      manual_review_status: null,
      manual_review_reason: null,
      primary_parsed_claim: primaryParsedClaim,
      note_updates: {
        parse_status: 'parsed',
        normalization_status: 'normalized',
        manual_review_required: false
      }
    });

    const currentIntelligence = await loadIntakeFileIntelligence(fileRecord.file_id);
    const associatedClaimIdList = Array.from(associatedClaimIds);

    for (const claimId of associatedClaimIdList) {
      const claimRow = await loadClaimWithProviderContext(claimId);

      if (!claimRow) {
        continue;
      }

      await applyClaimLifecycle({
        claimId,
        claim: claimRow,
        timestamp: Date.now(),
        options: {
          trigger: 'intake',
          context: {
            file_id: fileRecord.file_id,
            upload_id: uploadId
          }
        }
      });
    }

    const nextAssociationStatus = ambiguousCandidates.length > 0
      ? (associatedClaimIdList.length > 0 ? 'partially_ambiguous' : 'ambiguous')
      : (
        associatedClaimIdList.length > 1
          ? 'multiple_claims'
          : (
            createdClaimIds.size > 0
              ? 'created_new_claim'
              : (
                matchedExistingClaimIds.size > 0
                  ? 'matched_existing_claim'
                  : 'unresolved'
              )
          )
      );

    if (currentIntelligence) {
      await upsertIntakeFileIntelligence(
        fileRecord.file_id,
        applyCaseAssociationEvidence(currentIntelligence, {
          association_status: nextAssociationStatus,
          associated_claim_id: associatedClaimIdList.length === 1 ? associatedClaimIdList[0] : null,
          associated_claim_ids: associatedClaimIdList,
          matched_existing_claim_ids: Array.from(matchedExistingClaimIds),
          created_claim_ids: Array.from(createdClaimIds),
          ambiguous_candidates: ambiguousCandidates,
          manual_review_required: ambiguousCandidates.length > 0
        })
      );
    }

    return {
      status: 200,
      body: {
        ok: true,
        accepted: true,
        upload_id: uploadId,
        file_id: fileRecord.file_id,
        file_type: intakeFileMetadata.file_type,
        parser_type: parserType || null,
        intake_status: 'normalized',
        parse_status: 'parsed',
        normalization_status: 'normalized',
        cases_created: casesCreated,
        review_matches: reviewMatchesQueued
      }
    };
  } catch (err) {
    if (!durableRecordCreated && storedFile?.storage_key) {
      try {
        await deleteStoredFile(storedFile.storage_key);
      } catch (deleteErr) {
        console.error('Failed to clean up stored file after intake error', deleteErr);
      }
    }

    if (durableRecordCreated && fileRecord?.file_id) {
      const manualReviewReason = err?.code === 'AUTO_INTAKE_REQUIRES_MANUAL_REVIEW'
        ? 'auto_intake_could_not_complete'
        : 'auto_intake_failed_requires_manual_review';

      try {
        await updateDurableIntakeFileState(fileRecord.file_id, {
          parse_status: 'parse_failed',
          normalization_status: 'manual_review_needed',
          manual_review_status: 'pending',
          manual_review_reason: manualReviewReason,
          note_updates: {
            parse_status: 'parse_failed',
            normalization_status: 'manual_review_needed',
            manual_review_required: true,
            failure_reason: manualReviewReason
          }
        });
      } catch (stateErr) {
        console.error('Failed to persist manual intake state after auto-intake error', stateErr);
      }

      try {
        const currentIntelligence = await loadIntakeFileIntelligence(fileRecord.file_id);

        if (currentIntelligence) {
          await upsertIntakeFileIntelligence(
            fileRecord.file_id,
            applyCaseAssociationEvidence(currentIntelligence, {
              association_status: 'parse_failed',
              manual_review_required: true,
              case_evidence: {
                association_status: 'parse_failed',
                failure_reason: err?.code || 'UPLOAD_PROCESSING_FAILED'
              }
            })
          );
        }
      } catch (intelligenceErr) {
        console.error('Failed to persist intake intelligence after auto-intake error', intelligenceErr);
      }
    }

    if (err?.code === 'AUTO_INTAKE_REQUIRES_MANUAL_REVIEW') {
      return {
        status: 422,
        body: {
          ok: false,
          accepted: true,
          error: err.code,
          code: err.code,
          file_id: fileRecord?.file_id || null,
          intake_status: 'parse_failed',
          parse_status: 'parse_failed',
          normalization_status: 'manual_review_needed',
          manual_review_required: true
        }
      };
    }

    return {
      status: durableRecordCreated ? 422 : 500,
      body: {
        ok: false,
        accepted: Boolean(durableRecordCreated),
        error: durableRecordCreated
          ? 'AUTO_INTAKE_FAILED_MANUAL_REVIEW_REQUIRED'
          : 'UPLOAD_PROCESSING_FAILED',
        code: durableRecordCreated
          ? 'AUTO_INTAKE_FAILED_MANUAL_REVIEW_REQUIRED'
          : 'UPLOAD_PROCESSING_FAILED',
        file_id: durableRecordCreated ? (fileRecord?.file_id || null) : null,
        intake_status: durableRecordCreated ? 'parse_failed' : null,
        parse_status: durableRecordCreated ? 'parse_failed' : null,
        normalization_status: durableRecordCreated ? 'manual_review_needed' : null,
        manual_review_required: Boolean(durableRecordCreated)
      }
    };
  }
}

router.post('/api/intake/upload', multipartUploadMiddleware, async (req, res) => {
  try {
    const result = await processUpload({
      identity: req.identity,
      files: req.files,
      metadata: req.body || {}
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    const response = buildUploadErrorResponse(
      err?.code
        ? err
        : createUploadError('UPLOAD_PROCESSING_FAILED', 500)
    );
    return res.status(response.status).json(response.body);
  }
});

router.get('/api/intake/manual-review-items', requireOperatorRole, async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         f.file_id,
         f.upload_id,
         f.filename,
         f.original_filename,
         f.file_type,
         f.mime_type,
         f.file_size,
         f.storage_status,
         f.parse_status,
         f.normalization_status,
         f.manual_review_status,
         f.manual_review_reason,
         f.checksum,
         f.upload_notes,
         f.uploaded_at,
         f.updated_at,
         f.parsed_patient,
         f.parsed_payer,
         f.parsed_amount,
         f.parsed_date_of_service,
         ifi.canonical_document_type,
         ifi.document_type_source,
         ifi.association_status,
         ifi.associated_claim_id,
         ifi.denial_reason_understood,
         ifi.coverage_determinable_from_current_docs,
         ifi.requires_original_claim,
         ifi.requires_additional_documents,
         ifi.manual_review_required AS intelligence_manual_review_required,
         ifi.identifiers_json,
         ifi.denial_evidence_json,
         ifi.case_evidence_json,
         u.provider_id,
         u.provider_name,
         u.upload_name,
         u.niche
       FROM intake_files f
       LEFT JOIN intake_file_intelligence ifi
         ON ifi.file_id = f.file_id
       LEFT JOIN uploads u
         ON u.upload_id = f.upload_id
       WHERE COALESCE(f.manual_review_status, '') = 'pending'
          OR (
            COALESCE(f.manual_review_status, '') = ''
            AND COALESCE(f.normalization_status, '') = 'manual_review_needed'
          )
       ORDER BY COALESCE(f.updated_at, f.uploaded_at) DESC, f.file_id DESC`
    );

    const items = Array.isArray(rows)
      ? rows.map(row => {
          const notes = parseUploadNotes(row.upload_notes);

          return {
            file_id: row.file_id,
            upload_id: row.upload_id ?? null,
            provider_id: row.provider_id ?? null,
            provider_name: row.provider_name ?? null,
            upload_name: row.upload_name ?? null,
            niche: row.niche ?? null,
            filename: row.filename ?? null,
            original_filename: row.original_filename ?? null,
            file_type: row.file_type ?? null,
            mime_type: row.mime_type ?? null,
            file_size: row.file_size ?? null,
            storage_status: row.storage_status ?? null,
            intake_status: deriveIntakeStatus(row),
            parse_status: row.parse_status ?? null,
            normalization_status: row.normalization_status ?? null,
            manual_review_status: row.manual_review_status ?? null,
            manual_review_reason: row.manual_review_reason ?? null,
            parser_type: notes.parser_type ?? null,
            parse_summary: notes.parse_summary ?? null,
            classification_source: notes.classification_source ?? null,
            canonical_document_type: row.canonical_document_type ?? 'unknown',
            document_type_source: row.document_type_source ?? null,
            association_status: row.association_status ?? null,
            associated_claim_id: row.associated_claim_id ?? null,
            denial_reason_understood: normalizeBooleanFlag(row.denial_reason_understood),
            coverage_determinable_from_current_docs: normalizeBooleanFlag(row.coverage_determinable_from_current_docs),
            requires_original_claim: normalizeBooleanFlag(row.requires_original_claim),
            requires_additional_documents: normalizeBooleanFlag(row.requires_additional_documents),
            case_intelligence_manual_review_required: normalizeBooleanFlag(row.intelligence_manual_review_required),
            identifiers: parseStructuredJson(row.identifiers_json),
            denial_evidence: parseStructuredJson(row.denial_evidence_json),
            case_evidence: parseStructuredJson(row.case_evidence_json),
            uploaded_at: row.uploaded_at ?? null,
            updated_at: row.updated_at ?? null,
            parsed_patient: row.parsed_patient ?? null,
            parsed_payer: row.parsed_payer ?? null,
            parsed_amount: row.parsed_amount ?? null,
            parsed_date_of_service: row.parsed_date_of_service ?? null,
            manual_review_required: true
          };
        })
      : [];

    return res.json({
      ok: true,
      count: items.length,
      items
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/api/intake/manual-review-items/:fileId/resolve', requireOperatorRole, async (req, res) => {
  const fileId = String(req.params?.fileId || '').trim();

  if (!fileId) {
    return res.status(400).json({
      ok: false,
      error: 'fileId is required'
    });
  }

  return res.status(410).json({
    ok: false,
    error: 'Deprecated: manual intake resolution must go through the canonical upload pipeline'
  });
});

router._private = {
  SUPPORTED_FILES_PER_REQUEST,
  DUPLICATE_UPLOAD_WINDOW_MS,
  rejectClientProvidedIdentity,
  loadAuthenticatedUploadContext,
  hasRecordsPayload,
  validateJsonRecordsPayload,
  computeChecksum,
  findRecentDuplicateUpload,
  buildUploadErrorResponse,
  createUploadError,
  processParsedUpload,
  validateUploadedMultipartFile,
  createTrackedUploadContext,
  buildRecommendationSafeUploadItem
};

module.exports = router;
