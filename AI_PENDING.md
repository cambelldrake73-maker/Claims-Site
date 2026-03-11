
- Create a secure document access microservice that issues signed, time-limited URLs for files in protected directories and logs every access without modifying the files.
- Introduce background job processing (Redis + Bull or RabbitMQ) with retry policies and idempotent tasks for long-running workflows (appeals, claim resubmissions, report generation).
