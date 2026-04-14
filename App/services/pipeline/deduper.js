module.exports = {
  async deduplicateClaim(canonicalClaim) {
    return { isDuplicate: false, existingClaimId: null };
  }
};
