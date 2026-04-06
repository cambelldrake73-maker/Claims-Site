const INTAKE_BATCHES = [];
const INTAKE_FILES = [];
const RAW_PARSE_RESULTS = [];

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getBatchById(batch_id) {
  return INTAKE_BATCHES.find(batch => batch.batch_id === batch_id) || null;
}

function getFileById(file_id) {
  return INTAKE_FILES.find(file => file.file_id === file_id) || null;
}

function getFilesForBatch(batch_id) {
  return INTAKE_FILES.filter(file => file.batch_id === batch_id);
}

function getParseResultsForFile(file_id) {
  return RAW_PARSE_RESULTS.filter(result => result.file_id === file_id);
}

function createBatch({ org_id } = {}) {
  const timestamp = Date.now();
  const batch = {
    batch_id: createId('batch'),
    org_id: org_id || null,
    status: 'uploaded',
    file_count: 0,
    parsed_file_count: 0,
    normalized_file_count: 0,
    case_count: 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  INTAKE_BATCHES.push(batch);
  return batch;
}

function updateBatchRollup(batch_id) {
  const batch = getBatchById(batch_id);
  if (!batch) return null;

  const files = getFilesForBatch(batch_id);
  batch.file_count = files.length;
  batch.parsed_file_count = files.filter(file => file.parse_status === 'parsed').length;
  batch.normalized_file_count = files.filter(file => file.normalization_status === 'normalized').length;

  batch.case_count = files.reduce((total, file) => {
    const results = getParseResultsForFile(file.file_id);
    return total + results.reduce((count, result) => count + (result.record_count || 0), 0);
  }, 0);

  if (files.length === 0) {
    batch.status = 'uploaded';
  } else if (files.some(file => file.parse_status === 'parse_failed')) {
    batch.status = 'partially_failed';
  } else if (files.every(file => file.normalization_status === 'normalized')) {
    batch.status = 'normalized';
  } else if (files.every(file => file.parse_status === 'parsed')) {
    batch.status = 'parsed';
  } else {
    batch.status = 'processing';
  }

  batch.updated_at = Date.now();
  return batch;
}

function addFileToBatch({ batch_id, file_name, file_type } = {}) {
  const timestamp = Date.now();
  const batch = getBatchById(batch_id);
  if (!batch) {
    throw new Error('batch_id is required and must reference an existing batch');
  }
  const fileRecord = {
    file_id: createId('file'),
    batch_id,
    file_name: file_name || 'unknown',
    file_type: file_type || 'json',
    upload_status: 'uploaded',
    parse_status: 'pending',
    normalization_status: 'pending',
    created_at: timestamp,
    updated_at: timestamp
  };

  INTAKE_FILES.push(fileRecord);
  updateBatchRollup(batch_id);
  return fileRecord;
}

function saveParseResult({ file_id, raw_records, parser_type = 'simple', source_pages = [] } = {}) {
  const timestamp = Date.now();
  const fileRecord = getFileById(file_id);
  if (!fileRecord) {
    throw new Error('file_id is required and must reference an existing file');
  }

  const safeRecords = Array.isArray(raw_records) ? raw_records : [];
  const parseStatus = safeRecords.length > 0 ? 'parsed' : 'parse_failed';

  const parseResult = {
    parse_result_id: createId('parse'),
    file_id,
    parser_type,
    source_pages: Array.isArray(source_pages) ? source_pages : [],
    raw_records: safeRecords,
    record_count: safeRecords.length,
    status: parseStatus,
    created_at: timestamp,
    updated_at: timestamp
  };

  RAW_PARSE_RESULTS.push(parseResult);
  setFileParseStatus(file_id, parseStatus);
  updateBatchRollup(fileRecord.batch_id);
  return parseResult;
}

function setFileParseStatus(file_id, parse_status) {
  const fileRecord = INTAKE_FILES.find(file => file.file_id === file_id);
  if (!fileRecord) return null;

  fileRecord.parse_status = parse_status;
  fileRecord.updated_at = Date.now();
  updateBatchRollup(fileRecord.batch_id);
  return fileRecord;
}

function setFileNormalizationStatus(file_id, normalization_status) {
  const fileRecord = INTAKE_FILES.find(file => file.file_id === file_id);
  if (!fileRecord) return null;

  fileRecord.normalization_status = normalization_status;
  fileRecord.updated_at = Date.now();
  updateBatchRollup(fileRecord.batch_id);
  return fileRecord;
}

module.exports = {
  INTAKE_BATCHES,
  INTAKE_FILES,
  RAW_PARSE_RESULTS,
  getBatchById,
  getFileById,
  getFilesForBatch,
  getParseResultsForFile,
  updateBatchRollup,
  createBatch,
  addFileToBatch,
  saveParseResult,
  setFileParseStatus,
  setFileNormalizationStatus
};
