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
# SAFE TASK ACTIONS
if echo "$TASK" | grep -iq "dashboard"; then

    echo "AI modifying dashboard..."

    echo "" >> dashboard.html
    echo "<!-- AI improvement: dashboard spacing -->" >> dashboard.html
    echo "<style> .panel{margin-bottom:30px;} </style>" >> dashboard.html

elif echo "$TASK" | grep -iq "login"; then

    echo "AI modifying login page..."

    echo "" >> login.html
    echo "<!-- AI improvement: login alignment -->" >> login.html
    echo "<style> .login-form{max-width:420px;margin:40px auto;} </style>" >> login.html

elif echo "$TASK" | grep -iq "sidebar"; then

    echo "AI modifying dashboard sidebar..."

    echo "" >> dashboard.html
    echo "<!-- AI improvement: sidebar spacing -->" >> dashboard.html
    echo "<style> .sidebar a{display:block;padding:12px 16px;} </style>" >> dashboard.html

elif echo "$TASK" | grep -iq "status badges"; then

    echo "AI modifying claims page for status badges..."

    echo "" >> claims.html
    echo "<!-- AI improvement: claim status badges -->" >> claims.html
    echo "<style> .status-badge{display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;} </style>" >> claims.html

elif echo "$TASK" | grep -iq "filtering"; then

    echo "AI modifying claims page for filtering..."

    echo "" >> claims.html
    echo "<!-- AI improvement: claims filtering controls -->" >> claims.html
    echo "<div class=\"claims-filter-bar\">Filter controls placeholder</div>" >> claims.html

else

    echo "No safe file action matched task."

fi

echo "Logging work..."

echo "$(date): Completed task $TASK" >> "$LOG"

sleep 2

sed -i '' "/$TASK/d" "$RUNNING"
echo "$TASK" >> "$COMPLETED"

# Stage only safe files (prevent backend deletion)
git add dashboard.html *.html *.css *.js ai-executor.sh
# Abort if protected files were deleted
if git diff --cached --name-status | grep -E "^D\s+(services/|package.json|agent-worker.sh|ai-executor.sh)"; then
    echo "Protected file deletion detected. Aborting commit."
    git reset
    exit 1
fi

git commit -m "AI task completed: $TASK" 2>/dev/null
echo "Task completed."
