/*
  ARCHITECTURE RULE:
  All ingestion MUST go through /services/pipeline/intake_pipeline.js
  Direct calls to parse/match/orchestrator/claim_model are forbidden.
*/

function createGeneratedId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNullable(value) {
  return value === undefined ? null : value;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const cleaned = String(value)
    .replace(/[$,]/g, '')
    .trim();

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickField(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeAdditionalData(record) {
  const additionalData = record?.additional_data
    && typeof record.additional_data === 'object'
    && !Array.isArray(record.additional_data)
    ? { ...record.additional_data }
    : {};

  if (record?.source_type !== undefined) {
    additionalData.source_type = record.source_type;
  }

  if (record?.paid_amount !== undefined) {
    additionalData.paid_amount = normalizeAmount(record.paid_amount);
  }

  if (record?.claim_status !== undefined) {
    additionalData.claim_status = normalizeNullable(record.claim_status);
  }

  if (record?.normalized_denial_category !== undefined) {
    additionalData.normalized_denial_category = normalizeNullable(record.normalized_denial_category);
  }

  if (record?.normalized_adjustment_codes !== undefined) {
    additionalData.normalized_adjustment_codes = Array.isArray(record.normalized_adjustment_codes)
      ? record.normalized_adjustment_codes
      : normalizeNullable(record.normalized_adjustment_codes);
  }

  return Object.keys(additionalData).length ? additionalData : null;
}

function normalizeRecord(record, { batch_id, file_id }) {
  const timestamp = Date.now();
  const rawClaimId = normalizeNullable(
    pickField(record, ['claim_id', 'claim_number', 'id'])
  );

  const claimId =
    rawClaimId
      ? String(rawClaimId).trim()
      : createGeneratedId('claim');

  return {
    case_id: createGeneratedId('case'),
    batch_id,
    file_id,
    claim_id: claimId,
    patient: normalizeNullable(
      pickField(record, ['patient', 'patient_name', 'member_name', 'member', 'name'])
    ),
    payer: normalizeNullable(
      pickField(record, ['payer', 'payer_name', 'insurer', 'insurance'])
    ),
    amount: normalizeAmount(
      pickField(record, ['amount', 'denied_amount', 'billed_amount', 'charge'])
    ),
    denial_reason: normalizeNullable(
      pickField(record, ['denial_reason', 'denialReason', 'reason', 'denial', 'error'])
    ),
    date_of_service: (() => {
      const raw = normalizeNullable(
        pickField(record, ['date_of_service', 'service_date', 'date'])
      );

      if (!raw) return null;

      const parsed = new Date(raw);
      return isNaN(parsed.getTime())
        ? raw
        : parsed.toISOString().split('T')[0];
    })(),
    additional_data: normalizeAdditionalData(record),
    status: 'normalized',
    created_at: timestamp,
    updated_at: timestamp
  };
}

function normalizeRecords({ batch_id, file_id, raw_records }) {
  if (!batch_id) {
    throw new Error('batch_id is required');
  }

  if (!file_id) {
    throw new Error('file_id is required');
  }

  if (!Array.isArray(raw_records)) {
    throw new Error('raw_records must be an array');
  }

  return raw_records.map(record => {
    const normalizedInput =
      record && typeof record === 'object' && !Array.isArray(record)
        ? record
        : {};

    return normalizeRecord(normalizedInput, { batch_id, file_id });
  });
}

module.exports = {
  normalizeRecords
};
