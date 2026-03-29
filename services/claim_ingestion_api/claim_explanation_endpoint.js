const express = require('express');
const router = express.Router();
const { get } = require('./db');
const fs = require('fs');
const path = require('path');

const knowledgePath = path.join(__dirname, '../ai/denial_knowledge.json');
const denialKnowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));

function matchDenial(reason = '') {
  const lower = reason.toLowerCase();

  for (const key of Object.keys(denialKnowledge)) {
    if (lower.includes(key)) {
      return denialKnowledge[key];
    }
  }

  return null;
}

router.post('/api/claims/explanation', async (req, res) => {
  try {
    const { claim_id } = req.body || {};

    if (!claim_id) {
      return res.status(400).json({ ok: false, error: 'claim_id is required' });
    }

    const claim = await get(
      `SELECT * FROM claims WHERE claim_id = ?`,
      [claim_id]
    );

    if (!claim) {
      return res.status(404).json({ ok: false, error: 'claim not found' });
    }

    const denialReason = claim.denial_reason || 'unspecified';
    const match = matchDenial(denialReason);

    let explanation =
      `Claim ${claim.claim_id} for ${claim.patient} with ${claim.payer} is currently ${claim.status}. ` +
      `The denial reason is ${denialReason}. ` +
      `The billed amount is $${claim.amount || 0}. `;

    if (match) {
      explanation +=
        `This falls under the ${match.category} category. ` +
        `${match.description} ` +
        `Recommended action: ${match.action}`;
    } else {
      explanation +=
        `Recommended next step: review coding, documentation, and payer requirements before correction and resubmission.`;
    }

    res.json({
      ok: true,
      claim_id,
      explanation
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
