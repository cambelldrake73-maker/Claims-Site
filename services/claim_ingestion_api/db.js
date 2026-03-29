const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../claims.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
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
      )
    `);

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

    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_enrichment_claim_id ON claims_enrichment(claim_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_review_queue_claim_id ON review_queue(claim_id)`);
  });
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase
};
