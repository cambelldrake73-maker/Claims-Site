#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PENDING="$WORKSPACE/AI_PENDING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
cd "$WORKSPACE"

echo "Breaking architecture tasks into dev tasks..."

while IFS= read -r TASK
do


LOWER=$(echo "$TASK" | sed 's/^- *//' | tr '[:upper:]' '[:lower:]')

# Skip systems already implemented
if grep -Fqi "$LOWER" "$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"; then
    continue
fi
# Skip duplicate tasks already queued
if grep -Fxq -- "$TASK" "$PENDING"; then
    continue
fi

# Skip tasks already completed
if grep -Fxq -- "$TASK" "$COMPLETED"; then
    continue
fi
# AUTH / SECURITY
if [[ "$LOWER" == *"auth"* ]] || [[ "$LOWER" == *"oauth"* ]] || [[ "$LOWER" == *"rbac"* ]]; then

echo "- Create auth service folder" >> "$PENDING"
echo "- Implement authentication service configuration" >> "$PENDING"
echo "- Add login API endpoint" >> "$PENDING"
echo "- Implement JWT signing utility" >> "$PENDING"
echo "- Implement refresh token support" >> "$PENDING"
echo "- Add authentication middleware" >> "$PENDING"
echo "- Add RBAC permission checks" >> "$PENDING"
echo "- Implement role and permission models" >> "$PENDING"
echo "- Add audit logging for authentication events" >> "$PENDING"
echo "- Create authentication unit tests" >> "$PENDING"

# CLAIM PROCESSING
elif [[ "$LOWER" == *"claim"* ]] || [[ "$LOWER" == *"clearinghouse"* ]] || [[ "$LOWER" == *"denial"* ]] || [[ "$LOWER" == *"parsing"* ]] || [[ "$LOWER" == *"ingestion"* ]] || [[ "$LOWER" == *"integration"* ]] || [[ "$LOWER" == *"intelligence"* ]] || [[ "$LOWER" == *"edi"* ]]; then

echo "- Create claim ingestion service folder" >> "$PENDING"
echo "- Implement claim ingestion API endpoint" >> "$PENDING"
echo "- Implement claim parsing adapters (EDI, CSV, API)" >> "$PENDING"
echo "- Implement claim normalization pipeline" >> "$PENDING"
echo "- Add denial code reference table" >> "$PENDING"
echo "- Implement denial correction suggestion engine" >> "$PENDING"
echo "- Implement EDI 837 claim formatter" >> "$PENDING"
echo "- Implement claim validation and schema enforcement" >> "$PENDING"
echo "- Implement claim event lifecycle tracking" >> "$PENDING"
echo "- Create claim review dashboard API" >> "$PENDING"
echo "- Add claim processing unit tests" >> "$PENDING"
# DATABASE
elif [[ "$LOWER" == *"claim"* ]] || [[ "$LOWER" == *"clearinghouse"* ]] || [[ "$LOWER" == *"edi"* ]] || [[ "$LOWER" == *"denial"* ]] || [[ "$LOWER" == *"parsing"* ]] || [[ "$LOWER" == *"ingestion"* ]]; then

echo "- Create database schema file" >> "$PENDING"
echo "- Define claims table structure" >> "$PENDING"
echo "- Define patients table structure" >> "$PENDING"
echo "- Define claim_events table structure" >> "$PENDING"
echo "- Define denial_codes table structure" >> "$PENDING"
echo "- Define audit_logs table structure" >> "$PENDING"
echo "- Implement ORM models for database tables" >> "$PENDING"
echo "- Add database migration scripts" >> "$PENDING"
echo "- Implement database validation hooks" >> "$PENDING"
# DOCUMENT ACCESS
elif [[ "$LOWER" == *"document"* ]] || [[ "$LOWER" == *"file"* ]]; then

echo "- Create document proxy API endpoint" >> "$PENDING"
echo "- Implement signed URL generation" >> "$PENDING"
echo "- Implement document storage metadata model" >> "$PENDING"
echo "- Add document access logging" >> "$PENDING"
echo "- Implement document permission checks" >> "$PENDING"
echo "- Add document audit logging" >> "$PENDING"
# JOB / QUEUE
elif [[ "$LOWER" == *"queue"* ]] || [[ "$LOWER" == *"async"* ]] || [[ "$LOWER" == *"job"* ]]; then

echo "- Create jobs processing folder" >> "$PENDING"
echo "- Configure Redis connection" >> "$PENDING"
echo "- Implement background worker service" >> "$PENDING"
echo "- Implement job queue retry logic" >> "$PENDING"
echo "- Implement dead letter queue handling" >> "$PENDING"
echo "- Add job processing metrics and monitoring" >> "$PENDING"
echo "- Add worker health check endpoint" >> "$PENDING"
fi

done < "$SUGGESTIONS"

# Remove duplicate tasks
sort -u "$PENDING" -o "$PENDING"

echo "Architecture tasks decomposed."
