#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"
RUNNING="$WORKSPACE/AI_RUNNING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"

cd "$WORKSPACE" || exit 1

echo "Generating AI tasks..."

touch "$SUGGESTIONS" "$PENDING" "$RUNNING" "$COMPLETED"

if grep -qE '^- ' "$PENDING"; then
    echo "Pending already populated."
    exit 0
fi

echo "# Pending Tasks" > "$PENDING"

count=0
while IFS= read -r task; do
    [[ ! "$task" =~ ^- ]] && continue
    grep -Fxq -- "$task" "$COMPLETED" && continue
    grep -Fxq -- "$task" "$RUNNING" && continue
    grep -Fxq -- "$task" "$PENDING" && continue

    echo "$task" >> "$PENDING"
    count=$((count+1))
    [ "$count" -ge 5 ] && break
done < "$SUGGESTIONS"

if grep -qE '^- ' "$PENDING"; then
    echo "Tasks generated."
else
    echo "No new tasks to add."
fi
