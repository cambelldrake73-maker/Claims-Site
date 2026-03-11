#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"

cd "$WORKSPACE"

echo "Breaking architecture tasks into dev tasks..."

while IFS= read -r TASK
do

LOWER=$(echo "$TASK" | tr '[:upper:]' '[:lower:]')

# AUTH / SECURITY
if [[ "$LOWER" == *"auth"* ]] || [[ "$LOWER" == *"oauth"* ]] || [[ "$LOWER" == *"rbac"* ]]; then

echo "- Create auth service folder" >> "$PENDING"
echo "- Add login API endpoint" >> "$PENDING"
echo "- Implement JWT signing utility" >> "$PENDING"
echo "- Add authentication middleware" >> "$PENDING"
echo "- Add RBAC permission checks" >> "$PENDING"

# DATABASE
elif [[ "$LOWER" == *"data"* ]] || [[ "$LOWER" == *"database"* ]] || [[ "$LOWER" == *"model"* ]]; then

echo "- Create database schema file" >> "$PENDING"
echo "- Define claims table structure" >> "$PENDING"
echo "- Define patients table structure" >> "$PENDING"
echo "- Define claim_events table structure" >> "$PENDING"
echo "- Add migration scripts" >> "$PENDING"

# DOCUMENT ACCESS
elif [[ "$LOWER" == *"document"* ]] || [[ "$LOWER" == *"file"* ]]; then

echo "- Create document proxy API endpoint" >> "$PENDING"
echo "- Implement signed URL generation" >> "$PENDING"
echo "- Add document access logging" >> "$PENDING"

# JOB / QUEUE
elif [[ "$LOWER" == *"queue"* ]] || [[ "$LOWER" == *"async"* ]] || [[ "$LOWER" == *"job"* ]]; then

echo "- Create jobs processing folder" >> "$PENDING"
echo "- Configure Redis connection" >> "$PENDING"
echo "- Implement background worker service" >> "$PENDING"

fi

done < "$SUGGESTIONS"

echo "Architecture tasks decomposed."
