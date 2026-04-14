const { get, run } = require('./db');

function normalizeReasons(value) {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string');
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeCompetingMatches(value) {
  return Array.isArray(value) ? value : null;
}

function normalizeFlags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalizedFlags = {
    duplicate: value.duplicate === true,
    already_submitted: value.already_submitted === true,
    already_recovered: value.already_recovered === true
  };

  return Object.values(normalizedFlags).some(Boolean)
    ? normalizedFlags
    : null;
}

async function storeMatchReasoningSnapshot({
  claimId,
  fileId = null,
  confidence = null,
  reasons = [],
  competingMatches = null,
  flags = null,
  skipIfExists = false
}) {
  const normalizedReasons = normalizeReasons(reasons);
  const normalizedCompetingMatches = normalizeCompetingMatches(competingMatches);
  const normalizedFlags = normalizeFlags(flags);
  const reasonsJson = JSON.stringify(normalizedReasons);
  const competingMatchesJson = normalizedCompetingMatches
    ? JSON.stringify(normalizedCompetingMatches)
    : null;
  const flagsJson = normalizedFlags
    ? JSON.stringify(normalizedFlags)
    : null;

  if (skipIfExists) {
    const existing = await get(
      `SELECT id, flags
       FROM match_reasoning_snapshot
       WHERE claim_id = ?
         AND (
           (file_id = ?)
           OR (file_id IS NULL AND ? IS NULL)
         )
         AND (
           (confidence = ?)
           OR (confidence IS NULL AND ? IS NULL)
         )
         AND reasons = ?
         AND (
           (competing_matches = ?)
           OR (competing_matches IS NULL AND ? IS NULL)
         )
       ORDER BY id DESC
       LIMIT 1`,
      [
        claimId,
        fileId,
        fileId,
        confidence,
        confidence,
        reasonsJson,
        competingMatchesJson,
        competingMatchesJson
      ]
    );

    if (existing) {
      if (flagsJson && existing.flags !== flagsJson) {
        await run(
          `UPDATE match_reasoning_snapshot
           SET flags = ?
           WHERE id = ?`,
          [flagsJson, existing.id]
        );
      }

      return {
        id: existing.id,
        created: false
      };
    }
  }

  const result = await run(
    `INSERT INTO match_reasoning_snapshot (
      claim_id,
      file_id,
      confidence,
      reasons,
      competing_matches,
      flags,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      claimId,
      fileId,
      confidence,
      reasonsJson,
      competingMatchesJson,
      flagsJson,
      Date.now()
    ]
  );

  return {
    id: result.id,
    created: true
  };
}

module.exports = {
  storeMatchReasoningSnapshot
};
