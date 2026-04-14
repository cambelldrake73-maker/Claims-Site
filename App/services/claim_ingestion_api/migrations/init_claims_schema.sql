CREATE TABLE IF NOT EXISTS claims (
  case_id TEXT,
  batch_id TEXT,
  upload_id TEXT,
  claim_id TEXT PRIMARY KEY,
  customer_id TEXT,
  patient TEXT,
  payer TEXT,
  status TEXT,
  denial_reason TEXT,
  amount REAL,
  recovered_amount REAL,
  date_of_service TEXT,
  source_file TEXT,
  additional_data TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS uploads (
  upload_id TEXT PRIMARY KEY,
  provider_id TEXT,
  provider_name TEXT,
  upload_name TEXT,
  niche TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS providers (
  provider_id TEXT PRIMARY KEY,
  provider_name TEXT,
  provider_key TEXT UNIQUE,
  provider_npi TEXT,
  tax_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT,
  provider_id TEXT,
  customer_id TEXT,
  is_active INTEGER DEFAULT 1,
  token_version INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS intake_files (
  file_id TEXT PRIMARY KEY,
  upload_id TEXT,
  filename TEXT,
  original_filename TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size INTEGER,
  storage_status TEXT,
  parse_status TEXT,
  normalization_status TEXT,
  manual_review_status TEXT,
  manual_review_reason TEXT,
  storage_key TEXT,
  storage_backend TEXT,
  access_level TEXT,
  stored_at INTEGER,
  encryption_status TEXT,
  encryption_iv TEXT,
  encryption_tag TEXT,
  original_path TEXT,
  checksum TEXT,
  upload_notes TEXT,
  uploaded_at INTEGER,
  updated_at INTEGER,
  parsed_patient TEXT,
  parsed_payer TEXT,
  parsed_amount REAL,
  parsed_date_of_service TEXT
);

CREATE TABLE IF NOT EXISTS intake_file_intelligence (
  file_id TEXT PRIMARY KEY,
  provider_id TEXT,
  canonical_document_type TEXT,
  document_type_source TEXT,
  association_status TEXT,
  associated_claim_id TEXT,
  denial_reason_understood INTEGER DEFAULT 0,
  coverage_determinable_from_current_docs INTEGER DEFAULT 0,
  requires_original_claim INTEGER DEFAULT 0,
  requires_additional_documents INTEGER DEFAULT 0,
  manual_review_required INTEGER DEFAULT 0,
  identifiers_json TEXT,
  denial_evidence_json TEXT,
  case_evidence_json TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (file_id) REFERENCES intake_files(file_id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS claim_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  file_id TEXT,
  match_confidence REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS match_review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  file_id TEXT,
  suggested_claim_id TEXT,
  confidence REAL,
  reasons TEXT,
  note TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS match_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT,
  claim_id TEXT,
  matched_claim_id TEXT,
  action TEXT,
  confidence REAL,
  reasons TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS claims_enrichment (
  enrichment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  confidence REAL,
  recovery_route TEXT,
  likely_fix_type TEXT,
  denial_type TEXT,
  required_fields TEXT,
  required_field_status TEXT,
  missing_fields TEXT,
  missing_elements TEXT,
  coding_flags TEXT,
  warnings TEXT,
  recommended_actions TEXT,
  fix_plan TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_reasoning_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  file_id TEXT,
  confidence REAL,
  reasons TEXT,
  competing_matches TEXT,
  flags TEXT,
  created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS intelligence_decision_log (
  decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_type TEXT NOT NULL,
  decision_key TEXT,
  claim_id TEXT,
  file_id TEXT,
  provider_id TEXT,
  engine TEXT,
  suggested_value_json TEXT,
  confidence REAL,
  requires_review INTEGER DEFAULT 0,
  evidence_json TEXT,
  rationale_json TEXT,
  human_action TEXT,
  human_action_metadata_json TEXT,
  human_action_by_user_id TEXT,
  human_action_at INTEGER,
  final_outcome_json TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS claim_lifecycle_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  previous_status TEXT,
  new_status TEXT,
  "trigger" TEXT,
  context TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL,
  payload TEXT,
  status TEXT,
  clearinghouse_status TEXT,
  clearinghouse_id TEXT,
  error TEXT,
  response TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS eras (
  era_id TEXT PRIMARY KEY,
  external_event_id TEXT,
  claim_id TEXT,
  paid_amount REAL,
  billed_amount REAL,
  status TEXT,
  raw_payload TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS claim_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  recovered_amount REAL,
  clearinghouse_cost REAL,
  platform_fee_percent REAL,
  platform_fee_amount REAL,
  net_due REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  revenue_id INTEGER UNIQUE,
  amount_due REAL,
  amount_paid REAL,
  remaining_balance REAL,
  due_date INTEGER,
  status TEXT,
  paid_at INTEGER,
  payment_method TEXT,
  payment_reference TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  payment_reference TEXT UNIQUE,
  amount REAL,
  method TEXT,
  paid_at INTEGER,
  raw_payment TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  role TEXT,
  customer_id TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  metadata TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS agreements (
  agreement_id TEXT PRIMARY KEY,
  type TEXT,
  version TEXT,
  content TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS user_agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  agreement_id TEXT,
  accepted_at INTEGER,
  source TEXT,
  FOREIGN KEY (agreement_id) REFERENCES agreements(agreement_id)
);

CREATE TABLE IF NOT EXISTS provider_clearinghouse_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT,
  provider_name TEXT,
  clearinghouse_name TEXT,
  connection_type TEXT,
  provider_npi TEXT,
  tax_id TEXT,
  submitter_id TEXT,
  receiver_id TEXT,
  credential_status TEXT,
  is_active INTEGER DEFAULT 0,
  config_json TEXT,
  encrypted_config TEXT,
  encrypted_config_iv TEXT,
  encrypted_config_tag TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS provider_submission_approvals (
  approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT,
  provider_id TEXT,
  approved_by_user_id TEXT,
  approved_at INTEGER,
  claim_updated_at INTEGER,
  provider_connection_id INTEGER,
  fee_acknowledged INTEGER DEFAULT 0,
  status TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS claim_cases (
  case_id TEXT PRIMARY KEY,
  batch_id TEXT,
  status TEXT,
  created_at INTEGER
);

-- Deprecated legacy batch-ingestion tables retained only for backward-compatible schema initialization.
-- Live intake now flows through /api/intake/upload without writing to these tables.
CREATE TABLE IF NOT EXISTS intake_batches (
  batch_id TEXT PRIMARY KEY,
  niche TEXT,
  file_count INTEGER,
  status TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS intake_batch_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER
);

CREATE INDEX IF NOT EXISTS idx_claims_upload_id ON claims(upload_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer);
CREATE INDEX IF NOT EXISTS idx_uploads_provider_id ON uploads(provider_id);
CREATE INDEX IF NOT EXISTS idx_uploads_provider_name ON uploads(provider_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_provider_key ON providers(provider_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id);
CREATE INDEX IF NOT EXISTS idx_intake_files_upload_id ON intake_files(upload_id);
CREATE INDEX IF NOT EXISTS idx_intake_files_storage_key ON intake_files(storage_key);
CREATE INDEX IF NOT EXISTS idx_intake_files_manual_review_status ON intake_files(manual_review_status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_intake_files_parse_status ON intake_files(parse_status, normalization_status);
CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_provider_id ON intake_file_intelligence(provider_id);
CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_document_type ON intake_file_intelligence(canonical_document_type);
CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_manual_review ON intake_file_intelligence(manual_review_required, updated_at);
CREATE INDEX IF NOT EXISTS idx_review_queue_claim_id ON review_queue(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_documents_claim_id ON claim_documents(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_documents_file_id ON claim_documents(file_id);
CREATE INDEX IF NOT EXISTS idx_match_review_queue_status ON match_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_match_review_queue_file_id ON match_review_queue(file_id);
CREATE INDEX IF NOT EXISTS idx_match_review_queue_claim_id ON match_review_queue(claim_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_file_id ON match_feedback(file_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_claim_id ON match_feedback(claim_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_matched_claim_id ON match_feedback(matched_claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_enrichment_claim_id ON claims_enrichment(claim_id);
CREATE INDEX IF NOT EXISTS idx_match_reasoning_snapshot_claim_id ON match_reasoning_snapshot(claim_id);
CREATE INDEX IF NOT EXISTS idx_match_reasoning_snapshot_file_id ON match_reasoning_snapshot(file_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_type_created ON intelligence_decision_log(decision_type, created_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_claim_type ON intelligence_decision_log(claim_id, decision_type, created_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_file_type ON intelligence_decision_log(file_id, decision_type, created_at);
CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_key ON intelligence_decision_log(decision_key);
CREATE INDEX IF NOT EXISTS idx_claim_lifecycle_history_claim_id ON claim_lifecycle_history(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_lifecycle_history_created_at ON claim_lifecycle_history(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_claim_id ON submissions(claim_id);
CREATE INDEX IF NOT EXISTS idx_eras_claim_id ON eras(claim_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_eras_external_event_id ON eras(external_event_id);
CREATE INDEX IF NOT EXISTS idx_claim_revenue_claim_id ON claim_revenue(claim_id);
CREATE INDEX IF NOT EXISTS idx_invoices_claim_id ON invoices(claim_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_reference ON invoice_payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_agreements_type_created_at ON agreements(type, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_type_version ON agreements(type, version);
CREATE INDEX IF NOT EXISTS idx_user_agreements_user_id ON user_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agreements_agreement_id ON user_agreements(agreement_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agreements_user_agreement ON user_agreements(user_id, agreement_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_id ON provider_clearinghouse_connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_name ON provider_clearinghouse_connections(provider_name);
CREATE INDEX IF NOT EXISTS idx_provider_connections_active_status ON provider_clearinghouse_connections(is_active, credential_status);
CREATE INDEX IF NOT EXISTS idx_provider_submission_approvals_claim_provider ON provider_submission_approvals(claim_id, provider_id, status, approved_at);
CREATE INDEX IF NOT EXISTS idx_provider_submission_approvals_provider_connection ON provider_submission_approvals(provider_connection_id);
