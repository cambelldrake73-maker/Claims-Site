const { validate } = require('../../libs/validators/canonicalValidator');

async function normalizeParsedRecord(parsedRecord) {
  const canonicalClaim = { ...parsedRecord };
  validate('canonical_claim_schema', canonicalClaim);
  return canonicalClaim;
}

module.exports = { normalizeParsedRecord };
