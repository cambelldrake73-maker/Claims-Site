const express = require('express');
const router = express.Router();
const { normalizeClaim } = require('./claim_model');
const { evaluateClaim } = require('./claim_decision_engine');
const { run, all, get } = require('./db');
router.post('/api/claims/ingest', async (req, res) => {
  try {
    const input = req.body;

    if (!Array.isArray(input)) {
      return res.status(400).json({ ok: false, error: 'Expected array of claims' });
    }

    const normalized = input.map(c => {
      const claim = normalizeClaim(c);
      const decision = evaluateClaim(claim);

      claim.confidence = decision.confidence;
      claim.recovery_route = decision.recovery_route;
      claim.likely_fix_type = decision.likely_fix_type;
      claim.missing_fields = decision.missing_fields;
      claim.missing_elements = decision.missing_elements;
      claim.coding_flags = decision.coding_flags;
      claim.warnings = decision.warnings;
      claim.recommended_actions = decision.recommended_actions;
      claim.fix_plan = decision.fix_plan;  
    return claim;
    });

    let ingested = 0;
    const duplicates = [];
    const review_required = [];

    for (const claim of normalized) {
      if (claim.recovery_route === 'manual_exception_review' || claim.recovery_route === 'needs_more_documents') {
        review_required.push({
          claim_id: claim.claim_id,
          confidence: claim.confidence,
          likely_fix_type: claim.likely_fix_type,
          recovery_route: claim.recovery_route,
          missing_fields: claim.missing_fields,
          missing_elements: claim.missing_elements,
          coding_flags: claim.coding_flags,
          warnings: claim.warnings,
          recommended_actions: claim.recommended_actions,
          fix_plan: claim.fix_plan
        });
      }

      try {
        await run(
          `INSERT INTO claims (
            claim_id, patient, payer, status, denial_reason, amount,
            date_of_service, source_file, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.claim_id,
            claim.patient,
            claim.payer,
            claim.status,
            claim.denial_reason,
            claim.amount,
            claim.date_of_service,
            claim.source_file,
            claim.created_at,
            claim.updated_at
          ]
        );
        ingested += 1;
                await run(
          `INSERT INTO claims_enrichment (
            claim_id,
            confidence,
            recovery_route,
            likely_fix_type,
            missing_fields,
            missing_elements,
            coding_flags,
            warnings,
            recommended_actions,
            fix_plan,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.claim_id,
            claim.confidence,
            claim.recovery_route,
            claim.likely_fix_type,
            JSON.stringify(claim.missing_fields || []),
            JSON.stringify(claim.missing_elements || []),
            JSON.stringify(claim.coding_flags || []),
            JSON.stringify(claim.warnings || []),
            JSON.stringify(claim.recommended_actions || []),
            JSON.stringify(claim.fix_plan || {}),
            claim.created_at,
            claim.updated_at
          ]
        );
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
          duplicates.push(claim.claim_id);
        } else {
          throw err;
        }
      }
    }

    const totalRows = await all(`SELECT * FROM claims`);

    res.json({
      ok: true,
      ingested,
      duplicates,
      review_required,
      total: totalRows.length
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.get('/api/claims/all', async (req, res) => {
  try {
    const claims = await all(`SELECT * FROM claims ORDER BY created_at DESC`);
    res.json({ ok: true, claims });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
