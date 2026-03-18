const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../claims.db');
const db = new sqlite3.Database(DB_PATH);

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

    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer)`);
  });
}

module.exports = {
  db,
  initializeDatabase
};
// AI refresh 1773872462
