
build a policy engine-backed access control layer (rbac/abac) that enforces field-level access to phi, ties into the authentication service and access_control registry, and emits auditable decisions to audit_log_service
create a claim ingestion api and upload gateway that accepts uploads, performs initial validation, metadata extraction, stores documents in document_proxy/document_storage, and enqueues parsing jobs to parser_router via job_queue
design and deploy a schema registry service as the canonical source of truth for claim data models, versioned schemas, and niche-specific schema loading hooks; integrate with parser_router and claim_normalization services
develop a parser router service that selects niche-specific parsers, invokes healthcare parsers for edi/x12/pdf extraction, normalizes outputs against the schema registry, and forwards normalized claims to claim_normalization and claim_ingestion services
implement a production-grade authentication service with oauth2/oidc support, token issuance, refresh/revocation endpoints, and integration with the policy engine and token_revocation service in the service registry
