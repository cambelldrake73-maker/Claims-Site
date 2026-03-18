const express = require('express');
const router = express.Router();

router.get('/api/claims', async (req, res) => {
  res.json({
    ok: true,
    claims: [
      { id: 'CLM-1001', status: 'submitted', denialReason: '', amount: 1250.00 },
      { id: 'CLM-1002', status: 'denied', denialReason: 'Missing modifier', amount: 980.00 },
      { id: 'CLM-1003', status: 'pending_review', denialReason: '', amount: 430.00 }
    ]
  });
});

module.exports = router;
// AI refresh 1773788684
// AI refresh 1773789475
// AI refresh 1773791262
// AI refresh 1773872478
// AI refresh 1773872558
