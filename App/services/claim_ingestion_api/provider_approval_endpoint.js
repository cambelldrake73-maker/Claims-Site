const express = require('express');
const router = express.Router();

const { get, run } = require('./db');
const { requireProviderRole } = require('./role_middleware');
const { logAuditEventBestEffort } = require('../audit/audit_log');
const { evaluateSubmissionReadiness } = require('../pipeline/submission_builder');
const {
  evaluateProviderSubmissionApproval,
  getClaimVersionMarker,
  loadActiveProviderClearinghouseConnection,
  loadLatestProviderSubmissionApproval,
  loadProviderSubmissionContextForClaim,
  storeProviderSubmissionApproval
} = require('./provider_authority');

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '').trim();

  if (/^(1|true|yes|on)$/i.test(normalized)) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(normalized)) {
    return false;
  }

  return false;
}

router.post('/api/provider/claims/:id/approval', requireProviderRole, async (req, res) => {
  try {
    if (!req.identity || !req.identity.user_id) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHENTICATED'
      });
    }

    const claimRow = await get(
      `SELECT
         c.*,
         ce.recovery_route,
         ce.likely_fix_type,
         ce.required_field_status
       FROM claims c
       LEFT JOIN claims_enrichment ce
         ON ce.claim_id = c.claim_id
       WHERE c.claim_id = ?`,
      [req.params.id]
    );

    if (!claimRow) {
      return res.status(404).json({
        ok: false,
        error: 'Claim not found'
      });
    }

    const documentCountRow = await get(
      `SELECT COUNT(*) AS document_count
       FROM claim_documents
       WHERE claim_id = ?`,
      [claimRow.claim_id]
    );
    const submissionReadiness = evaluateSubmissionReadiness({
      claim: claimRow,
      enrichment: {
        recovery_route: claimRow.recovery_route ?? null,
        likely_fix_type: claimRow.likely_fix_type ?? null,
        required_field_status: claimRow.required_field_status ?? null
      },
      documentCount: Number(documentCountRow?.document_count ?? 0),
      allowHistorical: false
    });

    if (!submissionReadiness.ready) {
      return res.status(400).json({
        ok: false,
        error: 'Claim must be ready for provider submission before approval',
        code: 'CLAIM_NOT_READY_FOR_SUBMISSION',
        details: submissionReadiness
      });
    }

    const providerScope = await loadProviderSubmissionContextForClaim(claimRow);
    const providerContext = providerScope.provider_context || {};

    const providerConnection = await loadActiveProviderClearinghouseConnection(providerContext);

    if (!providerContext.provider_id && providerConnection?.provider_id) {
      providerContext.provider_id = providerConnection.provider_id;
    }

    if (!providerContext.provider_name && providerConnection?.provider_name) {
      providerContext.provider_name = providerConnection.provider_name;
    }

    if (!providerContext.provider_id) {
      return res.status(400).json({
        ok: false,
        error: 'Claim is not linked to a stable provider identity'
      });
    }

    if (String(req.identity.provider_id) !== String(providerContext.provider_id)) {
      return res.status(403).json({
        ok: false,
        error: 'Provider approval is not allowed for this claim'
      });
    }

    if (!providerConnection) {
      return res.status(400).json({
        ok: false,
        error: 'Active provider clearinghouse connection is required before approval',
        code: 'MISSING_CLEARINGHOUSE_CONNECTION'
      });
    }

    const claimVersionMarker = getClaimVersionMarker(claimRow);
    const existingApproval = await loadLatestProviderSubmissionApproval(
      claimRow.claim_id,
      providerContext.provider_id
    );
    const approvalState = evaluateProviderSubmissionApproval({
      approval: existingApproval,
      providerContext,
      providerConnection,
      claimVersionMarker
    });

    if (approvalState.valid) {
      return res.json({
        ok: true,
        approval: approvalState.approval
      });
    }

    const feeAcknowledged = normalizeBoolean(req.body?.fee_acknowledged);

    if (!feeAcknowledged) {
      return res.status(400).json({
        ok: false,
        error: 'Provider fee acknowledgment is required before approval',
        code: 'MISSING_PROVIDER_FEE_ACKNOWLEDGMENT'
      });
    }

    await run('BEGIN TRANSACTION');

    let approval;

    try {
      approval = await storeProviderSubmissionApproval({
        claimId: claimRow.claim_id,
        providerId: providerContext.provider_id,
        approvedByUserId: req.identity.user_id,
        claimUpdatedAt: claimVersionMarker,
        providerConnectionId: Number(providerConnection.id),
        feeAcknowledged,
        timestamp: Date.now()
      });

      await run('COMMIT');
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        // Preserve the original approval error.
      }

      throw err;
    }

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'provider_submission_approved',
      resource_type: 'claim',
      resource_id: claimRow.claim_id,
      metadata: {
        provider_id: providerContext.provider_id,
        provider_connection_id: Number(providerConnection.id),
        approval_id: approval?.approval_id ?? null,
        claim_updated_at: claimVersionMarker,
        fee_acknowledged: approval?.fee_acknowledged === true
      }
    });

    return res.json({
      ok: true,
      approval
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
