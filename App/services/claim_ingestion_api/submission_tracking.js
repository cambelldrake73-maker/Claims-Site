async function trackSubmission(claimId, submissionStatus = 'submitted') {
  throw new Error(
    `Deprecated: direct submission tracking is disabled for ${claimId || 'unknown_claim'} (${submissionStatus})`
  );
}

module.exports = { trackSubmission };
