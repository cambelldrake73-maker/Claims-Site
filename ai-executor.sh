#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

PENDING="$WORKSPACE/AI_PENDING.md"
RUNNING="$WORKSPACE/AI_RUNNING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
PLAN="$WORKSPACE/AI_PLAN.md"
LOG="$WORKSPACE/AI_LOG.md"

cd "$WORKSPACE"

echo "Checking for tasks..."

TASK=$(grep -v "#" "$PENDING" | head -n 1)

if [ -z "$TASK" ]; then
    echo "No tasks found."
    exit 0
fi

echo "Starting task: $TASK"

# remove from pending
sed -i '' "/$TASK/d" "$PENDING"

# move to running
echo "$TASK" >> "$RUNNING"

echo "Generating plan..."

echo "" >> "$PLAN"
echo "Task: $TASK" >> "$PLAN"
echo "- Analyze project structure" >> "$PLAN"
echo "- Identify files to modify" >> "$PLAN"
echo "- Apply safe improvement" >> "$PLAN"
echo "" >> "$PLAN"

# SAFE TEST ACTION
if echo "$TASK" | grep -iq "dashboard"; then

    echo "AI modifying dashboard..."

    echo "" >> dashboard.html
    echo "<!-- AI improvement: dashboard spacing -->" >> dashboard.html
    echo "<style> .panel{margin-bottom:30px;} </style>" >> dashboard.html

fi

echo "Logging work..."

echo "$(date): Completed task $TASK" >> "$LOG"

sleep 2

sed -i '' "/$TASK/d" "$RUNNING"
echo "$TASK" >> "$COMPLETED"

git add .
git commit -m "AI task completed: $TASK" 2>/dev/null

echo "Task completed."
