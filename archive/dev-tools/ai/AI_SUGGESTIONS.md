# AI Suggestions

- Add database indexes on claims.batch_id, claims.case_id, and claims.status columns to optimize filtering and aggregation queries for batch processing and review queue operations
- Create POST /api/claims/batch-action endpoint that accepts batch_id and action (normalize|review|archive) parameters, applies the action to all claims in the batch, updates batch status accordingly, and returns count of affected records with transaction support
- Implement GET /api/claims/stats endpoint that returns aggregate statistics including total_claims_count, claims_by_status object, claims_by_payer object, total_recovery_amount, average_claim_amount, and claims_by_denial_reason object calculated from database without external dependencies
- Build detail_endpoint.js router that serves GET /api/claims/:claim_id with full claim record including patient, payer, amounts, enrichment data, and review queue history in single JSON response
- Create POST /api/claims/update-status endpoint that accepts claim_id and new_status parameters, validates status against allowed values, updates claims table, logs status change with timestamp, and returns updated claim record with confirmation
