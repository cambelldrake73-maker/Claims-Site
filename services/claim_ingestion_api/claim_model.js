const { run } = require('./db');

const CLAIM_SCHEMA = {
  case_id: "string",
  batch_id: "string",
  claim_id: "string",
  patient: "string",
  payer: "string",
  status: "under_review",
  denial_reason: "string",
  amount: "number",
  date_of_service: "string",
  source_file: "string",
  created_at: "number",
  updated_at: "number",
  confidence: "number",
  route: "string"
};

function generateTemporaryClaimId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TEMP-${Date.now()}-${randomPart}`;
}

function normalizeClaim(raw) {
  const rawClaimId = raw.claim_id || raw.id || raw.claim_number;

  return {
    claim_id: rawClaimId || generateTemporaryClaimId(),

    patient:
      raw.patient ||
      raw.patient_name ||
      raw.member_name ||
      raw.member ||
      raw.name ||
      "Unknown Patient",

    payer:
      raw.payer ||
      raw.insurer ||
      raw.insurance ||
      raw.payer_name ||
      "Unknown Payer",

    status: String(raw.status || "unknown").toLowerCase(),

    denial_reason:
      raw.denial_reason ||
      raw.denialReason ||
      raw.reason ||
      raw.denial ||
      raw.error ||
      "unspecified",

    amount:
      Number(
        raw.amount ||
        raw.denied_amount ||
        raw.billed_amount ||
        raw.charge ||
        0
      ),

    date_of_service:
      raw.date_of_service ||
      raw.date ||
      raw.service_date ||
      "",

    source_file: raw.source_file || "manual",

    created_at: Date.now(),
    updated_at: Date.now(),

    confidence: 0,
    route: "unprocessed"
  };
}

async function addNormalizedCases(cases) {
  const normalizedCases = Array.isArray(cases) ? cases : [];
  let inserted = 0;
  const duplicates = [];

  for (const item of normalizedCases) {
    const created_at = item.created_at || Date.now();
    const updated_at = item.updated_at || created_at;
    const source_file = item.source_file || item.file_id || 'intake';

    if (!item.claim_id) {
      duplicates.push(null);
      continue;
    }

    try {
      await run(
        `INSERT INTO claims (
          claim_id, batch_id, case_id, patient, payer, status, denial_reason, amount,
          date_of_service, source_file, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.claim_id,
          item.batch_id ?? null,
          item.case_id ?? null,
          item.patient ?? null,
          item.payer ?? null,
          item.status || 'normalized',
          item.denial_reason ?? null,
          item.amount ?? null,
          item.date_of_service ?? null,
          source_file,
          created_at,
          updated_at
        ]
      );

      await run(
        `INSERT INTO claims_enrichment (
          claim_id,
          confidence,
          recovery_route,
          likely_fix_type,
          missing_fields,
          missing_elements,
          coding_flags,
          warnings,
          recommended_actions,
          fix_plan,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.claim_id,
          null,
          'pending_enrichment',
          null,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({}),
          created_at,
          updated_at
        ]
      );

      inserted += 1;
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        duplicates.push(item.claim_id);
        continue;
      }

      throw err;
    }
  }

  return { inserted, duplicates };
}

module.exports = {
  CLAIM_SCHEMA,
  normalizeClaim,
  addNormalizedCases
};
