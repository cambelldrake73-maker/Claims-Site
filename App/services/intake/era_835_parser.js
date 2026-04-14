const { normalizeAdjustmentCodes } = require('./denial_code_map');

function normalizeText(value) {
  return Buffer.isBuffer(value)
    ? value.toString('utf8')
    : String(value || '');
}

function normalizeEraText(value) {
  return normalizeText(value)
    .replace(/\r?\n/g, '')
    .trim();
}

function splitSegments(text) {
  if (!text) {
    return [];
  }

  return text
    .split('~')
    .map(segment => segment.trim())
    .filter(Boolean);
}

function getSegmentElements(segment) {
  return String(segment || '').split('*');
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatEraDate(value) {
  const normalized = String(value || '').trim();

  if (!/^\d{8}$/.test(normalized)) {
    return null;
  }

  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function summarizeAdjustmentCodes(adjustments) {
  const labels = adjustments
    .map(adjustment => {
      const group = String(adjustment.group_code || '').trim();
      const code = String(adjustment.reason_code || '').trim();

      if (!group && !code) {
        return null;
      }

      return group && code ? `${group}-${code}` : group || code;
    })
    .filter(Boolean);

  return labels.length ? `Adjustment codes: ${labels.join(', ')}` : null;
}

function normalizeClaimStatus(statusCode, billedAmount, paidAmount) {
  const normalized = String(statusCode || '').trim();

  if (normalized === '4') {
    return 'denied';
  }

  if (normalized === '1' && Number.isFinite(paidAmount) && paidAmount > 0) {
    return 'paid';
  }

  if (
    Number.isFinite(billedAmount)
    && Number.isFinite(paidAmount)
    && paidAmount > 0
    && paidAmount < billedAmount
  ) {
    return 'partial';
  }

  if (Number.isFinite(paidAmount) && paidAmount > 0) {
    return 'paid';
  }

  if (Number.isFinite(billedAmount) && billedAmount > 0 && (!paidAmount || paidAmount === 0)) {
    return 'denied';
  }

  return null;
}

function parseAdjustments(elements) {
  const groupCode = elements[1] || null;
  const adjustments = [];

  for (let index = 2; index < elements.length; index += 3) {
    const reasonCode = elements[index] || null;
    const amount = parseAmount(elements[index + 1]);

    if (!reasonCode && amount === null) {
      continue;
    }

    adjustments.push({
      group_code: groupCode,
      reason_code: reasonCode,
      amount
    });
  }

  return adjustments;
}

function buildPatientName(elements) {
  const lastName = String(elements[3] || '').trim();
  const firstName = String(elements[4] || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || null;
}

function finalizeClaimRecord(claim, payer, traceNumber) {
  if (!claim) {
    return null;
  }

  const {
    normalizedAdjustmentCodes,
    normalizedDenialCategory,
    normalizedDenialLabel
  } = normalizeAdjustmentCodes(claim.adjustments);
  const claimStatus = normalizeClaimStatus(
    claim.claim_status_code,
    claim.billed_amount,
    claim.paid_amount
  );
  const primaryNormalizedCode = normalizedAdjustmentCodes[0]?.code || null;
  const denialReason = normalizedDenialLabel
    ? `${normalizedDenialLabel}${primaryNormalizedCode ? ` (${primaryNormalizedCode})` : ''}`
    : summarizeAdjustmentCodes(claim.adjustments)
    || (claimStatus === 'denied'
      ? `835 claim status ${claim.claim_status_code || 'unknown'}`
      : null);

  return {
    claim_id: claim.claim_id || null,
    patient: claim.patient || null,
    payer: payer || null,
    amount: claim.billed_amount ?? null,
    date_of_service: claim.date_of_service || null,
    denial_reason: denialReason,
    paid_amount: claim.paid_amount ?? null,
    claim_status: claimStatus,
    source_type: 'era_835',
    additional_data: {
      source_type: 'era_835',
      trace_number: traceNumber || null,
      patient_control_number: claim.patient_control_number || null,
      payer_claim_control_number: claim.payer_claim_control_number || null,
      billed_amount: claim.billed_amount ?? null,
      paid_amount: claim.paid_amount ?? null,
      claim_status_code: claim.claim_status_code || null,
      claim_status: claimStatus,
      adjustments: claim.adjustments,
      normalized_adjustment_codes: normalizedAdjustmentCodes,
      normalized_denial_category: normalizedDenialCategory
    }
  };
}

function parseEra835File({ buffer } = {}) {
  const text = normalizeEraText(buffer);
  const segments = splitSegments(text);
  const payerSegment = segments.find(segment => segment.startsWith('N1*PR*')) || null;
  const paymentSegment = segments.find(segment => segment.startsWith('BPR*')) || null;
  const traceSegment = segments.find(segment => segment.startsWith('TRN*')) || null;
  const claimSegments = segments.filter(segment => segment.startsWith('CLP*'));

  const payerElements = getSegmentElements(payerSegment);
  const paymentElements = getSegmentElements(paymentSegment);
  const traceElements = getSegmentElements(traceSegment);
  const payer = payerElements[2] || null;
  const traceNumber = traceElements[2] || null;
  const records = [];
  let currentClaim = null;

  segments.forEach(segment => {
    const elements = getSegmentElements(segment);
    const segmentId = elements[0] || null;

    if (segmentId === 'CLP') {
      const finalized = finalizeClaimRecord(currentClaim, payer, traceNumber);

      if (finalized) {
        records.push(finalized);
      }

      currentClaim = {
        patient_control_number: elements[1] || null,
        claim_status_code: elements[2] || null,
        billed_amount: parseAmount(elements[3]),
        paid_amount: parseAmount(elements[4]),
        payer_claim_control_number: elements[7] || null,
        patient: null,
        date_of_service: null,
        adjustments: []
      };

      currentClaim.claim_id =
        currentClaim.payer_claim_control_number
        || currentClaim.patient_control_number
        || null;

      return;
    }

    if (!currentClaim) {
      return;
    }

    if (segmentId === 'CAS') {
      currentClaim.adjustments.push(...parseAdjustments(elements));
      return;
    }

    if (segmentId === 'NM1' && elements[1] === 'QC' && !currentClaim.patient) {
      currentClaim.patient = buildPatientName(elements);
      return;
    }

    if (
      segmentId === 'DTM'
      && !currentClaim.date_of_service
      && ['232', '472'].includes(String(elements[1] || '').trim())
    ) {
      currentClaim.date_of_service = formatEraDate(elements[2]);
    }
  });

  const finalized = finalizeClaimRecord(currentClaim, payer, traceNumber);

  if (finalized) {
    records.push(finalized);
  }

  return {
    summary: {
      payer,
      paid_amount: parseAmount(paymentElements[2]),
      claim_reference_count: claimSegments.length,
      trace_number: traceNumber
    },
    records
  };
}

module.exports = {
  parseEra835File
};
