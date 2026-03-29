const express = require('express');
const router = express.Router();
const { get } = require('./db');
const { generateClaimSummary } = require('../ai/claim_summary_service');

router.post('/api/claims/summary', async (req, res) => {
  try {
    const { claim_id } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    const claim = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    if (!claim) {
      return res.status(404).json({ ok: false, error: 'claim not found' });
    }

    const summary = await generateClaimSummary(claim);

    res.json({
      ok: true,
      claim_id,
      summary
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
