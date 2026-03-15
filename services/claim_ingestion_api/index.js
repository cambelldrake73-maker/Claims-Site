const express = require('express');
const router = express.Router();

router.post('/ingest', async (req, res) => {
  return res.status(501).json({ message: 'claim ingestion not implemented yet' });
});

module.exports = router;
