#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
LOCKFILE="/tmp/openclaw-worker.lock"

if [ -f "$LOCKFILE" ]; then
    echo "Worker already running."
    exit 0
fi

touch "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

echo "AI worker starting..."

cd "$WORKSPACE" || exit 1

while true
do
echo "-----------------------------------"
echo "Syncing repo..."
git fetch origin ai-dev
git checkout ai-dev

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Local changes detected. Skipping hard reset."
else
    git reset --hard origin/ai-dev
fi

if ! grep -qE '^- ' "$WORKSPACE/AI_PENDING.md" && ! grep -qE '^- ' "$WORKSPACE/AI_RUNNING.md"; then
    echo "Generating AI suggestions..."
    bash ai-suggest.sh

    echo "Generating AI tasks..."
    bash ai-task-maker.sh
else
    echo "Work already queued or running."
fi

TASKS_RUN=0
while grep -qE '^- ' "$WORKSPACE/AI_PENDING.md" && [ "$TASKS_RUN" -lt 3 ]; do
    echo "Checking for tasks..."
    bash ai-executor.sh
    TASKS_RUN=$((TASKS_RUN+1))
done

COMMITS_AHEAD=$(git rev-list --count origin/ai-dev..HEAD 2>/dev/null | awk '{print $1}')
COMMITS_AHEAD=${COMMITS_AHEAD:-0}

if [[ "$COMMITS_AHEAD" =~ ^[0-9]+$ ]] && [ "$COMMITS_AHEAD" -gt 5 ]; then
    echo "Pushing $COMMITS_AHEAD commits to GitHub..."
    git push origin ai-dev
fi

if ! grep -qE '^- ' "$WORKSPACE/AI_PENDING.md" && ! grep -qE '^- ' "$WORKSPACE/AI_RUNNING.md"; then
    echo "Idle. Sleeping 60 seconds..."
    sleep 60
else
    echo "Active work remains. Sleeping 15 seconds..."
    sleep 15
fi
done
