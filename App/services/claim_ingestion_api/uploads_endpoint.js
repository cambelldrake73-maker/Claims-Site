const express = require('express');
const router = express.Router();
const { all } = require('./db');
const { requireOperatorRole } = require('./role_middleware');

router.use(requireOperatorRole);

router.get('/api/uploads', async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         u.upload_id,
         u.provider_id,
         u.provider_name,
         u.upload_name,
         u.niche,
         u.created_at,
         COALESCE(f.file_count, 0) AS file_count,
         ft.file_type_summary,
         COALESCE(c.case_count, 0) AS case_count,
         COALESCE(pc.has_active_clearinghouse_connection, 0) AS has_active_clearinghouse_connection
       FROM uploads u
       LEFT JOIN (
         SELECT
           upload_id,
           COUNT(*) AS file_count
         FROM intake_files
         GROUP BY upload_id
       ) f
         ON f.upload_id = u.upload_id
       LEFT JOIN (
         SELECT
           upload_id,
           GROUP_CONCAT(summary, ', ') AS file_type_summary
         FROM (
           SELECT
             upload_id,
             (
               COALESCE(NULLIF(TRIM(file_type), ''), 'unknown')
               || ' ('
               || COUNT(*)
               || ')'
             ) AS summary
           FROM intake_files
           GROUP BY upload_id, COALESCE(NULLIF(TRIM(file_type), ''), 'unknown')
         ) file_type_counts
         GROUP BY upload_id
       ) ft
         ON ft.upload_id = u.upload_id
       LEFT JOIN (
         SELECT
           upload_id,
           COUNT(*) AS case_count
         FROM (
           SELECT
             c.upload_id AS upload_id,
             c.claim_id AS claim_id
           FROM claims c
           WHERE c.upload_id IS NOT NULL

           UNION

           SELECT
             f.upload_id AS upload_id,
             cd.claim_id AS claim_id
           FROM claim_documents cd
           JOIN intake_files f
             ON f.file_id = cd.file_id
           WHERE cd.claim_id IS NOT NULL
             AND f.upload_id IS NOT NULL
         ) claim_uploads
         GROUP BY upload_id
       ) c
         ON c.upload_id = u.upload_id
       LEFT JOIN (
         SELECT
           provider_id,
           MAX(
             CASE
               WHEN is_active = 1
                 AND LOWER(COALESCE(credential_status, '')) = 'connected'
               THEN 1
               ELSE 0
             END
           ) AS has_active_clearinghouse_connection
         FROM provider_clearinghouse_connections
         WHERE provider_id IS NOT NULL
           AND TRIM(provider_id) <> ''
         GROUP BY provider_id
       ) pc
         ON pc.provider_id = NULLIF(TRIM(u.provider_id), '')
       ORDER BY u.created_at DESC`
    );

    const uploads = Array.isArray(rows)
      ? rows.map(row => ({
          upload_id: row.upload_id,
          provider_name: row.provider_name ?? null,
          upload_name: row.upload_name ?? null,
          niche: row.niche ?? null,
          created_at: row.created_at ?? null,
          file_count: Number(row.file_count || 0),
          file_type_summary: row.file_type_summary ?? null,
          case_count: Number(row.case_count || 0),
          has_active_clearinghouse_connection: Number(row.has_active_clearinghouse_connection) === 1
        }))
      : [];

    res.json({
      ok: true,
      count: uploads.length,
      uploads
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
