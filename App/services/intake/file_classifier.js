const path = require('path');

const FILE_TYPES = new Set([
  'era_835',
  'claim_csv',
  'spreadsheet',
  'pdf_document',
  'image_document',
  'json_data',
  'text_report',
  'unknown'
]);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getExtension(filename) {
  return normalizeText(path.extname(filename || '')).replace(/^\./, '');
}

function sniffEra835(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const header = buffer.slice(0, 4096).toString('utf8').replace(/\r/g, '\n');

  return /^ISA\*/.test(header)
    && (
      header.includes('GS*HP*')
      || header.includes('ST*835*')
      || header.includes('BPR*')
    );
}

function sniffBinarySignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf_document';
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) {
    return 'image_document';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image_document';
  }

  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00)
    || (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return 'image_document';
  }

  return null;
}

function classifyUploadedFile({ filename, mimeType, buffer } = {}) {
  const extension = getExtension(filename);
  const normalizedMimeType = normalizeText(mimeType);

  if (sniffEra835(buffer)) {
    return {
      file_type: 'era_835',
      source: 'header_sniff'
    };
  }

  if (['835', 'edi', 'x12'].includes(extension)) {
    return {
      file_type: 'era_835',
      source: 'extension'
    };
  }

  const binaryType = sniffBinarySignature(buffer);
  if (binaryType) {
    return {
      file_type: binaryType,
      source: 'header_sniff'
    };
  }

  if (extension === 'csv') {
    return { file_type: 'claim_csv', source: 'extension' };
  }

  if (['xlsx', 'xls'].includes(extension)) {
    return { file_type: 'spreadsheet', source: 'extension' };
  }

  if (extension === 'pdf') {
    return { file_type: 'pdf_document', source: 'extension' };
  }

  if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'bmp', 'webp'].includes(extension)) {
    return { file_type: 'image_document', source: 'extension' };
  }

  if (['json', 'jsonl'].includes(extension)) {
    return { file_type: 'json_data', source: 'extension' };
  }

  if (['txt', 'tsv'].includes(extension)) {
    return { file_type: 'text_report', source: 'extension' };
  }

  if (normalizedMimeType.includes('csv')) {
    return { file_type: 'claim_csv', source: 'mime_type' };
  }

  if (
    normalizedMimeType.includes('spreadsheetml')
    || normalizedMimeType.includes('excel')
    || normalizedMimeType.includes('sheet')
  ) {
    return { file_type: 'spreadsheet', source: 'mime_type' };
  }

  if (normalizedMimeType.includes('pdf')) {
    return { file_type: 'pdf_document', source: 'mime_type' };
  }

  if (normalizedMimeType.startsWith('image/')) {
    return { file_type: 'image_document', source: 'mime_type' };
  }

  if (normalizedMimeType.includes('json')) {
    return { file_type: 'json_data', source: 'mime_type' };
  }

  if (normalizedMimeType.startsWith('text/')) {
    return { file_type: 'text_report', source: 'mime_type' };
  }

  return {
    file_type: 'unknown',
    source: 'fallback'
  };
}

function normalizeClassifiedFileType(fileType) {
  const normalized = normalizeText(fileType);
  return FILE_TYPES.has(normalized) ? normalized : 'unknown';
}

module.exports = {
  classifyUploadedFile,
  normalizeClassifiedFileType,
  sniffBinarySignature,
  sniffEra835
};
