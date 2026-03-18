const express = require('express');
const router = express.Router();

let CLAIM_STORE = [];

router.get('/intelligence', (req, res) => {
  const byReason = {};
  const byPayer = {};
  const byProcedureCode = {};

  CLAIM_STORE.forEach(c => {
    const reason = c.denial_reason || c.denialReason || 'unspecified';
    const payer = c.payer || 'Unknown Payer';
    const procedureCode = c.procedure_code || 'unknown';

    byReason[reason] = (byReason[reason] || 0) + 1;
    byPayer[payer] = (byPayer[payer] || 0) + 1;
    byProcedureCode[procedureCode] = (byProcedureCode[procedureCode] || 0) + 1;
  });

  res.json({
    ok: true,
    totals: {
      claims: CLAIM_STORE.length
    },
    denial_reasons: byReason,
    payers: byPayer,
    procedure_codes: byProcedureCode
  });
});

router.__setClaimStore = (store) => {
  CLAIM_STORE = store;
};

module.exports = router;
// AI refresh 1773872399
// AI refresh 1773872478
