# Platform Architecture Rules
Medical Claim Recovery Platform

This system analyzes denied medical claims and prepares them for corrected resubmission.

The system must remain modular, secure, and compliant with HIPAA.

---------------------------------

CORE PLATFORM DOMAINS

1. Claim Ingestion
Handles incoming claim files and claim bundles.

Responsibilities:
- File upload
- Claim parsing
- Claim normalization
- Schema validation
- Deduplication

Primary services:
- Parser Router
- Claim Ingestion API
- Schema Registry

---------------------------------

2. Claim Intelligence
Understands denial reasons and suggests corrections.

Responsibilities:
- Denial code knowledgebase
- Correction suggestion engine
- ML recoverability scoring
- Claim enrichment

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
- field level access
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

ARCHITECTURE RULES

- Each new system must belong to one domain.
- Do not duplicate systems already implemented.
- Prefer extending existing systems over creating redundant ones.
- All services must communicate through well-defined APIs.
- The Schema Registry is the single source of truth for claim data models.
- Security systems must integrate with the Policy Engine.
- All PHI access must be auditable.

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

---------------------------------
