const { get, run } = require('./db');
const { runOrchestrator } = require('../pipeline/orchestrator');
const {
  attachBusinessOutcomeToClaimDecisions,
  recordClaimIntelligenceDecisions
} = require('./intelligence_decision_log');

const CLAIM_STATUSES = [
  'uploaded',
  'in_review',
  'ready_for_submission',
  'submitted',
  'recovered',
  'not_recoverable'
];

const CLAIM_SCHEMA = {
  case_id: 'string',
  batch_id: 'string',
  upload_id: 'string',
  claim_id: 'string',
  customer_id: 'string',
  patient: 'string',
  payer: 'string',
  status: 'uploaded',
  denial_reason: 'string',
  amount: 'number',
  recovered_amount: 'number',
  date_of_service: 'string',
  source_file: 'string',
  applied_fixes: 'array',
  additional_data: 'object',
  created_at: 'number',
  updated_at: 'number',
  confidence: 'number',
  route: 'string'
};

const FINAL_CLAIM_STATUSES = new Set([
  'submitted',
  'recovered',
  'not_recoverable'
]);

function generateTemporaryClaimId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TEMP-${Date.now()}-${randomPart}`;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseAdditionalData(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (err) {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function serializeAdditionalData(value) {
  const parsed = parseAdditionalData(value);
  return Object.keys(parsed).length ? JSON.stringify(parsed) : null;
}

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch (err) {
    return fallback;
  }
}

function serializeJson(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function normalizeClaimStatus(status, fallback = 'uploaded') {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (!normalizedStatus) {
    return fallback;
  }

  if (normalizedStatus === 'uploaded') {
    return 'uploaded';
  }

  if (
    normalizedStatus === 'pending'
    || normalizedStatus === 'unknown'
    || normalizedStatus === 'normalized'
    || normalizedStatus === 'received'
    || normalizedStatus === 'parsed'
    || normalizedStatus === 'processing'
    || normalizedStatus.startsWith('under')
  ) {
    return 'uploaded';
  }

  if (
    normalizedStatus === 'needs_review'
    || normalizedStatus === 'in_review'
    || normalizedStatus.includes('review')
  ) {
    return 'in_review';
  }

  if (
    normalizedStatus === 'approved'
    || normalizedStatus === 'ready_for_submission'
    || normalizedStatus.includes('ready')
  ) {
    return 'ready_for_submission';
  }

  if (
    normalizedStatus === 'submitted'
    || normalizedStatus === 'pending_clearinghouse'
  ) {
    return 'submitted';
  }

  if (
    normalizedStatus === 'paid'
    || normalizedStatus === 'partial'
    || normalizedStatus === 'recovered'
    || normalizedStatus.startsWith('accept')
  ) {
    return 'recovered';
  }

  if (
    normalizedStatus === 'failed'
    || normalizedStatus === 'denied'
    || normalizedStatus === 'not_recoverable'
    || normalizedStatus.startsWith('reject')
    || normalizedStatus.startsWith('deni')
    || normalizedStatus.includes('recoverable')
  ) {
    return 'not_recoverable';
  }

  return fallback;
}

function getCustomerVisibleStatus(status) {
  const normalized = normalizeClaimStatus(status, '');

  if (!normalized) {
    return null;
  }

  if (normalized === 'ready_for_submission') {
    return 'ready_for_submission';
  }

  if (normalized === 'submitted') {
    return 'pending_clearinghouse';
  }

  if (normalized === 'recovered') {
    return 'recovered';
  }

  if (normalized === 'not_recoverable') {
    return 'not_recoverable';
  }

  return null;
}

function normalizeClaim(raw) {
  const rawClaimId = raw.claim_id || raw.id || raw.claim_number;

  return {
    claim_id: rawClaimId || generateTemporaryClaimId(),
    patient: raw.patient ?? null,
    payer: raw.payer ?? null,
    status: null,
    denial_reason: raw.denial_reason ?? null,
    amount: raw.amount ?? null,
    recovered_amount: raw.recovered_amount ?? null,
    date_of_service: raw.date_of_service ?? null,
    source_file: raw.source_file ?? null,
    applied_fixes: Array.isArray(raw.applied_fixes) ? raw.applied_fixes : [],
    additional_data: parseAdditionalData(raw.additional_data),
    created_at: Date.now(),
    updated_at: Date.now(),
    confidence: 0,
    route: 'unprocessed'
  };
}

function buildFixPlan(processed = {}) {
  const existing = parseJsonObject(processed.fix_plan, {});

  return {
    ...existing,
    priority_score: processed.priority_score ?? existing.priority_score ?? null,
    estimated_recovery: processed.estimated_recovery ?? existing.estimated_recovery ?? null,
    denial_type: processed.denial_type ?? existing.denial_type ?? null
  };
}

function buildEnrichmentRecord(processed) {
  const enrichment = processed.enrichment && typeof processed.enrichment === 'object'
    ? processed.enrichment
    : {};
  const recommendedActions = Array.isArray(processed.recommended_actions)
    ? processed.recommended_actions
    : Array.isArray(enrichment.recommended_actions)
      ? enrichment.recommended_actions
      : [];
  const requiredFields = Array.isArray(enrichment.required_fields)
    ? enrichment.required_fields
    : [];
  const requiredFieldStatus = Array.isArray(enrichment.required_field_status)
    ? enrichment.required_field_status
    : [];
  const missingFields = Array.isArray(enrichment.missing_fields)
    ? enrichment.missing_fields
    : [];
  const missingElements = Array.isArray(enrichment.missing_elements)
    ? enrichment.missing_elements
    : missingFields;
  const codingFlags = Array.isArray(enrichment.coding_flags)
    ? enrichment.coding_flags
    : [];
  const warnings = Array.isArray(enrichment.warnings)
    ? enrichment.warnings
    : [];

  return {
    confidence: Number(processed.confidence ?? enrichment.confidence ?? 0),
    recovery_route: enrichment.recovery_route ?? null,
    likely_fix_type: enrichment.likely_fix_type ?? null,
    denial_type: processed.denial_type ?? enrichment.denial_type ?? null,
    required_fields: serializeJson(requiredFields, []),
    required_field_status: serializeJson(requiredFieldStatus, []),
    missing_fields: serializeJson(missingFields, []),
    missing_elements: serializeJson(missingElements, []),
    coding_flags: serializeJson(codingFlags, []),
    warnings: serializeJson(warnings, []),
    recommended_actions: serializeJson(recommendedActions, []),
    fix_plan: serializeJson(buildFixPlan(processed), {})
  };
}

async function upsertClaimEnrichment(claimId, orchestration, timestamp) {
  const processedEnrichment = buildEnrichmentRecord(orchestration);
  const existing = await get(
    `SELECT enrichment_id, created_at
     FROM claims_enrichment
     WHERE claim_id = ?`,
    [claimId]
  );

  if (existing?.enrichment_id) {
    await run(
      `UPDATE claims_enrichment
       SET confidence = ?,
           recovery_route = ?,
           likely_fix_type = ?,
           denial_type = ?,
           required_fields = ?,
           required_field_status = ?,
           missing_fields = ?,
           missing_elements = ?,
           coding_flags = ?,
           warnings = ?,
           recommended_actions = ?,
           fix_plan = ?,
           updated_at = ?
       WHERE claim_id = ?`,
      [
        processedEnrichment.confidence,
        processedEnrichment.recovery_route,
        processedEnrichment.likely_fix_type,
        processedEnrichment.denial_type,
        processedEnrichment.required_fields,
        processedEnrichment.required_field_status,
        processedEnrichment.missing_fields,
        processedEnrichment.missing_elements,
        processedEnrichment.coding_flags,
        processedEnrichment.warnings,
        processedEnrichment.recommended_actions,
        processedEnrichment.fix_plan,
        timestamp,
        claimId
      ]
    );
    return;
  }

  await run(
    `INSERT INTO claims_enrichment (
      claim_id,
      confidence,
      recovery_route,
      likely_fix_type,
      denial_type,
      required_fields,
      required_field_status,
      missing_fields,
      missing_elements,
      coding_flags,
      warnings,
      recommended_actions,
      fix_plan,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      claimId,
      processedEnrichment.confidence,
      processedEnrichment.recovery_route,
      processedEnrichment.likely_fix_type,
      processedEnrichment.denial_type,
      processedEnrichment.required_fields,
      processedEnrichment.required_field_status,
      processedEnrichment.missing_fields,
      processedEnrichment.missing_elements,
      processedEnrichment.coding_flags,
      processedEnrichment.warnings,
      processedEnrichment.recommended_actions,
      processedEnrichment.fix_plan,
      timestamp,
      timestamp
    ]
  );
}

function normalizeReviewAssignmentStatus(value, fallback = null) {
  const normalized = normalizeNullableString(value)?.toLowerCase() || null;

  if (!normalized) {
    return fallback;
  }

  if (['unassigned', 'assigned', 'rejected'].includes(normalized)) {
    return normalized;
  }

  return fallback;
}

async function syncReviewQueueForStatus(claimId, status, timestamp, reviewQueue = {}) {
  const existing = await get(
    `SELECT id, reviewer_id, reviewer_notes, assignment_status
     FROM review_queue
     WHERE claim_id = ?`,
    [claimId]
  );

  if (status !== 'in_review') {
    if (existing?.id) {
      await run(
        `DELETE FROM review_queue WHERE claim_id = ?`,
        [claimId]
      );
    }
    return;
  }

  const reviewerId = reviewQueue.reviewer_id !== undefined
    ? normalizeNullableString(reviewQueue.reviewer_id)
    : normalizeNullableString(existing?.reviewer_id);
  const reviewerNotes = reviewQueue.reviewer_notes !== undefined
    ? normalizeNullableString(reviewQueue.reviewer_notes)
    : normalizeNullableString(existing?.reviewer_notes);
  let assignmentStatus = normalizeReviewAssignmentStatus(
    reviewQueue.assignment_status,
    normalizeReviewAssignmentStatus(existing?.assignment_status, null)
  );

  if (!assignmentStatus) {
    assignmentStatus = reviewerId ? 'assigned' : 'unassigned';
  }

  if (existing?.id) {
    await run(
      `UPDATE review_queue
       SET reviewer_id = ?,
           reviewer_notes = ?,
           assignment_status = ?,
           updated_at = ?
       WHERE claim_id = ?`,
      [
        reviewerId,
        reviewerNotes,
        assignmentStatus,
        timestamp,
        claimId
      ]
    );
    return;
  }

  await run(
    `INSERT INTO review_queue (
      claim_id,
      reviewer_id,
      reviewer_notes,
      assignment_status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      claimId,
      reviewerId,
      reviewerNotes,
      assignmentStatus,
      timestamp,
      timestamp
    ]
  );
}

function normalizeOrchestratorClaim(claim = {}, context = {}) {
  return {
    ...claim,
    additional_data: parseAdditionalData(claim.additional_data),
    ...context
  };
}

function orchestrateClaimLifecycle(claim, context = {}) {
  return runOrchestrator(normalizeOrchestratorClaim(claim, context));
}

async function persistClaimLifecycle(claimId, orchestration = {}, timestamp = Date.now(), options = {}) {
  const normalizedClaimId = normalizeNullableString(claimId);

  if (!normalizedClaimId) {
    throw new Error('claimId is required');
  }

  const existingClaim = await get(
    `SELECT * FROM claims WHERE claim_id = ?`,
    [normalizedClaimId]
  );

  if (!existingClaim) {
    throw new Error('Claim not found');
  }

  const status = normalizeClaimStatus(orchestration.status, normalizeClaimStatus(existingClaim.status));
  const nextTimestamp = Number.isFinite(Number(timestamp))
    ? Number(timestamp)
    : Date.now();

  await run('BEGIN TRANSACTION');

  try {
    await run(
      `UPDATE claims
       SET status = ?,
           updated_at = ?
       WHERE claim_id = ?`,
      [
        status,
        nextTimestamp,
        normalizedClaimId
      ]
    );

    await upsertClaimEnrichment(
      normalizedClaimId,
      {
        ...orchestration,
        status
      },
      nextTimestamp
    );

    await syncReviewQueueForStatus(
      normalizedClaimId,
      status,
      nextTimestamp,
      options.reviewQueue || {}
    );

    await run('COMMIT');
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (rollbackErr) {
      // Preserve the original lifecycle persistence error.
    }

    throw err;
  }

  await recordClaimIntelligenceDecisions({
    claimId: normalizedClaimId,
    lifecycle: {
      ...orchestration,
      status
    },
    trigger: options.trigger || 'lifecycle',
    context: options.context || {},
    timestamp: nextTimestamp
  });

  if (FINAL_CLAIM_STATUSES.has(status)) {
    await attachBusinessOutcomeToClaimDecisions({
      claimId: normalizedClaimId,
      finalOutcome: {
        status,
        trigger: options.trigger || 'lifecycle',
        context: options.context || {},
        updated_at: nextTimestamp
      },
      timestamp: nextTimestamp
    });
  }

  return {
    ...orchestration,
    status
  };
}

async function addNormalizedCases(cases) {
  const normalizedCases = Array.isArray(cases) ? cases : [];
  let inserted = 0;
  const duplicates = [];
  const claims = [];

  for (const item of normalizedCases) {
    if (!item.customer_id) {
      throw new Error('INVALID_CLAIM: missing customer_id');
    }

    const created_at = item.created_at || Date.now();
    const updated_at = item.updated_at || created_at;
    const source_file = item.source_file || item.file_id || 'intake';
    const claim_id = item.claim_id || generateTemporaryClaimId();
    const status = normalizeClaimStatus(item.status, 'uploaded');
    const serializedAdditionalData = serializeAdditionalData(item.additional_data);
    const appliedFixes = Array.isArray(item.applied_fixes) ? item.applied_fixes : [];

    try {
      await run(
        `INSERT INTO claims (
          claim_id,
          batch_id,
          case_id,
          upload_id,
          customer_id,
          patient,
          payer,
          status,
          denial_reason,
          amount,
          recovered_amount,
          date_of_service,
          source_file,
          applied_fixes,
          additional_data,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          claim_id,
          item.batch_id ?? null,
          item.case_id ?? null,
          item.upload_id ?? null,
          item.customer_id,
          item.patient ?? null,
          item.payer ?? null,
          status,
          item.denial_reason ?? null,
          item.amount ?? null,
          item.recovered_amount ?? null,
          item.date_of_service ?? null,
          source_file,
          serializeJson(appliedFixes, []),
          serializedAdditionalData,
          created_at,
          updated_at
        ]
      );

      await upsertClaimEnrichment(
        claim_id,
        {
          ...item,
          status
        },
        updated_at
      );

      inserted += 1;
      claims.push({
        ...item,
        claim_id,
        status,
        source_file,
        additional_data: parseAdditionalData(serializedAdditionalData),
        applied_fixes: appliedFixes,
        created_at,
        updated_at
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        duplicates.push(item.claim_id || claim_id);
        continue;
      }

      throw err;
    }
  }

  return { inserted, duplicates, claims };
}

module.exports = {
  CLAIM_STATUSES,
  CLAIM_SCHEMA,
  addNormalizedCases,
  generateTemporaryClaimId,
  getCustomerVisibleStatus,
  normalizeClaim,
  normalizeClaimStatus,
  orchestrateClaimLifecycle,
  parseAdditionalData,
  persistClaimLifecycle
};
