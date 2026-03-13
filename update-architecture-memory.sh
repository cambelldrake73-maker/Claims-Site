#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

COMPLETED="$WORKSPACE/AI_COMPLETED.md"
MEMORY="$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"

# Rebuild architecture memory cleanly
echo "# Architecture Memory" > "$MEMORY"
echo "" >> "$MEMORY"
echo "Systems implemented:" >> "$MEMORY"

grep -Ei "service|engine|pipeline|microservice|gateway|formatter|proxy|queue" "$COMPLETED" \
| sed 's/^- *//' \
| sort -u \
>> "$MEMORY"
echo "Architecture memory updated."
