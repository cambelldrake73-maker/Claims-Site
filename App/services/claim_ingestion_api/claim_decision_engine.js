// Legacy compatibility only.
// This file must not define lifecycle semantics or reinterpret orchestrator output.
// runOrchestrator() is authoritative for lifecycle decisions.
// claims_enrichment and intelligence_decision_log are the canonical downstream
// truth surfaces for enrichment and decision history.
const { runOrchestrator } = require('../pipeline/orchestrator');

function evaluateClaim(claim) {
  const orchestration = runOrchestrator(claim);
  const enrichment = orchestration.enrichment || {};
  const missing_fields = Array.isArray(orchestration.enrichment && orchestration.enrichment.missing_fields)
    ? orchestration.enrichment.missing_fields
    : [];

  return {
    missing_fields,
    warnings: Array.isArray(enrichment.warnings) ? enrichment.warnings : [],
    coding_flags: Array.isArray(enrichment.coding_flags) ? enrichment.coding_flags : [],
    missing_elements: missing_fields,
    required_fields: Array.isArray(enrichment.required_fields)
      ? enrichment.required_fields
      : [],
    required_field_status: Array.isArray(enrichment.required_field_status)
      ? enrichment.required_field_status
      : [],
    recommended_actions: Array.isArray(orchestration.recommended_actions)
      ? orchestration.recommended_actions
      : [],
    fix_plan: {
      priority_score: orchestration.priority_score ?? null,
      estimated_recovery: orchestration.estimated_recovery ?? null,
      denial_type: orchestration.denial_type ?? null
    },
    confidence: orchestration.confidence,
    likely_fix_type: enrichment.likely_fix_type ?? null,
    recovery_route: enrichment.recovery_route ?? null
  };
}

module.exports = {
  evaluateClaim
};
