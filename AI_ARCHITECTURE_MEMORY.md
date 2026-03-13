# Architecture Memory

Systems implemented:
Build a Clearinghouse Integration Gateway: transactional adapter pattern (sandbox/prod adapters), submission queue with retries/DLQ, idempotency keys, and per-submission audit/logging.  
Build a secure Clearinghouse Integration & Compliance microservice: EDI (837) validator/formatter, multi-adapter transactional gateway with sandbox/test harness, KMS-backed encryption for at-rest/in-transit payloads, strict RBAC and immutable submission audit trails, submission retry/rollback semantics, and SLA/health monitoring.  
Build an automated CI test harness and contract-testing pipeline: end-to-end integration tests for the claims parsing→correction→submission flow using synthetic HIPAA-safe data, adapter contract tests for clearinghouse/document/invoice proxies, and gated release pipelines to prevent regressions
Create a Claim Normalization Service and canonical data model: versioned normalization rules, transformers for disparate payer formats, and a mapping repository with automated tests.  
Create a secure document access microservice that issues signed, time-limited URLs for files in protected directories and logs every access without modifying the files.
Create auth service folder
Create claim ingestion service folder
Create document proxy API endpoint
Create monitoring service folder
Deliver a full GitOps CI/CD and infrastructure-as-code platform for safe, auditable deployments and compliance: Terraform/CloudFormation modules for infra, pipeline templates (GitHub Actions/GitLab CI) enforcing unit/integration/contract/e2e tests, DB migration orchestration with pre/post checks and safe migration strategies (canary
Design and implement a dedicated Claim Parsing Microservice: pluggable parsers for common claim formats, strict schema validation, idempotent processing, and unit/integration tests.  
Design and implement a resilient asynchronous claim processing pipeline: centralized job queue with idempotent workers, dead-letter queues, exponential-backoff retries, distributed tracing, per-job metrics, automated horizontal scaling, and end-to-end claim lifecycle event tracing.
Implement a Claim Correction Suggestion Engine: generate proposed edits with confidence scores, human-in-the-loop review workflow, and immutable audit trail for all suggestions.  
Implement a resilient Clearinghouse Integration & Submission Service (transactional adapter pattern with sandbox/production adapters, submission queue with DLQ and exponential backoff, KMS-backed encryption for in-transit/at-rest, immutable audit trails, per-submission distributed tracing/OpenTelemetry, and SLA/health monitoring)
Implement a resilient, idempotent asynchronous claim processing pipeline: central durable job queue (Redis/NSQ/SQS), idempotent worker patterns, dead-letter queues, exponential-backoff retries, per-job metrics, distributed tracing (OpenTelemetry), structured tracing/span propagation, DLQ alerting, and automated horizontal scaling rules.  
Implement a secure Clearinghouse Integration & Compliance layer: EDI (837) validator/formatter, multi-adapter transactional gateway with sandbox test harness, KMS-backed encryption (at-rest/in-transit) and key rotation, strict RBAC/audit trails for submissions, and submission SLA monitoring/alerting.
Implement an EDI 837 Formatter & Validator microservice: X12 837 generation, schema/segment validation, automated test harness and sandbox mode for verifier clearinghouse integrations.  
Implement background worker service
Implement claim normalization pipeline
Implement denial correction suggestion engine
Implement EDI 837 claim formatter
