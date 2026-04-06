const express = require('express');
const router = express.Router();

const {
  createBatch,
  addFileToBatch,
  saveParseResult,
  setFileParseStatus,
  setFileNormalizationStatus
} = require('./intake_store');
const { parseRecords } = require('./simple_parser');
const { normalizeRecords } = require('./normalizer');
const { routeCases } = require('./router');
const { addNormalizedCases } = require('../claim_ingestion_api/claim_model');

router.post('/api/intake/upload', async (req, res) => {
  let fileRecord = null;

  try {
    const { file_name, file_type, records, org_id } = req.body || {};

    if (!file_name || !Array.isArray(records)) {
      return res.status(400).json({
        ok: false,
        error: 'file_name and records array are required'
      });
    }

    const batch = createBatch({ org_id });
    fileRecord = addFileToBatch({
      batch_id: batch.batch_id,
      file_name,
      file_type: file_type || 'json'
    });

    setFileParseStatus(fileRecord.file_id, 'parsing');
    const rawRecords = parseRecords(records);
    saveParseResult({
      file_id: fileRecord.file_id,
      raw_records: rawRecords
    });

    const normalizedCases = normalizeRecords({
      raw_records: rawRecords,
      batch_id: batch.batch_id,
      file_id: fileRecord.file_id
    });

    const routedCases = routeCases(normalizedCases);
    const insertResult = await addNormalizedCases(routedCases);
    setFileNormalizationStatus(fileRecord.file_id, 'normalized');

    res.json({
      ok: true,
      batch_id: batch.batch_id,
      file_id: fileRecord.file_id,
      cases_created: insertResult.inserted
    });
  } catch (err) {
    if (fileRecord) {
      setFileParseStatus(fileRecord.file_id, 'parse_failed');
    }

    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
