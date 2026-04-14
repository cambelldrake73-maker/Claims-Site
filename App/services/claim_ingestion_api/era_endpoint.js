const express = require('express');
const router = express.Router();

const { processERA } = require('../era/era_processor');

router.post('/', async (req, res) => {
  try {
    const result = await processERA(req.body || {}, { identity: req.identity });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error
      });
    }

    return res.json({
      ok: true,
      era: result.era,
      claim: result.claim
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
