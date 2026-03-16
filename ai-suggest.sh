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
add_suggestion "- Add claim row click navigation to detail page"
add_suggestion "- Add denial reason display to claims table rows"
add_suggestion "- Hide claims empty state when claim rows exist"
add_suggestion "- Add loading state to claims page"
add_suggestion "- Style dashboard summary metric cards"
add_suggestion "- Add review queue item styling"
add_suggestion "- Add upload success message to submit claims page"

# Backend / product suggestions
if [ -d "services" ]; then
    add_suggestion "- Add claim detail page data rendering"
    add_suggestion "- Add mock claim detail JSON payload"
    add_suggestion "- Add claim detail API endpoint"
    add_suggestion "- Add claim search UI wiring"
    add_suggestion "- Add review queue data rendering from claims API"
    add_suggestion "- Add denied claims summary metric"
    add_suggestion "- Add pending review summary metric"
    add_suggestion "- Add claim count badge to dashboard"
fi
echo "Suggestions refreshed."
