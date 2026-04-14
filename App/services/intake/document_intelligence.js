const CANONICAL_DOCUMENT_TYPES = new Set([
  'denial_remittance',
  'original_claim',
  'clinical_support',
  'authorization_referral',
  'appeal_correspondence',
  'billing_support',
  'unknown'
]);

const SUPPORTING_DOCUMENT_TYPES = new Set([
  'clinical_support',
  'authorization_referral',
  'appeal_correspondence',
  'billing_support'
]);

const COVERAGE_DETERMINABLE_CATEGORIES = new Set([
  'deductible',
  'coinsurance',
  'contractual_adjustment',
  'impact_of_prior_payment'
]);
const ENTITY_NOISE_TOKENS = new Set([
  'THE',
  'INC',
  'INCORPORATED',
  'LLC',
  'LLC.',
  'LTD',
  'LIMITED',
  'CORP',
  'CORPORATION',
  'COMPANY',
  'CO',
  'PC',
  'P.C',
  'P.A',
  'PA',
  'PLLC',
  'LLP',
  'LP'
]);
const PERSON_SUFFIX_TOKENS = new Set([
  'JR',
  'SR',
  'II',
  'III',
  'IV',
  'V',
  'MD',
  'DO'
]);
const ENTITY_ALIAS_REPLACEMENTS = [
  { pattern: /\bBCBS\b/g, replacement: 'BLUE CROSS BLUE SHIELD' },
  { pattern: /\bBLUECROSS BLUESHIELD\b/g, replacement: 'BLUE CROSS BLUE SHIELD' },
  { pattern: /\bBLUE CROSS BLUE SHIELD ASSN\b/g, replacement: 'BLUE CROSS BLUE SHIELD' },
  { pattern: /\bUHC\b/g, replacement: 'UNITED HEALTHCARE' },
  { pattern: /\bUNITED HEALTH CARE\b/g, replacement: 'UNITED HEALTHCARE' },
  { pattern: /\bUNITEDHEALTH CARE\b/g, replacement: 'UNITED HEALTHCARE' }
];

const SCALAR_FIELD_CONFIG = [
  {
    name: 'patient_name',
    keys: ['patient', 'patient_name', 'member_name', 'member', 'name'],
    strength: 'weak',
    normalize: normalizeText
  },
  {
    name: 'patient_dob',
    keys: ['dob', 'date_of_birth', 'patient_dob', 'member_dob'],
    strength: 'strong',
    normalize: normalizeDate
  },
  {
    name: 'member_id',
    keys: ['member_id', 'member_number', 'subscriber_id', 'policy_id', 'subscriber_number'],
    strength: 'strong',
    normalize: normalizeText
  },
  {
    name: 'claim_number',
    keys: ['claim_id', 'claim_number', 'claim_no', 'claimid'],
    strength: 'strong',
    normalize: normalizeText
  },
  {
    name: 'date_of_service',
    keys: ['date_of_service', 'service_date', 'dos', 'date'],
    strength: 'strong',
    normalize: normalizeDate
  },
  {
    name: 'payer',
    keys: ['payer', 'payer_name', 'insurance', 'insurer'],
    strength: 'weak',
    normalize: normalizeText
  },
  {
    name: 'provider',
    keys: ['provider', 'provider_name', 'billing_provider', 'rendering_provider'],
    strength: 'weak',
    normalize: normalizeText
  },
  {
    name: 'provider_npi',
    keys: ['provider_npi', 'npi', 'billing_npi', 'rendering_npi'],
    strength: 'strong',
    normalize: normalizeText
  },
  {
    name: 'tax_id',
    keys: ['tax_id', 'tin', 'ein'],
    strength: 'strong',
    normalize: normalizeText
  },
  {
    name: 'billed_amount',
    keys: ['amount', 'billed_amount', 'charge', 'denied_amount'],
    strength: 'strong',
    normalize: normalizeAmount
  }
];

const CONTROL_NUMBER_CONFIG = [
  {
    type: 'patient_control_number',
    keys: ['patient_control_number'],
    strength: 'strong'
  },
  {
    type: 'payer_claim_control_number',
    keys: ['payer_claim_control_number'],
    strength: 'strong'
  },
  {
    type: 'icn',
    keys: ['icn'],
    strength: 'strong'
  },
  {
    type: 'dcn',
    keys: ['dcn'],
    strength: 'strong'
  },
  {
    type: 'trace_number',
    keys: ['trace_number'],
    strength: 'strong'
  },
  {
    type: 'reference_number',
    keys: ['reference_number', 'reference_no', 'reference'],
    strength: 'strong'
  },
  {
    type: 'control_number',
    keys: ['control_number', 'control_no'],
    strength: 'strong'
  }
];

const LIST_FIELD_CONFIG = [
  {
    name: 'procedure_codes',
    keys: ['procedure_code', 'procedure_codes', 'cpt', 'cpt_code', 'cpt_codes', 'hcpcs', 'hcpcs_code', 'hcpcs_codes'],
    strength: 'weak',
    normalize: normalizeCode
  },
  {
    name: 'diagnosis_codes',
    keys: ['diagnosis_code', 'diagnosis_codes', 'icd10', 'icd10_code', 'icd10_codes'],
    strength: 'weak',
    normalize: normalizeCode
  }
];

const AUTHORIZATION_NUMBER_CONFIG = [
  {
    type: 'authorization_number',
    keys: ['authorization_number', 'authorization_no', 'auth_number', 'auth_no'],
    strength: 'strong'
  },
  {
    type: 'referral_number',
    keys: ['referral_number', 'referral_no'],
    strength: 'strong'
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
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDate(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return normalized;
}

function normalizeDateForComparison(value) {
  return normalizeDate(value);
}

function normalizeAmountForComparison(value) {
  const amount = normalizeAmount(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function normalizeIdentifierForComparison(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const stripped = normalized
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return stripped || null;
}

function normalizeEntityNameForComparison(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  let comparison = normalized
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  ENTITY_ALIAS_REPLACEMENTS.forEach(({ pattern, replacement }) => {
    comparison = comparison.replace(pattern, replacement);
  });

  const tokens = comparison
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => !ENTITY_NOISE_TOKENS.has(token));

  return tokens.length ? tokens.join(' ') : comparison || null;
}

function parsePatientNameForComparison(value) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  const uppercase = normalized
    .toUpperCase()
    .replace(/['’.]/g, '')
    .replace(/-/g, ' ')
    .replace(/[^A-Z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!uppercase) {
    return null;
  }

  let ordered = uppercase;

  if (ordered.includes(',')) {
    const parts = ordered
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      ordered = `${parts.slice(1).join(' ')} ${parts[0]}`.trim();
    }
  }

  const tokens = ordered
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => !PERSON_SUFFIX_TOKENS.has(token));

  if (!tokens.length) {
    return null;
  }

  const firstName = tokens[0] || null;
  const lastName = tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0];
  const middleTokens = tokens.slice(1, -1);
  const nonInitialMiddleTokens = middleTokens.filter(token => token.length > 1);
  const comparisonValue = [firstName, ...nonInitialMiddleTokens, lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const coreValue = [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    comparison_value: comparisonValue || null,
    core_value: coreValue || null,
    first_name: firstName,
    last_name: lastName,
    first_initial: firstName ? firstName[0] : null,
    last_initial: lastName ? lastName[0] : null,
    middle_tokens: nonInitialMiddleTokens,
    tokens
  };
}

function normalizePatientNameForComparison(value) {
  return parsePatientNameForComparison(value)?.comparison_value || null;
}

function comparePatientNames(leftValue, rightValue) {
  const left = parsePatientNameForComparison(leftValue);
  const right = parsePatientNameForComparison(rightValue);

  if (!left || !right) {
    return 0;
  }

  if (left.comparison_value && right.comparison_value && left.comparison_value === right.comparison_value) {
    return 1;
  }

  if (left.core_value && right.core_value && left.core_value === right.core_value) {
    return 0.95;
  }

  if (
    left.last_name
    && right.last_name
    && left.last_name === right.last_name
    && left.first_name
    && right.first_name
  ) {
    if (left.first_name === right.first_name) {
      return 0.9;
    }

    if (
      left.first_initial
      && right.first_initial
      && left.first_initial === right.first_initial
    ) {
      return 0.75;
    }
  }

  return 0;
}

function compareEntityNames(leftValue, rightValue) {
  const left = normalizeEntityNameForComparison(leftValue);
  const right = normalizeEntityNameForComparison(rightValue);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);

  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const overlapCount = rightTokens.filter(token => leftSet.has(token)).length;
  const overlapRatio = overlapCount / Math.max(leftTokens.length, rightTokens.length);

  if (overlapRatio >= 0.8) {
    return 0.9;
  }

  if (overlapRatio >= 0.6 && overlapCount >= 2) {
    return 0.75;
  }

  return 0;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeDocumentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CANONICAL_DOCUMENT_TYPES.has(normalized) ? normalized : 'unknown';
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function flattenRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {};
  }

  const additionalData = record.additional_data
    && typeof record.additional_data === 'object'
    && !Array.isArray(record.additional_data)
    ? record.additional_data
    : {};

  return {
    ...additionalData,
    ...record,
    additional_data: additionalData
  };
}

function extractValues(record, keys, normalizer) {
  const flattened = flattenRecord(record);
  const values = [];

  keys.forEach(key => {
    toArray(flattened[key]).forEach(rawValue => {
      const normalized = normalizer(rawValue);

      if (normalized !== null && normalized !== undefined && normalized !== '') {
        values.push({
          key,
          value: normalized
        });
      }
    });
  });

  return values;
}

function extractListValues(record, keys, normalizer) {
  const flattened = flattenRecord(record);
  const values = [];

  keys.forEach(key => {
    toArray(flattened[key]).forEach(rawValue => {
      const parts = typeof rawValue === 'string'
        ? rawValue
          .split(/[,;|]/)
          .map(item => item.trim())
          .filter(Boolean)
        : [rawValue];

      parts.forEach(part => {
        const normalized = normalizer(part);

        if (normalized !== null && normalized !== undefined && normalized !== '') {
          values.push({
            key,
            value: normalized
          });
        }
      });
    });
  });

  return values;
}

function dedupeEvidenceEntries(entries, keyBuilder) {
  const seen = new Set();
  const deduped = [];

  entries.forEach(entry => {
    const key = keyBuilder(entry);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(entry);
  });

  return deduped;
}

function buildScalarIdentifierEvidence(records, providerRecord = null) {
  const identifiers = {};

  SCALAR_FIELD_CONFIG.forEach(config => {
    const values = dedupeEvidenceEntries(
      records.flatMap(record => extractValues(record, config.keys, config.normalize).map(item => ({
        value: item.value,
        comparison_value: (
          config.name === 'patient_name' ? normalizePatientNameForComparison(item.value)
            : config.name === 'payer' || config.name === 'provider' ? normalizeEntityNameForComparison(item.value)
              : config.name === 'patient_dob' || config.name === 'date_of_service' ? normalizeDateForComparison(item.value)
                : config.name === 'billed_amount' ? normalizeAmountForComparison(item.value)
                  : normalizeIdentifierForComparison(item.value)
        ),
        strength: config.strength,
        source: `field:${item.key}`
      }))),
      entry => `${config.name}:${String(entry.value)}:${entry.source}`
    );

    if (providerRecord && config.name === 'provider') {
      const providerName = normalizeText(providerRecord.provider_name);

      if (providerName) {
        values.unshift({
          value: providerName,
          comparison_value: normalizeEntityNameForComparison(providerName),
          strength: config.strength,
          source: 'provider_context'
        });
      }
    }

    if (providerRecord && config.name === 'provider_npi') {
      const providerNpi = normalizeText(providerRecord.provider_npi);

      if (providerNpi) {
        values.unshift({
          value: providerNpi,
          comparison_value: normalizeIdentifierForComparison(providerNpi),
          strength: config.strength,
          source: 'provider_context'
        });
      }
    }

    if (providerRecord && config.name === 'tax_id') {
      const taxId = normalizeText(providerRecord.tax_id);

      if (taxId) {
        values.unshift({
          value: taxId,
          comparison_value: normalizeIdentifierForComparison(taxId),
          strength: config.strength,
          source: 'provider_context'
        });
      }
    }

    identifiers[config.name] = dedupeEvidenceEntries(
      values,
      entry => `${config.name}:${String(entry.value)}:${entry.source}`
    );
  });

  return identifiers;
}

function buildTypedIdentifierEvidence(records, configList) {
  return dedupeEvidenceEntries(
    configList.flatMap(config => (
      records.flatMap(record => extractValues(record, config.keys, normalizeText).map(item => ({
        type: config.type,
        value: item.value,
        comparison_value: normalizeIdentifierForComparison(item.value),
        strength: config.strength,
        source: `field:${item.key}`
      })))
    )),
    entry => `${entry.type}:${String(entry.value)}:${entry.source}`
  );
}

function buildListIdentifierEvidence(records, configList) {
  const lists = {};

  configList.forEach(config => {
    lists[config.name] = dedupeEvidenceEntries(
      records.flatMap(record => extractListValues(record, config.keys, config.normalize).map(item => ({
        value: item.value,
        comparison_value: normalizeCode(item.value),
        strength: config.strength,
        source: `field:${item.key}`
      }))),
      entry => `${config.name}:${String(entry.value)}:${entry.source}`
    );
  });

  return lists;
}

function summarizeIdentifierStrengths(identifiers) {
  const strong = [];
  const weak = [];

  Object.entries(identifiers).forEach(([field, entries]) => {
    if (!Array.isArray(entries) || !entries.length) {
      return;
    }

    const strengths = new Set(entries.map(entry => entry?.strength).filter(Boolean));

    if (strengths.has('strong')) {
      strong.push(field);
    }

    if (strengths.has('weak')) {
      weak.push(field);
    }
  });

  return {
    strong_identifiers: strong,
    weak_identifiers: weak
  };
}

function extractIdentifierEvidence(recordsInput, providerRecord = null) {
  const records = Array.isArray(recordsInput)
    ? recordsInput.filter(record => record && typeof record === 'object' && !Array.isArray(record))
    : [];
  const scalarIdentifiers = buildScalarIdentifierEvidence(records, providerRecord);
  const listIdentifiers = buildListIdentifierEvidence(records, LIST_FIELD_CONFIG);
  const controlNumbers = buildTypedIdentifierEvidence(records, CONTROL_NUMBER_CONFIG);
  const authorizationNumbers = buildTypedIdentifierEvidence(records, AUTHORIZATION_NUMBER_CONFIG);
  const identifiers = {
    ...scalarIdentifiers,
    ...listIdentifiers,
    control_numbers: controlNumbers,
    authorization_numbers: authorizationNumbers
  };
  const summary = summarizeIdentifierStrengths(identifiers);

  return {
    ...identifiers,
    strong_identifiers: summary.strong_identifiers,
    weak_identifiers: summary.weak_identifiers
  };
}

function extractDenialEvidence(recordsInput = []) {
  const records = Array.isArray(recordsInput)
    ? recordsInput.filter(record => record && typeof record === 'object' && !Array.isArray(record))
    : [];
  const denialCodes = [];
  const denialTexts = [];
  let normalizedDenialCategory = null;
  let claimStatus = null;
  let evidenceOrigin = null;
  let evidenceSource = null;
  let sawEraEvidence = false;

  records.forEach(record => {
    const flattened = flattenRecord(record);
    const sourceType = normalizeText(flattened.source_type);
    const recordClaimStatus = normalizeText(flattened.claim_status);
    const recordDenialText = normalizeText(
      flattened.denial_reason
      || flattened.denialReason
      || flattened.reason
      || flattened.denial
      || flattened.error
    );
    const structuredCodes = Array.isArray(flattened.normalized_adjustment_codes)
      ? flattened.normalized_adjustment_codes
      : [];
    const rawAdjustments = Array.isArray(flattened.adjustments)
      ? flattened.adjustments
      : [];
    const recordCategory = normalizeText(flattened.normalized_denial_category);

    if (sourceType === 'era_835') {
      sawEraEvidence = true;
    }

    if (!claimStatus && recordClaimStatus) {
      claimStatus = recordClaimStatus;
    }

    if (!normalizedDenialCategory && recordCategory) {
      normalizedDenialCategory = recordCategory;
    }

    if (recordDenialText) {
      denialTexts.push(recordDenialText);
      evidenceOrigin = evidenceOrigin || (sourceType === 'era_835' ? 'remittance_field' : 'free_text');
      evidenceSource = evidenceSource || (sourceType === 'era_835' ? 'era_835' : 'structured_record');
    }

    structuredCodes.forEach(code => {
      const normalizedCode = normalizeCode(code?.code || code?.reason_code);

      if (!normalizedCode) {
        return;
      }

      denialCodes.push({
        code: normalizedCode,
        system: 'adjustment_code',
        category: normalizeText(code?.category),
        label: normalizeText(code?.label),
        source: 'structured_code'
      });

      if (!normalizedDenialCategory && normalizeText(code?.category)) {
        normalizedDenialCategory = normalizeText(code.category);
      }
    });

    rawAdjustments.forEach(adjustment => {
      const group = normalizeCode(adjustment?.group_code);
      const reason = normalizeCode(adjustment?.reason_code);
      const combined = group && reason ? `${group}-${reason}` : group || reason;

      if (!combined) {
        return;
      }

      denialCodes.push({
        code: combined,
        system: 'adjustment_code',
        category: null,
        label: null,
        source: 'structured_code'
      });
    });
  });

  const dedupedCodes = dedupeEvidenceEntries(
    denialCodes,
    entry => `${entry.system}:${entry.code}:${entry.source}`
  );
  const denialText = dedupeEvidenceEntries(
    denialTexts.map(value => ({ value })),
    entry => entry.value
  )[0]?.value || null;

  if (!evidenceOrigin && dedupedCodes.length) {
    evidenceOrigin = 'structured_code';
  }

  if (!evidenceSource && dedupedCodes.length) {
    evidenceSource = sawEraEvidence ? 'era_835' : 'structured_record';
  }

  if (!evidenceOrigin && claimStatus && ['denied', 'partial'].includes(claimStatus)) {
    evidenceOrigin = 'fallback_guess';
    evidenceSource = evidenceSource || 'structured_record';
  }

  return {
    denial_codes: dedupedCodes,
    denial_text: denialText,
    normalized_denial_category: normalizedDenialCategory || null,
    claim_status: claimStatus || null,
    evidence_origin: evidenceOrigin,
    evidence_source: evidenceSource,
    evidence_confident: Boolean(dedupedCodes.length || normalizedDenialCategory || denialText)
  };
}

function classifyDocumentType({
  fileType,
  originalFilename,
  identifiers,
  denialEvidence
}) {
  const normalizedFileType = normalizeText(fileType);
  const normalizedFilename = normalizeText(originalFilename);

  if (
    normalizedFileType === 'era_835'
    || denialEvidence.evidence_source === 'era_835'
    || denialEvidence.denial_codes.length > 0
    || ['denied', 'partial'].includes(String(denialEvidence.claim_status || '').toLowerCase())
  ) {
    return {
      canonical_document_type: 'denial_remittance',
      document_type_source: normalizedFileType === 'era_835'
        ? 'structured_remittance'
        : 'structured_denial_fields'
    };
  }

  if (normalizedFilename && /(authorization|referral|pre[-_ ]?auth|precert)/i.test(normalizedFilename)) {
    return {
      canonical_document_type: 'authorization_referral',
      document_type_source: 'filename_hint'
    };
  }

  if (normalizedFilename && /(appeal|reconsideration|correspondence|letter)/i.test(normalizedFilename)) {
    return {
      canonical_document_type: 'appeal_correspondence',
      document_type_source: 'filename_hint'
    };
  }

  if (normalizedFilename && /(invoice|statement|billing|superbill)/i.test(normalizedFilename)) {
    return {
      canonical_document_type: 'billing_support',
      document_type_source: 'filename_hint'
    };
  }

  if (normalizedFilename && /(medical|record|clinical|chart|progress[_ -]?note|notes)/i.test(normalizedFilename)) {
    return {
      canonical_document_type: 'clinical_support',
      document_type_source: 'filename_hint'
    };
  }

  const hasClaimShape = (
    Array.isArray(identifiers.patient_name) && identifiers.patient_name.length
    && Array.isArray(identifiers.payer) && identifiers.payer.length
    && Array.isArray(identifiers.date_of_service) && identifiers.date_of_service.length
  ) || (
    Array.isArray(identifiers.claim_number) && identifiers.claim_number.length
  );

  if (hasClaimShape) {
    return {
      canonical_document_type: 'original_claim',
      document_type_source: 'structured_claim_fields'
    };
  }

  return {
    canonical_document_type: 'unknown',
    document_type_source: normalizedFilename ? 'metadata_fallback' : 'unknown'
  };
}

function hasIdentifier(identifiers, fieldName) {
  return Array.isArray(identifiers?.[fieldName]) && identifiers[fieldName].length > 0;
}

function buildMissingEvidence({
  canonicalDocumentType,
  identifiers,
  denialEvidence,
  metadataOnly = false,
  parseStatus = null
}) {
  const missing = [];
  const hasClaimIdentifier = hasIdentifier(identifiers, 'claim_number') || hasIdentifier(identifiers, 'control_numbers');
  const hasPatientAnchor = hasIdentifier(identifiers, 'patient_name') || hasIdentifier(identifiers, 'member_id');
  const hasServiceAnchor = hasIdentifier(identifiers, 'date_of_service') && hasIdentifier(identifiers, 'billed_amount');
  const denialUnderstood = Boolean(
    denialEvidence.evidence_confident
    || denialEvidence.normalized_denial_category
    || denialEvidence.denial_text
  );

  if (metadataOnly || parseStatus === 'unsupported' || parseStatus === 'parse_failed') {
    missing.push('structured_document_content');
  }

  if (!hasClaimIdentifier) {
    missing.push('claim_identifier');
  }

  if (!hasPatientAnchor) {
    missing.push('patient_or_member_identifier');
  }

  if (!hasServiceAnchor) {
    missing.push('service_date_or_billed_amount');
  }

  if (canonicalDocumentType === 'denial_remittance' && !denialUnderstood) {
    missing.push('denial_reason_evidence');
  }

  return Array.from(new Set(missing));
}

function assessCaseEvidence({
  canonicalDocumentType,
  identifiers,
  denialEvidence,
  metadataOnly = false,
  parseStatus = null
}) {
  const denialReasonUnderstood = Boolean(
    denialEvidence.evidence_confident
    || denialEvidence.normalized_denial_category
    || denialEvidence.denial_text
  );
  const coverageDeterminableFromCurrentDocs = Boolean(
    denialEvidence.normalized_denial_category
    && COVERAGE_DETERMINABLE_CATEGORIES.has(denialEvidence.normalized_denial_category)
  );
  const hasStrongClaimAnchor = hasIdentifier(identifiers, 'claim_number')
    || hasIdentifier(identifiers, 'control_numbers')
    || hasIdentifier(identifiers, 'member_id');
  const hasClaimContext = hasStrongClaimAnchor
    || (
      hasIdentifier(identifiers, 'patient_name')
      && hasIdentifier(identifiers, 'date_of_service')
      && hasIdentifier(identifiers, 'billed_amount')
    );
  const supportingDoc = SUPPORTING_DOCUMENT_TYPES.has(canonicalDocumentType);
  const missingEvidence = buildMissingEvidence({
    canonicalDocumentType,
    identifiers,
    denialEvidence,
    metadataOnly,
    parseStatus
  });
  const requiresOriginalClaim = metadataOnly
    || parseStatus === 'unsupported'
    || parseStatus === 'parse_failed'
    || supportingDoc
    || canonicalDocumentType === 'unknown'
    || (
      canonicalDocumentType === 'denial_remittance'
      && (!hasClaimContext || !coverageDeterminableFromCurrentDocs)
    );
  const requiresAdditionalDocuments = metadataOnly
    || parseStatus === 'unsupported'
    || parseStatus === 'parse_failed'
    || canonicalDocumentType === 'unknown'
    || supportingDoc
    || !denialReasonUnderstood
    || requiresOriginalClaim;
  const manualReviewRequired = metadataOnly
    || parseStatus === 'unsupported'
    || parseStatus === 'parse_failed'
    || canonicalDocumentType === 'unknown'
    || (!denialReasonUnderstood && canonicalDocumentType === 'denial_remittance');

  if (requiresOriginalClaim) {
    missingEvidence.push('original_claim_document');
  }

  if (requiresAdditionalDocuments && !supportingDoc) {
    missingEvidence.push('additional_supporting_documents');
  }

  return {
    denial_reason_understood: denialReasonUnderstood,
    coverage_determinable_from_current_docs: coverageDeterminableFromCurrentDocs,
    requires_original_claim: requiresOriginalClaim,
    requires_additional_documents: requiresAdditionalDocuments,
    manual_review_required: manualReviewRequired,
    missing_evidence: Array.from(new Set(missingEvidence))
  };
}

function buildDocumentIntelligence({
  fileType,
  originalFilename,
  records,
  providerRecord = null,
  metadataOnly = false,
  parseStatus = null
}) {
  const identifierEvidence = extractIdentifierEvidence(records, providerRecord);
  const denialEvidence = extractDenialEvidence(records);
  const documentType = classifyDocumentType({
    fileType,
    originalFilename,
    identifiers: identifierEvidence,
    denialEvidence
  });
  const caseEvidence = assessCaseEvidence({
    canonicalDocumentType: documentType.canonical_document_type,
    identifiers: identifierEvidence,
    denialEvidence,
    metadataOnly,
    parseStatus
  });

  return {
    provider_id: normalizeText(providerRecord?.provider_id),
    canonical_document_type: normalizeDocumentType(documentType.canonical_document_type),
    document_type_source: normalizeText(documentType.document_type_source),
    association_status: metadataOnly
      ? (parseStatus === 'unsupported' ? 'unsupported' : 'metadata_only')
      : 'unresolved',
    associated_claim_id: null,
    denial_reason_understood: caseEvidence.denial_reason_understood,
    coverage_determinable_from_current_docs: caseEvidence.coverage_determinable_from_current_docs,
    requires_original_claim: caseEvidence.requires_original_claim,
    requires_additional_documents: caseEvidence.requires_additional_documents,
    manual_review_required: caseEvidence.manual_review_required,
    identifiers: identifierEvidence,
    denial_evidence: denialEvidence,
    case_evidence: {
      provider_scope_enforced: Boolean(providerRecord?.provider_id),
      association_status: metadataOnly
        ? (parseStatus === 'unsupported' ? 'unsupported' : 'metadata_only')
        : 'unresolved',
      associated_claim_id: null,
      associated_claim_ids: [],
      matched_existing_claim_ids: [],
      created_claim_ids: [],
      ambiguous_candidates: [],
      missing_evidence: caseEvidence.missing_evidence
    }
  };
}

function applyCaseAssociationEvidence(currentIntelligence = {}, updates = {}) {
  const nextCaseEvidence = {
    ...(currentIntelligence.case_evidence || {}),
    ...(updates.case_evidence || {})
  };
  const associationStatus = normalizeText(
    updates.association_status
    || nextCaseEvidence.association_status
    || currentIntelligence.association_status
    || 'unresolved'
  );
  const associatedClaimIds = Array.from(new Set(
    []
      .concat(nextCaseEvidence.associated_claim_ids || [])
      .concat(updates.associated_claim_ids || [])
      .map(value => normalizeText(value))
      .filter(Boolean)
  ));
  const matchedExistingClaimIds = Array.from(new Set(
    []
      .concat(nextCaseEvidence.matched_existing_claim_ids || [])
      .concat(updates.matched_existing_claim_ids || [])
      .map(value => normalizeText(value))
      .filter(Boolean)
  ));
  const createdClaimIds = Array.from(new Set(
    []
      .concat(nextCaseEvidence.created_claim_ids || [])
      .concat(updates.created_claim_ids || [])
      .map(value => normalizeText(value))
      .filter(Boolean)
  ));
  const ambiguousCandidates = Array.isArray(updates.ambiguous_candidates)
    ? updates.ambiguous_candidates
    : Array.isArray(nextCaseEvidence.ambiguous_candidates)
      ? nextCaseEvidence.ambiguous_candidates
      : [];
  const existingMissingEvidence = Array.isArray(nextCaseEvidence.missing_evidence)
    ? nextCaseEvidence.missing_evidence
    : [];
  const missingEvidence = Array.from(new Set(existingMissingEvidence));

  if (associationStatus === 'ambiguous' || associationStatus === 'partially_ambiguous') {
    missingEvidence.push('operator_case_association_review');
  }

  if (associationStatus === 'unresolved') {
    missingEvidence.push('claim_case_association');
  }

  const manualReviewRequired = normalizeBoolean(updates.manual_review_required)
    || normalizeBoolean(currentIntelligence.manual_review_required)
    || associationStatus === 'ambiguous'
    || associationStatus === 'partially_ambiguous'
    || associationStatus === 'unresolved';
  const associatedClaimId = normalizeText(
    updates.associated_claim_id
    || nextCaseEvidence.associated_claim_id
    || currentIntelligence.associated_claim_id
  );

  return {
    ...currentIntelligence,
    association_status: associationStatus || 'unresolved',
    associated_claim_id: associatedClaimId || (
      associatedClaimIds.length === 1 && associationStatus !== 'ambiguous' && associationStatus !== 'partially_ambiguous'
        ? associatedClaimIds[0]
        : null
    ),
    denial_reason_understood: normalizeBoolean(currentIntelligence.denial_reason_understood),
    coverage_determinable_from_current_docs: normalizeBoolean(currentIntelligence.coverage_determinable_from_current_docs),
    requires_original_claim: normalizeBoolean(currentIntelligence.requires_original_claim),
    requires_additional_documents: normalizeBoolean(currentIntelligence.requires_additional_documents),
    manual_review_required: manualReviewRequired,
    case_evidence: {
      ...nextCaseEvidence,
      association_status: associationStatus || 'unresolved',
      associated_claim_id: associatedClaimId || (
        associatedClaimIds.length === 1 && associationStatus !== 'ambiguous' && associationStatus !== 'partially_ambiguous'
          ? associatedClaimIds[0]
          : null
      ),
      associated_claim_ids: associatedClaimIds,
      matched_existing_claim_ids: matchedExistingClaimIds,
      created_claim_ids: createdClaimIds,
      ambiguous_candidates: ambiguousCandidates,
      missing_evidence: missingEvidence,
      provider_scope_enforced: updates.provider_scope_enforced !== undefined
        ? updates.provider_scope_enforced === true
        : currentIntelligence.case_evidence?.provider_scope_enforced === true
    }
  };
}

module.exports = {
  CANONICAL_DOCUMENT_TYPES,
  compareEntityNames,
  comparePatientNames,
  buildDocumentIntelligence,
  applyCaseAssociationEvidence,
  normalizeAmountForComparison,
  normalizeDateForComparison,
  normalizeEntityNameForComparison,
  normalizeIdentifierForComparison,
  normalizePatientNameForComparison
};
