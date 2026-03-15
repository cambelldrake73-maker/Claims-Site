CREATE TABLE IF NOT EXISTS claim_fingerprints (
  fingerprint TEXT PRIMARY KEY,
  canonical_claim_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
