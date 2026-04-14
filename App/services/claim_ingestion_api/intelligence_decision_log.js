const { all, get, run } = require('./db');

const DECISION_TYPES = new Set([
  'match',
  'denial_interpretation',
  'recommendation'
]);
const CLAIM_DECISION_TYPES = [
  'denial_interpretation',
  'recommendation'
];

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeDecisionType(value) {
  const normalized = normalizeString(value)?.toLowerCase() || null;

  if (!normalized) {
    return null;
  }

  return DECISION_TYPES.has(normalized) ? normalized : null;
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBoolean(value) {
  return value === true ? 1 : 0;
}

function parseJsonSafely(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function serializeJson(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function parseObject(value, fallback = {}) {
  const parsed = typeof value === 'string'
    ? parseJsonSafely(value, fallback)
    : value;

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : fallback;
}

function parseArray(value, fallback = []) {
  const parsed = typeof value === 'string'
    ? parseJsonSafely(value, fallback)
    : value;

  return Array.isArray(parsed) ? parsed : fallback;
}

function dedupeStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(item => normalizeString(item))
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

function readFirstMeaningfulValue(...values) {
  for (const value of values) {
    if (isMeaningfulValue(value)) {
      return value;
    }
  }

  return null;
}

function normalizeBooleanValue(value) {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  return false;
}

function inferRecommendationState({
  recommendationState,
  lifecycleStatus,
  recoverable,
  prerequisitesMet,
  missingFields,
  linkedDocumentSummary
}) {
  const normalizedState = normalizeString(recommendationState);

  if (normalizedState) {
    return normalizedState;
  }

  const hasMissingFields = Array.isArray(missingFields) && missingFields.length > 0;
  const requiresOriginalClaim = linkedDocumentSummary?.requires_original_claim === true;
  const requiresAdditionalDocuments = linkedDocumentSummary?.requires_additional_documents === true;
  const manualReviewRequired = linkedDocumentSummary?.manual_review_required === true;
  const normalizedLifecycleStatus = normalizeString(lifecycleStatus);

  if (
    normalizedLifecycleStatus === 'ready_for_submission'
    && recoverable === true
    && prerequisitesMet === true
    && !hasMissingFields
  ) {
    return 'ready_to_resubmit';
  }

  if (requiresOriginalClaim) {
    return 'needs_original_claim';
  }

  if (requiresAdditionalDocuments) {
    return 'needs_additional_documents';
  }

  if (manualReviewRequired) {
    return 'needs_manual_review';
  }

  if (hasMissingFields) {
    return 'insufficient_evidence';
  }

  if (recoverable === false) {
    return 'likely_not_recoverable';
  }

  return 'needs_manual_review';
}

function buildRecommendationBlockers({
  recommendationState,
  missingFields,
  linkedDocumentSummary,
  prerequisitesMet
}) {
  const blockers = [];
  const normalizedState = normalizeString(recommendationState);

  if (normalizedState && normalizedState !== 'ready_to_resubmit') {
    blockers.push(normalizedState);
  }

  if (Array.isArray(missingFields) && missingFields.length > 0) {
    blockers.push('missing_fields');
  }

  if (linkedDocumentSummary?.requires_original_claim === true) {
    blockers.push('original_claim_document');
  }

  if (linkedDocumentSummary?.requires_additional_documents === true) {
    blockers.push('additional_supporting_documents');
  }

  if (linkedDocumentSummary?.manual_review_required === true) {
    blockers.push('manual_review');
  }

  if (prerequisitesMet === false) {
    blockers.push('prerequisites_not_met');
  }

  return dedupeStrings(blockers);
}

function summarizeClaimSnapshot(claim = {}) {
  return {
    claim_id: normalizeString(claim.claim_id),
    customer_id: normalizeString(claim.customer_id),
    patient: normalizeString(claim.patient),
    payer: normalizeString(claim.payer),
    denial_reason: normalizeString(claim.denial_reason),
    amount: claim.amount ?? null,
    recovered_amount: claim.recovered_amount ?? null,
    date_of_service: normalizeString(claim.date_of_service),
    status: normalizeString(claim.status),
    additional_data: parseObject(claim.additional_data, {})
  };
}

function summarizeFileContext(fileContext = null) {
  if (!fileContext) {
    return null;
  }

  return {
    file_id: fileContext.file_id,
    upload_id: fileContext.upload_id,
    provider_id: fileContext.provider_id,
    provider_name: fileContext.provider_name,
    filename: fileContext.filename,
    original_filename: fileContext.original_filename,
    file_type: fileContext.file_type,
    mime_type: fileContext.mime_type,
    file_size: fileContext.file_size,
    checksum: fileContext.checksum,
    canonical_document_type: fileContext.canonical_document_type
  };
}

function shapeIntelligenceDecisionRow(row) {
  if (!row) {
    return null;
  }

  const {
    suggested_value_json,
    evidence_json,
    rationale_json,
    human_action_metadata_json,
    final_outcome_json,
    ...rest
  } = row;

  return {
    ...rest,
    confidence: normalizeConfidence(rest.confidence),
    requires_review: rest.requires_review === 1,
    suggested_value: parseJsonSafely(suggested_value_json, null),
    evidence: parseJsonSafely(evidence_json, null),
    rationale: parseJsonSafely(rationale_json, null),
    human_action_metadata: parseJsonSafely(human_action_metadata_json, null),
    final_outcome: parseJsonSafely(final_outcome_json, null)
  };
}

function buildMatchDecisionKey(fileId, claimId) {
  const normalizedFileId = normalizeString(fileId);
  const normalizedClaimId = normalizeString(claimId);

  if (!normalizedFileId || !normalizedClaimId) {
    return null;
  }

  return `match:${normalizedFileId}:${normalizedClaimId}`;
}

function buildClaimDecisionKey(decisionType, claimId) {
  const normalizedType = normalizeDecisionType(decisionType);
  const normalizedClaimId = normalizeString(claimId);

  if (!normalizedType || !normalizedClaimId) {
    return null;
  }

  return `claim:${normalizedClaimId}:${normalizedType}`;
}

async function loadFileDecisionContext(fileId) {
  const normalizedFileId = normalizeString(fileId);

  if (!normalizedFileId) {
    return null;
  }

  const row = await get(
    `SELECT
       f.file_id,
       f.upload_id,
       f.filename,
       f.original_filename,
       f.file_type,
       f.mime_type,
       f.file_size,
       f.checksum,
       ifi.provider_id AS intelligence_provider_id,
       ifi.canonical_document_type,
       ifi.identifiers_json,
       ifi.denial_evidence_json,
       ifi.case_evidence_json,
       u.provider_id AS upload_provider_id,
       u.provider_name
     FROM intake_files f
     LEFT JOIN intake_file_intelligence ifi
       ON ifi.file_id = f.file_id
     LEFT JOIN uploads u
       ON u.upload_id = f.upload_id
     WHERE f.file_id = ?`,
    [normalizedFileId]
  );

  if (!row) {
    return null;
  }

  return {
    file_id: row.file_id,
    upload_id: row.upload_id,
    provider_id: normalizeString(row.intelligence_provider_id) || normalizeString(row.upload_provider_id),
    provider_name: normalizeString(row.provider_name),
    filename: normalizeString(row.filename),
    original_filename: normalizeString(row.original_filename),
    file_type: normalizeString(row.file_type),
    mime_type: normalizeString(row.mime_type),
    file_size: row.file_size ?? null,
    checksum: normalizeString(row.checksum),
    canonical_document_type: normalizeString(row.canonical_document_type),
    identifiers: parseJsonSafely(row.identifiers_json, null),
    denial_evidence: parseJsonSafely(row.denial_evidence_json, null),
    case_evidence: parseJsonSafely(row.case_evidence_json, null)
  };
}

function shapeLinkedDocumentEvidence(row = {}) {
  return {
    file_id: normalizeString(row.file_id),
    provider_id: normalizeString(row.provider_id),
    canonical_document_type: normalizeString(row.canonical_document_type),
    association_status: normalizeString(row.association_status),
    associated_claim_id: normalizeString(row.associated_claim_id),
    denial_reason_understood: row.denial_reason_understood === 1,
    coverage_determinable_from_current_docs: row.coverage_determinable_from_current_docs === 1,
    requires_original_claim: row.requires_original_claim === 1,
    requires_additional_documents: row.requires_additional_documents === 1,
    manual_review_required: row.manual_review_required === 1,
    identifiers: parseJsonSafely(row.identifiers_json, null),
    denial_evidence: parseJsonSafely(row.denial_evidence_json, null),
    case_evidence: parseJsonSafely(row.case_evidence_json, null)
  };
}

function buildLinkedDocumentSummary(linkedDocuments = []) {
  const documents = Array.isArray(linkedDocuments) ? linkedDocuments : [];
  const denialCodes = [];
  const denialTexts = [];
  const normalizedCategories = [];
  const evidenceSources = [];
  let providerId = null;
  let denialReasonUnderstood = false;
  let coverageDeterminable = false;
  let requiresOriginalClaim = false;
  let requiresAdditionalDocuments = false;
  let manualReviewRequired = false;

  documents.forEach(document => {
    providerId = providerId || normalizeString(document.provider_id);
    denialReasonUnderstood = denialReasonUnderstood || document.denial_reason_understood === true;
    coverageDeterminable = coverageDeterminable || document.coverage_determinable_from_current_docs === true;
    requiresOriginalClaim = requiresOriginalClaim || document.requires_original_claim === true;
    requiresAdditionalDocuments = requiresAdditionalDocuments || document.requires_additional_documents === true;
    manualReviewRequired = manualReviewRequired || document.manual_review_required === true;

    const denialEvidence = document.denial_evidence && typeof document.denial_evidence === 'object'
      ? document.denial_evidence
      : {};
    const codes = Array.isArray(denialEvidence.denial_codes)
      ? denialEvidence.denial_codes
      : [];
    const texts = Array.isArray(denialEvidence.denial_text)
      ? denialEvidence.denial_text
      : [];

    codes.forEach(code => {
      if (code?.code) {
        denialCodes.push(String(code.code));
      }
    });

    texts.forEach(text => {
      const normalizedText = normalizeString(text);
      if (normalizedText) {
        denialTexts.push(normalizedText);
      }
    });

    if (denialEvidence.normalized_denial_category) {
      normalizedCategories.push(String(denialEvidence.normalized_denial_category));
    }

    if (denialEvidence.evidence_source) {
      evidenceSources.push(String(denialEvidence.evidence_source));
    }
  });

  return {
    provider_id: providerId,
    document_count: documents.length,
    document_types: dedupeStrings(documents.map(document => document.canonical_document_type)),
    denial_reason_understood: denialReasonUnderstood,
    coverage_determinable_from_current_docs: coverageDeterminable,
    requires_original_claim: requiresOriginalClaim,
    requires_additional_documents: requiresAdditionalDocuments,
    manual_review_required: manualReviewRequired,
    evidence_sources: dedupeStrings(evidenceSources),
    denial_codes: dedupeStrings(denialCodes),
    denial_text: dedupeStrings(denialTexts),
    normalized_denial_categories: dedupeStrings(normalizedCategories)
  };
}

async function loadClaimDecisionContext(claimId) {
  const normalizedClaimId = normalizeString(claimId);

  if (!normalizedClaimId) {
    return null;
  }

  const claimRow = await get(
    `SELECT
       c.*,
       ce.confidence AS enrichment_confidence,
       ce.recovery_route,
       ce.likely_fix_type,
       ce.denial_type AS enrichment_denial_type,
       ce.required_fields,
       ce.required_field_status,
       ce.missing_fields,
       ce.warnings,
       ce.recommended_actions,
       ce.fix_plan,
       u.provider_id AS upload_provider_id,
       u.provider_name AS upload_provider_name
     FROM claims c
     LEFT JOIN claims_enrichment ce
       ON ce.claim_id = c.claim_id
     LEFT JOIN uploads u
       ON u.upload_id = c.upload_id
     WHERE c.claim_id = ?`,
    [normalizedClaimId]
  );

  if (!claimRow) {
    return null;
  }

  const linkedDocuments = await all(
    `SELECT
       cd.file_id,
       ifi.provider_id,
       ifi.canonical_document_type,
       ifi.association_status,
       ifi.associated_claim_id,
       ifi.denial_reason_understood,
       ifi.coverage_determinable_from_current_docs,
       ifi.requires_original_claim,
       ifi.requires_additional_documents,
       ifi.manual_review_required,
       ifi.identifiers_json,
       ifi.denial_evidence_json,
       ifi.case_evidence_json
     FROM claim_documents cd
     LEFT JOIN intake_file_intelligence ifi
       ON ifi.file_id = cd.file_id
     WHERE cd.claim_id = ?
     ORDER BY cd.created_at ASC`,
    [normalizedClaimId]
  );

  const shapedLinkedDocuments = (Array.isArray(linkedDocuments) ? linkedDocuments : [])
    .map(shapeLinkedDocumentEvidence);
  const linkedDocumentSummary = buildLinkedDocumentSummary(shapedLinkedDocuments);

  return {
    claim: {
      ...claimRow,
      additional_data: parseObject(claimRow.additional_data, {})
    },
    provider_id: normalizeString(claimRow.upload_provider_id) || linkedDocumentSummary.provider_id,
    provider_name: normalizeString(claimRow.upload_provider_name),
    linked_documents: shapedLinkedDocuments,
    linked_document_summary: linkedDocumentSummary
  };
}

async function insertDecisionRow({
  decisionType,
  decisionKey = null,
  claimId = null,
  fileId = null,
  providerId = null,
  engine = null,
  suggestedValue = null,
  confidence = null,
  requiresReview = false,
  evidence = null,
  rationale = null,
  humanAction = null,
  humanActionMetadata = null,
  humanActionByUserId = null,
  humanActionAt = null,
  finalOutcome = null,
  createdAt = Date.now(),
  updatedAt = createdAt
}) {
  const normalizedDecisionType = normalizeDecisionType(decisionType);

  if (!normalizedDecisionType) {
    return null;
  }

  const result = await run(
    `INSERT INTO intelligence_decision_log (
      decision_type,
      decision_key,
      claim_id,
      file_id,
      provider_id,
      engine,
      suggested_value_json,
      confidence,
      requires_review,
      evidence_json,
      rationale_json,
      human_action,
      human_action_metadata_json,
      human_action_by_user_id,
      human_action_at,
      final_outcome_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedDecisionType,
      normalizeString(decisionKey),
      normalizeString(claimId),
      normalizeString(fileId),
      normalizeString(providerId),
      normalizeString(engine),
      serializeJson(suggestedValue),
      normalizeConfidence(confidence),
      normalizeBoolean(requiresReview),
      serializeJson(evidence),
      serializeJson(rationale),
      normalizeString(humanAction),
      serializeJson(humanActionMetadata),
      normalizeString(humanActionByUserId),
      humanActionAt ?? null,
      serializeJson(finalOutcome),
      createdAt,
      updatedAt
    ]
  );

  return result.id;
}

async function loadLatestDecision(filters = {}) {
  const conditions = [];
  const params = [];
  const decisionType = normalizeDecisionType(filters.decisionType);
  const decisionKey = normalizeString(filters.decisionKey);
  const claimId = normalizeString(filters.claimId);
  const fileId = normalizeString(filters.fileId);

  if (decisionType) {
    conditions.push('decision_type = ?');
    params.push(decisionType);
  }

  if (decisionKey) {
    conditions.push('decision_key = ?');
    params.push(decisionKey);
  }

  if (claimId) {
    conditions.push('claim_id = ?');
    params.push(claimId);
  }

  if (fileId) {
    conditions.push('file_id = ?');
    params.push(fileId);
  }

  if (!conditions.length) {
    return null;
  }

  return get(
    `SELECT *
     FROM intelligence_decision_log
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC, decision_id DESC
     LIMIT 1`,
    params
  );
}

async function upsertMatchDecision({
  fileId,
  suggestedClaimId,
  candidateClaimIds = [],
  confidence = null,
  requiresReview = false,
  reasons = [],
  competingMatches = [],
  flags = null,
  providerId = null,
  engine = 'deterministic_matcher',
  source = 'intake_matcher'
}) {
  const normalizedFileId = normalizeString(fileId);
  const normalizedClaimId = normalizeString(suggestedClaimId);

  if (!normalizedFileId || !normalizedClaimId) {
    return null;
  }

  const timestamp = Date.now();
  const decisionKey = buildMatchDecisionKey(normalizedFileId, normalizedClaimId);
  const existing = await loadLatestDecision({
    decisionType: 'match',
    decisionKey
  });
  const fileContext = await loadFileDecisionContext(normalizedFileId);
  const normalizedCompetingMatches = (Array.isArray(competingMatches) ? competingMatches : [])
    .filter(item => item && typeof item === 'object' && normalizeString(item.claim_id))
    .map(item => ({
      claim_id: normalizeString(item.claim_id),
      confidence: normalizeConfidence(item.confidence),
      reasons: (Array.isArray(item.reasons) ? item.reasons : [])
        .filter(reason => typeof reason === 'string')
    }));
  const normalizedCandidateClaimIds = dedupeStrings([
    normalizedClaimId,
    ...candidateClaimIds,
    ...normalizedCompetingMatches.map(item => item.claim_id)
  ]);
  const normalizedFlags = flags && typeof flags === 'object' && !Array.isArray(flags)
    ? {
        duplicate: flags.duplicate === true,
        already_submitted: flags.already_submitted === true,
        already_recovered: flags.already_recovered === true
      }
    : null;
  const suggestedValue = {
    suggested_claim_id: normalizedClaimId,
    candidate_claim_ids: normalizedCandidateClaimIds,
    auto_linked: requiresReview !== true
  };
  const evidence = {
    file_context: summarizeFileContext(fileContext),
    identifiers: fileContext?.identifiers ?? null,
    denial_evidence: fileContext?.denial_evidence ?? null,
    case_evidence: fileContext?.case_evidence ?? null,
    flags: normalizedFlags,
    competing_matches: normalizedCompetingMatches
  };
  const rationale = {
    source,
    reasons: (Array.isArray(reasons) ? reasons : [])
      .filter(reason => typeof reason === 'string')
  };
  const effectiveProviderId = normalizeString(providerId) || fileContext?.provider_id || null;

  if (existing?.decision_id) {
    await run(
      `UPDATE intelligence_decision_log
       SET provider_id = COALESCE(?, provider_id),
           engine = ?,
           suggested_value_json = ?,
           confidence = ?,
           requires_review = ?,
           evidence_json = ?,
           rationale_json = ?,
           updated_at = ?
       WHERE decision_id = ?`,
      [
        effectiveProviderId,
        normalizeString(engine),
        serializeJson(suggestedValue),
        normalizeConfidence(confidence),
        normalizeBoolean(requiresReview),
        serializeJson(evidence),
        serializeJson(rationale),
        timestamp,
        existing.decision_id
      ]
    );

    return existing.decision_id;
  }

  return insertDecisionRow({
    decisionType: 'match',
    decisionKey,
    claimId: normalizedClaimId,
    fileId: normalizedFileId,
    providerId: effectiveProviderId,
    engine,
    suggestedValue,
    confidence,
    requiresReview,
    evidence,
    rationale,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

async function attachMatchHumanOutcome({
  fileId,
  suggestedClaimId,
  humanAction,
  userId = null,
  metadata = null,
  seedDecision = null,
  timestamp = Date.now()
}) {
  const normalizedFileId = normalizeString(fileId);
  const normalizedClaimId = normalizeString(suggestedClaimId);

  if (!normalizedFileId || !normalizedClaimId) {
    return {
      updated: false,
      reason: 'missing_match_identity'
    };
  }

  let decision = await loadLatestDecision({
    decisionType: 'match',
    decisionKey: buildMatchDecisionKey(normalizedFileId, normalizedClaimId)
  });

  if (!decision && seedDecision) {
    await upsertMatchDecision({
      fileId: normalizedFileId,
      suggestedClaimId: normalizedClaimId,
      ...seedDecision
    });

    decision = await loadLatestDecision({
      decisionType: 'match',
      decisionKey: buildMatchDecisionKey(normalizedFileId, normalizedClaimId)
    });
  }

  if (!decision?.decision_id) {
    return {
      updated: false,
      reason: 'decision_not_found'
    };
  }

  await run(
    `UPDATE intelligence_decision_log
     SET human_action = ?,
         human_action_metadata_json = ?,
         human_action_by_user_id = ?,
         human_action_at = ?,
         updated_at = ?
     WHERE decision_id = ?`,
    [
      normalizeString(humanAction),
      serializeJson(metadata),
      normalizeString(userId),
      timestamp,
      timestamp,
      decision.decision_id
    ]
  );

  return {
    updated: true,
    decision_id: decision.decision_id
  };
}

async function attachHumanActionToClaimDecisions({
  claimId,
  decisionTypes = CLAIM_DECISION_TYPES,
  humanAction,
  userId = null,
  metadata = null,
  timestamp = Date.now()
}) {
  const normalizedClaimId = normalizeString(claimId);
  const normalizedDecisionTypes = (Array.isArray(decisionTypes) ? decisionTypes : [])
    .map(normalizeDecisionType)
    .filter(Boolean);

  if (!normalizedClaimId || !normalizedDecisionTypes.length) {
    return [];
  }

  const updates = [];

  for (const decisionType of normalizedDecisionTypes) {
    const decision = await loadLatestDecision({
      decisionType,
      claimId: normalizedClaimId
    });

    if (!decision?.decision_id) {
      continue;
    }

    await run(
      `UPDATE intelligence_decision_log
       SET human_action = ?,
           human_action_metadata_json = ?,
           human_action_by_user_id = ?,
           human_action_at = ?,
           updated_at = ?
       WHERE decision_id = ?`,
      [
        normalizeString(humanAction),
        serializeJson(metadata),
        normalizeString(userId),
        timestamp,
        timestamp,
        decision.decision_id
      ]
    );

    updates.push({
      decision_id: decision.decision_id,
      decision_type: decisionType
    });
  }

  return updates;
}

async function recordClaimIntelligenceDecisions({
  claimId,
  lifecycle = {},
  trigger = 'patch',
  context = {},
  timestamp = Date.now()
}) {
  const normalizedClaimId = normalizeString(claimId);

  if (!normalizedClaimId) {
    return [];
  }

  const decisionContext = await loadClaimDecisionContext(normalizedClaimId);

  if (!decisionContext?.claim) {
    return [];
  }

  const claim = decisionContext.claim;
  const linkedDocuments = decisionContext.linked_documents || [];
  const linkedDocumentSummary = decisionContext.linked_document_summary || {};
  const lifecycleEnrichment = parseObject(lifecycle.enrichment, {});
  const requiredFields = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.required_fields,
    parseArray(claim.required_fields, [])
  ) || []);
  const requiredFieldStatus = Array.isArray(readFirstMeaningfulValue(
    lifecycleEnrichment.required_field_status,
    parseArray(claim.required_field_status, [])
  ))
    ? readFirstMeaningfulValue(
        lifecycleEnrichment.required_field_status,
        parseArray(claim.required_field_status, [])
      )
    : [];
  const missingFields = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.missing_fields,
    lifecycleEnrichment.missing_elements,
    parseArray(claim.missing_fields, [])
  ) || []);
  const warnings = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.warnings,
    parseArray(claim.warnings, [])
  ) || []);
  const recommendedActions = Array.isArray(lifecycle.recommended_actions)
    ? lifecycle.recommended_actions
    : parseArray(claim.recommended_actions, []);
  const fixPlan = parseObject(claim.fix_plan, {});
  const denialType = normalizeString(lifecycle.denial_type) || normalizeString(claim.enrichment_denial_type);
  const confidence = normalizeConfidence(lifecycle.confidence ?? claim.enrichment_confidence);
  const recommendationState = inferRecommendationState({
    recommendationState: readFirstMeaningfulValue(
      lifecycleEnrichment.recommendation_state,
      claim.recommendation_state,
      claim.additional_data?.recommendation_state
    ),
    lifecycleStatus: lifecycle.status,
    recoverable: normalizeBooleanValue(readFirstMeaningfulValue(
      lifecycleEnrichment.recoverable,
      claim.recoverable,
      claim.additional_data?.recoverable
    )),
    prerequisitesMet: normalizeBooleanValue(readFirstMeaningfulValue(
      lifecycleEnrichment.prerequisites_met,
      claim.prerequisites_met,
      claim.additional_data?.prerequisites_met
    )),
    missingFields,
    linkedDocumentSummary
  });
  const recoverable = normalizeBooleanValue(readFirstMeaningfulValue(
    lifecycleEnrichment.recoverable,
    claim.recoverable,
    claim.additional_data?.recoverable
  ));
  const recoverableNow = normalizeBooleanValue(readFirstMeaningfulValue(
    lifecycleEnrichment.recoverable_now,
    claim.recoverable_now,
    claim.additional_data?.recoverable_now,
    recommendationState === 'ready_to_resubmit'
  ));
  const prerequisitesMet = normalizeBooleanValue(readFirstMeaningfulValue(
    lifecycleEnrichment.prerequisites_met,
    claim.prerequisites_met,
    claim.additional_data?.prerequisites_met,
    recommendationState === 'ready_to_resubmit' && !missingFields.length
  ));
  const prerequisiteDocuments = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.prerequisite_documents,
    claim.prerequisite_documents,
    claim.additional_data?.prerequisite_documents,
    linkedDocumentSummary.requires_original_claim === true ? ['original_claim_document'] : [],
    linkedDocumentSummary.requires_additional_documents === true ? ['additional_supporting_documents'] : []
  ) || []);
  const followUpDocumentsNeeded = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.follow_up_documents_needed,
    claim.follow_up_documents_needed,
    claim.additional_data?.follow_up_documents_needed,
    prerequisiteDocuments
  ) || []);
  const evidenceStrength = normalizeString(readFirstMeaningfulValue(
    lifecycleEnrichment.evidence_strength,
    claim.evidence_strength,
    claim.additional_data?.evidence_strength,
    linkedDocumentSummary.evidence_sources?.length ? 'strong' : null
  ));
  const recommendationReasoning = dedupeStrings(readFirstMeaningfulValue(
    lifecycleEnrichment.reasoning,
    claim.reasoning,
    claim.additional_data?.reasoning
  ) || []);
  const recommendationBlockers = buildRecommendationBlockers({
    recommendationState,
    missingFields,
    linkedDocumentSummary,
    prerequisitesMet
  });
  const actionable = (
    recommendationState === 'ready_to_resubmit'
    && recoverable === true
    && prerequisitesMet === true
    && missingFields.length === 0
  );
  const requiresReview = (
    normalizeString(lifecycle.status) === 'in_review'
    || linkedDocumentSummary.manual_review_required === true
  );
  const claimSnapshot = summarizeClaimSnapshot(claim);
  const providerId = decisionContext.provider_id || linkedDocumentSummary.provider_id || null;
  const baseEvidence = {
    claim: claimSnapshot,
    linked_document_summary: linkedDocumentSummary,
    linked_documents: linkedDocuments
  };
  const denialRationale = {
    trigger: normalizeString(trigger),
    engine: 'deterministic_denial_interpretation',
    denial_reason_source: claimSnapshot.denial_reason ? 'claim_denial_reason' : 'linked_document_evidence',
    coverage_determinable_from_current_docs: linkedDocumentSummary.coverage_determinable_from_current_docs === true,
    requires_original_claim: linkedDocumentSummary.requires_original_claim === true,
    requires_additional_documents: linkedDocumentSummary.requires_additional_documents === true,
    manual_review_required: linkedDocumentSummary.manual_review_required === true,
    context: parseObject(context, {})
  };
  const recommendationRationale = {
    trigger: normalizeString(trigger),
    engine: 'orchestrator',
    denial_type: denialType,
    status: normalizeString(lifecycle.status),
    recommendation_state: recommendationState,
    recovery_route: normalizeString(readFirstMeaningfulValue(
      lifecycleEnrichment.recovery_route,
      claim.recovery_route
    )),
    likely_fix_type: normalizeString(readFirstMeaningfulValue(
      lifecycleEnrichment.likely_fix_type,
      claim.likely_fix_type
    )),
    actionable,
    blocked: actionable !== true,
    blocker_types: recommendationBlockers,
    prerequisites_missing: missingFields,
    prerequisites_met: prerequisitesMet,
    prerequisite_documents: prerequisiteDocuments,
    follow_up_documents_needed: followUpDocumentsNeeded,
    evidence_strength: evidenceStrength,
    warnings,
    original_claim_required: linkedDocumentSummary.requires_original_claim === true,
    additional_documents_required: linkedDocumentSummary.requires_additional_documents === true,
    coverage_determinable_from_current_docs: linkedDocumentSummary.coverage_determinable_from_current_docs === true,
    manual_review_required: linkedDocumentSummary.manual_review_required === true,
    reasoning: recommendationReasoning,
    context: parseObject(context, {})
  };

  const insertedDecisionIds = [];

  insertedDecisionIds.push(await insertDecisionRow({
    decisionType: 'denial_interpretation',
    decisionKey: buildClaimDecisionKey('denial_interpretation', normalizedClaimId),
    claimId: normalizedClaimId,
    providerId,
    engine: 'deterministic_denial_interpretation',
    suggestedValue: {
      denial_type: denialType
    },
    confidence,
    requiresReview,
    evidence: {
      ...baseEvidence,
      denial_reason: claimSnapshot.denial_reason
    },
    rationale: denialRationale,
    createdAt: timestamp,
    updatedAt: timestamp
  }));

  insertedDecisionIds.push(await insertDecisionRow({
    decisionType: 'recommendation',
    decisionKey: buildClaimDecisionKey('recommendation', normalizedClaimId),
    claimId: normalizedClaimId,
    providerId,
    engine: 'orchestrator',
    suggestedValue: {
      status: normalizeString(lifecycle.status),
      denial_type: denialType,
      recommendation_state: recommendationState,
      actionable,
      blocked: actionable !== true,
      recovery_route: normalizeString(readFirstMeaningfulValue(
        lifecycleEnrichment.recovery_route,
        claim.recovery_route
      )),
      likely_fix_type: normalizeString(readFirstMeaningfulValue(
        lifecycleEnrichment.likely_fix_type,
        claim.likely_fix_type
      )),
      recoverable,
      recoverable_now: recoverableNow,
      prerequisites_met: prerequisitesMet,
      prerequisite_documents: prerequisiteDocuments,
      follow_up_documents_needed: followUpDocumentsNeeded,
      evidence_strength: evidenceStrength,
      blocker_types: recommendationBlockers,
      recommended_actions: recommendedActions,
      required_fields: requiredFields,
      required_field_status: requiredFieldStatus,
      missing_fields: missingFields,
      fix_plan: fixPlan,
      reasoning: recommendationReasoning
    },
    confidence,
    requiresReview,
    evidence: {
      ...baseEvidence,
      recommendation_state: recommendationState,
      actionable,
      blocked: actionable !== true,
      blocker_types: recommendationBlockers,
      recoverable,
      recoverable_now: recoverableNow,
      prerequisites_met: prerequisitesMet,
      prerequisite_documents: prerequisiteDocuments,
      follow_up_documents_needed: followUpDocumentsNeeded,
      evidence_strength: evidenceStrength,
      required_fields: requiredFields,
      required_field_status: requiredFieldStatus,
      missing_fields: missingFields
    },
    rationale: recommendationRationale,
    createdAt: timestamp,
    updatedAt: timestamp
  }));

  return insertedDecisionIds.filter(Boolean);
}

async function attachBusinessOutcomeToClaimDecisions({
  claimId,
  finalOutcome,
  timestamp = Date.now()
}) {
  const normalizedClaimId = normalizeString(claimId);

  if (!normalizedClaimId || !finalOutcome || typeof finalOutcome !== 'object') {
    return [];
  }

  const updates = [];

  for (const decisionType of CLAIM_DECISION_TYPES) {
    const decision = await loadLatestDecision({
      decisionType,
      claimId: normalizedClaimId
    });

    if (!decision?.decision_id) {
      continue;
    }

    await run(
      `UPDATE intelligence_decision_log
       SET final_outcome_json = ?,
           updated_at = ?
       WHERE decision_id = ?`,
      [
        serializeJson(finalOutcome),
        timestamp,
        decision.decision_id
      ]
    );

    updates.push({
      decision_id: decision.decision_id,
      decision_type: decisionType
    });
  }

  return updates;
}

function normalizeLimit(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 50;
  }

  return Math.min(200, Math.floor(numeric));
}

function normalizeTimestampFilter(value, options = {}) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}${options.endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfidenceBand(value) {
  const normalized = normalizeString(value)?.toLowerCase() || null;

  if (!normalized) {
    return null;
  }

  const supportedBands = new Set([
    'unknown',
    'below_review_threshold',
    'review_range',
    'auto_link_or_higher',
    'low',
    'medium',
    'high'
  ]);

  return supportedBands.has(normalized) ? normalized : null;
}

function normalizeDecisionFilters(filters = {}) {
  return {
    decisionType: normalizeDecisionType(filters.decisionType),
    claimId: normalizeString(filters.claimId),
    fileId: normalizeString(filters.fileId),
    decisionKey: normalizeString(filters.decisionKey),
    providerId: normalizeString(filters.providerId),
    dateFrom: normalizeTimestampFilter(filters.dateFrom, { endOfDay: false }),
    dateTo: normalizeTimestampFilter(filters.dateTo, { endOfDay: true }),
    minConfidence: normalizeConfidence(filters.minConfidence),
    maxConfidence: normalizeConfidence(filters.maxConfidence),
    confidenceBand: normalizeConfidenceBand(filters.confidenceBand),
    humanAction: normalizeString(filters.humanAction)?.toLowerCase() || null,
    finalOutcomeStatus: normalizeString(filters.finalOutcomeStatus)?.toLowerCase() || null
  };
}

function getDecisionConfidenceBand(row = {}) {
  const confidence = normalizeConfidence(row.confidence);

  if (confidence === null) {
    return 'unknown';
  }

  if (row.decision_type === 'match') {
    if (confidence < 0.55) {
      return 'below_review_threshold';
    }

    if (confidence < 0.85) {
      return 'review_range';
    }

    return 'auto_link_or_higher';
  }

  if (confidence < 0.6) {
    return 'low';
  }

  if (confidence < 0.85) {
    return 'medium';
  }

  return 'high';
}

function rowMatchesPostFilters(row = {}, filters = {}) {
  const normalizedFilters = normalizeDecisionFilters(filters);

  if (
    normalizedFilters.humanAction
    && (normalizeString(row.human_action)?.toLowerCase() || null) !== normalizedFilters.humanAction
  ) {
    return false;
  }

  if (
    normalizedFilters.finalOutcomeStatus
    && (normalizeString(row.final_outcome?.status)?.toLowerCase() || null) !== normalizedFilters.finalOutcomeStatus
  ) {
    return false;
  }

  if (
    normalizedFilters.confidenceBand
    && getDecisionConfidenceBand(row) !== normalizedFilters.confidenceBand
  ) {
    return false;
  }

  return true;
}

async function loadIntelligenceDecisionRows(filters = {}, options = {}) {
  const normalizedFilters = normalizeDecisionFilters(filters);
  const conditions = [];
  const params = [];
  const limit = options.limit === null
    ? null
    : normalizeLimit(options.limit ?? filters.limit);

  if (normalizedFilters.decisionType) {
    conditions.push('decision_type = ?');
    params.push(normalizedFilters.decisionType);
  }

  if (normalizedFilters.claimId) {
    conditions.push('claim_id = ?');
    params.push(normalizedFilters.claimId);
  }

  if (normalizedFilters.fileId) {
    conditions.push('file_id = ?');
    params.push(normalizedFilters.fileId);
  }

  if (normalizedFilters.decisionKey) {
    conditions.push('decision_key = ?');
    params.push(normalizedFilters.decisionKey);
  }

  if (normalizedFilters.providerId) {
    conditions.push('provider_id = ?');
    params.push(normalizedFilters.providerId);
  }

  if (normalizedFilters.dateFrom !== null) {
    conditions.push('created_at >= ?');
    params.push(normalizedFilters.dateFrom);
  }

  if (normalizedFilters.dateTo !== null) {
    conditions.push('created_at <= ?');
    params.push(normalizedFilters.dateTo);
  }

  if (normalizedFilters.minConfidence !== null) {
    conditions.push('confidence >= ?');
    params.push(normalizedFilters.minConfidence);
  }

  if (normalizedFilters.maxConfidence !== null) {
    conditions.push('confidence <= ?');
    params.push(normalizedFilters.maxConfidence);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';
  const limitClause = limit !== null ? 'LIMIT ?' : '';

  const rows = await all(
    `SELECT *
     FROM intelligence_decision_log
     ${whereClause}
     ORDER BY created_at DESC, decision_id DESC
     ${limitClause}`,
    limit !== null ? [...params, limit] : params
  );

  return (Array.isArray(rows) ? rows : [])
    .map(shapeIntelligenceDecisionRow)
    .filter(row => rowMatchesPostFilters(row, normalizedFilters));
}

function incrementCounter(counter = {}, key, amount = 1) {
  const normalizedKey = normalizeString(key) || 'unknown';
  counter[normalizedKey] = (counter[normalizedKey] || 0) + amount;
  return counter;
}

function incrementBandOutcome(counter = {}, band, outcomeKey) {
  const normalizedBand = normalizeString(band) || 'unknown';
  const normalizedOutcome = normalizeString(outcomeKey) || 'unknown';

  if (!counter[normalizedBand]) {
    counter[normalizedBand] = {
      total: 0,
      accepted: 0,
      rejected: 0,
      unresolved: 0
    };
  }

  counter[normalizedBand].total += 1;

  if (Object.prototype.hasOwnProperty.call(counter[normalizedBand], normalizedOutcome)) {
    counter[normalizedBand][normalizedOutcome] += 1;
  }

  return counter;
}

function buildMatchOutcomeLabel(row = {}) {
  const humanAction = normalizeString(row.human_action)?.toLowerCase() || null;

  if (humanAction === 'accept') {
    return 'accepted';
  }

  if (humanAction === 'reject' || humanAction === 'reject_candidate') {
    return 'rejected';
  }

  return 'unresolved';
}

function summarizeMatchDecisions(rows = []) {
  const summary = {
    total_decisions: rows.length,
    by_confidence_band: {},
    by_human_action: {},
    auto_linking: {
      auto_linked: 0,
      review_required: 0
    },
    competing_candidate_cases: {
      with_competing_candidates: 0,
      without_competing_candidates: 0
    },
    review_outcomes: {
      accepted: 0,
      rejected: 0,
      unresolved: 0
    },
    confidence_band_outcomes: {}
  };

  rows.forEach(row => {
    const band = getDecisionConfidenceBand(row);
    const outcome = buildMatchOutcomeLabel(row);
    const candidateIds = Array.isArray(row.suggested_value?.candidate_claim_ids)
      ? row.suggested_value.candidate_claim_ids.filter(Boolean)
      : [];
    const competingMatches = Array.isArray(row.evidence?.competing_matches)
      ? row.evidence.competing_matches.filter(item => item && item.claim_id)
      : [];
    const hasCompetingCandidates = competingMatches.length > 0 || candidateIds.length > 1;

    incrementCounter(summary.by_confidence_band, band);
    incrementCounter(summary.by_human_action, normalizeString(row.human_action)?.toLowerCase() || 'none');
    incrementBandOutcome(summary.confidence_band_outcomes, band, outcome);

    summary.review_outcomes[outcome] += 1;

    if (row.requires_review === true || row.suggested_value?.auto_linked === false) {
      summary.auto_linking.review_required += 1;
    } else {
      summary.auto_linking.auto_linked += 1;
    }

    if (hasCompetingCandidates) {
      summary.competing_candidate_cases.with_competing_candidates += 1;
    } else {
      summary.competing_candidate_cases.without_competing_candidates += 1;
    }
  });

  return summary;
}

function summarizeDenialInterpretationDecisions(rows = []) {
  const summary = {
    total_decisions: rows.length,
    by_denial_type: {},
    by_human_action: {},
    override_status: {
      overridden: 0,
      not_overridden: 0
    },
    evidence_source_distribution: {},
    manual_review_required_distribution: {
      required: 0,
      not_required: 0
    },
    by_final_outcome_status: {}
  };

  rows.forEach(row => {
    const denialType = normalizeString(row.suggested_value?.denial_type) || 'unknown';
    const humanAction = normalizeString(row.human_action)?.toLowerCase() || 'none';
    const evidenceSources = new Set();
    const linkedSources = Array.isArray(row.evidence?.linked_document_summary?.evidence_sources)
      ? row.evidence.linked_document_summary.evidence_sources
      : [];
    const rationaleSource = normalizeString(row.rationale?.denial_reason_source);
    const manualReviewRequired = (
      row.rationale?.manual_review_required === true
      || row.evidence?.linked_document_summary?.manual_review_required === true
    );
    const finalOutcomeStatus = normalizeString(row.final_outcome?.status) || 'none';

    incrementCounter(summary.by_denial_type, denialType);
    incrementCounter(summary.by_human_action, humanAction);
    incrementCounter(summary.by_final_outcome_status, finalOutcomeStatus);

    if (humanAction === 'override') {
      summary.override_status.overridden += 1;
    } else {
      summary.override_status.not_overridden += 1;
    }

    if (manualReviewRequired) {
      summary.manual_review_required_distribution.required += 1;
    } else {
      summary.manual_review_required_distribution.not_required += 1;
    }

    if (rationaleSource) {
      evidenceSources.add(rationaleSource);
    }

    linkedSources.forEach(source => {
      const normalizedSource = normalizeString(source);
      if (normalizedSource) {
        evidenceSources.add(normalizedSource);
      }
    });

    if (!evidenceSources.size) {
      evidenceSources.add('unknown');
    }

    evidenceSources.forEach(source => {
      incrementCounter(summary.evidence_source_distribution, source);
    });
  });

  return summary;
}

function summarizeRecommendationDecisions(rows = []) {
  const summary = {
    total_decisions: rows.length,
    by_recovery_route: {},
    by_likely_fix_type: {},
    by_recommendation_state: {},
    by_human_action: {},
    actionable_distribution: {
      actionable: 0,
      blocked: 0
    },
    follow_through: {
      followed: 0,
      rejected: 0,
      overridden: 0,
      untouched: 0
    },
    by_final_outcome_status: {},
    blocker_type_counts: {},
    evidence_strength_distribution: {},
    missing_field_counts: {},
    prerequisite_patterns: {},
    recommendation_state_outcomes: {}
  };

  rows.forEach(row => {
    const recoveryRoute = normalizeString(row.suggested_value?.recovery_route) || 'unknown';
    const likelyFixType = normalizeString(row.suggested_value?.likely_fix_type) || 'unknown';
    const recommendationState = normalizeString(
      row.suggested_value?.recommendation_state || row.rationale?.recommendation_state
    ) || 'unknown';
    const humanAction = normalizeString(row.human_action)?.toLowerCase() || 'none';
    const finalOutcomeStatus = normalizeString(row.final_outcome?.status) || 'none';
    const actionable = row.suggested_value?.actionable === true || row.evidence?.actionable === true;
    const blockerTypes = dedupeStrings(
      Array.isArray(row.suggested_value?.blocker_types)
        ? row.suggested_value.blocker_types
        : (
          Array.isArray(row.rationale?.blocker_types)
            ? row.rationale.blocker_types
            : []
        )
    );
    const evidenceStrength = normalizeString(
      row.suggested_value?.evidence_strength
      || row.evidence?.evidence_strength
      || row.rationale?.evidence_strength
    ) || 'unknown';
    const missingFields = dedupeStrings(
      Array.isArray(row.suggested_value?.missing_fields)
        ? row.suggested_value.missing_fields
        : (
          Array.isArray(row.rationale?.prerequisites_missing)
            ? row.rationale.prerequisites_missing
            : []
        )
    ).sort((left, right) => left.localeCompare(right));
    const patternKey = missingFields.length
      ? missingFields.join(', ')
      : 'none';

    incrementCounter(summary.by_recovery_route, recoveryRoute);
    incrementCounter(summary.by_likely_fix_type, likelyFixType);
    incrementCounter(summary.by_recommendation_state, recommendationState);
    incrementCounter(summary.by_human_action, humanAction);
    incrementCounter(summary.by_final_outcome_status, finalOutcomeStatus);
    incrementCounter(summary.evidence_strength_distribution, evidenceStrength);
    incrementCounter(summary.prerequisite_patterns, patternKey);
    summary.actionable_distribution[actionable ? 'actionable' : 'blocked'] += 1;

    blockerTypes.forEach(blockerType => {
      incrementCounter(summary.blocker_type_counts, blockerType);
    });

    missingFields.forEach(field => {
      incrementCounter(summary.missing_field_counts, field);
    });

    if (!summary.recommendation_state_outcomes[recommendationState]) {
      summary.recommendation_state_outcomes[recommendationState] = {
        total: 0,
        approved_followed: 0,
        rejected: 0,
        overridden: 0,
        untouched: 0,
        paid: 0,
        failed: 0,
        none: 0
      };
    }

    const stateOutcomes = summary.recommendation_state_outcomes[recommendationState];
    stateOutcomes.total += 1;

    if (humanAction === 'approve' || humanAction === 'submitted') {
      summary.follow_through.followed += 1;
      stateOutcomes.approved_followed += 1;
    } else if (humanAction === 'reject') {
      summary.follow_through.rejected += 1;
      stateOutcomes.rejected += 1;
    } else if (humanAction === 'override') {
      summary.follow_through.overridden += 1;
      stateOutcomes.overridden += 1;
    } else {
      summary.follow_through.untouched += 1;
      stateOutcomes.untouched += 1;
    }

    if (finalOutcomeStatus === 'paid') {
      stateOutcomes.paid += 1;
    } else if (finalOutcomeStatus === 'failed') {
      stateOutcomes.failed += 1;
    } else if (finalOutcomeStatus === 'none') {
      stateOutcomes.none += 1;
    }
  });

  return summary;
}

async function evaluateIntelligenceDecisions(filters = {}) {
  const normalizedFilters = normalizeDecisionFilters(filters);
  const rows = await loadIntelligenceDecisionRows(normalizedFilters, {
    limit: null
  });
  const matchRows = rows.filter(row => row.decision_type === 'match');
  const denialRows = rows.filter(row => row.decision_type === 'denial_interpretation');
  const recommendationRows = rows.filter(row => row.decision_type === 'recommendation');

  return {
    filters: {
      decision_type: normalizedFilters.decisionType,
      provider_id: normalizedFilters.providerId,
      date_from: normalizedFilters.dateFrom,
      date_to: normalizedFilters.dateTo,
      min_confidence: normalizedFilters.minConfidence,
      max_confidence: normalizedFilters.maxConfidence,
      confidence_band: normalizedFilters.confidenceBand,
      human_action: normalizedFilters.humanAction,
      final_outcome_status: normalizedFilters.finalOutcomeStatus
    },
    totals: {
      decisions: rows.length,
      by_decision_type: {
        match: matchRows.length,
        denial_interpretation: denialRows.length,
        recommendation: recommendationRows.length
      }
    },
    ...(normalizedFilters.decisionType && normalizedFilters.decisionType !== 'match'
      ? {}
      : { match: summarizeMatchDecisions(matchRows) }),
    ...(normalizedFilters.decisionType && normalizedFilters.decisionType !== 'denial_interpretation'
      ? {}
      : { denial_interpretation: summarizeDenialInterpretationDecisions(denialRows) }),
    ...(normalizedFilters.decisionType && normalizedFilters.decisionType !== 'recommendation'
      ? {}
      : { recommendation: summarizeRecommendationDecisions(recommendationRows) })
  };
}

async function listIntelligenceDecisions(filters = {}) {
  return loadIntelligenceDecisionRows(filters, {
    limit: filters.limit
  });
}

module.exports = {
  CLAIM_DECISION_TYPES,
  buildMatchDecisionKey,
  buildClaimDecisionKey,
  upsertMatchDecision,
  attachMatchHumanOutcome,
  attachHumanActionToClaimDecisions,
  recordClaimIntelligenceDecisions,
  attachBusinessOutcomeToClaimDecisions,
  listIntelligenceDecisions,
  evaluateIntelligenceDecisions
};
