const crypto = require('crypto');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function getFileEncryptionKeyBuffer() {
  const configuredKey = normalizeString(process.env.FILE_ENCRYPTION_KEY);

  if (!configuredKey) {
    throw new Error('FILE_ENCRYPTION_KEY is required for file encryption');
  }

  return crypto
    .createHash('sha256')
    .update(configuredKey, 'utf8')
    .digest();
}

function encryptBuffer(buffer) {
  const normalizedBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer || '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getFileEncryptionKeyBuffer(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(normalizedBuffer),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext,
    tag: tag.toString('base64')
  };
}

function decryptBuffer(record = {}) {
  const iv = normalizeString(record.iv || record.encryption_iv);
  const tag = normalizeString(record.tag || record.encryption_tag);
  const ciphertext = Buffer.isBuffer(record.ciphertext)
    ? record.ciphertext
    : Buffer.from(record.ciphertext || '');

  if (!iv || !tag) {
    throw new Error('Encrypted file record is incomplete');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getFileEncryptionKeyBuffer(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
}

module.exports = {
  decryptBuffer,
  encryptBuffer
};
