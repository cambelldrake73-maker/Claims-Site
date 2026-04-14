function parseRecommendedActions(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function getRecommendationDecision(claim) {
  const decision = claim?.recommendation_decision || claim?.enrichment?.recommendation_decision;
  return decision && typeof decision === 'object' ? decision : null;
}

async function generateClaimSummary(claim) {
  const id = claim?.claim_id || claim?.id || 'UNKNOWN';
  const status = claim?.status || 'unknown';
  const denialType =
    claim?.denial_type ||
    claim?.enrichment?.denial_type ||
    'other';
  const denialReason =
    claim?.denial_reason ||
    claim?.denialReason ||
    'unspecified reason';
  const recommendedActions = parseRecommendedActions(claim?.recommended_actions);
  const recommendationDecision = getRecommendationDecision(claim);
  const amount = claim?.amount || 0;
  const patient = claim?.patient || 'Unknown Patient';
  const payer = claim?.payer || 'Unknown Payer';
  const actionText = recommendedActions.length
    ? recommendedActions
      .map(action => action?.message || action?.type || 'Review claim')
      .join(' ')
    : 'Review the claim using the orchestrator recommendations.';
  const blockerText = Array.isArray(recommendationDecision?.blocker_types)
    && recommendationDecision.blocker_types.length
    ? recommendationDecision.blocker_types.join(', ')
    : null;

  let recommendationText = `Recommended action: ${actionText}`;

  if (recommendationDecision?.recommendation_state) {
    if (recommendationDecision.actionable === true) {
      recommendationText =
        `The current recommendation state is ${recommendationDecision.recommendation_state}, and the recommended path is actionable now. ` +
        `Recommended action: ${actionText}`;
    } else if (recommendationDecision.blocked === true) {
      recommendationText =
        `The current recommendation state is ${recommendationDecision.recommendation_state}, and the claim is blocked` +
        `${blockerText ? ` pending ${blockerText}` : ''}. ` +
        `Recommended action: ${actionText}`;
    } else {
      recommendationText =
        `The current recommendation state is ${recommendationDecision.recommendation_state}. ` +
        `Recommended action: ${actionText}`;
    }

    if (recommendationDecision.prerequisites_met === false) {
      recommendationText += ' Required prerequisites are not yet met.';
    }

    if (recommendationDecision.recoverable_now === false) {
      recommendationText += ' The claim is not yet recoverable now with the currently available evidence.';
    }
  }

  return `Claim ${id} for ${patient} with ${payer} is currently ${status}. The claim amount is $${amount}. The denial reason is ${denialReason}. The denial type is ${denialType}. ${recommendationText}`;
}

module.exports = { generateClaimSummary };
