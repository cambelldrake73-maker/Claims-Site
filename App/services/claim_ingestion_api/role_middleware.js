function parseRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function getRequestRole(req) {
  return parseRole(req?.identity?.role);
}

function requireOperatorRole(req, res, next) {
  const role = getRequestRole(req);

  if (role === 'operator') {
    return next();
  }

  return res.status(403).json({
    ok: false,
    error: 'Operator access required'
  });
}

function requireCustomerRole(req, res, next) {
  const role = getRequestRole(req);

  if (role === 'customer') {
    return next();
  }

  return res.status(403).json({
    ok: false,
    error: 'Customer access required'
  });
}

function requireProviderRole(req, res, next) {
  const role = getRequestRole(req);

  if (role === 'provider') {
    return next();
  }

  return res.status(403).json({
    ok: false,
    error: 'Provider access required'
  });
}

module.exports = {
  getRequestRole,
  requireOperatorRole,
  requireCustomerRole,
  requireProviderRole
};
