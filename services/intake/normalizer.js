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

  const numeric = Number(value);
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

function normalizeRecord(record, { batch_id, file_id }) {
  const timestamp = Date.now();
  const claimId = normalizeNullable(
    pickField(record, ['claim_id', 'claim_number', 'id'])
  ) || createGeneratedId('claim');

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
    date_of_service: normalizeNullable(
      pickField(record, ['date_of_service', 'service_date', 'date'])
    ),
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
