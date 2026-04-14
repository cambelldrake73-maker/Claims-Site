const express = require('express');
const router = express.Router();

router.post('/api/claims/ingest', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload'
  });
});

router.get('/api/claims/all', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload and /api/claims endpoints'
  });
});

module.exports = router;
