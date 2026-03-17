const express = require('express');
const router = express.Router();
const { generateText } = require('../ai/provider');

router.post('/api/claims/explanation', async (req, res) => {
  try {
    const claim = req.body || {
      id: 'CLM-1002',
      status: 'denied',
      denialReason: 'Missing modifier',
      amount: 980.00,
      patient: 'Jane Doe',
      payer: 'Example Health'
    };

    const system = "You explain denied medical claims for internal claim recovery teams.";
    const prompt = `Explain why this claim may have been denied and suggest next steps:\n${JSON.stringify(claim, null, 2)}`;

    const explanation = await generateText({ system, prompt });
    res.json({ ok: true, explanation });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
