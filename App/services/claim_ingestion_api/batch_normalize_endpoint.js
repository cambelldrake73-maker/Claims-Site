const express = require('express');
const router = express.Router();

router.post('/api/claims/batch-normalize', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload'
  });
});

module.exports = router;
