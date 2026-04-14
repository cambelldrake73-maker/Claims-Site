const express = require('express');
const router = express.Router();

const { all } = require('./db');
const { computeAdaptiveWeights } = require('../intake/match_learning');

async function handleMatchLearning(req, res) {
  try {
    const denialType = typeof req.query.denial_type === 'string'
      ? req.query.denial_type.trim()
      : '';

    let sql = `
      SELECT
        mf.*
      FROM match_feedback mf
    `;
    const params = [];

    if (denialType) {
      sql += `
        LEFT JOIN claims_enrichment ce
          ON ce.claim_id = mf.claim_id
        WHERE ce.denial_type = ?
      `;
      params.push(denialType);
    }

    sql += `
      ORDER BY mf.created_at DESC
      LIMIT 100
    `;

    const feedbackRows = await all(sql, params);
    const result = computeAdaptiveWeights(Array.isArray(feedbackRows) ? feedbackRows : []);

    res.json({
      weights: result.weights,
      stats: result.stats,
      sample_size: result.sample_size,
      explanation: result.explanation
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

router.get('/api/match-learning', handleMatchLearning);
router.get('/match-learning', handleMatchLearning);

module.exports = router;
