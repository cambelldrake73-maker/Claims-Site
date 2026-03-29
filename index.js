const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { initializeDatabase } = require('./services/claim_ingestion_api/db');
const claimsApiRouter = require('./services/claim_ingestion_api');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(claimsApiRouter);
initializeDatabase();
const db = new sqlite3.Database('./claims.db');

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS claim_cases (
      case_id TEXT PRIMARY KEY,
      batch_id TEXT,
      status TEXT,
      created_at INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT PRIMARY KEY,
      batch_id TEXT,
      case_id TEXT,     
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

  db.run(`ALTER TABLE claims ADD COLUMN batch_id TEXT`, () => {});
  db.run(`ALTER TABLE claims ADD COLUMN case_id TEXT`, () => {});
  db.run(`
    CREATE TABLE IF NOT EXISTS intake_batches (
      batch_id TEXT PRIMARY KEY,
      niche TEXT,
      file_count INTEGER,
      status TEXT,
      created_at INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS intake_batch_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT,
      file_name TEXT,
      file_type TEXT,
      file_size INTEGER
    )
  `);
});

app.post('/api/intake/batch', async (req, res) => {
  try {
    const { niche, files } = req.body || {};

    if (!niche) {
      return res.status(400).json({ ok: false, error: 'niche is required' });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'files array is required' });
    }

    const batch_id = `BATCH-${Date.now()}`;
    const now = Date.now();
    const case_id = `CASE-${Date.now()}`;

    await run(
      `INSERT INTO claim_cases (case_id, batch_id, status, created_at)
       VALUES (?, ?, ?, ?)`,
      [case_id, batch_id, 'under_review', now]
    );
    await run(
      `INSERT INTO intake_batches (batch_id, niche, file_count, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [batch_id, niche, files.length, 'received', now]
    );

    for (const file of files) {
      await run(
        `INSERT INTO intake_batch_files (batch_id, file_name, file_type, file_size)
         VALUES (?, ?, ?, ?)`,
        [
          batch_id,
          file.name || 'unknown',
          file.type || 'unknown',
          Number(file.size || 0)
        ]
      );
    }

    for (const file of files) {
      const claimId = `CLM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await run(
        `INSERT INTO claims (
          claim_id,
          batch_id,
          case_id,
          patient,
          payer,
          status,
          denial_reason,
          amount,
          date_of_service,
          source_file,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claimId,
          batch_id,
          case_id,
          'Unknown Patient',
          'Unknown Payer',
          'under_review',
          'unspecified',
          0,
          '',
          file.name || 'batch_upload',
          now,
          now
        ]
       );
     }
    res.json({
      ok: true,
      batch: {
        batch_id,
        niche,
        file_count: files.length,
        status: 'received',
        created_at: now
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/intake/batches', async (req, res) => {
  try {
    const batches = await all(
      `SELECT *
       FROM intake_batches
       ORDER BY created_at DESC`
    );

    const results = [];

    for (const batch of batches) {
      const files = await all(
        `SELECT file_name, file_type, file_size
         FROM intake_batch_files
         WHERE batch_id = ?`,
        [batch.batch_id]
      );

      results.push({
        ...batch,
        files
      });
    }

    res.json({ ok: true, batches: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/intake/update-status', async (req, res) => {
  try {
    const { batch_id, status } = req.body || {};
    const allowedStatuses = ['received', 'processing', 'parsed', 'failed'];

    if (!batch_id) {
      return res.status(400).json({ ok: false, error: 'batch_id is required' });
    }

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `status must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    await run(
      `UPDATE intake_batches
       SET status = ?
       WHERE batch_id = ?`,
      [status, batch_id]
    );

    const rows = await all(
      `SELECT *
       FROM intake_batches
       WHERE batch_id = ?`,
      [batch_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'batch not found' });
    }

    res.json({ ok: true, batch: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/claims/normalize-statuses', async (req, res) => {
  try {
    await run(`
      UPDATE claims
      SET status = 'under_review'
      WHERE LOWER(status) IN ('denied', 'pending', 'unknown')
    `);

    await run(`
      UPDATE claims
      SET status = 'submitted'
      WHERE LOWER(status) IN ('approved')
    `);

    await run(`
      UPDATE claims
      SET status = 'not_recoverable'
      WHERE LOWER(status) IN ('rejected')
    `);

    const claims = await all(`
      SELECT claim_id, status
      FROM claims
      ORDER BY created_at DESC
    `);

    res.json({
      ok: true,
      message: 'Claim statuses normalized',
      claims
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/claims/all', async (req, res) => {
  try {
    const rows = await all(`
      SELECT *
      FROM claims
      ORDER BY created_at DESC
    `);

    res.json({ ok: true, claims: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/claims/intelligence', async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM claims`);
    const summary = {
  total_claims: rows.length,
  under_review_count: 0,
  submitted_count: 0,
  not_recoverable_count: 0,
  submitted_recovery_value: 0,
  avg_claim_value: 0,
  approval_rate: 0
};

rows.forEach((row) => {
  const status = String(row.status || '').toLowerCase();
  const amount = Number(row.amount || 0);

  if (status === 'under_review') {
    summary.under_review_count += 1;
  } else if (status === 'submitted') {
    summary.submitted_count += 1;
    summary.submitted_recovery_value += amount;
  } else if (status === 'not_recoverable') {
    summary.not_recoverable_count += 1;
  }
});

// Derived metrics
if (summary.submitted_count > 0) {
  summary.avg_claim_value =
    summary.submitted_recovery_value / summary.submitted_count;
}

const decided =
  summary.submitted_count + summary.not_recoverable_count;

if (decided > 0) {
  summary.approval_rate =
    summary.submitted_count / decided;
}
 res.json({ ok: true, intelligence: summary });

} catch (err) {
  res.status(500).json({ ok: false, error: err.message });
}
});
app.get('/api/intake/batch/:batch_id/claims', async (req, res) => {
  try {
    const { batch_id } = req.params;

    const claims = await all(
      `SELECT *
       FROM claims
       WHERE batch_id = ?
       ORDER BY created_at DESC`,
      [batch_id]
    );

    res.json({ ok: true, batch_id, claims });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/intake/batch/:batch_id/files', async (req, res) => {
  try {
    const { batch_id } = req.params;

    const files = await all(
      `SELECT *
       FROM intake_batch_files
       WHERE batch_id = ?
       ORDER BY id ASC`,
      [batch_id]
    );

    res.json({ ok: true, batch_id, files });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/cases/all', async (req, res) => {
  try {
    const cases = await all(`
      SELECT 
        case_id,
        batch_id,
        MIN(created_at) as created_at,
        COUNT(*) as claim_count,
        CASE
          WHEN SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) > 0 THEN 'processing'
          WHEN SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) = COUNT(*) THEN 'submitted'
          ELSE 'received'
        END as case_status
      FROM claims
      WHERE case_id IS NOT NULL
      GROUP BY case_id, batch_id
      ORDER BY created_at DESC
    `);
    res.json({ ok: true, cases });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/case/:case_id/claims', async (req, res) => {
  try {
    const { case_id } = req.params;

    const claims = await all(
      `SELECT *
       FROM claims
       WHERE case_id = ?
       ORDER BY created_at DESC`,
      [case_id]
    );

    res.json({ ok: true, case_id, claims });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.post('/api/case/:case_id/process', async (req, res) => {
  try {
    const { case_id } = req.params;

    // simulate processing
    await run(
      `UPDATE claims
       SET status = 'submitted'
       WHERE case_id = ?`,
      [case_id]
    );

    res.json({
      ok: true,
      message: `Case ${case_id} processed`
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.post('/api/case/:case_id/approve', async (req, res) => {
  try {
    const { case_id } = req.params;

    await run(
      `UPDATE claims
       SET status = 'approved'
       WHERE case_id = ?`,
      [case_id]
    );

    res.json({ ok: true, message: `Case ${case_id} approved` });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.post('/api/case/:case_id/reject', async (req, res) => {
  try {
    const { case_id } = req.params;

    await run(
      `UPDATE claims
       SET status = 'not_recoverable'
       WHERE case_id = ?`,
      [case_id]
    );

    res.json({ ok: true, message: `Case ${case_id} rejected` });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/cases/submission-ready', async (req, res) => {
  try {
    const cases = await all(`
      SELECT 
        case_id,
        batch_id,
        COUNT(*) as claim_count,
        MIN(created_at) as created_at
      FROM claims
      WHERE status = 'approved'
      GROUP BY case_id, batch_id
      ORDER BY created_at DESC
    `);

    res.json({ ok: true, cases });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.post('/api/case/:case_id/submit', async (req, res) => {
  try {
    const { case_id } = req.params;

    // Only allow approved cases to be submitted
    const claims = await all(
      `SELECT * FROM claims WHERE case_id = ?`,
      [case_id]
    );

    if (!claims.length) {
      return res.status(404).json({ ok: false, error: 'Case not found' });
    }

    const hasUnapproved = claims.some(c => c.status !== 'approved');

    if (hasUnapproved) {
      return res.status(400).json({
        ok: false,
        error: 'All claims must be approved before submission'
      });
    }

    // Simulate clearinghouse submission
    await run(
      `UPDATE claims
       SET status = 'submitted',
           updated_at = ?
       WHERE case_id = ?`,
      [Date.now(), case_id]
    );

    res.json({
      ok: true,
      message: `Case ${case_id} submitted to clearinghouse`
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`claims-site API listening on port ${PORT}`);
});
