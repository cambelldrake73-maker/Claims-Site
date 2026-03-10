#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"

cd "$WORKSPACE"

echo "Generating AI tasks..."

# ensure pending exists
touch "$PENDING"

# if pending already has tasks, do nothing
if grep -q "-" "$PENDING"; then
    echo "Task queue already populated."
    exit 0
fi

# if suggestions exist, filter them into executable tasks
if [ -f "$SUGGESTIONS" ]; then

    grep "^-" "$SUGGESTIONS" | \
    grep -iE "layout|ui|css|style|spacing|dashboard|table|badge|filter|search|responsive|sidebar|button|form" \
    >> "$PENDING"

    echo "Filtered tasks generated."

else
    echo "No suggestions file found."
fi
