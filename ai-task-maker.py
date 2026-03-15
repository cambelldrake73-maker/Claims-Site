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
    text = re.sub(r"[^a-z0-9 ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def canon_task(text: str) -> str:
    text = normalize(text)
    text = re.sub(r"^implement\s+", "", text)
    return text

completed_tasks = set()
for line in completed.read_text().splitlines():
    line = canon_task(line)
    if line:
        completed_tasks.add(line)

queued_tasks = set()
for line in pending.read_text().splitlines():
    line = canon_task(line)
    if line:
        queued_tasks.add(line)

matches = []
seen = set()

for raw in suggestions.read_text().splitlines():
    raw = raw.strip()
    if not raw.startswith("- "):
        continue

    canonical = canon_task(raw)

    if not canonical:
        continue
    if canonical in completed_tasks:
        continue
    if canonical in queued_tasks:
        continue
    if canonical in seen:
        continue

    seen.add(canonical)
    matches.append(raw)

pending.write_text("\n".join(matches[:8]) + ("\n" if matches[:8] else ""))
print("Tasks generated.")

suggestions.write_text("")
