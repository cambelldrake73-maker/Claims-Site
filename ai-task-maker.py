#!/usr/bin/env python3

from pathlib import Path
import re
import sys

workspace = Path.home() / ".openclaw" / "workspace" / "claims-site"
suggestions = workspace / "AI_SUGGESTIONS.md"
pending = workspace / "AI_PENDING.md"
completed = workspace / "AI_COMPLETED.md"
arch_memory = workspace / "AI_ARCHITECTURE_MEMORY.md"
registry = workspace / "SERVICE_REGISTRY.md"

print("Generating AI tasks...")

for p in [suggestions, pending, completed, arch_memory, registry]:
    p.touch(exist_ok=True)

pending_text = pending.read_text()
if re.search(r"^-", pending_text, flags=re.M):
    print("Task queue already populated.")
    sys.exit(0)

def normalize(text: str) -> str:
    text = text.lower().replace("_", " ").replace("-", " ")
    text = re.sub(r"[^a-z0-9 ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text
implemented = set()
completed_services = set()

for line in arch_memory.read_text().splitlines():
    line = normalize(line)
    if line:
        implemented.add(line)

for line in completed.read_text().splitlines():
    line = normalize(line)
    if line:
        completed_services.add(line)
registry_services = []
for line in registry.read_text().splitlines():
    raw = line.strip()
    if not raw or raw.startswith("#") or "---" in raw:
        continue
    svc = normalize(raw)
    if svc:
        registry_services.append((raw, svc))

suggestion_text = normalize(suggestions.read_text())
matches = []
added_services = set()

for raw, svc in registry_services:

    if svc in implemented:
        continue

    if svc in completed_services:
        continue
    if svc in suggestion_text and svc not in added_services:
        matches.append(f"- implement {raw}")
        added_services.add(svc)
seen = set()
final = []
for item in matches:
    if item not in seen:
        seen.add(item)
        final.append(item)

pending.write_text("\n".join(final[:8]) + ("\n" if final[:8] else ""))
print("Tasks generated.")

suggestions.write_text("")
