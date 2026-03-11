- Design and implement a backend REST API with OpenAPI specification covering claims, claim-events, patients (minimal PHI metadata), payers, invoices metadata, users, roles, and reports endpoints.

- Create a database schema and migration scripts (Postgres recommended) for claims, claim_events, users, roles, audit_logs (immutable), documents_metadata, payers, invoices, and report_jobs.

- Implement authentication using OAuth2 / OpenID Connect with short-lived JWTs and refresh tokens; store refresh tokens securely and enforce secure cookie flags.

- Build role-based access control (RBAC) middleware enforcing fine-grained permissions for all API endpoints and document access.

- Implement an append-only audit logging system that records actor, action, resource, timestamp, and before/after state; persist audit logs in a write-optimized store (separate DB table/index).

- Create a secure document access microservice that issues signed, time-limited URLs for files in protected directories and logs every access without modifying the files.

- Implement server-side input validation, centralized structured error handling, and consistent error response contracts across all APIs.

- Introduce background job processing (Redis + Bull or RabbitMQ) with retry policies and idempotent tasks for long-running workflows (appeals, claim resubmissions, report generation).

- Build an events stream (Kafka or Redis streams) for claim lifecycle events to decouple UI actions, analytics, and background processors.

- Migrate frontend to a modular component architecture (React + TypeScript) with a shared component library; provide incremental migration plan starting with header/sidebar and claim list.

- Add Storybook (or equivalent) for the component library to document and test reusable UI components (Cards, Tables, Status Badges, Forms, Charts).

- Create a central API client layer (typed) and state-management strategy (RTK Query or Zustand) to centralize data fetching, caching, and optimistic updates.

- Implement comprehensive automated test suites: unit tests for backend services, integration tests for API contracts, and end-to
