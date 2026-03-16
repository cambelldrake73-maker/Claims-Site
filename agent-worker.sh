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

echo "Generating AI suggestions..."
bash ai-suggest.sh

echo "Generating AI tasks..."
bash ai-task-maker.sh

echo "Checking for tasks..."
bash ai-executor.sh

# Auto-push if too many local commits are ahead of GitHub
COMMITS_AHEAD=$(git rev-list --count origin/ai-dev..HEAD 2>/dev/null)

if [ -n "$COMMITS_AHEAD" ] && [ "$COMMITS_AHEAD" -gt 50 ]; then
    echo "Pushing $COMMITS_AHEAD commits to GitHub..."
    git push origin ai-dev
fi
echo "Sleeping 30 seconds..."
sleep 30

done
