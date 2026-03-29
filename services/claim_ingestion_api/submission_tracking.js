const { get, run } = require('./db');

async function trackSubmission(claimId, submissionStatus = 'submitted') {
  if (!claimId) {
    throw new Error('claimId is required');
  }

  const existing = await get(
    `SELECT * FROM claims WHERE claim_id = ?`,
    [claimId]
  );

  if (!existing) {
    throw new Error('claim not found');
  }

  const updatedAt = Date.now();

  await run(
    `UPDATE claims SET status = ?, updated_at = ? WHERE claim_id = ?`,
    [submissionStatus, updatedAt, claimId]
  );

  const updated = await get(
    `SELECT * FROM claims WHERE claim_id = ?`,
    [claimId]
  );

  return {
    claimId: updated.claim_id,
    status: updated.status,
    timestamp: updated.updated_at
  };
}

module.exports = { trackSubmission };
