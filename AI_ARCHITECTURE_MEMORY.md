
build a policy engine-backed access control layer (rbac/abac) that enforces field-level access to phi, ties into the authentication service and access_control registry, and emits auditable decisions to audit_log_service
create a claim ingestion api and upload gateway that accepts uploads, performs initial validation, metadata extraction, stores documents in document_proxy/document_storage, and enqueues parsing jobs to parser_router via job_queue
design and deploy a schema registry service as the canonical source of truth for claim data models, versioned schemas, and niche-specific schema loading hooks; integrate with parser_router and claim_normalization services
