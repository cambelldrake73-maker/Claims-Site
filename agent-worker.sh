#!/bin/bash

cd ~/.openclaw/workspace/claims-site

echo "AI worker starting..."

git pull origin main

echo "Running OpenClaw improvement task..."

curl -s http://127.0.0.1:18789/api/agents/main/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Improve the claims portal UI following AGENT_RULES.md."
  }'

echo "Saving improvements..."

git add .
git commit -m "OpenClaw automated improvement"
git push origin main

echo "AI worker finished."
