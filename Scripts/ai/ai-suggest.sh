#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

cd "$WORKSPACE" || exit 1

echo "Generating AI suggestions via Claude..."

touch AI_SUGGESTIONS.md AI_COMPLETED.md AI_PENDING.md AI_RUNNING.md

node services/agent/write_suggestions.js

echo "Suggestions refreshed."
