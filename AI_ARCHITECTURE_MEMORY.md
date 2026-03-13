
# Architecture Memory
access_control
audit_log_service
build a claim normalization microservice that transforms parsed claims into the canonical schema with per-field provenance, validation hooks, and migration tooling (standalone implementation)
build a claim replay & incident debugging service that can re-run claims through parsing/normalization/correction pipelines in an isolated sandbox with versioned schemas and replay controls (not implemented)
build a parser router microservice that selects pluggable parsers based on file type and schema, with idempotency, validation, and structured error reporting (new service)
build a token revocation service with immediate distributed blacklist propagation and admin revoke endpoints for jwt invalidation (distinct implementation not present in memory)
claim_ingestion
claim_normalization
claim_replay
clearinghouse_gateway
consent_service
correction_engine
document_proxy
job_queue
ml_scoring
observability
parser_router
policy_engine
schema_registry
token_revocation
build a claim normalization microservice that transforms parsed claims into the canonical schema with per-field provenance, validation hooks, and migration tooling (standalone implementation)
build a claim replay & incident debugging service that can re-run claims through parsing/normalization/correction pipelines in an isolated sandbox with versioned schemas and replay controls (not implemented)
build a parser router microservice that selects pluggable parsers based on file type and schema, with idempotency, validation, and structured error reporting (new service)
build a token revocation service with immediate distributed blacklist propagation and admin revoke endpoints for jwt invalidation (distinct implementation not present in memory)
