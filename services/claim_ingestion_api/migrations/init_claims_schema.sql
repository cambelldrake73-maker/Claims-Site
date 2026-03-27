CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  patient TEXT,
  payer TEXT,
  status TEXT,
  denial_reason TEXT,
  amount REAL,
  date_of_service TEXT,
  source_file TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  reviewer_id TEXT,
  reviewer_notes TEXT,
  assignment_status TEXT DEFAULT 'unassigned',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS claims_intelligence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  denial_reason TEXT,
  payer TEXT,
  procedure_code TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_claims_claim_id ON claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer);
CREATE INDEX IF NOT EXISTS idx_review_queue_claim_id ON review_queue(claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_intelligence_claim_id ON claims_intelligence(claim_id);
-- AI refresh 1773872462
-- AI refresh 1773872542
-- AI refresh 1773874322
-- AI refresh 1774655453
-- AI refresh 1774655592
-- AI refresh 1774655592
