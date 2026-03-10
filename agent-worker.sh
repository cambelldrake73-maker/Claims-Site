
#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

cd "$WORKSPACE"

LAST_HASH=""

echo "AI worker starting..."

while true
do

    echo "-----------------------------------"
    echo "Syncing repo..."

    git fetch origin ai-dev >/dev/null 2>&1
    git pull origin ai-dev >/dev/null 2>&1

    CURRENT_HASH=$(git rev-parse HEAD)

    if [ "$CURRENT_HASH" != "$LAST_HASH" ] || [ -s AI_PENDING.md ]; then

        echo "Changes detected or tasks pending."

        echo "Generating AI suggestions..."
        bash ai-suggest.sh

        echo "Generating AI tasks..."
        bash ai-task-maker.sh

        echo "Executing tasks..."
        bash ai-executor.sh

        LAST_HASH=$CURRENT_HASH

    else
        echo "No repo changes. Sleeping."
    fi

    sleep 60

done
