const crypto = require('crypto');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function getSecretKeyBuffer() {
  const configuredSecret = normalizeString(process.env.CLEARINGHOUSE_SECRET_KEY);

  if (!configuredSecret) {
    throw new Error('CLEARINGHOUSE_SECRET_KEY is required for clearinghouse secret encryption');
  }

  // Derive a stable 32-byte key from the configured secret so deploys can use
  // a strong env passphrase without separate key formatting requirements.
  return crypto
    .createHash('sha256')
    .update(configuredSecret, 'utf8')
    .digest();
}

function encryptSecret(plaintext) {
  const normalizedPlaintext = String(plaintext ?? '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKeyBuffer(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalizedPlaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decryptSecret(record = {}) {
  const iv = normalizeString(record.iv || record.encrypted_config_iv);
  const ciphertext = normalizeString(record.ciphertext || record.encrypted_config);
  const tag = normalizeString(record.tag || record.encrypted_config_tag);

  if (!iv || !ciphertext || !tag) {
    throw new Error('Encrypted secret record is incomplete');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getSecretKeyBuffer(),
    Buffer.from(iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]);

  return plaintext.toString('utf8');
}

module.exports = {
  decryptSecret,
  encryptSecret
};
