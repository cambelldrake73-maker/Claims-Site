const express = require('express');
const router = express.Router();
const { all } = require('./db');

router.get('/api/claims', async (req, res) => {
  try {
    const claims = await all(`SELECT * FROM claims ORDER BY created_at DESC`);
    res.json({
      ok: true,
      count: claims.length,
      claims
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
