const express = require('express');
const router = express.Router();

router.post('/api/claims/status', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: lifecycle is orchestrator-controlled'
  });
});

module.exports = router;
