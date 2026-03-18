const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const claimIngestionRouter = require('./services/claim_ingestion_api');
const { initializeDatabase } = require('./services/claim_ingestion_api/db');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'claims-site API running' });
});

app.use('/api/claims', claimIngestionRouter);

const PORT = process.env.PORT || 3000;

initializeDatabase();

app.listen(PORT, () => {
  console.log(`claims-site API listening on port ${PORT}`);
});
