const express = require('express');
const router = express.Router();

router.post('/explanation', async (req, res) => {
  try {
    const claim = Object.keys(req.body || {}).length
      ? req.body
      : {
          id: 'CLM-1002',
          status: 'denied',
          denialReason: 'Missing modifier',
          amount: 980.00,
          patient: 'Jane Doe',
          payer: 'Example Health'
        };

    const id = claim?.id || 'UNKNOWN';
    const denialReason = claim?.denialReason || 'unspecified reason';
    const status = claim?.status || 'unknown';
    const amount = claim?.amount || 0;
    const patient = claim?.patient || 'Unknown Patient';
    const payer = claim?.payer || 'Unknown Payer';

    const explanation =
      `Claim ${id} for ${patient} with ${payer} is currently ${status}. ` +
      `The denial reason is ${denialReason}. ` +
      `The billed amount is $${amount}. ` +
      `Recommended next step: review coding, documentation, and payer requirements before correction and resubmission.`;

    res.json({ ok: true, explanation });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
