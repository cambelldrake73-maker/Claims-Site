const express = require('express');
const router = express.Router();

router.get('/api/claims/detail', async (req, res) => {
  res.json({
    ok: true,
    claim: {
      id: req.query.id || 'CLM-1002',
      status: 'denied',
      denialReason: 'Missing modifier',
      amount: 980.00,
      patient: 'Jane Doe',
      payer: 'Example Health'
    }
  });
});

module.exports = router;
// AI refresh 1773788701
// AI refresh 1773791262
