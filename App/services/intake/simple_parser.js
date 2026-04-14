/*
  ARCHITECTURE RULE:
  All ingestion MUST go through /services/pipeline/intake_pipeline.js
  Direct calls to parse/match/orchestrator/claim_model are forbidden.
*/

function parseRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('records must be an array');
  }

  return records.map((record, index) => {
    if (record === null || record === undefined) {
      throw new Error(`record at index ${index} is empty`);
    }

    if (Array.isArray(record)) {
      return [...record];
    }

    if (typeof record !== 'object') {
      throw new Error(`record at index ${index} must be an object or array`);
    }

    return { ...record };
  });
}

module.exports = { parseRecords };
