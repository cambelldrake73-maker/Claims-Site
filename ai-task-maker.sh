#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"

cd "$WORKSPACE"

echo "Generating AI tasks..."

touch "$PENDING"

# If tasks already exist, do nothing
if grep -q "-" "$PENDING"; then
    echo "Task queue already populated."
    exit 0
fi

# Generate tasks from suggestions
if [ -f "$SUGGESTIONS" ]; then

    grep "^-" "$SUGGESTIONS" | \
    grep -vi "error" | \
    grep -vi "api" | \
    grep -vi "message" | \
    head -n 8 >> "$PENDING"
    
    echo "Tasks generated."

else
    echo "No suggestions file found."
fi
