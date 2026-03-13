
build schema_registry as a centralized service (api + versioned store) for canonical_claim_schema and niche-specific schemas; include schema validation endpoints and integration points for parser_router and claim_ingestion.
create claim_ingestion api and upload_gateway: secure file upload endpoints (multipart + streaming), inbound validation, immediate enqueueing to job_queue, and hooks to document_proxy for storage.
