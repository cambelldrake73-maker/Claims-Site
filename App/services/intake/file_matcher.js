/*
  ARCHITECTURE RULE:
  All ingestion MUST go through /services/pipeline/intake_pipeline.js
  Direct calls to parse/match/orchestrator/claim_model are forbidden.
*/

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProviderValue(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.length < 3 || b.length < 3) {
    return a === b ? 1 : 0;
  }

  if (a.includes(b) || b.includes(a)) return 0.6;
  return 0;
}

function normalizeAmount(value) {
  const normalized = String(value || '')
    .replace(/[$,\s]/g, '')
    .trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().split('T')[0];
}

function providerScopeMatches(file = {}, claim = {}) {
  const fileProviderId = normalizeProviderValue(file.provider_id);
  const claimProviderId = normalizeProviderValue(
    claim.upload_provider_id ?? claim.provider_id
  );

  if (fileProviderId && claimProviderId) {
    return fileProviderId === claimProviderId;
  }

  const fileProviderName = normalizeProviderValue(file.provider_name);
  const claimProviderName = normalizeProviderValue(
    claim.upload_provider_name ?? claim.provider_name
  );

  if (fileProviderName && claimProviderName) {
    return fileProviderName === claimProviderName;
  }

  return true;
}

function buildMatchFlags(claim = {}) {
  const status = normalizeStatus(claim.status);
  const flags = {
    duplicate: false,
    already_submitted: status === 'submitted',
    already_recovered: status === 'recovered' || status === 'paid'
  };

  return Object.values(flags).some(Boolean) ? flags : null;
}

function scoreCandidate(file = {}, claim = {}) {
  let score = 0;
  const reasons = [];

  const patientScore = similarity(
    normalizeText(file.parsed_patient),
    normalizeText(claim.patient)
  );

  if (patientScore > 0) {
    score += patientScore * 0.4;
    reasons.push('patient match');
  }

  const amountDiff = Math.abs(
    normalizeAmount(file.parsed_amount) - normalizeAmount(claim.amount)
  );

  if (amountDiff === 0) {
    score += 0.3;
    reasons.push('exact amount');
  } else if (amountDiff < 5) {
    score += 0.2;
    reasons.push('close amount');
  }

  const fileDate = normalizeDate(file.parsed_date_of_service);
  const claimDate = normalizeDate(claim.date_of_service);

  if (fileDate && claimDate && fileDate === claimDate) {
    score += 0.2;
    reasons.push('same date');
  }

  const payerScore = similarity(
    normalizeText(file.parsed_payer),
    normalizeText(claim.payer)
  );

  if (payerScore > 0) {
    score += payerScore * 0.1;
    reasons.push('payer match');
  }

  return {
    claim_id: claim.claim_id,
    confidence: Number(score.toFixed(2)),
    reasons,
    flags: buildMatchFlags(claim)
  };
}

function matchFileToClaim(file, claims) {
  const scopedClaims = (Array.isArray(claims) ? claims : [])
    .filter(claim => providerScopeMatches(file, claim));
  const scoredCandidates = scopedClaims
    .map(claim => scoreCandidate(file, claim))
    .filter(candidate => candidate.confidence >= 0.5)
    .sort((left, right) => right.confidence - left.confidence);

  if (!scoredCandidates.length) {
    return null;
  }

  const bestMatch = scoredCandidates[0];
  const competingMatches = scoredCandidates
    .slice(1)
    .filter(candidate => Math.abs(candidate.confidence - bestMatch.confidence) <= 0.15)
    .map(candidate => ({
      claim_id: candidate.claim_id,
      confidence: candidate.confidence,
      reasons: candidate.reasons
    }));
  const requiresReview = (
    bestMatch.confidence < 0.8
    || competingMatches.length > 0
    || bestMatch.flags?.already_submitted === true
    || bestMatch.flags?.already_recovered === true
  );

  return {
    claim_id: bestMatch.claim_id,
    confidence: bestMatch.confidence,
    reasons: bestMatch.reasons,
    flags: bestMatch.flags,
    competing_matches: competingMatches,
    requires_review: requiresReview
  };
}

module.exports = {
  matchFileToClaim,
  providerScopeMatches
};
