const crypto = require('crypto');

function hasCriticalFields(payload = {}) {
  return [
    payload.claim_id,
    payload.patient,
    payload.payer,
    payload.date_of_service,
    payload.amount
  ].every(value => value !== null && value !== undefined);
}

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function buildPayloadFingerprint(payload = {}) {
  const fingerprintSource = [
    normalizeValue(payload.claim_id),
    normalizeValue(payload.payer),
    normalizeValue(payload.patient),
    normalizeValue(payload.amount),
    normalizeValue(payload.date_of_service),
    normalizeValue(payload.procedure_code),
    normalizeValue(payload.authorization_number)
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintSource)
    .digest('hex');
}

function getDeterministicBucket(fingerprint) {
  const bucketSource = fingerprint.slice(0, 8);
  return Number.parseInt(bucketSource, 16) % 100;
}

function submitToClearinghouse(payload, connectionContext = {}) {
  void connectionContext;

  if (!hasCriticalFields(payload)) {
    return {
      status: 'rejected',
      error: 'Invalid payload'
    };
  }

  const fingerprint = buildPayloadFingerprint(payload);
  const bucket = getDeterministicBucket(fingerprint);

  if (bucket < 70) {
    return {
      status: 'accepted',
      clearinghouse_id: `CH_${fingerprint.slice(0, 12).toUpperCase()}`
    };
  }

  if (bucket < 90) {
    return {
      status: 'rejected',
      error: 'Invalid payer mapping'
    };
  }

  return {
    status: 'error',
    error: 'Temporary clearinghouse failure'
  };
}

module.exports = {
  submitToClearinghouse
};
