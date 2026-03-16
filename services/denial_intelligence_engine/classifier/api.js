module.exports = {
  classifyDenial(denialCode, context = {}) {
    return { category: 'unknown', recoverabilityScore: 0.0, suggestedCorrectionTypes: [] };
  }
};
