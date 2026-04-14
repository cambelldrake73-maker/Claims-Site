const crypto = require('crypto');
const { promisify } = require('util');

const { get, run } = require('../claim_ingestion_api/db');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 8;

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeEmail(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeRole(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeBooleanInteger(value, fallback = 1) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? 1 : 0;
  }

  const normalized = normalizeString(value);

  if (!normalized) {
    return fallback;
  }

  if (/^(1|true|yes|on)$/i.test(normalized)) {
    return 1;
  }

  if (/^(0|false|no|off)$/i.test(normalized)) {
    return 0;
  }

  return fallback;
}

function generateUserId() {
  return `usr_${crypto.randomBytes(8).toString('hex')}`;
}

function shapeUser(row) {
  if (!row) {
    return null;
  }

  return {
    user_id: normalizeString(row.user_id),
    email: normalizeEmail(row.email),
    role: normalizeRole(row.role),
    provider_id: normalizeString(row.provider_id),
    customer_id: normalizeString(row.customer_id),
    is_active: Number(row.is_active) === 1,
    token_version: Number.isFinite(Number(row.token_version))
      ? Number(row.token_version)
      : 0,
    created_at: Number.isFinite(Number(row.created_at))
      ? Number(row.created_at)
      : null,
    updated_at: Number.isFinite(Number(row.updated_at))
      ? Number(row.updated_at)
      : null
  };
}

function buildAuthContextFromUser(user) {
  if (!user) {
    return null;
  }

  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    provider_id: user.provider_id ?? null,
    customer_id: user.customer_id ?? null,
    token_version: Number.isFinite(Number(user.token_version))
      ? Number(user.token_version)
      : 0
  };
}

function assertUserScope(role, providerId, customerId) {
  if (role !== 'operator' && role !== 'provider' && role !== 'customer') {
    throw new Error('role must be operator, provider, or customer');
  }

  if (role === 'provider' && !providerId) {
    throw new Error('provider_id is required for provider users');
  }

  if (role === 'customer' && !customerId) {
    throw new Error('customer_id is required for customer users');
  }

  if (role !== 'provider' && providerId) {
    throw new Error('provider_id is only allowed for provider users');
  }

  if (role !== 'customer' && customerId) {
    throw new Error('customer_id is only allowed for customer users');
  }
}

function validatePassword(password) {
  const normalized = String(password || '');

  if (normalized.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/\S/.test(normalized)) {
    throw new Error('password must not be blank');
  }
}

async function hashPassword(password) {
  validatePassword(password);

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(String(password), salt, 64);

  return `scrypt:${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const normalizedHash = normalizeString(passwordHash);

  if (!normalizedHash) {
    return false;
  }

  const parts = normalizedHash.split(':');

  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHex] = parts;
  const derivedKey = await scryptAsync(String(password || ''), salt, 64);
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  const derivedBuffer = Buffer.from(derivedKey);

  if (expectedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

async function getUserById(userId) {
  const normalizedUserId = normalizeString(userId);

  if (!normalizedUserId) {
    return null;
  }

  const row = await get(
    `SELECT * FROM users WHERE user_id = ?`,
    [normalizedUserId]
  );

  return shapeUser(row);
}

async function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const row = await get(
    `SELECT * FROM users WHERE email = ?`,
    [normalizedEmail]
  );

  return shapeUser(row);
}

async function getUserWithPasswordByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  return get(
    `SELECT * FROM users WHERE email = ?`,
    [normalizedEmail]
  );
}

async function countUsers() {
  const row = await get(`SELECT COUNT(*) AS count FROM users`);
  return Number(row?.count ?? 0);
}

async function createUser({
  email,
  password,
  role,
  provider_id,
  customer_id,
  is_active = 1,
  timestamp = Date.now()
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);
  const normalizedProviderId = normalizeString(provider_id);
  const normalizedCustomerId = normalizeString(customer_id);
  const normalizedIsActive = normalizeBooleanInteger(is_active, 1);

  if (!normalizedEmail) {
    throw new Error('email is required');
  }

  assertUserScope(
    normalizedRole,
    normalizedProviderId,
    normalizedCustomerId
  );

  const existing = await getUserByEmail(normalizedEmail);

  if (existing) {
    throw new Error('email is already in use');
  }

  const passwordHash = await hashPassword(password);
  const userId = generateUserId();

  await run(
    `INSERT INTO users (
      user_id,
      email,
      password_hash,
      role,
      provider_id,
      customer_id,
      is_active,
      token_version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      normalizedEmail,
      passwordHash,
      normalizedRole,
      normalizedProviderId,
      normalizedCustomerId,
      normalizedIsActive,
      0,
      timestamp,
      timestamp
    ]
  );

  return getUserById(userId);
}

async function authenticateUserByPassword(email, password) {
  const row = await getUserWithPasswordByEmail(email);

  if (!row || Number(row.is_active) !== 1) {
    return null;
  }

  const valid = await verifyPassword(password, row.password_hash);

  if (!valid) {
    return null;
  }

  return shapeUser(row);
}

async function rotateUserTokenVersion(userId, timestamp = Date.now()) {
  const normalizedUserId = normalizeString(userId);

  if (!normalizedUserId) {
    return null;
  }

  await run(
    `UPDATE users
     SET token_version = COALESCE(token_version, 0) + 1,
         updated_at = ?
     WHERE user_id = ?`,
    [timestamp, normalizedUserId]
  );

  return getUserById(normalizedUserId);
}

async function updateUser(userId, updates = {}, options = {}) {
  const existing = await getUserById(userId);

  if (!existing) {
    return null;
  }

  const timestamp = Number.isFinite(Number(options.timestamp))
    ? Number(options.timestamp)
    : Date.now();
  const setClauses = [];
  const values = [];
  let rotateTokenVersion = false;

  if (updates.is_active !== undefined) {
    setClauses.push('is_active = ?');
    values.push(normalizeBooleanInteger(updates.is_active, existing.is_active ? 1 : 0));
    rotateTokenVersion = true;
  }

  if (updates.password !== undefined) {
    const passwordHash = await hashPassword(updates.password);
    setClauses.push('password_hash = ?');
    values.push(passwordHash);
    rotateTokenVersion = true;
  }

  if (!setClauses.length) {
    throw new Error('no supported user updates provided');
  }

  if (rotateTokenVersion) {
    setClauses.push('token_version = COALESCE(token_version, 0) + 1');
  }

  setClauses.push('updated_at = ?');
  values.push(timestamp, existing.user_id);

  await run(
    `UPDATE users
     SET ${setClauses.join(', ')}
     WHERE user_id = ?`,
    values
  );

  return getUserById(existing.user_id);
}

async function ensureBootstrapOperatorFromEnv() {
  const email = normalizeEmail(
    process.env.AUTH_BOOTSTRAP_EMAIL
    || process.env.AUTH_BOOTSTRAP_OPERATOR_EMAIL
  );
  const password = normalizeString(
    process.env.AUTH_BOOTSTRAP_PASSWORD
    || process.env.AUTH_BOOTSTRAP_OPERATOR_PASSWORD
  );

  if (!email || !password) {
    return null;
  }

  if (await countUsers() > 0) {
    return null;
  }

  return createUser({
    email,
    password,
    role: 'operator'
  });
}

module.exports = {
  authenticateUserByPassword,
  buildAuthContextFromUser,
  countUsers,
  createUser,
  ensureBootstrapOperatorFromEnv,
  getUserByEmail,
  getUserById,
  hashPassword,
  normalizeEmail,
  normalizeRole,
  normalizeString,
  rotateUserTokenVersion,
  shapeUser,
  updateUser,
  verifyPassword
};
