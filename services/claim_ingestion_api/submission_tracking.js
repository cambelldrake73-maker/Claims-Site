function trackSubmission(claimId) {
  return {
    claimId,
    status: "submitted",
    timestamp: Date.now()
  };
}

module.exports = { trackSubmission };
