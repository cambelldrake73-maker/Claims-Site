const express = require('express');
const router = express.Router();
const { get } = require('./db');

router.get('/api/claims/:id', async (req, res) => {
  try {
    const claim = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [req.params.id]
    );

    if (!claim) {
      return res.status(404).json({ ok: false, error: 'claim not found' });
    }

    res.json({ ok: true, claim });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
