const {
  normalizeClaimStatus,
  parseAdditionalData
} = require('../claim_ingestion_api/claim_model');

const SUBMISSION_READY_STATUSES = new Set([
  'ready_for_submission'
]);

const SUBMISSION_HISTORY_STATUSES = new Set([
  'submitted',
  'recovered'
]);

function clean(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  return value === undefined ? null : value;
}

function normalizeAmount(value) {
  const cleanedValue = clean(value);

  if (cleanedValue === null || cleanedValue === undefined) {
    return null;
  }

  if (typeof cleanedValue === 'number') {
    return Number.isFinite(cleanedValue) ? cleanedValue : null;
  }

  const normalized = String(cleanedValue)
    .replace(/[$,\s]/g, '')
    .trim();

  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeGeneratedAt(claim = {}) {
  const sourceValue =
    claim.generated_at !== undefined
      ? claim.generated_at
      : claim.updated_at !== undefined
        ? claim.updated_at
        : claim.created_at;

  if (sourceValue === undefined || sourceValue === null) {
    return null;
  }

  const parsed = new Date(sourceValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseRequiredFieldStatus(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item && typeof item === 'object');
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item === 'object')
      : [];
  } catch (err) {
    return [];
  }
}

function buildSubmissionPayload(claim = {}, enrichment = {}) {
  const additionalData = parseAdditionalData(claim.additional_data);

  function resolveField(field) {
    const value = claim[field] !== undefined && claim[field] !== null
      ? claim[field]
      : additionalData[field];

    return clean(value);
  }

  return {
    claim_id: clean(claim.claim_id),
    patient: resolveField('patient'),
    payer: resolveField('payer'),
    date_of_service: resolveField('date_of_service'),
    amount: normalizeAmount(resolveField('amount')),
    procedure_code: resolveField('procedure_code'),
    modifier: resolveField('modifier'),
    diagnosis: resolveField('diagnosis'),
    authorization_number: resolveField('authorization_number'),
    denial_reason: resolveField('denial_reason'),
    recovery_route: clean(enrichment && enrichment.recovery_route),
    likely_fix_type: clean(enrichment && enrichment.likely_fix_type)
  };
}

function validateSubmissionPayload(payload = {}, requiredFieldStatus) {
  const missingFields = new Set();
  const errors = [];
  const normalizedRequiredFieldStatus = parseRequiredFieldStatus(requiredFieldStatus);

  normalizedRequiredFieldStatus.forEach(item => {
    if (item.present === false && item.field) {
      missingFields.add(item.field);
    }
  });

  ['patient', 'payer', 'date_of_service', 'amount'].forEach(field => {
    if (payload[field] === null || payload[field] === undefined) {
      missingFields.add(field);
    }
  });

  return {
    valid: missingFields.size === 0,
    missing_fields: Array.from(missingFields),
    errors
  };
}

function evaluateSubmissionReadiness({
  claim = {},
  enrichment = {},
  documentCount = null,
  allowHistorical = false
} = {}) {
  const status = normalizeClaimStatus(claim.status, 'uploaded');
  const payload = buildSubmissionPayload(claim, enrichment);
  const validation = validateSubmissionPayload(
    payload,
    enrichment?.required_field_status
  );
  const normalizedDocumentCount = Number.isFinite(Number(documentCount))
    ? Number(documentCount)
    : null;
  const hasDocuments = normalizedDocumentCount === null || normalizedDocumentCount > 0;
  const ready = (
    SUBMISSION_READY_STATUSES.has(status)
    && validation.valid
    && hasDocuments
  );
  const historicallyAllowed = (
    allowHistorical
    && SUBMISSION_HISTORY_STATUSES.has(status)
    && validation.valid
    && hasDocuments
  );
  const issues = [];

  if (!SUBMISSION_READY_STATUSES.has(status) && !historicallyAllowed) {
    issues.push('status_not_submission_ready');
  }

  if (!validation.valid) {
    issues.push('missing_required_fields');
  }

  if (!hasDocuments) {
    issues.push('missing_linked_documents');
  }

  return {
    status,
    ready,
    allowed: ready || historicallyAllowed,
    allow_historical: allowHistorical,
    missing_fields: validation.missing_fields,
    errors: validation.errors,
    document_count: normalizedDocumentCount,
    issues,
    payload
  };
}

function buildClaimSubmission({
  claim = {},
  enrichment = {},
  documentCount = null,
  allowHistorical = false
} = {}) {
  const readiness = evaluateSubmissionReadiness({
    claim,
    enrichment,
    documentCount,
    allowHistorical
  });

  if (!readiness.allowed) {
    const err = new Error('Claim is not ready for submission');
    err.code = 'CLAIM_NOT_READY_FOR_SUBMISSION';
    err.status = 409;
    err.details = readiness;
    throw err;
  }

  return {
    payload: readiness.payload,
    readiness
  };
}

function buildSubmissionPreview({
  claim = {},
  enrichment = {},
  documentCount = null,
  allowHistorical = false
} = {}) {
  const { payload, readiness } = buildClaimSubmission({
    claim,
    enrichment,
    documentCount,
    allowHistorical
  });

  return {
    transaction_type: '837P',
    claim: {
      patient_name: payload.patient,
      payer_name: payload.payer,
      service_date: payload.date_of_service,
      charge_amount: payload.amount,
      denial_code: payload.denial_reason,
      claim_status: readiness.status
    },
    metadata: {
      ready_for_submission: readiness.ready,
      document_count: readiness.document_count,
      missing_fields: readiness.missing_fields,
      issues: readiness.issues,
      generated_at: normalizeGeneratedAt(claim)
    }
  };
}

module.exports = {
  SUBMISSION_HISTORY_STATUSES,
  SUBMISSION_READY_STATUSES,
  buildClaimSubmission,
  buildSubmissionPayload,
  buildSubmissionPreview,
  clean,
  evaluateSubmissionReadiness,
  validateSubmissionPayload
};
