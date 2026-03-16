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
add_suggestion "- Add claims table column sorting"
add_suggestion "- Add claims table empty state UI"
add_suggestion "- Add mobile layout improvements to claims page"
add_suggestion "- Add top navigation consistency across pages"
add_suggestion "- Add dashboard quick action buttons"

# Backend / product suggestions
if [ -d "services" ]; then
    add_suggestion "- Add claims list API endpoint"
    add_suggestion "- Add mock claims JSON response for frontend wiring"
    add_suggestion "- Wire claims page to render fetched claim rows"
    add_suggestion "- Add claim status color mapping logic"
    add_suggestion "- Add denial reason field to mock claim payloads"
    add_suggestion "- Add claim detail HTML page scaffolding"
    add_suggestion "- Add claim detail route placeholder"
    add_suggestion "- Add upload form submission handler for submitted claims"
    add_suggestion "- Add dashboard summary metrics from mock claims data"
    add_suggestion "- Add basic review queue page scaffolding"
fi
echo "Suggestions refreshed."
