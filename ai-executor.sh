#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

PENDING="$WORKSPACE/AI_PENDING.md"
RUNNING="$WORKSPACE/AI_RUNNING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
LOG="$WORKSPACE/AI_LOG.md"
PROTECTED="$WORKSPACE/PROTECTED_FILES.md"

cd "$WORKSPACE"

echo "Checking for tasks..."

# Ensure files exist
touch "$PENDING"
touch "$RUNNING"
touch "$COMPLETED"
touch "$LOG"

# Get next task
TASK=$(grep "-" "$PENDING" | head -n 1)

if [ -z "$TASK" ]; then
    echo "No tasks found."
    exit 0
fi

echo "Executing task: $TASK"

# Move task to RUNNING
grep -v -- "$TASK" "$PENDING" > tmp && mv tmp "$PENDING"
echo "$TASK" >> "$RUNNING"

########################################
# PROTECTED FILE CHECK
########################################

is_protected() {
    TARGET=$1

    if [ -f "$PROTECTED" ]; then
        while read LINE
        do
            if [[ "$TARGET" == *"$LINE"* ]]; then
                return 0
            fi
        done < "$PROTECTED"
    fi

    return 1
}

########################################
# SIMPLE EXECUTION ENGINE
########################################

# Example: improve dashboard spacing
if [[ "$TASK" == *"dashboard"* ]]; then

    TARGET="dashboard.html"

    if is_protected "$TARGET"; then
        echo "Skipping protected file: $TARGET"
        echo "$(date): Skipped protected file $TARGET" >> "$LOG"
    else
        echo "<!-- AI layout improvement -->" >> "$TARGET"
        echo "$(date): Updated $TARGET for layout improvement" >> "$LOG"
    fi

fi


# Example: sidebar improvements
if [[ "$TASK" == *"sidebar"* ]]; then

    TARGET="design-system.css"

    if is_protected "$TARGET"; then
        echo "Skipping protected file: $TARGET"
        echo "$(date): Skipped protected file $TARGET" >> "$LOG"
    else
        echo "/* AI sidebar improvement */" >> "$TARGET"
        echo "$(date): Updated sidebar styles" >> "$LOG"
    fi

fi


########################################
# COMPLETE TASK
########################################

grep -v "$TASK" "$RUNNING" > tmp && mv tmp "$RUNNING"
echo "$TASK" >> "$COMPLETED"

echo "$(date): Completed task $TASK" >> "$LOG"

########################################
# COMMIT
########################################

git add .
git commit -m "AI task completed: $TASK" >/dev/null 2>&1

echo "Task completed."
