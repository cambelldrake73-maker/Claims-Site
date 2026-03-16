module.exports = {
  async submitClaim(formattedEdi, metadata) {
    return { submissionId: 'mock-submission-id', status: 'accepted' };
  }
};
