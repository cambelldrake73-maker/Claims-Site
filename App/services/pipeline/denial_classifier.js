const { ADJUSTMENT_CODE_MAP } = require('../intake/denial_code_map');

const STRUCTURED_CATEGORY_MAP = {
  missing_information: {
    denial_type: 'missing_info',
    rule_id: 'structured_category:missing_information'
  },
  duplicate_claim: {
    denial_type: 'duplicate',
    rule_id: 'structured_category:duplicate_claim'
  },
  duplicate_or_included_service: {
    denial_type: 'duplicate',
    rule_id: 'structured_category:duplicate_or_included_service'
  },
  contractual_adjustment: {
    denial_type: 'coverage_issue',
    rule_id: 'structured_category:contractual_adjustment'
  },
  deductible: {
    denial_type: 'coverage_issue',
    rule_id: 'structured_category:deductible'
  },
  coinsurance: {
    denial_type: 'coverage_issue',
    rule_id: 'structured_category:coinsurance'
  },
  impact_of_prior_payment: {
    denial_type: 'coverage_issue',
    rule_id: 'structured_category:impact_of_prior_payment'
  }
};

const STRUCTURED_FIELD_RULES = [
  {
    id: 'structured_field:authorization_required',
    denial_type: 'authorization_required',
    patterns: [
      /\bAUTH(?:ORIZATION)?\b/,
      /\bPRE[\s-]?AUTH\b/,
      /\bPRIOR[\s-]?AUTH\b/,
      /\bREFERRAL\b/
    ]
  },
  {
    id: 'structured_field:duplicate',
    denial_type: 'duplicate',
    patterns: [
      /\bDUP(?:LICATE)?\b/,
      /\bALREADY[\s-]?(?:PROCESSED|PAID|BILLED)\b/
    ]
  },
  {
    id: 'structured_field:coding_error',
    denial_type: 'coding_error',
    patterns: [
      /\bCOD(?:E|ING)\b/,
      /\bMODIFIER\b/,
      /\bCPT\b/,
      /\bHCPCS\b/,
      /\bNCCI\b/
    ]
  },
  {
    id: 'structured_field:missing_info',
    denial_type: 'missing_info',
    patterns: [
      /\bMISSING\b/,
      /\bINCOMPLETE\b/,
      /\bINVALID\b/,
      /\bINFORMATION\b/,
      /\bDOCUMENTATION\b/
    ]
  },
  {
    id: 'structured_field:coverage_issue',
    denial_type: 'coverage_issue',
    patterns: [
      /\bNOT[\s-]?COVERED\b/,
      /\bNON[\s-]?COVERED\b/,
      /\bCOVERAGE\b/,
      /\bBENEFIT\b/,
      /\bELIGIB(?:ILITY|LE)?\b/,
      /\bDEDUCTIBLE\b/,
      /\bCOINSURANCE\b/,
      /\bCONTRACTUAL\b/,
      /\bPATIENT[\s-]?RESPONSIBILITY\b/
    ]
  }
];

const PAYER_CODE_RULES = [
  {
    id: 'payer_code:authorization',
    denial_type: 'authorization_required',
    patterns: [
      /^AUTH(?:ORIZATION)?[A-Z0-9-]*$/,
      /^PREAUTH[A-Z0-9-]*$/,
      /^PRIORAUTH[A-Z0-9-]*$/,
      /^REFERRAL[A-Z0-9-]*$/
    ]
  },
  {
    id: 'payer_code:duplicate',
    denial_type: 'duplicate',
    patterns: [
      /^DUP(?:LICATE)?[A-Z0-9-]*$/,
      /^DUPCLM[A-Z0-9-]*$/,
      /^ALREADY[A-Z0-9-]*$/
    ]
  },
  {
    id: 'payer_code:coding',
    denial_type: 'coding_error',
    patterns: [
      /^COD(?:E|ING)[A-Z0-9-]*$/,
      /^MOD(?:IFIER)?[A-Z0-9-]*$/,
      /^CPT[A-Z0-9-]*$/,
      /^HCPCS[A-Z0-9-]*$/,
      /^NCCI[A-Z0-9-]*$/
    ]
  },
  {
    id: 'payer_code:missing_info',
    denial_type: 'missing_info',
    patterns: [
      /^MISS(?:ING)?[A-Z0-9-]*$/,
      /^INCOMP(?:LETE)?[A-Z0-9-]*$/,
      /^INVALID[A-Z0-9-]*$/,
      /^INFO[A-Z0-9-]*$/,
      /^DOC[A-Z0-9-]*$/
    ]
  },
  {
    id: 'payer_code:coverage',
    denial_type: 'coverage_issue',
    patterns: [
      /^COV(?:ERAGE)?[A-Z0-9-]*$/,
      /^NCOV[A-Z0-9-]*$/,
      /^ELIG[A-Z0-9-]*$/,
      /^BENEFIT[A-Z0-9-]*$/,
      /^DED(?:UCTIBLE)?[A-Z0-9-]*$/,
      /^COINS?[A-Z0-9-]*$/,
      /^COB[A-Z0-9-]*$/
    ]
  }
];

const FREE_TEXT_RULES = [
  {
    id: 'free_text:authorization_required',
    denial_type: 'authorization_required',
    patterns: [
      /\bAUTHORIZATION REQUIRED\b/,
      /\bNO AUTHORIZATION\b/,
      /\bPRIOR AUTH(?:ORIZATION)?\b/,
      /\bPRE[\s-]?AUTH(?:ORIZATION)?\b/,
      /\bREFERRAL REQUIRED\b/,
      /\bNO REFERRAL\b/
    ]
  },
  {
    id: 'free_text:duplicate',
    denial_type: 'duplicate',
    patterns: [
      /\bDUPLICATE CLAIM\b/,
      /\bDUPLICATE SERVICE\b/,
      /\bALREADY PROCESSED\b/,
      /\bALREADY PAID\b/,
      /\bALREADY BILLED\b/,
      /\bPREVIOUSLY ADJUDICATED\b/
    ]
  },
  {
    id: 'free_text:coding_error',
    denial_type: 'coding_error',
    patterns: [
      /\bCODING ERROR\b/,
      /\bINVALID COD(?:E|ING)\b/,
      /\bINCORRECT COD(?:E|ING)\b/,
      /\bINVALID MODIFIER\b/,
      /\bMODIFIER\b/,
      /\bCPT\b/,
      /\bHCPCS\b/,
      /\bNCCI\b/,
      /\bBUNDL(?:ED|ING)\b/,
      /\bUNBUNDL(?:ED|ING)\b/
    ]
  },
  {
    id: 'free_text:missing_info',
    denial_type: 'missing_info',
    patterns: [
      /\bMISSING INFORMATION\b/,
      /\bINCOMPLETE\b/,
      /\bINFORMATION REQUIRED\b/,
      /\bADDITIONAL INFORMATION\b/,
      /\bMISSING\b/,
      /\bNO DOCUMENTATION\b/,
      /\bINSUFFICIENT DOCUMENTATION\b/,
      /\bINVALID\b/
    ]
  },
  {
    id: 'free_text:coverage_issue',
    denial_type: 'coverage_issue',
    patterns: [
      /\bNOT[\s-]?COVERED\b/,
      /\bNON[\s-]?COVERED\b/,
      /\bNO COVERAGE\b/,
      /\bCOVERAGE\b/,
      /\bBENEFIT\b/,
      /\bELIGIB(?:ILITY|LE)?\b/,
      /\bDEDUCTIBLE\b/,
      /\bCOINSURANCE\b/,
      /\bCONTRACTUAL\b/,
      /\bPRIOR PAYMENT\b/,
      /\bPATIENT RESPONSIBILITY\b/,
      /\bCOORDINATION OF BENEFITS\b/
    ]
  }
];

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeWhitespace(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\s+/g, ' ') : null;
}

function normalizeCode(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

function normalizeCategory(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeFreeText(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .toUpperCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^A-Z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseObject(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch (err) {
      return null;
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function combineAdjustmentCode(groupCode, reasonCode) {
  const group = normalizeCode(groupCode);
  const reason = normalizeCode(reasonCode);

  if (!group && !reason) {
    return null;
  }

  return group && reason ? `${group}-${reason}` : group || reason;
}

function flattenInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const additionalData = parseObject(input.additional_data) || {};

  return {
    ...additionalData,
    ...input,
    additional_data: additionalData
  };
}

function extractCodesFromText(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return [];
  }

  const codes = new Set();
  const codePattern = /\b(?:CO|PR|OA|PI)\s*[- ]?\s*([0-9A-Z]{1,3})\b/g;
  let match = codePattern.exec(normalizedText);

  while (match) {
    const group = normalizeCode(match[0].slice(0, 2));
    const reason = normalizeCode(match[1]);
    const combined = combineAdjustmentCode(group, reason);

    if (combined) {
      codes.add(combined);
    }

    match = codePattern.exec(normalizedText);
  }

  return Array.from(codes);
}

function collectEvidence(input) {
  if (typeof input === 'string' || input === undefined || input === null) {
    const freeText = normalizeText(input);
    return {
      free_text: freeText ? [freeText] : [],
      adjustment_codes: extractCodesFromText(freeText),
      structured_categories: [],
      structured_field_values: [],
      payer_codes: []
    };
  }

  const flattened = flattenInput(input);
  const freeText = [];
  const adjustmentCodes = new Set();
  const structuredCategories = new Set();
  const structuredFieldValues = [];
  const payerCodes = new Set();

  [
    flattened.denial_reason,
    flattened.denialReason,
    flattened.reason,
    flattened.denial,
    flattened.error,
    flattened.denial_text
  ].forEach(value => {
    const normalized = normalizeText(value);

    if (normalized) {
      freeText.push(normalized);
      extractCodesFromText(normalized).forEach(code => adjustmentCodes.add(code));
    }
  });

  [
    flattened.normalized_denial_category,
    flattened.denial_category,
    flattened.denialCategory
  ].forEach(value => {
    const normalized = normalizeCategory(value);
    if (normalized) {
      structuredCategories.add(normalized);
    }
  });

  toArray(flattened.normalized_adjustment_codes).forEach(entry => {
    const code = normalizeCode(entry?.code || entry?.reason_code);
    const category = normalizeCategory(entry?.category);
    const label = normalizeText(entry?.label);

    if (code) {
      adjustmentCodes.add(code);
    }

    if (category) {
      structuredCategories.add(category);
    }

    if (label) {
      structuredFieldValues.push(label);
    }
  });

  toArray(flattened.adjustments).forEach(entry => {
    const code = combineAdjustmentCode(entry?.group_code, entry?.reason_code);
    if (code) {
      adjustmentCodes.add(code);
    }
  });

  toArray(flattened.denial_codes).forEach(entry => {
    const code = normalizeCode(entry?.code || entry?.reason_code || entry);
    const category = normalizeCategory(entry?.category);
    const label = normalizeText(entry?.label);

    if (code) {
      adjustmentCodes.add(code);
    }

    if (category) {
      structuredCategories.add(category);
    }

    if (label) {
      structuredFieldValues.push(label);
    }
  });

  [
    flattened.payer_denial_code,
    flattened.denial_code,
    flattened.denialCode,
    flattened.carc,
    flattened.rarc
  ].forEach(value => {
    const normalized = normalizeCode(value);
    if (normalized) {
      payerCodes.add(normalized);
    }
  });

  [
    flattened.denial_field,
    flattened.denial_label,
    flattened.denial_description,
    flattened.status_reason
  ].forEach(value => {
    const normalized = normalizeText(value);
    if (normalized) {
      structuredFieldValues.push(normalized);
    }
  });

  return {
    free_text: Array.from(new Set(freeText)),
    adjustment_codes: Array.from(adjustmentCodes),
    structured_categories: Array.from(structuredCategories),
    structured_field_values: Array.from(new Set(structuredFieldValues)),
    payer_codes: Array.from(payerCodes)
  };
}

function buildAssessment({
  denial_type,
  evidence_source,
  evidence_strength,
  matched_rule,
  matched_value,
  reasoning
}) {
  return {
    denial_type,
    evidence_source,
    evidence_strength,
    matched_rule,
    matched_value,
    reasoning: Array.isArray(reasoning)
      ? reasoning.filter(item => typeof item === 'string' && item.trim())
      : []
  };
}

function classifyFromAdjustmentCodes(codes) {
  for (const code of Array.isArray(codes) ? codes : []) {
    const mapped = ADJUSTMENT_CODE_MAP[code];

    if (!mapped) {
      continue;
    }

    const categoryRule = STRUCTURED_CATEGORY_MAP[normalizeCategory(mapped.category)];

    if (!categoryRule) {
      continue;
    }

    return buildAssessment({
      denial_type: categoryRule.denial_type,
      evidence_source: 'adjustment_code_map',
      evidence_strength: 'strong',
      matched_rule: code,
      matched_value: mapped.label || mapped.category || code,
      reasoning: [
        `structured adjustment code matched: ${code}`,
        `mapped denial category: ${mapped.category}`
      ]
    });
  }

  return null;
}

function classifyFromStructuredCategories(categories) {
  for (const category of Array.isArray(categories) ? categories : []) {
    const rule = STRUCTURED_CATEGORY_MAP[category];

    if (!rule) {
      continue;
    }

    return buildAssessment({
      denial_type: rule.denial_type,
      evidence_source: 'structured_denial_category',
      evidence_strength: 'strong',
      matched_rule: rule.rule_id,
      matched_value: category,
      reasoning: [`structured denial category matched: ${category}`]
    });
  }

  return null;
}

function classifyByRuleSet(values, rules, evidenceSource, evidenceStrength) {
  for (const rawValue of Array.isArray(values) ? values : []) {
    const normalizedValue = normalizeFreeText(rawValue);

    if (!normalizedValue) {
      continue;
    }

    for (const rule of rules) {
      const matchedPattern = rule.patterns.find(pattern => pattern.test(normalizedValue));

      if (matchedPattern) {
        return buildAssessment({
          denial_type: rule.denial_type,
          evidence_source: evidenceSource,
          evidence_strength: evidenceStrength,
          matched_rule: rule.id,
          matched_value: rawValue,
          reasoning: [
            `${evidenceSource.replace(/_/g, ' ')} matched rule: ${rule.id}`,
            `matched evidence value: ${rawValue}`
          ]
        });
      }
    }
  }

  return null;
}

function classifyFromPayerCodes(codes) {
  return classifyByRuleSet(codes, PAYER_CODE_RULES, 'payer_denial_code', 'medium');
}

function classifyFromStructuredFields(values) {
  return classifyByRuleSet(values, STRUCTURED_FIELD_RULES, 'structured_denial_field', 'medium');
}

function classifyFromFreeText(values) {
  return classifyByRuleSet(values, FREE_TEXT_RULES, 'free_text_fallback', 'weak');
}

function classifyDenialDetailed(input = '') {
  const evidence = collectEvidence(input);

  return (
    classifyFromAdjustmentCodes(evidence.adjustment_codes)
    || classifyFromStructuredCategories(evidence.structured_categories)
    || classifyFromPayerCodes(evidence.payer_codes)
    || classifyFromStructuredFields(evidence.structured_field_values)
    || classifyFromFreeText(evidence.free_text)
    || buildAssessment({
      denial_type: 'other',
      evidence_source: 'unknown',
      evidence_strength: 'weak',
      matched_rule: 'fallback:other',
      matched_value: null,
      reasoning: ['no structured denial evidence matched; classified conservatively as other']
    })
  );
}

function classifyDenial(input = '', options = {}) {
  const assessment = classifyDenialDetailed(input);
  return options && options.detailed === true
    ? assessment
    : assessment.denial_type;
}

module.exports = { classifyDenial };
