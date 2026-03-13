#!/bin/bash
python3 <<'PY'
from pathlib import Path
import re

workspace = Path.home() / ".openclaw" / "workspace" / "claims-site"
suggestions = workspace / "AI_SUGGESTIONS.md"
pending = workspace / "AI_PENDING.md"
completed = workspace / "AI_COMPLETED.md"
arch_memory = workspace / "AI_ARCHITECTURE_MEMORY.md"
registry = workspace / "SERVICE_REGISTRY.md"

print("Generating AI tasks...")

for p in [suggestions, pending, completed, arch_memory]:
    p.touch(exist_ok=True)

pending_text = pending.read_text()
if re.search(r"^-", pending_text, flags=re.M):
    print("Task queue already populated.")
    raise SystemExit(0)

def normalize(text: str) -> str:
    text = text.lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9 ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

implemented = set()
for line in arch_memory.read_text().splitlines():
    line = normalize(line)
    if line:
        implemented.add(line)

for line in completed.read_text().splitlines():
    line = normalize(line)
    if line:
        implemented.add(line)

registry_services = []
for line in registry.read_text().splitlines():
    raw = line.strip()
    if not raw or raw.startswith("#") or "---" in raw:
        continue
    svc = normalize(raw)
    if re.fullmatch(r"[a-z0-9 ]+", svc):
        registry_services.append((raw.strip(), svc))

suggestion_text = normalize(suggestions.read_text())

matches = []
for raw, svc in registry_services:
    if svc in implemented:
        continue
    if svc and svc in suggestion_text:
        matches.append(f"- implement {raw.strip()}")

seen = set()
final = []
for m in matches:
    if m not in seen:
        seen.add(m)
        final.append(m)

pending.write_text("\n".join(final[:8]) + ("\n" if final[:8] else ""))
print("Tasks generated.")
suggestions.write_text("")
PY
