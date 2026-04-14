function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeAmount(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[$,\s]/g, '');
  if (normalized === '') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function formatClaimToSubmission(caseData = {}) {
  const patient_name = normalizeString(caseData.patient);
  const payer_name = normalizeString(caseData.payer);
  const service_date = normalizeString(caseData.date_of_service);
  const charge_amount = normalizeAmount(caseData.amount);
  const denial_code = normalizeString(caseData.denial_reason);
  const claim_status = normalizeString(caseData.status);
  const generated_at = normalizeTimestamp(
    caseData.generated_at !== undefined
      ? caseData.generated_at
      : caseData.updated_at !== undefined
        ? caseData.updated_at
        : caseData.created_at
  );

  return {
    transaction_type: '837P',
    claim: {
      patient_name,
      payer_name,
      service_date,
      charge_amount,
      denial_code,
      claim_status
    },
    metadata: {
      ready_for_submission: [
        patient_name,
        payer_name,
        service_date,
        charge_amount,
        denial_code,
        claim_status
      ].every(value => value !== null),
      generated_at
    }
  };
}

module.exports = {
  formatTo837(canonicalClaim, options = {}) {
    return { segments: ['ISA', 'GS', 'ST', 'SE', 'GE', 'IEA'], claim: canonicalClaim, options };
  },
  formatClaimToSubmission
};
