#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

cd "$WORKSPACE"

LAST_HASH=""

# --- AI usage controls ---
MAX_AI_CALLS_PER_DAY=20
AI_COUNTER_FILE=".ai_daily_count"
AI_DATE_FILE=".ai_daily_date"

echo "AI worker starting..."

while true
do

echo "-----------------------------------"
echo "Syncing repo..."

git fetch origin ai-dev >/dev/null 2>&1
git pull origin ai-dev >/dev/null 2>&1

CURRENT_HASH=$(git rev-parse HEAD)

# Reset AI counter if new day
TODAY=$(date +%F)

if [ -f "$AI_DATE_FILE" ]; then
    LAST_DATE=$(cat "$AI_DATE_FILE")
else
    LAST_DATE=""
fi

if [ "$TODAY" != "$LAST_DATE" ]; then
    echo 0 > "$AI_COUNTER_FILE"
    echo "$TODAY" > "$AI_DATE_FILE"
fi

AI_CALLS=$(cat "$AI_COUNTER_FILE" 2>/dev/null || echo 0)

# ---------------------------
# TASK EXECUTION FIRST
# ---------------------------

if [ -s AI_PENDING.md ]; then

    echo "Tasks already queued — executing without AI."
    bash ai-executor.sh

# ---------------------------
# GENERATE NEW TASKS
# ---------------------------

elif [ "$CURRENT_HASH" != "$LAST_HASH" ]; then

    echo "Repo changed — checking AI limits..."

    if [ "$AI_CALLS" -ge "$MAX_AI_CALLS_PER_DAY" ]; then
        echo "Daily AI limit reached — skipping AI generation."
    else

        echo "Running AI planner..."
        bash ai-planner.sh || echo "Planner failed"

        echo "Running AI suggestions..."
        bash ai-suggest.sh || echo "Suggest failed"

        echo "Generating tasks..."
        bash ai-task-maker.sh

        echo $((AI_CALLS+1)) > "$AI_COUNTER_FILE"

    fi

    LAST_HASH=$CURRENT_HASH

else
    echo "No repo changes."
fi

echo "Executing task batch..."

for i in {1..10}
do
    if [ -s "$WORKSPACE/AI_PENDING.md" ]; then
        bash "$WORKSPACE/ai-executor.sh"
    else
        echo "No tasks remaining."
        break
    fi
done

echo "Sleeping 3 minutes..."
sleep 180

done
