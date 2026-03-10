#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Generating AI suggestions..."

# Create file if missing
touch "$SUGGESTIONS"

# Only generate if empty
if [ -s "$SUGGESTIONS" ]; then
    echo "Suggestions already exist."
    exit 0
fi

echo "# AI Suggestions" > "$SUGGESTIONS"
echo "" >> "$SUGGESTIONS"

echo "- Improve dashboard layout responsiveness" >> "$SUGGESTIONS"
echo "- Improve sidebar navigation spacing" >> "$SUGGESTIONS"
echo "- Improve login form UI alignment" >> "$SUGGESTIONS"
echo "- Add status badges to claims table" >> "$SUGGESTIONS"
echo "- Add filtering to claims table" >> "$SUGGESTIONS"

echo "Suggestions generated."
