const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { parseAdditionalData, normalizeClaimStatus } = require('./claim_model');
const {
  buildUploadMetadata,
  mergeUploadContexts,
  loadLinkedUploadsByClaimIds
} = require('./upload_context');

function getStatusSearchAliases(status) {
  const normalized = normalizeClaimStatus(status, '')
    || String(status || '').trim().toLowerCase();
  const aliases = new Set([normalized]);

  if (normalized === 'ready_for_submission') {
    aliases.add('approved');
  }

  if (normalized === 'in_review') {
    aliases.add('needs_review');
  }

  if (normalized === 'recovered') {
    aliases.add('paid');
  }

  if (normalized === 'not_recoverable') {
    aliases.add('failed');
  }

  if (normalized === 'submitted') {
    aliases.add('pending_clearinghouse');
  }

  return Array.from(aliases).filter(Boolean);
}

router.get('/api/claims/search', async (req, res) => {
  try {
    const {
      status,
      payer,
      patient_name,
      patient,
      date_of_service_from,
      date_of_service_to
    } = req.query;

    let sql = `
      SELECT
        c.*,
        u.provider_name AS upload_provider_name,
        u.upload_name AS upload_upload_name,
        u.niche AS upload_niche,
        u.created_at AS upload_created_at
      FROM claims c
      LEFT JOIN uploads u
        ON u.upload_id = c.upload_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      const statusAliases = getStatusSearchAliases(status);
      sql += ` AND lower(c.status) IN (${statusAliases.map(() => 'lower(?)').join(', ')})`;
      params.push(...statusAliases);
    }

    if (payer) {
      sql += ' AND lower(c.payer) LIKE lower(?)';
      params.push(`%${payer}%`);
    }

    const patientQuery = patient_name || patient;
    if (patientQuery) {
      sql += ' AND lower(c.patient) LIKE lower(?)';
      params.push(`%${patientQuery}%`);
    }

    if (date_of_service_from) {
      sql += ' AND c.date_of_service >= ?';
      params.push(date_of_service_from);
    }

    if (date_of_service_to) {
      sql += ' AND c.date_of_service <= ?';
      params.push(date_of_service_to);
    }

    sql += ' ORDER BY c.created_at DESC';

    const claims = await all(sql, params);
    const linkedUploadsByClaimId = await loadLinkedUploadsByClaimIds(
      claims.map(claim => claim.claim_id)
    );
    res.json({
      ok: true,
      count: claims.length,
      claims: claims.map(claim => {
        const {
          upload_provider_name: _uploadProviderName,
          upload_upload_name: _uploadUploadName,
          upload_niche: _uploadNiche,
          upload_created_at: _uploadCreatedAt,
          ...claimData
        } = claim;
        const primaryUpload = buildUploadMetadata(claim);
        const linked_uploads = mergeUploadContexts(
          primaryUpload,
          linkedUploadsByClaimId.get(claim.claim_id) || []
        );

        return {
          ...claimData,
          additional_data: parseAdditionalData(claimData.additional_data),
          status: normalizeClaimStatus(claimData.status),
          upload: primaryUpload || linked_uploads[0] || null,
          linked_uploads
        };
      })
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
