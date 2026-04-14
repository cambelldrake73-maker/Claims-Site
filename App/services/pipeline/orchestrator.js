const { classifyDenial } = require('./denial_classifier');
const {
  getRecoveryIntelligence,
  mapRequiredFieldsToClaim
} = require('./recovery_intelligence');

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

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function dedupeStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return true;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function readRecoveryValue(claim, field) {
  const claimObject = claim && typeof claim === 'object' && !Array.isArray(claim)
    ? claim
    : {};
  const additionalData = parseObject(claimObject.additional_data) || {};

  const candidates = [
    claimObject[field],
    additionalData[field]
  ];

  for (const candidate of candidates) {
    if (isMeaningfulValue(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function mergeRecoveryContext(claim, computedRecovery = {}) {
  const merged = {
    ...computedRecovery
  };

  [
    'recommendation_state',
    'recovery_route',
    'fix_type',
    'evidence_strength'
  ].forEach(field => {
    const value = readRecoveryValue(claim, field);
    if (isMeaningfulValue(value)) {
      merged[field] = value;
    }
  });

  [
    'recoverable',
    'recoverable_now',
    'prerequisites_met'
  ].forEach(field => {
    const value = readRecoveryValue(claim, field);
    if (value === true || value === false) {
      merged[field] = value;
    }
  });

  [
    'required_fields',
    'missing_fields',
    'prerequisite_documents',
    'follow_up_documents_needed'
  ].forEach(field => {
    const existing = Array.isArray(merged[field]) ? merged[field] : [];
    const fromClaim = toArray(readRecoveryValue(claim, field))
      .map(value => String(value || '').trim())
      .filter(Boolean);

    if (fromClaim.length > 0) {
      merged[field] = dedupeStrings([...existing, ...fromClaim]);
    }
  });

  [
    'reasoning',
    'warnings'
  ].forEach(field => {
    const fromClaim = toArray(readRecoveryValue(claim, field))
      .map(value => String(value || '').trim())
      .filter(Boolean);

    if (fromClaim.length > 0) {
      merged[field] = dedupeStrings(fromClaim);
    }
  });

  return merged;
}

function buildMissingFieldActions(fields = []) {
  const messages = {
    patient: 'Patient is required',
    payer: 'Payer is required',
    amount: 'Amount is required',
    date_of_service: 'Date of service is required',
    denial_type: 'Denial type is required'
  };

  return dedupeStrings(fields).map(field => ({
    type: 'missing_field',
    field,
    message: messages[field] || `${field} is required before recovery action`
  }));
}

function buildRecoveryStateActions(recovery = {}, recommendationState, missingFields = []) {
  const prerequisiteDocuments = dedupeStrings(recovery.prerequisite_documents);
  const actions = [];

  if (recommendationState === 'needs_original_claim') {
    actions.push({
      type: 'collect_document',
      field: 'original_claim_document',
      message: 'Original claim is required before recovery action'
    });
  }

  if (recommendationState === 'needs_additional_documents') {
    actions.push({
      type: 'collect_document',
      field: 'additional_supporting_documents',
      message: 'Additional supporting documents are required before recovery action'
    });
  }

  prerequisiteDocuments.forEach(documentField => {
    if (!actions.some(action => action.field === documentField)) {
      actions.push({
        type: 'collect_document',
        field: documentField,
        message: `${documentField} is required before recovery action`
      });
    }
  });

  if (recommendationState === 'needs_manual_review') {
    actions.push({
      type: 'manual_review',
      field: 'review',
      message: 'Manual review required before recovery action'
    });
  }

  if (recommendationState === 'insufficient_evidence') {
    actions.push({
      type: 'manual_review',
      field: 'denial_evidence',
      message: 'More evidence is required before choosing a confident recovery path'
    });
  }

  if (recommendationState === 'likely_not_recoverable') {
    actions.push({
      type: 'manual_review',
      field: 'recoverability',
      message: 'Evidence suggests this claim may not be recoverable; confirm before closing'
    });
  }

  if (missingFields.length > 0) {
    actions.push(...buildMissingFieldActions(missingFields));
  }

  return actions;
}

function getRecommendationStateBaseConfidence(recommendationState, hasMissing) {
  switch (recommendationState) {
    case 'ready_to_resubmit':
      return hasMissing ? 0.55 : 0.9;
    case 'needs_original_claim':
      return 0.4;
    case 'needs_additional_documents':
      return 0.45;
    case 'needs_manual_review':
      return 0.4;
    case 'insufficient_evidence':
      return 0.3;
    case 'likely_not_recoverable':
      return 0.5;
    default:
      return hasMissing ? 0.5 : 0.75;
  }
}

function runOrchestrator(claim) {
  const currentStatus = normalizeString(claim.status);
  const reviewDecision = normalizeString(claim.review_decision);
  const submissionResult = normalizeString(claim.submission_result);
  const denial_type = classifyDenial(claim);
  const recovery = mergeRecoveryContext(
    claim,
    getRecoveryIntelligence(claim, denial_type)
  );
  const recommendationState = normalizeString(recovery.recommendation_state) || 'needs_manual_review';
  const required_field_status = mapRequiredFieldsToClaim(
    claim,
    Array.isArray(recovery.required_fields) ? recovery.required_fields : []
  );
  const recoveryMap = {
    coding_error: 0.9,
    missing_info: 0.85,
    authorization_required: 0.7,
    duplicate: 0.4,
    coverage_issue: 0.2,
    other: 0.5
  };
  const requiredFields = [
    { field: 'patient', value: claim.patient, message: 'Patient is required' },
    { field: 'payer', value: claim.payer, message: 'Payer is required' },
    { field: 'amount', value: claim.amount, message: 'Amount is required' },
    {
      field: 'date_of_service',
      value: claim.date_of_service,
      message: 'Date of service is required'
    },
    {
      field: 'denial_type',
      value: claim.denial_type || denial_type,
      message: 'Denial type is required'
    }
  ];

  const missingActions = requiredFields
    .filter(({ value }) => !value)
    .map(({ field, message }) => ({
      type: 'missing_field',
      field,
      message
    }));

  const baselineMissingFields = missingActions.map(action => action.field);
  const recoveryMissingFields = Array.isArray(recovery.missing_fields)
    ? recovery.missing_fields.filter(field => String(field || '').trim())
    : [];
  const missingFields = dedupeStrings([
    ...baselineMissingFields,
    ...recoveryMissingFields
  ]);
  const hasMissing = missingFields.length > 0;
  const estimated_recovery = Number(claim.amount || 0);
  const legacyRecoveryScore = recoveryMap[denial_type] || 0.5;
  const baseConfidence = getRecommendationStateBaseConfidence(recommendationState, hasMissing);
  const existingConfidence = Number(
    Math.max(0, Math.min(1, ((baseConfidence * 0.7) + (legacyRecoveryScore * 0.3)).toFixed(2)))
  );
  const recovery_score = Number(recovery.confidence ?? 0.5);
  const confidence = Number(
    Math.max(0, Math.min(1, ((existingConfidence * 0.7) + (recovery_score * 0.3)).toFixed(2)))
  );
  const actionableNow = (
    recommendationState === 'ready_to_resubmit'
    && recovery.recoverable === true
    && recovery.prerequisites_met === true
    && !hasMissing
  );
  let status = actionableNow ? 'ready_for_submission' : 'in_review';
  let recommended_actions = actionableNow
    ? []
    : buildRecoveryStateActions(recovery, recommendationState, missingFields);

  if (
    submissionResult === 'paid'
    || submissionResult === 'failed'
    || submissionResult === 'submitted'
    || submissionResult === 'recovered'
    || submissionResult === 'not_recoverable'
  ) {
    status = submissionResult;
    recommended_actions = [];
  } else if (
    currentStatus === 'paid'
    || currentStatus === 'failed'
    || currentStatus === 'submitted'
    || currentStatus === 'recovered'
    || currentStatus === 'not_recoverable'
  ) {
    status = currentStatus;
    recommended_actions = [];
  } else if (reviewDecision === 'approve') {
    status = actionableNow ? 'ready_for_submission' : 'in_review';
    recommended_actions = actionableNow
      ? []
      : buildRecoveryStateActions(recovery, recommendationState, missingFields);
  } else if (claim.review_requested || reviewDecision === 'reject') {
    status = 'in_review';
    recommended_actions = buildRecoveryStateActions(recovery, recommendationState, missingFields);

    if (!recommended_actions.length) {
      recommended_actions = hasMissing
        ? buildMissingFieldActions(missingFields)
        : [{
            type: 'manual_review',
            field: 'review',
            message: 'Manual review required'
          }];
    }
  }

  let priority_score = 0;

  priority_score += estimated_recovery * ((confidence + recovery_score) / 2);
  priority_score = Math.min(100, Math.round(priority_score / 100));

  return {
    status,
    confidence,
    denial_type,
    enrichment: {
      missing_fields: missingFields,
      missing_elements: missingFields,
      denial_type,
      recovery_score,
      recommendation_state: recommendationState,
      recovery_route: recovery.recovery_route,
      likely_fix_type: recovery.fix_type,
      required_fields: Array.isArray(recovery.required_fields) ? recovery.required_fields : [],
      required_field_status,
      recoverable: recovery.recoverable === true,
      recoverable_now: recovery.recoverable_now === true,
      prerequisites_met: recovery.prerequisites_met === true,
      prerequisite_documents: Array.isArray(recovery.prerequisite_documents)
        ? recovery.prerequisite_documents
        : [],
      follow_up_documents_needed: Array.isArray(recovery.follow_up_documents_needed)
        ? recovery.follow_up_documents_needed
        : [],
      evidence_strength: recovery.evidence_strength || null,
      warnings: Array.isArray(recovery.warnings) ? recovery.warnings : [],
      reasoning: Array.isArray(recovery.reasoning) ? recovery.reasoning : []
    },
    recommended_actions,
    priority_score,
    estimated_recovery
  };
}

module.exports = { runOrchestrator };
