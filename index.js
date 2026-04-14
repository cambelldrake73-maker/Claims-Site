const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  initializeDatabase
} = require('./App/services/claim_ingestion_api/db');
const authRouter = require('./App/services/auth/auth_endpoint');
const { ensureBootstrapOperatorFromEnv } = require('./App/services/auth/user_model');
const claimsApiRouter = require('./App/services/claim_ingestion_api');
const eraEndpointRouter = require('./App/services/claim_ingestion_api/era_endpoint');
const { requireOperatorRole } = require('./App/services/claim_ingestion_api/role_middleware');
const { authenticateRequest } = require('./App/services/auth/auth_middleware');
const app = express();
const PORT = 3000;
const WORKSPACE_ROOT = __dirname;
const STATIC_PUBLIC_ROOT = path.join(WORKSPACE_ROOT, 'public');
const ROOT_PUBLIC_JS = new Set();

function isSafeRootPublicFile(fileName) {
  if (!/^[A-Za-z0-9._-]+$/.test(String(fileName || ''))) {
    return false;
  }

  return fileName.endsWith('.html')
    || fileName.endsWith('.css')
    || ROOT_PUBLIC_JS.has(fileName);
}

app.use(cors());
app.use(express.json());
app.use('/api', authenticateRequest);
app.use('/api/auth', authRouter);
app.use('/api/era', requireOperatorRole, eraEndpointRouter);
app.use(claimsApiRouter);
app.use('/static', express.static(STATIC_PUBLIC_ROOT, {
  fallthrough: true,
  index: false,
  dotfiles: 'ignore',
  immutable: false
}));
initializeDatabase();

app.post('/api/intake/batch', requireOperatorRole, async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload'
  });
});

app.get('/api/intake/batches', requireOperatorRole, async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload and intake_files state'
  });
});

app.post('/api/intake/update-status', requireOperatorRole, async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: intake batch status is derived from durable intake file state'
  });
});
app.get('/api/intake/batch/:batch_id/files', requireOperatorRole, async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Deprecated: use /api/intake/upload and intake_files state'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(WORKSPACE_ROOT, 'Index.html'));
});

app.get('/:fileName', (req, res, next) => {
  const fileName = String(req.params.fileName || '');

  if (!isSafeRootPublicFile(fileName)) {
    return next();
  }

  return res.sendFile(path.join(WORKSPACE_ROOT, fileName), err => {
    if (err) {
      return next(err);
    }

    return undefined;
  });
});

async function startServer() {
  await ensureBootstrapOperatorFromEnv();

  app.listen(PORT, () => {
    console.log(`claims-site API listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to initialize server', err);
  process.exit(1);
});
