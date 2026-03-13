#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
ARCH_MEMORY="$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"

cd "$WORKSPACE"

echo "Generating AI tasks..."

touch "$PENDING"
touch "$COMPLETED"
touch "$ARCH_MEMORY"

# If tasks already exist, do nothing
if grep -q "^-" "$PENDING"; then
    echo "Task queue already populated."
    exit 0
fi

TMP_FILTER="$WORKSPACE/.ai_task_filter.tmp"

{
    if [ -f "$COMPLETED" ]; then
        sed 's/^- *//' "$COMPLETED" | tr '[:upper:]' '[:lower:]'
    fi
    if [ -f "$ARCH_MEMORY" ]; then
        cat "$ARCH_MEMORY"
    fi
} | sort -u > "$TMP_FILTER"

# Generate tasks from suggestions
if [ -f "$SUGGESTIONS" ]; then

    grep "^-" "$SUGGESTIONS" | \
    sed 's/^- *//' | \
    tr '[:upper:]' '[:lower:]' | \
    sort -u | \
    grep -Fvxf "$TMP_FILTER" | \
    head -n 8 | \
    sed 's/^/- /' >> "$PENDING"

    echo "Tasks generated."

    > "$SUGGESTIONS"

else
    echo "No suggestions file found."
fi

rm -f "$TMP_FILTER"
