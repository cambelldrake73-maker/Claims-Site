#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

COMPLETED="$WORKSPACE/AI_COMPLETED.md"
MEMORY="$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"

echo "Updating architecture memory..."

touch "$MEMORY"

grep -Ei "service|engine|pipeline|microservice|gateway|formatter|queue|schema|model" "$COMPLETED" |
sed 's/^- *//' |
tr '[:upper:]' '[:lower:]' |
sed 's/[^a-z0-9 ]//g' |
awk '{
    if ($0 ~ /schema registry/) print "schema_registry";
    else if ($0 ~ /token revocation/) print "token_revocation";
    else if ($0 ~ /policy engine/) print "policy_engine";
    else if ($0 ~ /claim normalization/) print "claim_normalization";
    else if ($0 ~ /claim replay/) print "claim_replay";
    else if ($0 ~ /access control/) print "access_control";
    else if ($0 ~ /consent/) print "consent_service";
    else if ($0 ~ /audit/) print "audit_log_service";
    else if ($0 ~ /job queue/) print "job_queue";
    else if ($0 ~ /parser/) print "parser_router";
}' >> "$MEMORY"

sort -u "$MEMORY" -o "$MEMORY"

echo "Architecture memory updated."
