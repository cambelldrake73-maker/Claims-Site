const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const LEGACY_DB_PATH = path.resolve(__dirname, '../../claims.db');
const WORKSPACE_DB_PATH = path.resolve(__dirname, '../../../Data/db/claims.db');
const DEFAULT_DB_PATH = path.join(os.homedir(), '.revcapture', 'claims.db');
const DB_PATH = path.resolve(
  process.env.CLAIMS_DB_PATH
  || process.env.REVCAPTURE_DB_PATH
  || (fs.existsSync(WORKSPACE_DB_PATH) ? WORKSPACE_DB_PATH : null)
  || (fs.existsSync(LEGACY_DB_PATH) ? LEGACY_DB_PATH : DEFAULT_DB_PATH)
);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);
const transactionStack = [];
let savepointCounter = 0;

function executeRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function normalizeTransactionCommand(sql) {
  return String(sql || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

async function beginTransaction() {
  if (transactionStack.length === 0) {
    await executeRun('BEGIN TRANSACTION');
    transactionStack.push(null);
    return { id: 0, changes: 0 };
  }

  const savepointName = `sp_${++savepointCounter}`;
  await executeRun(`SAVEPOINT ${savepointName}`);
  transactionStack.push(savepointName);
  return { id: 0, changes: 0 };
}

async function commitTransaction() {
  if (transactionStack.length === 0) {
    throw new Error('No active transaction to commit');
  }

  const currentScope = transactionStack.pop();

  if (currentScope === null) {
    await executeRun('COMMIT');
    return { id: 0, changes: 0 };
  }

  await executeRun(`RELEASE SAVEPOINT ${currentScope}`);
  return { id: 0, changes: 0 };
}

async function rollbackTransaction() {
  if (transactionStack.length === 0) {
    throw new Error('No active transaction to roll back');
  }

  const currentScope = transactionStack.pop();

  if (currentScope === null) {
    await executeRun('ROLLBACK');
    return { id: 0, changes: 0 };
  }

  await executeRun(`ROLLBACK TO SAVEPOINT ${currentScope}`);
  await executeRun(`RELEASE SAVEPOINT ${currentScope}`);
  return { id: 0, changes: 0 };
}

function run(sql, params = []) {
  const normalizedCommand = normalizeTransactionCommand(sql);

  if (params.length === 0 && normalizedCommand === 'BEGIN TRANSACTION') {
    return beginTransaction();
  }

  if (params.length === 0 && normalizedCommand === 'COMMIT') {
    return commitTransaction();
  }

  if (params.length === 0 && normalizedCommand === 'ROLLBACK') {
    return rollbackTransaction();
  }

  return executeRun(sql, params);
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
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
        applied_fixes TEXT,
        additional_data TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);

    db.all(`PRAGMA table_info(claims)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('case_id')) {
        db.run(`ALTER TABLE claims ADD COLUMN case_id TEXT`);
      }

      if (!columns.has('batch_id')) {
        db.run(`ALTER TABLE claims ADD COLUMN batch_id TEXT`);
      }

      if (!columns.has('upload_id')) {
        db.run(`ALTER TABLE claims ADD COLUMN upload_id TEXT`);
      }

      if (!columns.has('customer_id')) {
        db.run(`ALTER TABLE claims ADD COLUMN customer_id TEXT`);
      }

      if (!columns.has('additional_data')) {
        db.run(`ALTER TABLE claims ADD COLUMN additional_data TEXT`);
      }

      if (!columns.has('recovered_amount')) {
        db.run(`ALTER TABLE claims ADD COLUMN recovered_amount REAL`);
      }

      if (!columns.has('applied_fixes')) {
        db.run(`ALTER TABLE claims ADD COLUMN applied_fixes TEXT`);
      }

      if (columns.has('upload_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_claims_upload_id ON claims(upload_id)`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS uploads (
        upload_id TEXT PRIMARY KEY,
        provider_id TEXT,
        provider_name TEXT,
        upload_name TEXT,
        niche TEXT,
        created_at INTEGER
      )
    `);

    db.all(`PRAGMA table_info(uploads)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('provider_id')) {
        db.run(`ALTER TABLE uploads ADD COLUMN provider_id TEXT`);
      }

      if (columns.has('provider_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_uploads_provider_id ON uploads(provider_id)`);
      }

      if (columns.has('provider_name')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_uploads_provider_name ON uploads(provider_name)`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS providers (
        provider_id TEXT PRIMARY KEY,
        provider_name TEXT,
        provider_key TEXT UNIQUE,
        provider_npi TEXT,
        tax_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(users)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('provider_id')) {
        db.run(`ALTER TABLE users ADD COLUMN provider_id TEXT`);
      }

      if (!columns.has('customer_id')) {
        db.run(`ALTER TABLE users ADD COLUMN customer_id TEXT`);
      }

      if (!columns.has('is_active')) {
        db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
      }

      if (!columns.has('token_version')) {
        db.run(`ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`);
      }

      if (!columns.has('created_at')) {
        db.run(`ALTER TABLE users ADD COLUMN created_at INTEGER`);
      }

      if (!columns.has('updated_at')) {
        db.run(`ALTER TABLE users ADD COLUMN updated_at INTEGER`);
      }

      if (columns.has('email')) {
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      }

      if (columns.has('role')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
      }

      if (columns.has('provider_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id)`);
      }

      if (columns.has('customer_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id)`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS review_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_notes TEXT,
        assignment_status TEXT DEFAULT 'unassigned',
        created_at INTEGER,
        updated_at INTEGER
      )
    `);
    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(claims_enrichment)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('denial_type')) {
        db.run(`ALTER TABLE claims_enrichment ADD COLUMN denial_type TEXT`);
      }

      if (!columns.has('required_fields')) {
        db.run(`ALTER TABLE claims_enrichment ADD COLUMN required_fields TEXT`);
      }

      if (!columns.has('required_field_status')) {
        db.run(`ALTER TABLE claims_enrichment ADD COLUMN required_field_status TEXT`);
      }
    });

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(submissions)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('payload')) {
        db.run(`ALTER TABLE submissions ADD COLUMN payload TEXT`);
      }

      if (!columns.has('response')) {
        db.run(`ALTER TABLE submissions ADD COLUMN response TEXT`);
      }

      if (!columns.has('clearinghouse_status')) {
        db.run(`ALTER TABLE submissions ADD COLUMN clearinghouse_status TEXT`);
      }

      if (!columns.has('clearinghouse_id')) {
        db.run(`ALTER TABLE submissions ADD COLUMN clearinghouse_id TEXT`);
      }

      if (!columns.has('error')) {
        db.run(`ALTER TABLE submissions ADD COLUMN error TEXT`);
      }
    });

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(intake_files)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('upload_id')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN upload_id TEXT`);
      }

      if (!columns.has('original_filename')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN original_filename TEXT`);
      }

      if (!columns.has('file_type')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN file_type TEXT`);
      }

      if (!columns.has('mime_type')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN mime_type TEXT`);
      }

      if (!columns.has('file_size')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN file_size INTEGER`);
      }

      if (!columns.has('storage_status')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN storage_status TEXT`);
      }

      if (!columns.has('parse_status')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN parse_status TEXT`);
      }

      if (!columns.has('normalization_status')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN normalization_status TEXT`);
      }

      if (!columns.has('manual_review_status')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN manual_review_status TEXT`);
      }

      if (!columns.has('manual_review_reason')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN manual_review_reason TEXT`);
      }

      if (!columns.has('storage_key')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN storage_key TEXT`);
      }

      if (!columns.has('storage_backend')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN storage_backend TEXT`);
      }

      if (!columns.has('access_level')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN access_level TEXT`);
      }

      if (!columns.has('stored_at')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN stored_at INTEGER`);
      }

      if (!columns.has('encryption_status')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN encryption_status TEXT`);
      }

      if (!columns.has('encryption_iv')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN encryption_iv TEXT`);
      }

      if (!columns.has('encryption_tag')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN encryption_tag TEXT`);
      }

      if (!columns.has('original_path')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN original_path TEXT`);
      }

      if (!columns.has('checksum')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN checksum TEXT`);
      }

      if (!columns.has('upload_notes')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN upload_notes TEXT`);
      }

      if (!columns.has('updated_at')) {
        db.run(`ALTER TABLE intake_files ADD COLUMN updated_at INTEGER`);
      }

      if (columns.has('upload_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_intake_files_upload_id ON intake_files(upload_id)`);
      }

      if (columns.has('storage_key')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_intake_files_storage_key ON intake_files(storage_key)`);
      }

      if (columns.has('manual_review_status') && columns.has('uploaded_at')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_intake_files_manual_review_status ON intake_files(manual_review_status, uploaded_at)`);
      }

      if (columns.has('parse_status') && columns.has('normalization_status')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_intake_files_parse_status ON intake_files(parse_status, normalization_status)`);
      }
    });

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(intake_file_intelligence)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('provider_id')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN provider_id TEXT`);
      }

      if (!columns.has('canonical_document_type')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN canonical_document_type TEXT`);
      }

      if (!columns.has('document_type_source')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN document_type_source TEXT`);
      }

      if (!columns.has('association_status')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN association_status TEXT`);
      }

      if (!columns.has('associated_claim_id')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN associated_claim_id TEXT`);
      }

      if (!columns.has('denial_reason_understood')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN denial_reason_understood INTEGER DEFAULT 0`);
      }

      if (!columns.has('coverage_determinable_from_current_docs')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN coverage_determinable_from_current_docs INTEGER DEFAULT 0`);
      }

      if (!columns.has('requires_original_claim')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN requires_original_claim INTEGER DEFAULT 0`);
      }

      if (!columns.has('requires_additional_documents')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN requires_additional_documents INTEGER DEFAULT 0`);
      }

      if (!columns.has('manual_review_required')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN manual_review_required INTEGER DEFAULT 0`);
      }

      if (!columns.has('identifiers_json')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN identifiers_json TEXT`);
      }

      if (!columns.has('denial_evidence_json')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN denial_evidence_json TEXT`);
      }

      if (!columns.has('case_evidence_json')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN case_evidence_json TEXT`);
      }

      if (!columns.has('created_at')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN created_at INTEGER`);
      }

      if (!columns.has('updated_at')) {
        db.run(`ALTER TABLE intake_file_intelligence ADD COLUMN updated_at INTEGER`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS claim_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT,
        file_id TEXT,
        match_confidence REAL,
        created_at INTEGER
      )
    `);

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(match_review_queue)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('claim_id')) {
        db.run(`ALTER TABLE match_review_queue ADD COLUMN claim_id TEXT`);
      }

      if (!columns.has('note')) {
        db.run(`ALTER TABLE match_review_queue ADD COLUMN note TEXT`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS match_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT,
        claim_id TEXT,
        matched_claim_id TEXT,
        action TEXT,
        confidence REAL,
        reasons TEXT,
        created_at INTEGER
      )
    `);

    db.all(`PRAGMA table_info(match_feedback)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('matched_claim_id')) {
        db.run(`ALTER TABLE match_feedback ADD COLUMN matched_claim_id TEXT`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS match_reasoning_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT,
        file_id TEXT,
        confidence REAL,
        reasons TEXT,
        competing_matches TEXT,
        flags TEXT,
        created_at INTEGER DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
      )
    `);

    db.all(`PRAGMA table_info(match_reasoning_snapshot)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('flags')) {
        db.run(`ALTER TABLE match_reasoning_snapshot ADD COLUMN flags TEXT`);
      }
    });

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(intelligence_decision_log)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('decision_key')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN decision_key TEXT`);
      }

      if (!columns.has('claim_id')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN claim_id TEXT`);
      }

      if (!columns.has('file_id')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN file_id TEXT`);
      }

      if (!columns.has('provider_id')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN provider_id TEXT`);
      }

      if (!columns.has('engine')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN engine TEXT`);
      }

      if (!columns.has('suggested_value_json')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN suggested_value_json TEXT`);
      }

      if (!columns.has('confidence')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN confidence REAL`);
      }

      if (!columns.has('requires_review')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN requires_review INTEGER DEFAULT 0`);
      }

      if (!columns.has('evidence_json')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN evidence_json TEXT`);
      }

      if (!columns.has('rationale_json')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN rationale_json TEXT`);
      }

      if (!columns.has('human_action')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN human_action TEXT`);
      }

      if (!columns.has('human_action_metadata_json')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN human_action_metadata_json TEXT`);
      }

      if (!columns.has('human_action_by_user_id')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN human_action_by_user_id TEXT`);
      }

      if (!columns.has('human_action_at')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN human_action_at INTEGER`);
      }

      if (!columns.has('final_outcome_json')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN final_outcome_json TEXT`);
      }

      if (!columns.has('created_at')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN created_at INTEGER`);
      }

      if (!columns.has('updated_at')) {
        db.run(`ALTER TABLE intelligence_decision_log ADD COLUMN updated_at INTEGER`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS claim_lifecycle_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT,
        previous_status TEXT,
        new_status TEXT,
        "trigger" TEXT,
        context TEXT,
        created_at INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS eras (
        era_id TEXT PRIMARY KEY,
        external_event_id TEXT,
        claim_id TEXT,
        paid_amount REAL,
        billed_amount REAL,
        status TEXT,
        raw_payload TEXT,
        created_at INTEGER
      )
    `);

    db.all(`PRAGMA table_info(eras)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('external_event_id')) {
        db.run(`ALTER TABLE eras ADD COLUMN external_event_id TEXT`);
      }

      if (columns.has('claim_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_eras_claim_id ON eras(claim_id)`);
      }

      if (columns.has('external_event_id')) {
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_eras_external_event_id ON eras(external_event_id)`);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS claim_revenue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT,
        recovered_amount REAL,
        clearinghouse_cost REAL,
        platform_fee_percent REAL,
        platform_fee_amount REAL,
        net_due REAL,
        created_at INTEGER
      )
    `);

    db.run(`
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        payment_reference TEXT UNIQUE,
        amount REAL,
        method TEXT,
        paid_at INTEGER,
        raw_payment TEXT,
        created_at INTEGER
      )
    `);

    db.run(`
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS agreements (
        agreement_id TEXT PRIMARY KEY,
        type TEXT,
        version TEXT,
        content TEXT,
        created_at INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS user_agreements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        agreement_id TEXT,
        accepted_at INTEGER,
        source TEXT,
        FOREIGN KEY (agreement_id) REFERENCES agreements(agreement_id)
      )
    `);

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(invoices)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('paid_at')) {
        db.run(`ALTER TABLE invoices ADD COLUMN paid_at INTEGER`);
      }

      if (!columns.has('payment_method')) {
        db.run(`ALTER TABLE invoices ADD COLUMN payment_method TEXT`);
      }

      if (!columns.has('payment_reference')) {
        db.run(`ALTER TABLE invoices ADD COLUMN payment_reference TEXT`);
      }

      if (!columns.has('amount_paid')) {
        db.run(`ALTER TABLE invoices ADD COLUMN amount_paid REAL`);
      }

      if (!columns.has('remaining_balance')) {
        db.run(`ALTER TABLE invoices ADD COLUMN remaining_balance REAL`);
      }

      if (!columns.has('due_date')) {
        db.run(`ALTER TABLE invoices ADD COLUMN due_date INTEGER`);
      }
    });

    db.all(`PRAGMA table_info(invoice_payments)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('raw_payment')) {
        db.run(`ALTER TABLE invoice_payments ADD COLUMN raw_payment TEXT`);
      }
    });

    db.all(`PRAGMA table_info(provider_clearinghouse_connections)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('provider_id')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN provider_id TEXT`);
      }

      if (!columns.has('provider_name')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN provider_name TEXT`);
      }

      if (!columns.has('clearinghouse_name')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN clearinghouse_name TEXT`);
      }

      if (!columns.has('connection_type')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN connection_type TEXT`);
      }

      if (!columns.has('provider_npi')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN provider_npi TEXT`);
      }

      if (!columns.has('tax_id')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN tax_id TEXT`);
      }

      if (!columns.has('submitter_id')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN submitter_id TEXT`);
      }

      if (!columns.has('receiver_id')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN receiver_id TEXT`);
      }

      if (!columns.has('credential_status')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN credential_status TEXT`);
      }

      if (!columns.has('is_active')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN is_active INTEGER DEFAULT 0`);
      }

      if (!columns.has('config_json')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN config_json TEXT`);
      }

      if (!columns.has('encrypted_config')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN encrypted_config TEXT`);
      }

      if (!columns.has('encrypted_config_iv')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN encrypted_config_iv TEXT`);
      }

      if (!columns.has('encrypted_config_tag')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN encrypted_config_tag TEXT`);
      }

      if (!columns.has('created_at')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN created_at INTEGER`);
      }

      if (!columns.has('updated_at')) {
        db.run(`ALTER TABLE provider_clearinghouse_connections ADD COLUMN updated_at INTEGER`);
      }

      if (columns.has('provider_id')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_id ON provider_clearinghouse_connections(provider_id)`);
      }

      if (columns.has('provider_name')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_name ON provider_clearinghouse_connections(provider_name)`);
      }

      if (columns.has('is_active') && columns.has('credential_status')) {
        db.run(`CREATE INDEX IF NOT EXISTS idx_provider_connections_active_status ON provider_clearinghouse_connections(is_active, credential_status)`);
      }
    });

    db.run(`
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
      )
    `);

    db.all(`PRAGMA table_info(provider_submission_approvals)`, (err, rows) => {
      if (err) return;

      const columns = new Set((rows || []).map(row => row.name));

      if (!columns.has('fee_acknowledged')) {
        db.run(`ALTER TABLE provider_submission_approvals ADD COLUMN fee_acknowledged INTEGER DEFAULT 0`);
      }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_enrichment_claim_id ON claims_enrichment(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_provider_key ON providers(provider_key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_provider_id ON intake_file_intelligence(provider_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_document_type ON intake_file_intelligence(canonical_document_type)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intake_file_intelligence_manual_review ON intake_file_intelligence(manual_review_required, updated_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claim_revenue_claim_id ON claim_revenue(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_claim_id ON invoices(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_reference ON invoice_payments(payment_reference)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_agreements_type_created_at ON agreements(type, created_at)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_type_version ON agreements(type, version)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_agreements_user_id ON user_agreements(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_agreements_agreement_id ON user_agreements(agreement_id)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agreements_user_agreement ON user_agreements(user_id, agreement_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_provider_submission_approvals_claim_provider ON provider_submission_approvals(claim_id, provider_id, status, approved_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_provider_submission_approvals_provider_connection ON provider_submission_approvals(provider_connection_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_review_queue_claim_id ON review_queue(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_submissions_claim_id ON submissions(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claim_documents_claim_id ON claim_documents(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claim_documents_file_id ON claim_documents(file_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_review_queue_status ON match_review_queue(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_review_queue_file_id ON match_review_queue(file_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_review_queue_claim_id ON match_review_queue(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_feedback_file_id ON match_feedback(file_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_feedback_claim_id ON match_feedback(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_feedback_matched_claim_id ON match_feedback(matched_claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_reasoning_snapshot_claim_id ON match_reasoning_snapshot(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_match_reasoning_snapshot_file_id ON match_reasoning_snapshot(file_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_type_created ON intelligence_decision_log(decision_type, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_claim_type ON intelligence_decision_log(claim_id, decision_type, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_file_type ON intelligence_decision_log(file_id, decision_type, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_intelligence_decision_log_key ON intelligence_decision_log(decision_key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claim_lifecycle_history_claim_id ON claim_lifecycle_history(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claim_lifecycle_history_created_at ON claim_lifecycle_history(created_at)`);
  });
}

module.exports = {
  db,
  DB_PATH,
  run,
  get,
  all,
  initializeDatabase
};
