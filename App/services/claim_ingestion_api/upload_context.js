const { all, get } = require('./db');

function normalizeUploadMetadata(upload) {
  if (!upload || typeof upload !== 'object') {
    return null;
  }

  const normalized = {
    upload_id: upload.upload_id ?? null,
    provider_id: upload.provider_id ?? null,
    provider_name: upload.provider_name ?? null,
    upload_name: upload.upload_name ?? null,
    niche: upload.niche ?? null,
    created_at: upload.created_at ?? null
  };

  return Object.values(normalized).some(value => value !== null && value !== undefined)
    ? normalized
    : null;
}

function buildUploadMetadata(row) {
  if (!row) {
    return null;
  }

  return normalizeUploadMetadata({
    upload_id: row.upload_id ?? null,
    provider_id: row.upload_provider_id ?? null,
    provider_name: row.upload_provider_name ?? null,
    upload_name: row.upload_upload_name ?? null,
    niche: row.upload_niche ?? null,
    created_at: row.upload_created_at ?? null
  });
}

function mergeUploadContexts(primaryUpload, linkedUploads = []) {
  const merged = [];
  const seen = new Set();

  [primaryUpload, ...(Array.isArray(linkedUploads) ? linkedUploads : [])]
    .map(normalizeUploadMetadata)
    .filter(Boolean)
    .forEach(upload => {
      const key = upload.upload_id || JSON.stringify(upload);

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(upload);
    });

  return merged;
}

async function loadLinkedUploadsByClaimIds(claimIds = []) {
  const normalizedClaimIds = Array.from(new Set(
    (Array.isArray(claimIds) ? claimIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));

  if (!normalizedClaimIds.length) {
    return new Map();
  }

  const placeholders = normalizedClaimIds.map(() => '?').join(', ');
  const rows = await all(
    `SELECT DISTINCT
       cd.claim_id,
       u.upload_id,
       u.provider_id,
       u.provider_name,
       u.upload_name,
       u.niche,
       u.created_at
     FROM claim_documents cd
     JOIN intake_files f
       ON f.file_id = cd.file_id
     LEFT JOIN uploads u
       ON u.upload_id = f.upload_id
     WHERE cd.claim_id IN (${placeholders})
       AND f.upload_id IS NOT NULL`,
    normalizedClaimIds
  );

  const uploadsByClaimId = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const claimId = String(row.claim_id || '').trim();
    const upload = normalizeUploadMetadata({
      upload_id: row.upload_id,
      provider_id: row.provider_id,
      provider_name: row.provider_name,
      upload_name: row.upload_name,
      niche: row.niche,
      created_at: row.created_at
    });

    if (!claimId || !upload) {
      return;
    }

    const current = uploadsByClaimId.get(claimId) || [];
    uploadsByClaimId.set(claimId, mergeUploadContexts(null, [...current, upload]));
  });

  return uploadsByClaimId;
}

async function loadUploadContextsForClaim(claimRow) {
  const claimId = String(claimRow?.claim_id || '').trim();

  if (!claimId) {
    return [];
  }

  let primaryUpload = buildUploadMetadata(claimRow);

  if (!primaryUpload && claimRow?.upload_id) {
    const uploadRow = await get(
      `SELECT
         upload_id,
         provider_id,
         provider_name,
         upload_name,
         niche,
         created_at
       FROM uploads
       WHERE upload_id = ?`,
      [claimRow.upload_id]
    );

    primaryUpload = normalizeUploadMetadata(uploadRow);
  }

  const linkedUploadsByClaimId = await loadLinkedUploadsByClaimIds([claimId]);

  return mergeUploadContexts(
    primaryUpload,
    linkedUploadsByClaimId.get(claimId) || []
  );
}

function resolveProviderNameFromUploads(uploads = []) {
  const normalizedUploads = Array.isArray(uploads) ? uploads : [];

  for (const upload of normalizedUploads) {
    const providerName = typeof upload?.provider_name === 'string'
      ? upload.provider_name.trim()
      : '';

    if (providerName) {
      return providerName;
    }
  }

  return null;
}

function resolveProviderContextFromUploads(uploads = []) {
  const normalizedUploads = Array.isArray(uploads) ? uploads : [];

  for (const upload of normalizedUploads) {
    const providerId = typeof upload?.provider_id === 'string'
      ? upload.provider_id.trim()
      : '';
    const providerName = typeof upload?.provider_name === 'string'
      ? upload.provider_name.trim()
      : '';

    if (!providerId && !providerName) {
      continue;
    }

    return {
      upload_id: upload?.upload_id ?? null,
      provider_id: providerId || null,
      provider_name: providerName || null,
      upload_name: upload?.upload_name ?? null,
      niche: upload?.niche ?? null,
      created_at: upload?.created_at ?? null,
      source: upload?.upload_id ? 'upload' : 'linked_upload'
    };
  }

  return {
    upload_id: null,
    provider_id: null,
    provider_name: null,
    upload_name: null,
    niche: null,
    created_at: null,
    source: null
  };
}

module.exports = {
  buildUploadMetadata,
  mergeUploadContexts,
  loadLinkedUploadsByClaimIds,
  loadUploadContextsForClaim,
  resolveProviderContextFromUploads,
  resolveProviderNameFromUploads
};
