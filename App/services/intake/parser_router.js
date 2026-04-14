/*
  ARCHITECTURE RULE:
  All ingestion MUST go through /services/pipeline/intake_pipeline.js
  Direct calls to parse/match/orchestrator/claim_model are forbidden.
*/

const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');

const {
  classifyUploadedFile,
  normalizeClassifiedFileType
} = require('./file_classifier');
const { parseEra835File } = require('./era_835_parser');

const STRUCTURED_FILE_TYPES = new Set([
  'claim_csv',
  'spreadsheet',
  'json_data',
  'text_report',
  'era_835'
]);

function pickField(record, keys) {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }

  return undefined;
}

function sanitizeParsedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }

  return { ...record };
}

function sanitizeParsedRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('parsed records must be an array');
  }

  return records
    .map(sanitizeParsedRecord)
    .filter(Boolean);
}

function parseDelimitedTextBuffer(buffer, options = {}) {
  const content = Buffer.isBuffer(buffer)
    ? buffer.toString('utf8')
    : String(buffer || '');

  if (!content.trim()) {
    return [];
  }

  return parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    ...options
  });
}

function parseJsonBuffer(buffer) {
  const parsed = JSON.parse(
    Buffer.isBuffer(buffer) ? buffer.toString('utf8') : '{}'
  );

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.records)) {
    return parsed.records;
  }

  if (parsed && typeof parsed === 'object') {
    return [parsed];
  }

  return [];
}

function buildStructuredRoute(fileType, parserType, records, summary = null) {
  return {
    fileType,
    route: 'structured_claims',
    parserType,
    metadataOnly: false,
    parseStatus: 'parsed',
    records: sanitizeParsedRecords(records),
    summary
  };
}

function buildMetadataRoute(fileType, parseStatus, summary = null) {
  return {
    fileType,
    route: fileType === 'era_835' ? 'era_835' : 'metadata_only',
    parserType: fileType === 'era_835' ? 'era_835' : 'metadata_only',
    metadataOnly: true,
    parseStatus,
    records: [],
    summary
  };
}

function routeUploadedFile(file) {
  const classification = classifyUploadedFile({
    filename: file?.originalname,
    mimeType: file?.mimetype,
    buffer: file?.buffer
  });
  const fileType = normalizeClassifiedFileType(classification.file_type);

  switch (fileType) {
    case 'claim_csv':
      return buildStructuredRoute(
        fileType,
        'claim_csv',
        parseDelimitedTextBuffer(file?.buffer)
      );
    case 'spreadsheet': {
      const workbook = XLSX.read(file?.buffer, { type: 'buffer' });
      const firstSheetName = Array.isArray(workbook?.SheetNames)
        ? workbook.SheetNames[0]
        : null;

      if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
        throw new Error('No worksheet found in uploaded spreadsheet');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const records = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: false
      });

      return buildStructuredRoute(fileType, 'spreadsheet', records);
    }
    case 'json_data':
      return buildStructuredRoute(fileType, 'json_data', parseJsonBuffer(file?.buffer));
    case 'text_report':
      return buildStructuredRoute(
        fileType,
        'text_report',
        parseDelimitedTextBuffer(file?.buffer, {
          delimiter: [',', '\t', '|']
        })
      );
    case 'era_835': {
      const parsed835 = parseEra835File({ buffer: file?.buffer });
      const parsedRecords = Array.isArray(parsed835?.records)
        ? parsed835.records
        : [];

      if (parsedRecords.length > 0) {
        return buildStructuredRoute(
          fileType,
          'era_835',
          parsedRecords,
          parsed835?.summary || null
        );
      }

      return buildMetadataRoute(
        fileType,
        'metadata_only',
        parsed835?.summary || null
      );
    }
    case 'pdf_document':
    case 'image_document':
      return buildMetadataRoute(fileType, 'needs_manual_intake_review');
    case 'unknown':
    default:
      return buildMetadataRoute('unknown', 'unsupported');
  }
}

module.exports = {
  STRUCTURED_FILE_TYPES,
  routeUploadedFile
};
