#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
PENDING="$WORKSPACE/AI_PENDING.md"

cd "$WORKSPACE"

echo "Generating AI suggestions..."

touch "$SUGGESTIONS"
touch "$COMPLETED"
touch "$PENDING"

# Rebuild suggestions fresh each cycle
echo "# AI Suggestions" > "$SUGGESTIONS"
echo "" >> "$SUGGESTIONS"

add_suggestion() {
    local task="$1"

    # skip if already completed
    if grep -Fxq -- "$task" "$COMPLETED"; then
        return
    fi

    # skip if already pending
    if grep -Fxq -- "$task" "$PENDING"; then
        return
    fi

    # skip if already suggested in this run
    if grep -Fxq -- "$task" "$SUGGESTIONS"; then
        return
    fi

    echo "$task" >> "$SUGGESTIONS"
}

# Frontend suggestions
add_suggestion "- Improve dashboard layout responsiveness"
add_suggestion "- Improve sidebar navigation spacing"
add_suggestion "- Improve login form UI alignment"
add_suggestion "- Add status badges to claims table"
add_suggestion "- Add filtering to claims table"

# Backend / product suggestions
if [ -d "services" ]; then
    add_suggestion "- Connect claims table to backend data"
    add_suggestion "- Add claim search endpoint"
    add_suggestion "- Add claim status API wiring"
    add_suggestion "- Add denial reason display to claims page"
    add_suggestion "- Build claim review workflow UI"
    add_suggestion "- Add upload-to-parser flow for submitted claims"
    add_suggestion "- Add claim detail page scaffolding"
    add_suggestion "- Add reporting summary cards to dashboard"
fi

echo "Suggestions refreshed."
