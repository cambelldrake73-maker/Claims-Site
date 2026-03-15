const { normalizeParsedRecord } = require('../../claim_normalization/normalize');

async function runClaimIngestWorker(bundle) {
  return normalizeParsedRecord(bundle);
}

module.exports = { runClaimIngestWorker };
