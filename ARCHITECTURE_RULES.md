# Platform Architecture Contract

Platform goal:
Build a modular AI-assisted revenue recovery platform capable of operating across multiple industry niches.

The platform must remain modular, secure, and compliant with relevant regulatory frameworks (HIPAA for healthcare).

---------------------------------

PLATFORM CORE

These systems must remain independent of any niche.

Core responsibilities:
- authentication
- job orchestration
- file ingestion
- rule engine
- observability
- audit logging
- security
- distributed tracing

Core services include:
- Authentication Service
- Policy Engine
- Job Queue
- Observability Service
- Audit Log Service

---------------------------------

NICHE FRAMEWORK

The platform must support multiple niches (industries).

Examples:
- healthcare
- insurance
- financial billing
- logistics
- regulatory compliance

Each processing job must run within a **selected niche context**.

The niche context determines:
- schemas
- code systems
- validation rules
- parsing logic
- correction logic

The platform core must remain **niche-agnostic**.

---------------------------------

NICHE ROUTER

All uploaded data must pass through a Niche Router.

Responsibilities:
- determine the niche selected by the user
- load niche schemas
- load niche code systems
- load niche rule engine
- route jobs to correct processing pipeline

---------------------------------

NICHE MODULE STRUCTURE

Each niche must be implemented as a modular component.

Example structure:

sectors/
   healthcare/
      schemas/
      code_sets/
      parsers/
      rules/

   insurance/
      schemas/
      code_sets/
      rules/

   finance/
      schemas/
      code_sets/
      rules/

---------------------------------

CORE PLATFORM DOMAINS

1. Claim Ingestion

Handles incoming claim files and claim bundles.

Responsibilities:
- file upload
- claim parsing
- claim normalization
- schema validation
- deduplication

Primary services:
- Parser Router
- Claim Ingestion API
- Schema Registry

---------------------------------

2. Claim Intelligence

Understands denial reasons and suggests corrections.

Responsibilities:
- denial code knowledgebase
- correction suggestion engine
- ML recoverability scoring
- claim enrichment

Primary services:
- Denial Knowledgebase
- Correction Suggestion Engine
- ML Model Serving
- Claim Enrichment

---------------------------------

3. Claim Lifecycle Processing

Manages claim state from ingestion to submission.

Responsibilities:
- claim state tracking
- claim lineage
- job orchestration
- replay/debugging

Primary services:
- Claim Event Store
- Claim Replay Service
- Claim Processing Orchestrator

---------------------------------

4. Clearinghouse Integration

Handles corrected claim submission.

Responsibilities:
- EDI 837 formatting
- clearinghouse submission
- transaction tracking
- retry management

Primary services:
- Clearinghouse Submission Orchestrator
- EDI Formatter
- Payer Connector Framework

---------------------------------

5. Security and Compliance

Protects PHI and enforces policy.

Responsibilities:
- RBAC
- field-level access
- audit logging
- encryption
- consent enforcement

Primary services:
- Policy Engine
- Token Revocation Service
- Data Access Governance
- Secure Audit Log Service
- Consent Authorization Service

---------------------------------

6. Observability and Operations

Ensures reliability and monitoring.

Responsibilities:
- distributed tracing
- job metrics
- system monitoring
- incident replay

Primary services:
- Observability Service
- Distributed Tracing
- Metrics Pipeline

---------------------------------

JOB PROCESSING FLOW

User selects niche before uploading data.

Processing pipeline:

User upload
→ Niche Router
→ Schema validation
→ Code lookup
→ Rule engine
→ AI correction suggestions
→ Human review
→ Submission
→ Lifecycle tracking
→ Revenue recovery reporting

---------------------------------

ARCHITECTURE RULES

- Each new system must belong to one domain.
- Do not duplicate systems already implemented.
- Prefer extending existing systems over creating redundant ones.
- All services must communicate through well-defined APIs.
- The Schema Registry is the single source of truth for claim data models.
- Security systems must integrate with the Policy Engine.
- All PHI access must be auditable.
- Platform core must remain niche-agnostic.
- Domain-specific logic must exist inside niche modules.
- Code systems must be separated by niche.

---------------------------------

SYSTEM GOAL

The final platform should:

1. Accept denied claims from clinics.
2. Parse and normalize claim data.
3. Identify denial causes.
4. Suggest corrected claims.
5. Allow human review.
6. Submit corrected claims to clearinghouses.
7. Track claim lifecycle and revenue recovery.
8. Support additional industries using niche modules.

---------------------------------

INITIAL NICHE

Healthcare is the first supported niche.

Healthcare modules include:
- claim schemas
- denial codes
- CPT/ICD code systems
- EDI parsing
- claim correction rules
