#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

echo "AI worker starting..."

cd "$WORKSPACE"

while true
do
echo "-----------------------------------"
echo "Syncing repo..."

git fetch origin

git checkout ai-dev
git pull origin ai-dev

# Only refresh suggestions/tasks when queue is empty
if ! grep -qE '^- ' "$WORKSPACE/AI_PENDING.md"; then
    echo "Generating AI suggestions..."
    bash ai-suggest.sh

    echo "Generating AI tasks..."
    bash ai-task-maker.sh
else
    echo "Pending tasks already exist. Skipping suggestion refresh."
fi

# Execute up to 3 tasks per cycle
TASKS_RUN=0
while grep -qE '^- ' "$WORKSPACE/AI_PENDING.md" && [ "$TASKS_RUN" -lt 3 ]; do
    echo "Checking for tasks..."
    bash ai-executor.sh
    TASKS_RUN=$((TASKS_RUN+1))
done

# Auto-push if too many local commits are ahead of GitHub
COMMITS_AHEAD=$(git rev-list --count origin/ai-dev..HEAD 2>/dev/null)

if [ -n "$COMMITS_AHEAD" ] && [ "$COMMITS_AHEAD" -gt 10 ]; then
    echo "Pushing $COMMITS_AHEAD commits to GitHub..."
    git push origin ai-dev
fi

echo "Sleeping 5 seconds..."
sleep 5
done
