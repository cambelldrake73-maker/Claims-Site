
build schema_registry as a centralized service (api + versioned store) for canonical_claim_schema and niche-specific schemas; include schema validation endpoints and integration points for parser_router and claim_ingestion.
create claim_ingestion api and upload_gateway: secure file upload endpoints (multipart + streaming), inbound validation, immediate enqueueing to job_queue, and hooks to document_proxy for storage.
create correction_suggestion_engine and review_workflow_service: generate suggested corrections, manage human review queues, provide approval_queue_service integration, and persist change events to claim_replay and audit_log_service.
