const ALLOWED_DENIAL_TYPES = new Set([
  'coding_error',
  'missing_info',
  'authorization_required',
  'duplicate',
  'coverage_issue',
  'other'
]);

module.exports = {
  classifyDenial(denialType, context = {}) {
    const candidate = String(context.denial_type || denialType || '').trim().toLowerCase();
    const category = ALLOWED_DENIAL_TYPES.has(candidate) ? candidate : 'other';

    return {
      category,
      recoverabilityScore: Number(context.recovery_score ?? 0.5),
      suggestedCorrectionTypes: []
    };
  }
};
