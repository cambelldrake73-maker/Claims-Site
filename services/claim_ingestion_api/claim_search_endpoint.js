const express = require('express');
const router = express.Router();
const { all } = require('./db');

router.get('/search', async (req, res) => {
  try {
    const {
      status,
      payer,
      patient_name,
      patient,
      date_of_service_from,
      date_of_service_to
    } = req.query;

    let sql = 'SELECT * FROM claims WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND lower(status) = lower(?)';
      params.push(status);
    }

    if (payer) {
      sql += ' AND lower(payer) LIKE lower(?)';
      params.push(`%${payer}%`);
    }

    const patientQuery = patient_name || patient;
    if (patientQuery) {
      sql += ' AND lower(patient) LIKE lower(?)';
      params.push(`%${patientQuery}%`);
    }

    if (date_of_service_from) {
      sql += ' AND date_of_service >= ?';
      params.push(date_of_service_from);
    }

    if (date_of_service_to) {
      sql += ' AND date_of_service <= ?';
      params.push(date_of_service_to);
    }

    sql += ' ORDER BY created_at DESC';

    const claims = await all(sql, params);
    res.json({ ok: true, claims });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
