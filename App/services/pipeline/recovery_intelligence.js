const BASE_RECOVERY_PROFILES = {
  missing_info: {
    recoverable: true,
    confidence: 0.9,
    recovery_route: 'resubmit',
    required_fields: ['patient', 'payer', 'date_of_service'],
    fix_type: 'data_completion'
  },
  authorization_required: {
    recoverable: true,
    confidence: 0.85,
    recovery_route: 'resubmit',
    required_fields: ['authorization_number'],
    fix_type: 'authorization'
  },
  coding_error: {
    recoverable: true,
    confidence: 0.75,
    recovery_route: 'resubmit',
    required_fields: ['procedure_code'],
    fix_type: 'coding'
  },
  duplicate: {
    recoverable: false,
    confidence: 0.2,
    recovery_route: 'none',
    required_fields: [],
    fix_type: 'duplicate'
  },
  coverage_issue: {
    recoverable: false,
    confidence: 0.3,
    recovery_route: 'manual_review',
    required_fields: [],
    fix_type: 'coverage'
  },
  other: {
    recoverable: false,
    confidence: 0.5,
    recovery_route: 'manual_review',
    required_fields: [],
    fix_type: 'unknown'
  }
};

const STRONG_EVIDENCE_SOURCES = new Set([
  'era_835',
  'structured_record',
  'adjustment_code_map',
  'structured_denial_category',
  'structured_denial_field'
]);

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  return false;
}

function parseObject(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch (err) {
      return null;
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function getClaimObject(claim) {
  return claim && typeof claim === 'object' && !Array.isArray(claim)
    ? claim
    : {};
}

function getAdditionalData(claimObject) {
  return parseObject(claimObject.additional_data) || {};
}

function getNestedObject(parent, key) {
  const object = parseObject(parent);
  return object ? (parseObject(object[key]) || {}) : {};
}

function resolveFieldValue(claim, field) {
  const claimObject = getClaimObject(claim);
  const additionalData = getAdditionalData(claimObject);
  const claimCaseEvidence = getNestedObject(claimObject, 'case_evidence');
  const additionalCaseEvidence = getNestedObject(additionalData, 'case_evidence');
  const claimLinkedSummary = getNestedObject(claimObject, 'linked_document_summary');
  const additionalLinkedSummary = getNestedObject(additionalData, 'linked_document_summary');

  const candidates = [
    { source: 'claim', value: claimObject[field], inSchema: Object.prototype.hasOwnProperty.call(claimObject, field) },
    { source: 'additional_data', value: additionalData[field], inSchema: Object.prototype.hasOwnProperty.call(claimObject, field) },
    { source: 'case_evidence', value: claimCaseEvidence[field], inSchema: false },
    { source: 'additional_case_evidence', value: additionalCaseEvidence[field], inSchema: false },
    { source: 'linked_document_summary', value: claimLinkedSummary[field], inSchema: false },
    { source: 'additional_linked_document_summary', value: additionalLinkedSummary[field], inSchema: false }
  ];

  for (const candidate of candidates) {
    if (isFieldPresent(candidate.value)) {
      return candidate;
    }
  }

  return {
    source: null,
    value: undefined,
    inSchema: Object.prototype.hasOwnProperty.call(claimObject, field)
  };
}

function readBooleanSignal(claim, field) {
  const claimObject = getClaimObject(claim);
  const additionalData = getAdditionalData(claimObject);
  const claimCaseEvidence = getNestedObject(claimObject, 'case_evidence');
  const additionalCaseEvidence = getNestedObject(additionalData, 'case_evidence');
  const claimLinkedSummary = getNestedObject(claimObject, 'linked_document_summary');
  const additionalLinkedSummary = getNestedObject(additionalData, 'linked_document_summary');

  return [
    claimObject[field],
    additionalData[field],
    claimCaseEvidence[field],
    additionalCaseEvidence[field],
    claimLinkedSummary[field],
    additionalLinkedSummary[field]
  ].some(normalizeBoolean);
}

function collectStringValues(values) {
  const collected = new Set();

  values.forEach(value => {
    toArray(value).forEach(entry => {
      const normalized = normalizeString(entry);
      if (normalized) {
        collected.add(normalized);
      }
    });
  });

  return Array.from(collected);
}

function collectEvidenceSources(claim) {
  const claimObject = getClaimObject(claim);
  const additionalData = getAdditionalData(claimObject);
  const topLevelDenialEvidence = parseObject(claimObject.denial_evidence) || {};
  const additionalDenialEvidence = parseObject(additionalData.denial_evidence) || {};
  const claimLinkedSummary = getNestedObject(claimObject, 'linked_document_summary');
  const additionalLinkedSummary = getNestedObject(additionalData, 'linked_document_summary');

  return collectStringValues([
    topLevelDenialEvidence.evidence_source,
    additionalDenialEvidence.evidence_source,
    claimLinkedSummary.evidence_sources,
    additionalLinkedSummary.evidence_sources
  ]);
}

function collectMissingEvidence(claim) {
  const claimObject = getClaimObject(claim);
  const additionalData = getAdditionalData(claimObject);
  const claimCaseEvidence = getNestedObject(claimObject, 'case_evidence');
  const additionalCaseEvidence = getNestedObject(additionalData, 'case_evidence');

  return collectStringValues([
    claimObject.missing_evidence,
    additionalData.missing_evidence,
    claimCaseEvidence.missing_evidence,
    additionalCaseEvidence.missing_evidence
  ]);
}

function inferEvidenceStrength({ denialReasonUnderstood, evidenceSources }) {
  const normalizedSources = Array.isArray(evidenceSources)
    ? evidenceSources.map(source => String(source).trim().toLowerCase()).filter(Boolean)
    : [];

  if (normalizedSources.some(source => STRONG_EVIDENCE_SOURCES.has(source))) {
    return 'strong';
  }

  if (denialReasonUnderstood) {
    return normalizedSources.length > 0 ? 'medium' : 'weak';
  }

  return 'weak';
}

function getBaseProfile(denial_type) {
  const key = normalizeString(denial_type) || 'other';
  return {
    ...(
      BASE_RECOVERY_PROFILES[key]
      || BASE_RECOVERY_PROFILES.other
    )
  };
}

function buildRecoveryContext(claim, denial_type) {
  const evidenceSources = collectEvidenceSources(claim);
  const denialReasonUnderstood = readBooleanSignal(claim, 'denial_reason_understood');
  const coverageDeterminable = readBooleanSignal(claim, 'coverage_determinable_from_current_docs');
  const requiresOriginalClaim = readBooleanSignal(claim, 'requires_original_claim');
  const requiresAdditionalDocuments = readBooleanSignal(claim, 'requires_additional_documents');
  const manualReviewRequired = readBooleanSignal(claim, 'manual_review_required');
  const missingEvidence = collectMissingEvidence(claim);
  const evidenceStrength = inferEvidenceStrength({
    denialReasonUnderstood,
    evidenceSources
  });

  return {
    denial_type: normalizeString(denial_type) || 'other',
    denial_reason_understood: denialReasonUnderstood,
    coverage_determinable_from_current_docs: coverageDeterminable,
    requires_original_claim: requiresOriginalClaim,
    requires_additional_documents: requiresAdditionalDocuments,
    manual_review_required: manualReviewRequired,
    evidence_sources: evidenceSources,
    evidence_strength: evidenceStrength,
    missing_evidence: missingEvidence
  };
}

function clampConfidence(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0.5;
  }

  return Number(Math.max(0, Math.min(1, numeric)).toFixed(2));
}

function buildReasoningBase(context, missingFields) {
  const reasoning = [
    `denial type considered: ${context.denial_type}`,
    `denial evidence strength: ${context.evidence_strength}`
  ];

  if (context.denial_reason_understood) {
    reasoning.push('denial reason is understood from current evidence');
  } else {
    reasoning.push('denial reason is not understood strongly enough from current evidence');
  }

  if (context.evidence_sources.length) {
    reasoning.push(`evidence sources: ${context.evidence_sources.join(', ')}`);
  }

  if (context.requires_original_claim) {
    reasoning.push('original claim is required before a stronger recommendation can be made');
  }

  if (context.requires_additional_documents) {
    reasoning.push('additional supporting documents are required before action');
  }

  if (context.manual_review_required) {
    reasoning.push('manual review is required by current case/document evidence');
  }

  if (context.denial_type === 'coverage_issue') {
    reasoning.push(
      context.coverage_determinable_from_current_docs
        ? 'coverage determination is supported by current documents'
        : 'coverage is not determinable from current documents'
    );
  }

  if (missingFields.length) {
    reasoning.push(`required claim fields still missing: ${missingFields.join(', ')}`);
  }

  if (context.missing_evidence.length) {
    reasoning.push(`missing evidence signals: ${context.missing_evidence.join(', ')}`);
  }

  return reasoning;
}

function buildRecoveryDecision({ profile, context, missingFields }) {
  const prerequisiteDocuments = [];
  const warnings = [];
  let recommendationState = 'needs_manual_review';
  let recoveryRoute = profile.recovery_route;
  let confidence = profile.confidence;
  let recoverable = profile.recoverable;
  let recoverableNow = false;

  if (context.requires_original_claim || context.missing_evidence.includes('original_claim_document')) {
    prerequisiteDocuments.push('original_claim_document');
  }

  if (context.requires_additional_documents || context.missing_evidence.includes('additional_supporting_documents')) {
    prerequisiteDocuments.push('additional_supporting_documents');
  }

  const reasoning = buildReasoningBase(context, missingFields);

  if (!context.denial_reason_understood) {
    recommendationState = 'insufficient_evidence';
    recoveryRoute = 'manual_review';
    confidence = Math.min(profile.confidence, 0.25);
    warnings.push('denial context is too weak for a stronger recovery recommendation');
    reasoning.push('a stronger action was not chosen because denial evidence is still insufficient');
  } else if (prerequisiteDocuments.includes('original_claim_document')) {
    recommendationState = 'needs_original_claim';
    recoveryRoute = 'manual_review';
    confidence = Math.min(profile.confidence, 0.35);
    warnings.push('original claim document must be obtained before recovery action');
    reasoning.push('resubmission or appeal is deferred until the original claim is available');
  } else if (prerequisiteDocuments.includes('additional_supporting_documents')) {
    recommendationState = 'needs_additional_documents';
    recoveryRoute = 'manual_review';
    confidence = Math.min(profile.confidence, 0.4);
    warnings.push('supporting documents are required before recovery action');
    reasoning.push('a stronger action was not chosen because supporting documents are still missing');
  } else if (context.manual_review_required) {
    recommendationState = 'needs_manual_review';
    recoveryRoute = 'manual_review';
    confidence = Math.min(profile.confidence, 0.45);
    warnings.push('case evidence currently requires operator review');
    reasoning.push('manual review was chosen because current evidence remains mixed or incomplete');
  } else if (context.denial_type === 'coverage_issue') {
    if (context.coverage_determinable_from_current_docs) {
      recommendationState = 'likely_not_recoverable';
      recoveryRoute = 'none';
      confidence = Math.max(profile.confidence, 0.6);
      reasoning.push('the denial appears coverage-related and determinable from current documents');
    } else {
      recommendationState = 'insufficient_evidence';
      recoveryRoute = 'manual_review';
      confidence = Math.min(profile.confidence, 0.3);
      warnings.push('coverage issue cannot be confirmed confidently from current documents');
      reasoning.push('a non-recoverable recommendation was not chosen because coverage is not yet determinable');
    }
  } else if (context.denial_type === 'duplicate') {
    if (context.evidence_strength === 'weak') {
      recommendationState = 'insufficient_evidence';
      recoveryRoute = 'manual_review';
      confidence = Math.min(profile.confidence, 0.2);
      warnings.push('duplicate classification is not strong enough to close the case');
      reasoning.push('duplicate handling remains review-first because the evidence is weak');
    } else {
      recommendationState = 'likely_not_recoverable';
      recoveryRoute = 'none';
      confidence = Math.max(profile.confidence, 0.55);
      reasoning.push('duplicate evidence is strong enough to avoid recommending resubmission');
    }
  } else if (profile.recoverable && missingFields.length > 0) {
    recommendationState = 'insufficient_evidence';
    recoveryRoute = profile.recovery_route;
    confidence = Math.min(profile.confidence, 0.55);
    warnings.push('known recovery path exists, but required claim fields are still missing');
    reasoning.push('the fix path is known, but prerequisites are not yet met for action');
  } else if (profile.recoverable) {
    recommendationState = 'ready_to_resubmit';
    recoveryRoute = profile.recovery_route;
    recoverableNow = true;
    confidence = context.evidence_strength === 'strong'
      ? profile.confidence
      : Math.min(profile.confidence, 0.7);
    reasoning.push('current evidence supports the identified recovery path without additional document gates');
  } else {
    recommendationState = 'needs_manual_review';
    recoveryRoute = 'manual_review';
    confidence = Math.min(profile.confidence, 0.45);
    warnings.push('no safe deterministic recovery path is known from current evidence');
    reasoning.push('manual review was chosen because the current denial type does not map safely to a deterministic action');
  }

  const prerequisitesMet = (
    recommendationState === 'ready_to_resubmit'
    && missingFields.length === 0
    && prerequisiteDocuments.length === 0
  );

  return {
    recommendation_state: recommendationState,
    recovery_route: recoveryRoute,
    recoverable,
    recoverable_now: recoverableNow,
    confidence: clampConfidence(confidence),
    prerequisite_documents: Array.from(new Set(prerequisiteDocuments)),
    follow_up_documents_needed: Array.from(new Set(prerequisiteDocuments)),
    prerequisites_met: prerequisitesMet,
    warnings,
    reasoning
  };
}

function getRecoveryIntelligence(claim, denial_type) {
  const profile = getBaseProfile(denial_type);
  const requiredFieldStatus = mapRequiredFieldsToClaim(claim, profile.required_fields);
  const missingFields = requiredFieldStatus
    .filter(entry => entry.present !== true)
    .map(entry => entry.field);
  const context = buildRecoveryContext(claim, denial_type);
  const decision = buildRecoveryDecision({
    profile,
    context,
    missingFields
  });

  return {
    recoverable: decision.recoverable,
    recoverable_now: decision.recoverable_now,
    confidence: decision.confidence,
    recovery_route: decision.recovery_route,
    required_fields: profile.required_fields,
    missing_fields: missingFields,
    fix_type: profile.fix_type,
    recommendation_state: decision.recommendation_state,
    prerequisite_documents: decision.prerequisite_documents,
    follow_up_documents_needed: decision.follow_up_documents_needed,
    prerequisites_met: decision.prerequisites_met,
    evidence_strength: context.evidence_strength,
    denial_context: context,
    warnings: decision.warnings,
    reasoning: decision.reasoning
  };
}

function isFieldPresent(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(isFieldPresent);
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return true;
}

function mapRequiredFieldsToClaim(claim, required_fields) {
  const fields = Array.isArray(required_fields) ? required_fields : [];

  return fields.map(field => {
    const resolved = resolveFieldValue(claim, field);

    return {
      field,
      present: isFieldPresent(resolved.value),
      in_schema: resolved.inSchema === true,
      source: resolved.source
    };
  });
}

module.exports = {
  getRecoveryIntelligence,
  isFieldPresent,
  mapRequiredFieldsToClaim
};
