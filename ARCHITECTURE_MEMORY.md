# Architecture Memory

## Backend
- Auth service implemented
- JWT signing utility implemented
- Authentication middleware implemented
- RBAC permission system implemented

## Database
- Database schema initialized
- Claims table defined
- Patients table defined
- Claim events table defined
- Migration scripts configured

## Infrastructure
- Background job processing architecture introduced
- Redis queue system planned
- Document proxy service implemented
- Signed URL document access implemented

## Security
- Audit logging system implemented
- Protected directories enforced
- File access logging implemented

## System
- Planner → Architect → Executor pipeline active
- Worker automation loop active
RBAC permission checks implemented
Create auth service folder
Create database schema file
Implement JWT signing utility
Add authentication middleware
Add RBAC permission checks
Create auth service folder
Create database schema file
Implement JWT signing utility
- Monitoring system introduced
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Create database schema file
- Database schema system implemented
Implement JWT signing utility
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Implement JWT signing utility
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Implement JWT signing utility
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Implement JWT signing utility
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Implement JWT signing utility
## Claims Intelligence Platform

The system is a medical claim recovery platform.

Core capabilities:

- Clinics upload denied medical claims
- Claims are parsed and normalized
- Denial codes are analyzed
- System proposes claim corrections
- Human reviewer approves or edits
- Claims prepared for clearinghouse submission

Key architecture components required:

Claim Upload Service  
Claim Parsing Engine  
Denial Intelligence Engine  
Claim Correction Engine  
Claim Review Dashboard  
EDI Claim Formatter (837P / 837I)  
Clearinghouse Submission Gateway  
Claim Recovery Analytics  

Human approval is required before claim submission.
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Create database schema file
- Database schema system implemented
Create document proxy API endpoint
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Implement JWT signing utility
Design and implement a resilient asynchronous claim processing pipeline: centralized job queue with idempotent workers, dead-letter queues, exponential-backoff retries, distributed tracing, per-job metrics, automated horizontal scaling, and end-to-end claim lifecycle event tracing.
- Background job system implemented
Implement a secure Clearinghouse Integration & Compliance layer: EDI (837) validator/formatter, multi-adapter transactional gateway with sandbox test harness, KMS-backed encryption (at-rest/in-transit) and key rotation, strict RBAC/audit trails for submissions, and submission SLA monitoring/alerting.
- Monitoring system introduced
Implement a resilient, idempotent asynchronous claim processing pipeline: central durable job queue (Redis/NSQ/SQS), idempotent worker patterns, dead-letter queues, exponential-backoff retries, per-job metrics, distributed tracing (OpenTelemetry), structured tracing/span propagation, DLQ alerting, and automated horizontal scaling rules.  
- Background job system implemented
Build a secure Clearinghouse Integration & Compliance microservice: EDI (837) validator/formatter, multi-adapter transactional gateway with sandbox/test harness, KMS-backed encryption for at-rest/in-transit payloads, strict RBAC and immutable submission audit trails, submission retry/rollback semantics, and SLA/health monitoring.  
- Monitoring system introduced
Implement a resilient Clearinghouse Integration & Submission Service (transactional adapter pattern with sandbox/production adapters, submission queue with DLQ and exponential backoff, KMS-backed encryption for in-transit/at-rest, immutable audit trails, per-submission distributed tracing/OpenTelemetry, and SLA/health monitoring)
- Monitoring system introduced
- Background job system implemented
Implement a resilient Clearinghouse Integration & Submission Service (transactional adapter pattern with sandbox/production adapters, submission queue with DLQ and exponential backoff, KMS-backed encryption for in-transit/at-rest, immutable audit trails, per-submission distributed tracing/OpenTelemetry, and SLA/health monitoring)
- Monitoring system introduced
- Background job system implemented
Implement a resilient Clearinghouse Integration & Submission Service (transactional adapter pattern with sandbox/production adapters, submission queue with DLQ and exponential backoff, KMS-backed encryption for in-transit/at-rest, immutable audit trails, per-submission distributed tracing/OpenTelemetry, and SLA/health monitoring)
- Monitoring system introduced
- Background job system implemented
Implement a resilient Clearinghouse Integration & Submission Service (transactional adapter pattern with sandbox/production adapters, submission queue with DLQ and exponential backoff, KMS-backed encryption for in-transit/at-rest, immutable audit trails, per-submission distributed tracing/OpenTelemetry, and SLA/health monitoring)
- Monitoring system introduced
- Background job system implemented
Design and implement a dedicated Claim Parsing Microservice: pluggable parsers for common claim formats, strict schema validation, idempotent processing, and unit/integration tests.  
- Database schema system implemented
Implement an EDI 837 Formatter & Validator microservice: X12 837 generation, schema/segment validation, automated test harness and sandbox mode for verifier clearinghouse integrations.  
- Database schema system implemented
Build a Clearinghouse Integration Gateway: transactional adapter pattern (sandbox/prod adapters), submission queue with retries/DLQ, idempotency keys, and per-submission audit/logging.  
- Background job system implemented
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Create jobs processing folder
- Background job system implemented
Implement JWT signing utility
Add authentication middleware
- Auth system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Create document proxy API endpoint
Implement JWT signing utility
Implement claim validation and schema enforcement
- Database schema system implemented
Add audit logging for authentication events
- Auth system implemented
Add authentication middleware
- Auth system implemented
Add job processing metrics and monitoring
- Monitoring system introduced
- Background job system implemented
Add RBAC permission checks
Create auth service folder
- Auth system implemented
Create authentication unit tests
- Auth system implemented
Create document proxy API endpoint
Create jobs processing folder
- Background job system implemented
Implement authentication service configuration
- Auth system implemented
Implement claim validation and schema enforcement
- Database schema system implemented
Implement dead letter queue handling
- Background job system implemented
Implement job queue retry logic
- Background job system implemented
Implement JWT signing utility
Build a Claim Normalization microservice to transform parsed claims into a canonical schema with field-level provenance and validation.
- Database schema system implemented
Develop a Claim Enrichment service to augment claims with external data (payer databases, provider NPI lookup, patient demographics) via secure connectors.
- Database schema system implemented
Implement Per-Field Encryption for PHI in the database using envelope encryption and KMS-backed keys with access controls and audit logging.
- Database schema system implemented
Build a Claims Ingestion Orchestrator microservice that accepts uploaded claim bundles, performs schema routing, enqueues parsing jobs, and returns idempotency keys.
- Database schema system implemented
- Background job system implemented
Build a PHI-aware Column-Level Encryption layer in the database access service with transparent encryption/decryption hooks and strict key usage logs.
- Database schema system implemented
Create a Secure Document Proxy microservice (separate from file storage) that issues short-lived, audited access tokens and enforces fine-grained access rules for PDF/claim document retrieval.
