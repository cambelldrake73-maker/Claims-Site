const { all, get, run } = require('../claim_ingestion_api/db');
const {
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_CLEARINGHOUSE_COST
} = require('../billing/revenue_definition');

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function buildBillingAgreementContent() {
  return `
      <p><strong>Billing Terms</strong></p>
      <p>A recovered claim means a claim with a posted payer payment recorded by RevCapture. Submitted, approved, or in-review claims are not billed as recoveries.</p>
      <p>The recovered amount is the amount actually paid on that recovery. RevCapture invoices a platform fee of ${formatPercent(DEFAULT_PLATFORM_FEE_PERCENT)} of the recovered amount and a separate ${formatCurrency(DEFAULT_CLEARINGHOUSE_COST)} clearinghouse processing charge when a recovered amount is posted.</p>
      <p>Your invoice total is the platform fee plus any applicable clearinghouse charge. Payment status and balances are shown in the customer billing view for your account.</p>
    `.trim();
}

const DEFAULT_AGREEMENTS = [
  {
    agreement_id: 'agr_terms_2026_01',
    type: 'terms',
    version: '2026.1',
    created_at: Date.UTC(2026, 0, 1),
    content: `
      <p><strong>Terms of Service</strong></p>
      <p>RevCapture may use the documents and claim data you provide to intake, review, and pursue recovery activity on your behalf.</p>
      <p>You confirm that you are authorized to upload these materials for your organization and that the information submitted is accurate to the best of your knowledge.</p>
    `.trim()
  },
  {
    agreement_id: 'agr_privacy_2026_01',
    type: 'privacy',
    version: '2026.1',
    created_at: Date.UTC(2026, 0, 1) + 1,
    content: `
      <p><strong>Privacy Notice</strong></p>
      <p>RevCapture stores and processes account, claim, and supporting document data to provide claim recovery services and customer support.</p>
      <p>Access to customer information is limited by authenticated user scope, operational controls, and audit logging.</p>
    `.trim()
  },
  {
    agreement_id: 'agr_billing_2026_01',
    type: 'billing',
    version: '2026.1',
    created_at: Date.UTC(2026, 0, 1) + 2,
    content: buildBillingAgreementContent()
  }
];

let seedPromise = null;

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function shapeAgreement(row) {
  if (!row) {
    return null;
  }

  return {
    agreement_id: normalizeString(row.agreement_id),
    type: normalizeString(row.type),
    version: normalizeString(row.version),
    content: normalizeString(row.content),
    created_at: row.created_at ?? null
  };
}

function shapeAcceptanceRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id ?? null,
    user_id: normalizeString(row.user_id),
    agreement_id: normalizeString(row.agreement_id),
    accepted_at: row.accepted_at ?? null,
    source: normalizeString(row.source),
    type: normalizeString(row.type),
    version: normalizeString(row.version)
  };
}

async function ensureAgreementCatalog() {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const agreement of DEFAULT_AGREEMENTS) {
        await run(
          `INSERT OR IGNORE INTO agreements (
            agreement_id,
            type,
            version,
            content,
            created_at
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            agreement.agreement_id,
            agreement.type,
            agreement.version,
            agreement.content,
            agreement.created_at
          ]
        );
      }
    })().catch(err => {
      seedPromise = null;
      throw err;
    });
  }

  return seedPromise;
}

async function getLatestAgreements() {
  await ensureAgreementCatalog();

  const rows = await all(
    `SELECT a.*
     FROM agreements a
     INNER JOIN (
       SELECT type, MAX(created_at) AS max_created_at
       FROM agreements
       GROUP BY type
     ) latest
       ON latest.type = a.type
      AND latest.max_created_at = a.created_at
     ORDER BY a.type ASC`
  );

  return Array.isArray(rows)
    ? rows.map(shapeAgreement).filter(Boolean)
    : [];
}

async function getAgreementById(agreementId) {
  await ensureAgreementCatalog();

  const normalizedAgreementId = normalizeString(agreementId);

  if (!normalizedAgreementId) {
    return null;
  }

  const row = await get(
    `SELECT * FROM agreements WHERE agreement_id = ?`,
    [normalizedAgreementId]
  );

  return shapeAgreement(row);
}

async function recordAcceptance({ userId, agreementId, source }) {
  await ensureAgreementCatalog();

  const normalizedUserId = normalizeString(userId);
  const normalizedAgreementId = normalizeString(agreementId);
  const normalizedSource = normalizeString(source) || 'account_page';

  if (!normalizedUserId) {
    throw new Error('userId is required');
  }

  if (!normalizedAgreementId) {
    throw new Error('agreementId is required');
  }

  const agreement = await getAgreementById(normalizedAgreementId);

  if (!agreement) {
    throw new Error('Agreement not found');
  }

  const accepted_at = Date.now();
  const result = await run(
    `INSERT OR IGNORE INTO user_agreements (
      user_id,
      agreement_id,
      accepted_at,
      source
    ) VALUES (?, ?, ?, ?)`,
    [
      normalizedUserId,
      normalizedAgreementId,
      accepted_at,
      normalizedSource
    ]
  );

  const stored = await get(
    `SELECT ua.*, a.type, a.version
     FROM user_agreements ua
     JOIN agreements a
       ON a.agreement_id = ua.agreement_id
     WHERE ua.user_id = ?
       AND ua.agreement_id = ?`,
    [normalizedUserId, normalizedAgreementId]
  );

  return {
    created: Number(result?.changes || 0) > 0,
    agreement,
    acceptance: shapeAcceptanceRow(stored)
  };
}

async function getUserAgreementStatus(userId) {
  await ensureAgreementCatalog();

  const normalizedUserId = normalizeString(userId);
  const latestAgreements = await getLatestAgreements();

  if (!normalizedUserId) {
    return {
      user_id: null,
      accepted_all: false,
      accepted_types: [],
      missing_types: latestAgreements.map(item => item.type),
      agreements: latestAgreements.map(item => ({
        ...item,
        accepted: false,
        accepted_at: null,
        source: null
      }))
    };
  }

  const acceptanceRows = await all(
    `SELECT ua.*, a.type, a.version
     FROM user_agreements ua
     JOIN agreements a
       ON a.agreement_id = ua.agreement_id
     WHERE ua.user_id = ?`,
    [normalizedUserId]
  );

  const latestAcceptanceByAgreementId = new Map();

  (Array.isArray(acceptanceRows) ? acceptanceRows : [])
    .map(shapeAcceptanceRow)
    .filter(Boolean)
    .forEach(row => {
      const existing = latestAcceptanceByAgreementId.get(row.agreement_id);

      if (!existing || Number(row.accepted_at || 0) > Number(existing.accepted_at || 0)) {
        latestAcceptanceByAgreementId.set(row.agreement_id, row);
      }
    });

  const agreements = latestAgreements.map(agreement => {
    const acceptance = latestAcceptanceByAgreementId.get(agreement.agreement_id);

    return {
      ...agreement,
      accepted: Boolean(acceptance),
      accepted_at: acceptance?.accepted_at ?? null,
      source: acceptance?.source ?? null
    };
  });

  const accepted_types = agreements
    .filter(item => item.accepted)
    .map(item => item.type);
  const missing_types = agreements
    .filter(item => !item.accepted)
    .map(item => item.type);

  return {
    user_id: normalizedUserId,
    accepted_all: missing_types.length === 0 && agreements.length > 0,
    accepted_types,
    missing_types,
    agreements
  };
}

module.exports = {
  getLatestAgreements,
  recordAcceptance,
  getUserAgreementStatus
};
