const express = require('express');
const router = express.Router();
const { db } = require('./db');

function normalizeClaim(claim) {
  return {
    claim_id: claim.claim_id || claim.id || `CLM-${Date.now()}`,
    patient: claim.patient || claim.patient_name || 'Unknown',
    payer: claim.payer || claim.payer_name || 'Unknown',
    status: String(claim.status || 'pending').toLowerCase(),
    denial_reason: claim.denial_reason || claim.denialReason || '',
    amount: Number(claim.amount || 0),
    created_at: Date.now(),
    updated_at: Date.now()
  };
}

router.post('/api/claims/batch-normalize', async (req, res) => {
  try {
    const claims = Array.isArray(req.body?.claims)
      ? req.body.claims
      : Array.isArray(req.body)
      ? req.body
      : [];

    if (!claims.length) {
      return res.status(400).json({ ok: false, error: 'No claims provided' });
    }

    const normalized = claims.map(normalizeClaim);

    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO claims
        (claim_id, patient, payer, status, denial_reason, amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      normalized.forEach(c => {
        stmt.run(
          c.claim_id,
          c.patient,
          c.payer,
          c.status,
          c.denial_reason,
          c.amount,
          c.created_at,
          c.updated_at
        );
      });

      stmt.finalize();
    });

    res.json({
      ok: true,
      inserted: normalized.length,
      sample: normalized[0]
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
