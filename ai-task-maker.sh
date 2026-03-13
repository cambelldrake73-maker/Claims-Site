#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
ARCH_MEMORY="$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"

cd "$WORKSPACE"

echo "Generating AI tasks..."

touch "$PENDING"

# If tasks already exist, do nothing
if grep -q "^-" "$PENDING"; then
    echo "Task queue already populated."
    exit 0
fi

# Generate tasks from suggestions
if [ -f "$SUGGESTIONS" ]; then

    grep "^-" "$SUGGESTIONS" | \
    sed 's/^- *//' | \
    tr '[:upper:]' '[:lower:]' | \
    sort -u | \
    grep -Fvxf <(
        if [ -f "$COMPLETED" ]; then
            sed 's/^- *//' "$COMPLETED" | tr '[:upper:]' '[:lower:]'
        fi
        if [ -f "$ARCH_MEMORY" ]; then
            cat "$ARCH_MEMORY"
        fi
    ) | \
    head -n 8 | \
    sed 's/^/- /' >> "$PENDING"

    echo "Tasks generated."

    # Clear suggestions so they aren't reused
    > "$SUGGESTIONS"

else
    echo "No suggestions file found."
fi
