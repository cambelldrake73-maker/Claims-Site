const ADJUSTMENT_CODE_MAP = {
  'CO-16': {
    category: 'missing_information',
    label: 'Missing information'
  },
  'CO-18': {
    category: 'duplicate_claim',
    label: 'Duplicate claim'
  },
  'CO-45': {
    category: 'contractual_adjustment',
    label: 'Fee schedule adjustment'
  },
  'CO-97': {
    category: 'duplicate_or_included_service',
    label: 'Duplicate or included service'
  },
  'PR-1': {
    category: 'deductible',
    label: 'Deductible'
  },
  'PR-2': {
    category: 'coinsurance',
    label: 'Coinsurance'
  },
  'OA-23': {
    category: 'impact_of_prior_payment',
    label: 'Impact of prior payment'
  }
};

function buildAdjustmentCode(groupCode, reasonCode) {
  const group = String(groupCode || '').trim().toUpperCase();
  const reason = String(reasonCode || '').trim().toUpperCase();

  if (!group && !reason) {
    return null;
  }

  return group && reason ? `${group}-${reason}` : group || reason;
}

function normalizeAdjustmentCodes(adjustments) {
  const normalizedAdjustmentCodes = [];
  let normalizedDenialCategory = null;
  let normalizedDenialLabel = null;

  for (const adjustment of Array.isArray(adjustments) ? adjustments : []) {
    const code = buildAdjustmentCode(
      adjustment?.group_code,
      adjustment?.reason_code
    );

    if (!code) {
      continue;
    }

    const mapped = ADJUSTMENT_CODE_MAP[code];

    if (!mapped) {
      continue;
    }

    normalizedAdjustmentCodes.push({
      code,
      category: mapped.category,
      label: mapped.label
    });

    if (!normalizedDenialCategory) {
      normalizedDenialCategory = mapped.category;
      normalizedDenialLabel = mapped.label;
    }
  }

  return {
    normalizedAdjustmentCodes,
    normalizedDenialCategory,
    normalizedDenialLabel
  };
}

module.exports = {
  ADJUSTMENT_CODE_MAP,
  normalizeAdjustmentCodes
};
