function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function evaluateClaim(claim) {
  const missing_fields = [];
  const warnings = [];
  const coding_flags = [];
  const missing_elements = [];
  const recommended_actions = [];
  const fix_plan = {
    recover_claim_id: false,
    verify_payer: false,
    verify_amount: false,
    add_procedure_codes: [],
    add_diagnosis_codes: [],
    add_modifiers: [],
    attach_documents: [],
    authorization_followup: false,
    resubmit_claim: false,
    manual_review_required: false
  };

  const denialReason = String(claim.denial_reason || '').toLowerCase();
  const procedureCodes = toArray(claim.procedure_codes);
  const diagnosisCodes = toArray(claim.diagnosis_codes);
  const modifiers = toArray(claim.modifiers);

  if (!claim.claim_id || String(claim.claim_id).startsWith('TEMP-')) {
    missing_fields.push('claim_id');
    recommended_actions.push('Verify or recover the original claim identifier before submission.');
    fix_plan.recover_claim_id = true;
  }

  if (!claim.payer || claim.payer === 'Unknown Payer') {
    missing_fields.push('payer');
    recommended_actions.push('Confirm the correct payer and update payer information.');
    fix_plan.verify_payer = true;
  }

  if (typeof claim.amount !== 'number' || Number.isNaN(claim.amount) || claim.amount <= 0) {
    missing_fields.push('amount');
    recommended_actions.push('Verify billed amount and update claim charges.');
    fix_plan.verify_amount = true;
  }

  if (!claim.denial_reason || claim.denial_reason === 'unspecified') {
    missing_fields.push('denial_reason');
    recommended_actions.push('Obtain the denial reason from remittance or denial paperwork.');
    fix_plan.attach_documents.push('denial paperwork');
  }

  if (procedureCodes.length === 0) {
    missing_elements.push('procedure_codes');
    coding_flags.push('missing_procedure_code');
    recommended_actions.push('Review documentation and add the correct CPT/HCPCS procedure code.');
    fix_plan.add_procedure_codes.push('TBD_from_documentation');
  }

  if (diagnosisCodes.length === 0) {
    missing_elements.push('diagnosis_codes');
    coding_flags.push('missing_diagnosis_code');
    recommended_actions.push('Add supporting ICD diagnosis codes that justify the billed service.');
    fix_plan.add_diagnosis_codes.push('TBD_from_documentation');
  }

  if (denialReason.includes('modifier') && modifiers.length === 0) {
    missing_elements.push('modifiers');
    coding_flags.push('missing_modifier');
    recommended_actions.push('Add the required modifier and verify payer-specific modifier rules.');
    fix_plan.add_modifiers.push('TBD_required_modifier');
  }

  if (denialReason.includes('authorization') || denialReason.includes('prior auth')) {
    coding_flags.push('authorization_issue');
    recommended_actions.push('Confirm prior authorization details and attach authorization support.');
    fix_plan.authorization_followup = true;
    fix_plan.attach_documents.push('authorization support');
  }

  if (denialReason.includes('documentation')) {
    coding_flags.push('documentation_issue');
    recommended_actions.push('Gather and attach missing documentation supporting medical necessity and coding.');
    fix_plan.attach_documents.push('clinical notes');
    fix_plan.attach_documents.push('medical necessity support');
  }

  if (denialReason.includes('duplicate')) {
    coding_flags.push('duplicate_claim_risk');
    recommended_actions.push('Check for prior submission history and verify whether this is a duplicate claim.');
  }

  if (!claim.status || claim.status === 'unknown') {
    warnings.push('status is unknown');
    recommended_actions.push('Confirm the exact claim status before routing.');
  }

  let confidence = 1.0;
  confidence -= missing_fields.length * 0.25;
  confidence -= missing_elements.length * 0.15;
  confidence -= warnings.length * 0.05;

  if (confidence < 0) confidence = 0;

  let likely_fix_type = 'general_denial_review';
  let recovery_route = 'ready_for_recovery_review';

  if (coding_flags.includes('missing_modifier')) {
    likely_fix_type = 'modifier_correction';
    recovery_route = 'coding_correction_review';
  } else if (coding_flags.includes('missing_procedure_code')) {
    likely_fix_type = 'missing_procedure_code';
    recovery_route = 'coding_correction_review';
  } else if (coding_flags.includes('missing_diagnosis_code')) {
    likely_fix_type = 'missing_diagnosis_code';
    recovery_route = 'coding_correction_review';
  } else if (coding_flags.includes('authorization_issue')) {
    likely_fix_type = 'authorization_issue';
    recovery_route = 'authorization_review';
  } else if (coding_flags.includes('documentation_issue')) {
    likely_fix_type = 'documentation_gap';
    recovery_route = 'needs_more_documents';
  } else if (coding_flags.includes('duplicate_claim_risk')) {
    likely_fix_type = 'duplicate_claim_review';
    recovery_route = 'manual_exception_review';
  }

  if (missing_fields.length > 0) {
    recovery_route = 'manual_exception_review';
  }

  if (confidence < 0.65) {
    recovery_route = 'manual_exception_review';
  }

  if (
    recovery_route === 'coding_correction_review' ||
    recovery_route === 'authorization_review' ||
    recovery_route === 'needs_more_documents'
  ) {
    fix_plan.resubmit_claim = true;
  }

  if (recovery_route === 'manual_exception_review') {
    fix_plan.manual_review_required = true;
  }

  return {
    missing_fields,
    warnings,
    coding_flags,
    missing_elements,
    recommended_actions,
    fix_plan,
    confidence: Number(confidence.toFixed(2)),
    likely_fix_type,
    recovery_route
  };
}

module.exports = {
  evaluateClaim
};
