const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const claimIngestionRouter = require('./services/claim_ingestion_api');

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'claims-site API running' });
});

app.use('/api/claims', claimIngestionRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`claims-site API listening on port ${PORT}`);
});

