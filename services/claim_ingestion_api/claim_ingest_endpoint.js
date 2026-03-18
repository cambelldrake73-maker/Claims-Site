const express = require('express');
const router = express.Router();
const { normalizeClaim } = require('./claim_model');

let CLAIM_STORE = [];

router.post('/ingest', async (req, res) => {
  try {
    const input = req.body;

    if (!Array.isArray(input)) {
      return res.status(400).json({ ok: false, error: "Expected array of claims" });
    }

    const normalized = input.map(c => normalizeClaim(c));

    CLAIM_STORE.push(...normalized);

    res.json({
      ok: true,
      ingested: normalized.length,
      total: CLAIM_STORE.length
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/all', (req, res) => {
  res.json({ ok: true, claims: CLAIM_STORE });
});

module.exports = router;

