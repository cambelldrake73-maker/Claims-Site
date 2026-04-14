const BASE_WEIGHTS = {
  patient: 0.4,
  amount: 0.3,
  date: 0.2,
  payer: 0.1
};

const WEIGHT_LIMITS = {
  patient: { min: 0.2, max: 0.6 },
  amount: { min: 0.2, max: 0.5 },
  date: { min: 0.1, max: 0.3 },
  payer: { min: 0.05, max: 0.2 }
};

function smoothUpdate(current, target, alpha = 0.1) {
  return current * (1 - alpha) + target * alpha;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);

  if (!total) {
    return { ...BASE_WEIGHTS };
  }

  const normalizedWeights = {};

  Object.keys(BASE_WEIGHTS).forEach(key => {
    normalizedWeights[key] = Number(weights[key] || 0) / total;
  });

  return normalizedWeights;
}

function applyWeightBounds(weights) {
  const boundedWeights = {};

  Object.keys(BASE_WEIGHTS).forEach(key => {
    const limits = WEIGHT_LIMITS[key];
    boundedWeights[key] = clamp(weights[key], limits.min, limits.max);
  });

  return boundedWeights;
}

function adjustWeights(baseWeights, feedbackStats) {
  const weights = { ...baseWeights };

  if (feedbackStats.patient_accuracy < 0.7) {
    const target = weights.patient * 0.9;
    weights.patient = smoothUpdate(weights.patient, target);
  }

  if (feedbackStats.amount_accuracy > 0.9) {
    const target = weights.amount * 1.1;
    weights.amount = smoothUpdate(weights.amount, target);
  }

  return applyWeightBounds(normalizeWeights(weights));
}

function getFeedbackStats(feedbackRows) {
  let patientHits = 0;
  let amountHits = 0;
  const total = feedbackRows.length;

  for (const row of feedbackRows) {
    let reasons = [];

    try {
      reasons = JSON.parse(row.reasons || '[]');
    } catch (err) {
      reasons = [];
    }

    if (row.action === 'accept' && reasons.includes('patient match')) {
      patientHits++;
    }

    if (
      row.action === 'accept' &&
      (reasons.includes('exact amount') || reasons.includes('close amount'))
    ) {
      amountHits++;
    }
  }

  return {
    patient_accuracy: total ? patientHits / total : 1,
    amount_accuracy: total ? amountHits / total : 1
  };
}

function explainLearning(feedbackRows, stats, weights) {
  return {
    summary: {
      sample_size: feedbackRows.length,
      patient_accuracy: stats.patient_accuracy,
      amount_accuracy: stats.amount_accuracy
    },
    adjustments: {
      patient_adjusted: stats.patient_accuracy < 0.7,
      amount_adjusted: stats.amount_accuracy > 0.9
    },
    final_weights: weights
  };
}

function computeAdaptiveWeights(feedbackRows) {
  const rows = Array.isArray(feedbackRows) ? feedbackRows : [];
  const stats = getFeedbackStats(rows);

  if (rows.length === 0) {
    const weights = { ...BASE_WEIGHTS };

    return {
      weights,
      stats,
      base_weights: { ...BASE_WEIGHTS },
      sample_size: rows.length,
      explanation: explainLearning(rows, stats, weights)
    };
  }

  const weights = adjustWeights(BASE_WEIGHTS, stats);

  if (!weights || Object.values(weights).some(value => Number.isNaN(value))) {
    return {
      weights: { ...BASE_WEIGHTS },
      stats,
      base_weights: { ...BASE_WEIGHTS },
      sample_size: rows.length,
      explanation: explainLearning(rows, stats, { ...BASE_WEIGHTS })
    };
  }

  return {
    weights,
    stats,
    base_weights: { ...BASE_WEIGHTS },
    sample_size: rows.length,
    explanation: explainLearning(rows, stats, weights)
  };
}

module.exports = {
  BASE_WEIGHTS,
  WEIGHT_LIMITS,
  adjustWeights,
  getFeedbackStats,
  computeAdaptiveWeights,
  explainLearning,
  smoothUpdate,
  clamp
};
