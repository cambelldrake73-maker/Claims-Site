const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { decryptBuffer, encryptBuffer } = require('../security/file_crypto');

const STORAGE_ROOT = path.resolve(
  process.env.FILE_STORAGE_ROOT || path.join(os.homedir(), '.revcapture', 'private_uploads')
);
const LEGACY_STORAGE_ROOT = path.resolve(__dirname, '../../private_uploads');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function sanitizeFilename(value) {
  const normalized = String(value || 'uploaded-file')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '');
  const basename = path.basename(normalized);
  const sanitized = basename
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();

  return sanitized.replace(/^[.\- ]+|[.\- ]+$/g, '') || 'uploaded-file';
}

function buildDatePathParts(timestamp) {
  const date = new Date(Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now());
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return { year, month, day };
}

function buildStorageKey({ fileId, originalFilename, storedAt }) {
  const safeFileId = sanitizeFilename(fileId || 'file');
  const safeFilename = sanitizeFilename(originalFilename || 'uploaded-file');
  const { year, month, day } = buildDatePathParts(storedAt);

  return path.posix.join('intake', year, month, day, `${safeFileId}__${safeFilename}`);
}

function buildResolvedPath(rootPath, storageKey) {
  const normalizedKey = normalizeString(storageKey);

  if (!normalizedKey) {
    throw new Error('storage_key is required');
  }

  const resolvedPath = path.resolve(rootPath, normalizedKey);
  const rootPrefix = rootPath.endsWith(path.sep)
    ? rootPath
    : `${rootPath}${path.sep}`;

  if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPrefix)) {
    throw new Error('Invalid storage key');
  }

  return resolvedPath;
}

function resolveLocalPath(storageKey) {
  const currentPath = buildResolvedPath(STORAGE_ROOT, storageKey);

  if (fs.existsSync(currentPath)) {
    return currentPath;
  }

  if (LEGACY_STORAGE_ROOT !== STORAGE_ROOT) {
    const legacyPath = buildResolvedPath(LEGACY_STORAGE_ROOT, storageKey);

    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  return currentPath;
}

async function ensureParentDirectory(filePath) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
}

async function pathExists(filePath) {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function isPreviewSupported(fileRecord = {}) {
  const fileType = normalizeString(fileRecord.file_type);
  const mimeType = normalizeString(fileRecord.mime_type);

  if (['pdf_document', 'image_document', 'claim_csv', 'json_data', 'text_report', 'era_835'].includes(fileType)) {
    return true;
  }

  if (!mimeType) {
    return false;
  }

  return mimeType.startsWith('image/')
    || mimeType.startsWith('text/')
    || mimeType.includes('json')
    || mimeType.includes('pdf')
    || mimeType.includes('csv');
}

async function saveUploadedFile(file = {}) {
  const fileId = normalizeString(file.fileId || file.file_id);

  if (!fileId) {
    throw new Error('fileId is required for file storage');
  }

  const originalFilename = normalizeString(file.originalFilename || file.original_filename || file.filename) || 'uploaded-file';
  const storedAt = Number.isFinite(Number(file.storedAt || file.stored_at))
    ? Number(file.storedAt || file.stored_at)
    : Date.now();
  const buffer = Buffer.isBuffer(file.buffer)
    ? file.buffer
    : Buffer.from(file.buffer || '');
  const storageKey = buildStorageKey({
    fileId,
    originalFilename,
    storedAt
  });
  const localPath = buildResolvedPath(STORAGE_ROOT, storageKey);
  const tempPath = `${localPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const encryptedPayload = encryptBuffer(buffer);

  await ensureParentDirectory(localPath);

  try {
    await fsPromises.writeFile(tempPath, encryptedPayload.ciphertext);
    await fsPromises.rename(tempPath, localPath);
  } catch (err) {
    try {
      await fsPromises.unlink(tempPath);
    } catch (cleanupErr) {
      if (cleanupErr && cleanupErr.code !== 'ENOENT') {
        console.error('Failed to clean up temporary encrypted upload file', cleanupErr);
      }
    }

    throw err;
  }

  return {
    storage_key: storageKey,
    storage_backend: 'local',
    access_level: 'private',
    stored_at: storedAt,
    original_path: localPath,
    storage_status: 'stored',
    encryption_status: 'encrypted',
    encryption_iv: encryptedPayload.iv,
    encryption_tag: encryptedPayload.tag
  };
}

async function deleteStoredFile(storageKey) {
  const normalizedKey = normalizeString(storageKey);

  if (!normalizedKey) {
    return false;
  }

  try {
    await fsPromises.unlink(buildResolvedPath(STORAGE_ROOT, normalizedKey));
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT' && LEGACY_STORAGE_ROOT !== STORAGE_ROOT) {
      try {
        await fsPromises.unlink(buildResolvedPath(LEGACY_STORAGE_ROOT, normalizedKey));
        return true;
      } catch (legacyErr) {
        if (legacyErr && legacyErr.code === 'ENOENT') {
          return false;
        }

        throw legacyErr;
      }
    }

    if (err && err.code === 'ENOENT') {
      return false;
    }

    throw err;
  }
}

async function getFileAccessDescriptor(fileRecord = {}) {
  const fileId = normalizeString(fileRecord.file_id);

  if (!fileId) {
    throw new Error('file_id is required');
  }

  const storageKey = normalizeString(fileRecord.storage_key);
  const originalFilename = normalizeString(
    fileRecord.original_filename || fileRecord.filename
  );
  const downloadUrl = storageKey
    ? `/api/files/${encodeURIComponent(fileId)}/content?download=1`
    : null;
  const accessUrl = storageKey
    ? `/api/files/${encodeURIComponent(fileId)}/content`
    : null;

  let accessAvailable = false;

  if (storageKey && normalizeString(fileRecord.storage_backend) === 'local') {
    accessAvailable = await pathExists(resolveLocalPath(storageKey));
  }

  return {
    file_id: fileId,
    original_filename: originalFilename,
    mime_type: normalizeString(fileRecord.mime_type),
    file_type: normalizeString(fileRecord.file_type),
    file_size: Number.isFinite(Number(fileRecord.file_size))
      ? Number(fileRecord.file_size)
      : null,
    access_mode: 'private',
    preview_supported: isPreviewSupported(fileRecord),
    access_available: accessAvailable,
    access_url: accessAvailable ? accessUrl : null,
    download_url: accessAvailable ? downloadUrl : null
  };
}

function isEncryptedFileRecord(fileRecord = {}) {
  const encryptionStatus = normalizeString(fileRecord.encryption_status);
  const encryptionIv = normalizeString(fileRecord.encryption_iv);
  const encryptionTag = normalizeString(fileRecord.encryption_tag);

  if (encryptionStatus === 'encrypted') {
    return true;
  }

  return Boolean(encryptionIv && encryptionTag);
}

async function readStoredFile(fileRecord = {}) {
  const storageKey = normalizeString(fileRecord.storage_key);

  if (!storageKey) {
    throw new Error('storage_key is required');
  }

  const encryptedBytes = await fsPromises.readFile(resolveLocalPath(storageKey));

  if (!isEncryptedFileRecord(fileRecord)) {
    return encryptedBytes;
  }

  return decryptBuffer({
    ciphertext: encryptedBytes,
    encryption_iv: fileRecord.encryption_iv,
    encryption_tag: fileRecord.encryption_tag
  });
}

module.exports = {
  STORAGE_ROOT,
  LEGACY_STORAGE_ROOT,
  saveUploadedFile,
  deleteStoredFile,
  getFileAccessDescriptor,
  readStoredFile,
  resolveLocalPath,
  sanitizeFilename
};
