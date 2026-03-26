const CLAIM_SCHEMA = {
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
    patient: raw.patient || raw.patient_name || "Unknown Patient",
    payer: raw.payer || raw.insurer || "Unknown Payer",
    status: String(raw.status || "unknown").toLowerCase(),
    denial_reason: raw.denial_reason || raw.denialReason || raw.reason || "unspecified",
    amount: Number(raw.amount || raw.denied_amount || 0),
    date_of_service: raw.date_of_service || raw.date || "",
    source_file: raw.source_file || "manual",
    created_at: Date.now(),
    updated_at: Date.now(),
    confidence: 0,
    route: "unprocessed"
  };
}

module.exports = {
  CLAIM_SCHEMA,
  normalizeClaim
};
