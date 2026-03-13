#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

cd "$WORKSPACE"

LAST_HASH=""

# --- AI usage controls ---
MAX_AI_CALLS_PER_DAY=20
AI_COUNTER_FILE="$WORKSPACE/.daily_api_calls"
AI_DATE_FILE=".ai_daily_date"

echo "AI worker starting..."

while true
do

echo "-----------------------------------"
echo "Syncing repo..."

git fetch origin ai-dev >/dev/null 2>&1
git pull origin ai-dev >/dev/null 2>&1

CURRENT_HASH=$(git rev-parse HEAD)

# ---------------------------
# RESET AI LIMIT DAILY
# ---------------------------

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

AI_CALLS=$(tail -n 1 "$AI_COUNTER_FILE" 2>/dev/null | tr -dc '0-9')
[ -z "$AI_CALLS" ] && AI_CALLS=0
# ---------------------------
# TASK EXECUTION FIRST
# ---------------------------

if [ -s "$WORKSPACE/AI_PENDING.md" ]; then

    echo "Tasks already queued — executing without AI."
    bash "$WORKSPACE/ai-executor.sh"

# ---------------------------
# GENERATE TASKS IF REPO CHANGED
# ---------------------------

elif [ "$CURRENT_HASH" != "$LAST_HASH" ]; then

    echo "Repo changed — checking AI limits..."

    # Refresh counter before checking limit
    AI_CALLS=$(tail -n 1 "$AI_COUNTER_FILE" 2>/dev/null | tr -dc '0-9')
    [ -z "$AI_CALLS" ] && AI_CALLS=0
    if [ "$AI_CALLS" -ge "$MAX_AI_CALLS_PER_DAY" ]; then
        echo "Daily AI limit reached — skipping AI generation."
    else

        echo "Running AI planner..."
        bash "$WORKSPACE/ai-planner.sh" || echo "Planner failed"

        echo "Generating tasks..."
        bash "$WORKSPACE/ai-task-maker.sh"

        DATE=$(date +%Y-%m-%d)
        NEW_COUNT=$((AI_CALLS+1))
        echo -e "$DATE\n$NEW_COUNT" > "$AI_COUNTER_FILE"

    fi

    LAST_HASH=$CURRENT_HASH

# ---------------------------
# FALLBACK ARCHITECTURE TASKS
# ---------------------------

else

    echo "No repo changes."

QUEUE_SIZE=$(grep -c "^-" "$WORKSPACE/AI_PENDING.md" 2>/dev/null || echo 0)

    if [ "$QUEUE_SIZE" -lt 10 ]; then
        echo "Queue low ($QUEUE_SIZE tasks) — generating architecture tasks..."

        if [ "$AI_CALLS" -ge "$MAX_AI_CALLS_PER_DAY" ]; then
            echo "Daily AI limit reached — skipping architecture planner."
        else

            bash "$WORKSPACE/ai-planner.sh"
            bash "$WORKSPACE/ai-architect.sh"
 
            DATE=$(date +%Y-%m-%d)
            NEW_COUNT=$((AI_CALLS+1))
            echo -e "$DATE\n$NEW_COUNT" > "$AI_COUNTER_FILE"
        fi
    fi

fi

# ---------------------------
# EXECUTE TASK BATCH
# ---------------------------

echo "Executing task batch..."

for i in {1..20}
do
    if [ -s "$WORKSPACE/AI_PENDING.md" ]; then
        bash "$WORKSPACE/ai-executor.sh"
    else
        echo "No tasks remaining."
        bash ~/.openclaw/workspace/claims-site/update-architecture-memory.sh
        break
    fi
done

echo "Sleeping 3 minutes..."
sleep 180

done
