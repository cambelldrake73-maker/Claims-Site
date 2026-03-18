const express = require('express');
const router = express.Router();
const { normalizeClaim } = require('./claim_model');
const { run, all } = require('./db');

router.post('/ingest', async (req, res) => {
  try {
    const input = req.body;

    if (!Array.isArray(input)) {
      return res.status(400).json({ ok: false, error: 'Expected array of claims' });
    }

    const normalized = input.map(c => normalizeClaim(c));

    let ingested = 0;
    const duplicates = [];

    for (const claim of normalized) {
      try {
        await run(
          `INSERT INTO claims (
            claim_id, patient, payer, status, denial_reason, amount,
            date_of_service, source_file, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.claim_id,
            claim.patient,
            claim.payer,
            claim.status,
            claim.denial_reason,
            claim.amount,
            claim.date_of_service,
            claim.source_file,
            claim.created_at,
            claim.updated_at
          ]
        );
        ingested += 1;
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
          duplicates.push(claim.claim_id);
        } else {
          throw err;
        }
      }
    }

    const totalRows = await all(`SELECT * FROM claims`);

    res.json({
      ok: true,
      ingested,
      duplicates,
      total: totalRows.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/all', async (req, res) => {
  try {
    const claims = await all(`SELECT * FROM claims ORDER BY created_at DESC`);
    res.json({ ok: true, claims });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
