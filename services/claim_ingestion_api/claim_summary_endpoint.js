const express = require('express');
const router = express.Router();
const { generateClaimSummary } = require('../ai/claim_summary_service');

router.post('/api/claims/summary', async (req, res) => {
  try {
    const claim = req.body || {
      id: 'CLM-1002',
      status: 'denied',
      denialReason: 'Missing modifier',
      amount: 980.00,
      patient: 'Jane Doe',
      payer: 'Example Health'
    };

    const summary = await generateClaimSummary(claim);
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
