const express = require('express');
const router = express.Router();

const { logAuditEventBestEffort } = require('../audit/audit_log');
const {
  getLatestAgreements,
  recordAcceptance,
  getUserAgreementStatus
} = require('./agreements_service');

function requireUserIdentity(req, res) {
  if (!req.identity?.user_id) {
    res.status(401).json({
      ok: false,
      error: 'UNAUTHENTICATED'
    });
    return false;
  }

  return true;
}

router.get('/api/agreements/latest', async (req, res) => {
  try {
    if (!requireUserIdentity(req, res)) return;

    const agreements = await getLatestAgreements();

    return res.json({
      ok: true,
      count: agreements.length,
      agreements
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.get('/api/agreements/status', async (req, res) => {
  try {
    if (!requireUserIdentity(req, res)) return;

    const status = await getUserAgreementStatus(req.identity.user_id);

    return res.json({
      ok: true,
      status
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post('/api/agreements/accept', async (req, res) => {
  try {
    if (!requireUserIdentity(req, res)) return;

    const agreement_id = String(req.body?.agreement_id || '').trim();

    if (!agreement_id) {
      return res.status(400).json({
        ok: false,
        error: 'agreement_id is required'
      });
    }

    const source = 'agreements_page';
    const result = await recordAcceptance({
      userId: req.identity.user_id,
      agreementId: agreement_id,
      source
    });

    const status = await getUserAgreementStatus(req.identity.user_id);

    await logAuditEventBestEffort({
      identity: req.identity,
      action: 'agreement_accepted',
      resource_type: 'agreement',
      resource_id: agreement_id,
      metadata: {
        agreement_type: result.agreement?.type ?? null,
        agreement_version: result.agreement?.version ?? null,
        source,
        created: result.created === true,
        accepted_at: result.acceptance?.accepted_at ?? null
      }
    });

    return res.json({
      ok: true,
      agreement: result.agreement,
      acceptance: result.acceptance,
      status
    });
  } catch (err) {
    const statusCode = err.message === 'Agreement not found' ? 404 : 400;

    return res.status(statusCode).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
