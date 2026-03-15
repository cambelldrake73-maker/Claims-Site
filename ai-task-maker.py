#!/usr/bin/env python3

from pathlib import Path
import re
import sys

workspace = Path.home() / ".openclaw" / "workspace" / "claims-site"
suggestions = workspace / "AI_SUGGESTIONS.md"
pending = workspace / "AI_PENDING.md"
completed = workspace / "AI_COMPLETED.md"
arch_memory = workspace / "AI_ARCHITECTURE_MEMORY.md"

print("Generating AI tasks...")

for p in [suggestions, pending, completed, arch_memory]:
    p.touch(exist_ok=True)

pending_text = pending.read_text()
if re.search(r"^-", pending_text, flags=re.M):
    print("Task queue already populated.")
    sys.exit(0)

def normalize(text: str) -> str:
    text = text.lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9./ ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def service_family(text: str) -> str:
    t = normalize(text)

    families = [
        ("claim_ingestion_api", [
            "claim ingestion api", "claim_ingestion_api", "services/claim_ingestion_api", "/ingest", "post /ingest"
        ]),
        ("parser_router", [
            "parser router", "parser_router", "services/parser_router", "routeclaimbundle", "parseclaimbundle"
        ]),
        ("canonical_claim_schema", [
            "canonical claim schema", "canonical_claim_schema", "canonical claim", "canonicalclaim",
            "claim.schema.json", "canonical_claim.v1.json", "canonical_claim_schema.json"
        ]),
        ("claim_normalization", [
            "claim normalization", "claim_normalization", "normalizeclaim", "normalize claim",
            "normalization worker", "services/claim_normalization"
        ]),
        ("claim_deduplication", [
            "claim deduplication", "claim_deduplication", "deduper", "deduplication", "claim fingerprint"
        ]),
        ("claim_enrichment", [
            "claim enrichment", "claim_enrichment", "enrichments", "claim_enrichments"
        ]),
        ("denial_intelligence_engine", [
            "denial intelligence engine", "denial_intelligence_engine", "denial_reason_classifier",
            "denial reason classifier", "classifydenial"
        ]),
        ("correction_suggestion_engine", [
            "correction suggestion engine", "correction_suggestion_engine",
            "correction_suggestion_worker", "suggested corrections", "suggestcorrections"
        ]),
        ("review_workflow_service", [
            "review workflow service", "review_workflow_service", "review queue",
            "review tasks", "/review-tasks", "reviewtask"
        ]),
        ("approval_queue_service", [
            "approval queue", "approval_queue_service"
        ]),
        ("edi_formatter", [
            "edi formatter", "edi_formatter", "edi 837", "837", "formatto837"
        ]),
        ("clearinghouse_adapter_framework", [
            "clearinghouse adapter framework", "clearinghouse_adapter_framework",
            "iadapter", "submission jobs", "submission_jobs", "clearinghouseadapter"
        ]),
        ("submission_status_tracker", [
            "submission status tracker", "submission_status_tracker", "submission status", "/submission-status"
        ]),
        ("job_queue", [
            "job queue", "job_queue", "bull", "rabbitmq", "claim_ingest_worker", "parsejob"
        ]),
        ("schema_registry", [
            "schema registry", "schema_registry"
        ]),
        ("authentication_service", [
            "authentication service", "authentication_service", "auth service", "oauth", "oidc"
        ]),
        ("token_revocation", [
            "token revocation", "token_revocation", "revoke token", "jwt invalidation"
        ]),
        ("policy_engine", [
            "policy engine", "policy_engine", "rego", "opa"
        ]),
        ("access_control", [
            "access control", "access_control", "rbac", "field-level rbac"
        ]),
        ("audit_log_service", [
            "audit log", "audit_log_service", "audit trail"
        ]),
        ("upload_gateway", [
            "upload gateway", "upload_gateway", "multipart", "uploaded metadata"
        ]),
        ("review_queue_api", [
            "review queue api", "review_queue_api"
        ]),
        ("claims_dashboard_api", [
            "claims dashboard api", "claims_dashboard_api"
        ]),
    ]

    for family, patterns in families:
        if any(p in t for p in patterns):
            return family

    # fallback: collapse leading verbs so wording changes don't matter as much
    t = re.sub(r"^(implement|create|add|build|wire|scaffold)\s+", "", t)
    return t

def collect_families(text: str) -> set[str]:
    families = set()
    for line in text.splitlines():
        line = line.strip()
        if line:
            families.add(service_family(line))
    return families

completed_families = collect_families(completed.read_text())
implemented_families = collect_families(arch_memory.read_text())
queued_families = collect_families(pending.read_text())

matches = []
seen = set()

for raw in suggestions.read_text().splitlines():
    raw = raw.strip()
    if not raw.startswith("- "):
        continue

    family = service_family(raw)

    if not family:
        continue
    if family in completed_families:
        continue
    if family in implemented_families:
        continue
    if family in queued_families:
        continue
    if family in seen:
        continue

    seen.add(family)
    matches.append(raw)

pending.write_text("\n".join(matches[:8]) + ("\n" if matches[:8] else ""))
print("Tasks generated.")

suggestions.write_text("")
