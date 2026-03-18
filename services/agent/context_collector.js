const fs = require('fs');
const path = require('path');

function safeRead(filePath, maxChars = 6000) {
  try {
    const fullPath = path.resolve(__dirname, '../../', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return `\n===== FILE: ${filePath} =====\n${content.slice(0, maxChars)}\n`;
  } catch (err) {
    return `\n===== FILE: ${filePath} =====\n[missing or unreadable]\n`;
  }
}

function safeTail(filePath, maxLines = 40) {
  try {
    const fullPath = path.resolve(__dirname, '../../', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    return `\n===== FILE: ${filePath} (tail ${maxLines}) =====\n${lines.slice(-maxLines).join('\n')}\n`;
  } catch (err) {
    return `\n===== FILE: ${filePath} =====\n[missing or unreadable]\n`;
  }
}

function collectContext() {
  const files = [
    'index.js',
    'services/claim_ingestion_api/index.js',
    'services/claim_ingestion_api/claim_model.js',
    'services/claim_ingestion_api/claim_ingest_endpoint.js',
    'services/ai/claim_summary_service.js',
    'services/claim_ingestion_api/claim_explanation_endpoint.js',
    'claims.html',
    'dashboard.html',
    'ai-executor.sh'
  ];

  let context = 'PROJECT CODE CONTEXT\n';

  files.forEach(file => {
    context += safeRead(file);
  });

  context += safeTail('AI_COMPLETED.md', 30);
  context += safeTail('AI_PENDING.md', 30);
  context += safeTail('AI_RUNNING.md', 30);

  return context;
}

module.exports = {
  collectContext
};
