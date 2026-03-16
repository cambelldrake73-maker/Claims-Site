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

echo "Sleeping 30 seconds..."
sleep 30

done
