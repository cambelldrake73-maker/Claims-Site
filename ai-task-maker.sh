#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"

cd "$WORKSPACE"

echo "Generating AI tasks..."

# ensure files exist
touch "$PENDING"
touch "$COMPLETED"

# if pending already has real tasks, do nothing
if grep -qE '^- ' "$PENDING"; then
    echo "Task queue already populated."
    exit 0
fi

# rebuild pending cleanly
echo "# Pending Tasks" > "$PENDING"

# if suggestions exist, convert only new suggestions into tasks
if [ -f "$SUGGESTIONS" ]; then
    while IFS= read -r task; do
        # only process markdown bullet tasks
        if echo "$task" | grep -qE '^- '; then
            # skip if task already completed
            if grep -Fxq -- "$task" "$COMPLETED"; then
                continue
            fi

            # skip if task already in pending
            if grep -Fxq -- "$task" "$PENDING"; then
                continue
            fi

            echo "$task" >> "$PENDING"
        fi
    done < "$SUGGESTIONS"

    if grep -qE '^- ' "$PENDING"; then
        echo "Tasks generated."
    else
        echo "No new tasks to add."
    fi
else
    echo "No suggestions file found."
fi
