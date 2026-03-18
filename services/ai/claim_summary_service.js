async function generateClaimSummary(claim) {
  const id = claim?.id || 'UNKNOWN';
  const status = claim?.status || 'unknown';
  const denialReason = claim?.denialReason || 'unspecified reason';
  const amount = claim?.amount || 0;
  const patient = claim?.patient || 'Unknown Patient';
  const payer = claim?.payer || 'Unknown Payer';

  return `Claim ${id} for ${patient} with ${payer} is currently ${status}. The claim amount is $${amount}. The current denial reason is ${denialReason}. This claim should be reviewed for correction and resubmission.`;
}

module.exports = { generateClaimSummary };
