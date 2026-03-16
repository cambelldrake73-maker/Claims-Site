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

# Stage only safe files (prevent backend deletion)
git add dashboard.html *.html *.css *.js AI_*.md ai-executor.sh
# Abort if protected files were deleted
if git diff --cached --name-status | grep -E "^D\s+(services/|package.json|agent-worker.sh|ai-executor.sh)"; then
    echo "Protected file deletion detected. Aborting commit."
    git reset
    exit 1
fi

git commit -m "AI task completed: $TASK" 2>/dev/null
echo "Task completed."
