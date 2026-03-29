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

    const enrichment = await get(
      `SELECT * FROM claims_enrichment WHERE claim_id = ?`,
      [req.params.id]
    );

    res.json({
      ok: true,
      claim,
      enrichment: enrichment
        ? {
            ...enrichment,
            missing_fields: JSON.parse(enrichment.missing_fields || '[]'),
            missing_elements: JSON.parse(enrichment.missing_elements || '[]'),
            coding_flags: JSON.parse(enrichment.coding_flags || '[]'),
            warnings: JSON.parse(enrichment.warnings || '[]'),
            recommended_actions: JSON.parse(enrichment.recommended_actions || '[]'),
            fix_plan: JSON.parse(enrichment.fix_plan || '{}')
          }
        : null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/claims/:id/enrichment', async (req, res) => {
  try {
    const enrichment = await get(
      `SELECT * FROM claims_enrichment WHERE claim_id = ?`,
      [req.params.id]
    );

    if (!enrichment) {
      return res.status(404).json({ ok: false, error: 'enrichment not found' });
    }

    res.json({
      ok: true,
      enrichment: {
        ...enrichment,
        missing_fields: JSON.parse(enrichment.missing_fields || '[]'),
        missing_elements: JSON.parse(enrichment.missing_elements || '[]'),
        coding_flags: JSON.parse(enrichment.coding_flags || '[]'),
        warnings: JSON.parse(enrichment.warnings || '[]'),
        recommended_actions: JSON.parse(enrichment.recommended_actions || '[]'),
        fix_plan: JSON.parse(enrichment.fix_plan || '{}')
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
