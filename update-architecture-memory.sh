#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

COMPLETED="$WORKSPACE/AI_COMPLETED.md"
MEMORY="$WORKSPACE/AI_ARCHITECTURE_MEMORY.md"

echo "Updating architecture memory..."

touch "$COMPLETED"
touch "$MEMORY"

grep -Ei "service|engine|pipeline|microservice|gateway|formatter|queue|schema|model|router|adapter|authentication|ingestion|review|analytics|tracing|monitor" "$COMPLETED" | \
sed 's/^- *//' | \
tr '[:upper:]' '[:lower:]' | \
tr '_' ' '
sed 's/[^a-z0-9 ]//g' | \
awk '
{
    if ($0 ~ /authentication/) print "authentication_service";
    else if ($0 ~ /token revocation/) print "token_revocation";
    else if ($0 ~ /policy engine/) print "policy_engine";
    else if ($0 ~ /access control/) print "access_control";
    else if ($0 ~ /audit/) print "audit_log_service";
    else if ($0 ~ /schema registry/) print "schema_registry";
    else if ($0 ~ /claim ingestion/) print "claim_ingestion_api";
    else if ($0 ~ /upload gateway/) print "upload_gateway";
    else if ($0 ~ /parser router/ || $0 ~ /parser/) print "parser_router";
    else if ($0 ~ /document storage/ || $0 ~ /document proxy/) print "document_storage";
    else if ($0 ~ /claim bundle validator/) print "claim_bundle_validator";
    else if ($0 ~ /canonical claim schema/) print "canonical_claim_schema";
    else if ($0 ~ /claim normalization/) print "claim_normalization";
    else if ($0 ~ /claim enrichment/) print "claim_enrichment";
    else if ($0 ~ /claim deduplication/) print "claim_deduplication";
    else if ($0 ~ /denial intelligence/) print "denial_intelligence_engine";
    else if ($0 ~ /payer rule/) print "payer_rule_engine";
    else if ($0 ~ /denial reason classifier/) print "denial_reason_classifier";
    else if ($0 ~ /recoverability scoring/) print "recoverability_scoring_model";
    else if ($0 ~ /correction suggestion/) print "correction_suggestion_engine";
    else if ($0 ~ /review workflow/) print "review_workflow_service";
    else if ($0 ~ /approval queue/) print "approval_queue_service";
    else if ($0 ~ /clearinghouse adapter/) print "clearinghouse_adapter_framework";
    else if ($0 ~ /edi formatter/) print "edi_formatter";
    else if ($0 ~ /claim submission/) print "claim_submission_gateway";
    else if ($0 ~ /resubmission retry/) print "resubmission_retry_service";
    else if ($0 ~ /submission status/) print "submission_status_tracker";
    else if ($0 ~ /claims dashboard api/) print "claims_dashboard_api";
    else if ($0 ~ /review queue api/) print "review_queue_api";
    else if ($0 ~ /document viewer api/) print "document_viewer_api";
    else if ($0 ~ /analytics api/) print "analytics_api";
    else if ($0 ~ /claims dashboard ui/) print "claims_dashboard_ui";
    else if ($0 ~ /claim review ui/) print "claim_review_ui";
    else if ($0 ~ /submission status ui/) print "submission_status_ui";
    else if ($0 ~ /denial analysis ui/) print "denial_analysis_ui";
    else if ($0 ~ /analytics dashboard ui/) print "analytics_dashboard_ui";
    else if ($0 ~ /claim upload ui/) print "claim_upload_ui";
    else if ($0 ~ /job queue/) print "job_queue";
    else if ($0 ~ /distributed tracing/) print "distributed_tracing";
    else if ($0 ~ /metrics pipeline/) print "metrics_pipeline";
    else if ($0 ~ /incident replay/) print "incident_replay_service";
    else if ($0 ~ /system health monitor/) print "system_health_monitor";
    else if ($0 ~ /revenue recovery analytics/) print "revenue_recovery_analytics";
    else if ($0 ~ /payer denial trends/) print "payer_denial_trends";
    else if ($0 ~ /model training pipeline/) print "model_training_pipeline";
    else if ($0 ~ /performance reporting/) print "performance_reporting";
}
' > "$MEMORY"

sort -u "$MEMORY" -o "$MEMORY"

echo "Architecture memory updated."
