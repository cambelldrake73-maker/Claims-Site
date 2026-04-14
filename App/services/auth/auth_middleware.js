const crypto = require('crypto');
const { buildAuthContextFromUser, getUserById } = require('./user_model');
const { getUserAgreementStatus } = require('../legal/agreements_service');

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseBooleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function base64UrlToBuffer(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0
    ? ''
    : '='.repeat(4 - (normalized.length % 4));

  return Buffer.from(normalized + padding, 'base64');
}

function bufferToBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseRole(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeAgreementStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const agreements = Array.isArray(value.agreements)
    ? value.agreements.map(item => Object.freeze({
        agreement_id: normalizeString(item?.agreement_id),
        type: normalizeString(item?.type),
        version: normalizeString(item?.version),
        accepted: item?.accepted === true,
        accepted_at: item?.accepted_at ?? null,
        source: normalizeString(item?.source)
      }))
    : [];
  const accepted_types = Array.isArray(value.accepted_types)
    ? value.accepted_types.map(normalizeString).filter(Boolean)
    : [];
  const missing_types = Array.isArray(value.missing_types)
    ? value.missing_types.map(normalizeString).filter(Boolean)
    : [];

  return Object.freeze({
    accepted_all: value.accepted_all === true,
    accepted_types: Object.freeze(accepted_types),
    missing_types: Object.freeze(missing_types),
    agreements: Object.freeze(agreements)
  });
}

function buildRequestIdentity(authContext = {}) {
  const role = parseRole(authContext.role);
  return Object.freeze({
    user_id: normalizeString(authContext.user_id),
    email: normalizeString(authContext.email),
    role,
    customer_id: normalizeString(authContext.customer_id),
    provider_id: normalizeString(authContext.provider_id),
    token_version: Number.isFinite(Number(authContext.token_version))
      ? Number(authContext.token_version)
      : 0,
    is_dev_bypass: authContext.is_dev_bypass === true,
    agreement_status: normalizeAgreementStatus(authContext.agreement_status),
    scopes: role ? [role] : []
  });
}

function buildBootstrapIdentity() {
  return Object.freeze({
    user_id: null,
    email: null,
    role: 'anonymous',
    customer_id: null,
    provider_id: null,
    token_version: 0,
    is_dev_bypass: false,
    is_auth_bootstrap: true,
    scopes: ['auth:bootstrap']
  });
}

function attachRequestIdentity(req, identity) {
  Object.defineProperty(req, 'identity', {
    value: identity,
    enumerable: true,
    configurable: true,
    writable: false
  });
}

async function buildIdentityWithAgreementStatus(authContext = {}) {
  try {
    const agreement_status = authContext?.user_id
      ? await getUserAgreementStatus(authContext.user_id)
      : null;

    return buildRequestIdentity({
      ...authContext,
      agreement_status
    });
  } catch (err) {
    return buildRequestIdentity(authContext);
  }
}

function isAuthBootstrapRequest(req) {
  const url = String(req?.originalUrl || req?.url || '');
  const method = String(req?.method || '').trim().toUpperCase();
  return method === 'POST' && url === '/api/auth/login';
}

function requiresScopedUploadIdentity(req) {
  const url = String(req?.originalUrl || req?.url || '');
  return url === '/api/intake/upload';
}

function validateEdgeIdentityForRequest(identity, req) {
  if (!requiresScopedUploadIdentity(req)) {
    return null;
  }

  const missing = [];

  if (!normalizeString(identity?.customer_id)) {
    missing.push('customer_id');
  }

  if (!normalizeString(identity?.provider_id)) {
    missing.push('provider_id');
  }

  if (!missing.length) {
    return null;
  }

  return new Error(
    `Authenticated session is missing required upload identity: ${missing.join(', ')}`
  );
}

function normalizeAuthPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid payload');
  }

  const user_id = normalizeString(payload.user_id);
  const role = parseRole(payload.role);
  const customer_id = normalizeString(payload.customer_id);
  const provider_id = normalizeString(payload.provider_id);
  const token_version = Number.isFinite(Number(payload.token_version))
    ? Number(payload.token_version)
    : 0;

  if (!user_id) {
    throw new Error('user_id is required');
  }

  if (role !== 'operator' && role !== 'customer' && role !== 'provider') {
    throw new Error('role must be operator, provider, or customer');
  }

  if (role === 'customer' && !customer_id) {
    throw new Error('customer_id is required for customer auth');
  }

  if (role === 'provider' && !provider_id) {
    throw new Error('provider_id is required for provider auth');
  }

  return {
    user_id,
    role,
    customer_id,
    provider_id,
    token_version
  };
}

function parseBearerToken(req) {
  const header = normalizeString(req?.headers?.authorization);

  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? normalizeString(match[1]) : null;
}

function verifyAuthToken(token) {
  const secret = normalizeString(
    process.env.AUTH_JWT_SECRET || process.env.AUTH_SECRET
  );

  if (!secret) {
    throw new Error('AUTH_JWT_SECRET is not configured');
  }

  const parts = String(token || '').split('.');

  if (parts.length !== 3) {
    throw new Error('invalid token format');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = JSON.parse(base64UrlToBuffer(headerPart).toString('utf8'));
  const payload = JSON.parse(base64UrlToBuffer(payloadPart).toString('utf8'));

  if (header?.alg !== 'HS256') {
    throw new Error('unsupported token algorithm');
  }

  const expectedSignature = bufferToBase64Url(
    crypto
      .createHmac('sha256', secret)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  const providedSignature = String(signaturePart || '');
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);

  if (
    expectedBuffer.length !== providedBuffer.length
    || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error('invalid token signature');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Number.isFinite(Number(payload?.nbf)) && Number(payload.nbf) > nowSeconds) {
    throw new Error('token not active');
  }

  if (Number.isFinite(Number(payload?.exp)) && Number(payload.exp) <= nowSeconds) {
    throw new Error('token expired');
  }

  return normalizeAuthPayload(payload);
}

function resolveJwtSecret() {
  const secret = normalizeString(
    process.env.AUTH_JWT_SECRET || process.env.AUTH_SECRET
  );

  if (!secret) {
    throw new Error('AUTH_JWT_SECRET is not configured');
  }

  return secret;
}

function issueAuthToken(authContext, options = {}) {
  const normalizedAuth = normalizeAuthPayload(authContext);
  const secret = resolveJwtSecret();
  const headerPart = bufferToBase64Url(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT'
  }));
  const nowSeconds = Number.isFinite(Number(options.nowSeconds))
    ? Number(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const ttlHours = Number.isFinite(Number(options.ttlHours))
    ? Number(options.ttlHours)
    : Number.isFinite(Number(process.env.AUTH_JWT_TTL_HOURS))
      ? Number(process.env.AUTH_JWT_TTL_HOURS)
      : 12;
  const payload = {
    ...normalizedAuth,
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + Math.max(1, Math.floor(ttlHours * 3600))
  };
  const payloadPart = bufferToBase64Url(JSON.stringify(payload));
  const signaturePart = bufferToBase64Url(
    crypto
      .createHmac('sha256', secret)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );

  return {
    token: `${headerPart}.${payloadPart}.${signaturePart}`,
    payload
  };
}

function isCustomerApiRequest(req) {
  const url = String(req?.originalUrl || req?.url || '');
  return url.startsWith('/api/customer/');
}

function isProviderApiRequest(req) {
  const url = String(req?.originalUrl || req?.url || '');
  return url.startsWith('/api/provider/');
}

function buildDevBypassAuth(req) {
  if (!parseBooleanEnv(process.env.AUTH_DEV_BYPASS)) {
    return null;
  }

  if (isCustomerApiRequest(req)) {
    const customer_id = normalizeString(process.env.AUTH_DEV_CUSTOMER_ID);

    if (!customer_id) {
      return null;
    }

    return {
      user_id: normalizeString(process.env.AUTH_DEV_CUSTOMER_USER_ID) || 'dev_customer',
      email: null,
      role: 'customer',
      customer_id,
      provider_id: null,
      token_version: 0,
      is_dev_bypass: true
    };
  }

  if (isProviderApiRequest(req)) {
    const provider_id = normalizeString(process.env.AUTH_DEV_PROVIDER_ID);

    if (!provider_id) {
      return null;
    }

    return {
      user_id: normalizeString(process.env.AUTH_DEV_PROVIDER_USER_ID) || 'dev_provider',
      email: null,
      role: 'provider',
      customer_id: null,
      provider_id,
      token_version: 0,
      is_dev_bypass: true
    };
  }

  return {
    user_id: normalizeString(process.env.AUTH_DEV_OPERATOR_USER_ID) || 'dev_operator',
    email: null,
    role: 'operator',
    customer_id: null,
    provider_id: null,
    token_version: 0,
    is_dev_bypass: true
  };
}

function respondUnauthorized(res, error) {
  if (error) {
    console.warn(`Authentication failed: ${error.message}`);
  }

  return res.status(401).json({
    ok: false,
    error: 'Authentication required'
  });
}

async function authenticateRequest(req, res, next) {
  if (isAuthBootstrapRequest(req)) {
    attachRequestIdentity(req, buildBootstrapIdentity());
    return next();
  }

  const token = parseBearerToken(req);

  if (token) {
    try {
      const tokenPayload = verifyAuthToken(token);
      const user = await getUserById(tokenPayload.user_id);

      if (!user || user.is_active !== true) {
        throw new Error('user account is inactive or missing');
      }

      const userAuthContext = buildAuthContextFromUser(user);

      if (!userAuthContext) {
        throw new Error('user auth context is invalid');
      }

      if (
        userAuthContext.role !== tokenPayload.role
        || userAuthContext.provider_id !== tokenPayload.provider_id
        || userAuthContext.customer_id !== tokenPayload.customer_id
        || Number(userAuthContext.token_version) !== Number(tokenPayload.token_version)
      ) {
        throw new Error('token no longer matches the active user session');
      }

      const identity = await buildIdentityWithAgreementStatus(userAuthContext);
      const edgeIdentityError = validateEdgeIdentityForRequest(identity, req);

      if (edgeIdentityError) {
        return respondUnauthorized(res, edgeIdentityError);
      }

      attachRequestIdentity(req, identity);
      return next();
    } catch (err) {
      const bypassAuth = buildDevBypassAuth(req);

      if (bypassAuth) {
        const identity = await buildIdentityWithAgreementStatus(bypassAuth);
        const edgeIdentityError = validateEdgeIdentityForRequest(identity, req);

        if (edgeIdentityError) {
          return respondUnauthorized(res, edgeIdentityError);
        }

        attachRequestIdentity(req, identity);
        return next();
      }

      return respondUnauthorized(res, err);
    }
  }

  const bypassAuth = buildDevBypassAuth(req);

  if (bypassAuth) {
    const identity = await buildIdentityWithAgreementStatus(bypassAuth);
    const edgeIdentityError = validateEdgeIdentityForRequest(identity, req);

    if (edgeIdentityError) {
      return respondUnauthorized(res, edgeIdentityError);
    }

    attachRequestIdentity(req, identity);
    return next();
  }

  return respondUnauthorized(res);
}

module.exports = {
  authenticateRequest,
  issueAuthToken,
  verifyAuthToken,
  normalizeAuthPayload
};
