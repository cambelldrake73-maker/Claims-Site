const fs = require('fs');
const path = require('path');

const knowledgePath = path.join(__dirname, 'denial_knowledge.json');
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

async function generateClaimSummary(claim) {
  const id = claim?.claim_id || claim?.id || 'UNKNOWN';
  const status = claim?.status || 'unknown';
  const denialReason =
    claim?.denial_reason ||
    claim?.denialReason ||
    'unspecified reason';
  const amount = claim?.amount || 0;
  const patient = claim?.patient || 'Unknown Patient';
  const payer = claim?.payer || 'Unknown Payer';

  const match = matchDenial(denialReason);

  let actionText = 'Review the claim for correction and resubmission.';

  if (match) {
    actionText = match.action;
  }

  return `Claim ${id} for ${patient} with ${payer} is currently ${status}. The claim amount is $${amount}. The denial reason is ${denialReason}. Recommended action: ${actionText}`;
}

module.exports = { generateClaimSummary };
