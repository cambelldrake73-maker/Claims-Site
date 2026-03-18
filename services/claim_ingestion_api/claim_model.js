const CLAIM_SCHEMA = {
  claim_id: "string",
  patient: "string",
  payer: "string",
  status: "string", // denied, approved, pending
  denial_reason: "string",
  amount: "number",
  date_of_service: "string",
  source_file: "string",
  created_at: "number",
  updated_at: "number"
};

function normalizeClaim(raw) {
  return {
    claim_id: raw.claim_id || raw.id || "UNKNOWN",
    patient: raw.patient || "Unknown Patient",
    payer: raw.payer || "Unknown Payer",
    status: (raw.status || "unknown").toLowerCase(),
    denial_reason: raw.denial_reason || raw.denialReason || "unspecified",
    amount: Number(raw.amount || 0),
    date_of_service: raw.date_of_service || raw.date || "",
    source_file: raw.source_file || "manual",
    created_at: Date.now(),
    updated_at: Date.now()
  };
}

module.exports = {
  CLAIM_SCHEMA,
  normalizeClaim
};
