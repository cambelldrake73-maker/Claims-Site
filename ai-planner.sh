#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

# ---------------------------
# DAILY API LIMIT CONTROL
# ---------------------------

LIMIT_FILE="$WORKSPACE/.daily_api_calls"
TODAY=$(date +%Y-%m-%d)

if [ -f "$LIMIT_FILE" ]; then
    LAST_DAY=$(head -n 1 "$LIMIT_FILE")
    COUNT=$(tail -n 1 "$LIMIT_FILE")
else
    LAST_DAY=""
    COUNT=0
fi

# Reset daily counter
if [ "$TODAY" != "$LAST_DAY" ]; then
    COUNT=0
fi

# Max planner calls per day
if [ "$COUNT" -ge 10 ]; then
    echo "Daily AI limit reached. Skipping planner."
    exit 0
fi

COUNT=$((COUNT+1))
echo "$TODAY" > "$LIMIT_FILE"
echo "$COUNT" >> "$LIMIT_FILE"

echo "Scanning project for planning..."

# ---------------------------
# LOAD CONTEXT FILES
# ---------------------------

PROJECT_CONTEXT=$(cat PROJECT_CONTEXT.md 2>/dev/null)
DEV_MEMORY=$(cat DEV_MEMORY.md 2>/dev/null)
ARCH_MEMORY=$(cat ARCHITECTURE_MEMORY.md 2>/dev/null)
DENIAL_MEMORY=$(cat DENIAL_KNOWLEDGE_BASE.md 2>/dev/null)
# ---------------------------
# BUILD SIMPLE SITE MAP
# ---------------------------

echo "Building site map..."

SITE_MAP=$(find . -name "*.html" -type f ! -path "./.git/*" | head -n 30)

STRUCTURE=""

for FILE in $SITE_MAP
do
    LINKS=$(grep -oE 'href="[^"]+"' "$FILE" 2>/dev/null | sed 's/href="//g' | sed 's/"//g')

    STRUCTURE="$STRUCTURE
PAGE: $FILE
LINKS TO:"

    for LINK in $LINKS
    do
        STRUCTURE="$STRUCTURE
  -> $LINK"
    done
done

# ---------------------------
# BUILD PROMPT
# ---------------------------

PROMPT=$(cat <<EOF
You are the lead software architect for a production medical claim recovery platform.

Site structure:
$STRUCTURE

Project context:
$PROJECT_CONTEXT

Architecture rules:
$(cat "$WORKSPACE/ARCHITECTURE_RULES.md")

Platform build roadmap:
$(cat "$WORKSPACE/BUILD_PLAN.md")

Service registry:
$(cat "$WORKSPACE/SERVICE_REGISTRY.md")

Development history:
$DEV_MEMORY

Architecture memory:
$ARCH_MEMORY
Evaluate the architecture memory and propose ONLY concrete backend implementation tasks for systems that are not fully built yet.
Do not repeat systems listed in the architecture memory unless you are proposing a missing subcomponent or integration for that system.
This system processes denied medical claims and prepares them for resubmission through clearinghouses.

Focus on actionable build tasks such as:
- create service folders
- add route scaffolds
- add schema files
- add validators
- add queue models
- add worker modules
- add adapter interfaces
- wire one service into another
- add persistence models
- add API contracts

Avoid:
- CSS tweaks
- UI adjustments
- icons
- spacing fixes
- cosmetic improvements
- layout changes
- sidebar changes
- hover effects
- typography changes
- trivial front-end tasks

Rules:

- Generate EXACTLY 8 tasks
- Each task must be specific and immediately buildable
- Do NOT output vague placeholder tasks like:
  - implement payer_rule_engine
  - implement review_workflow_service
  - implement edi_formatter
- Prefer tasks like:
  - Create payer_rule_engine service folder and base module scaffold
  - Add payer rule config schema and validation model
  - Create review_workflow_service queue state model
  - Add submission_status_tracker persistence schema
  - Add claims_dashboard_api route scaffold and response contract
  - Wire parser_router output into claim_normalization entrypoint
- Do NOT repeat tasks already completed or already present in architecture memory
- Output only the tasks
- Each task must start with "- "
- No explanations

Follow the build roadmap sequentially, but break large systems into real implementation subtasks.
Ensure new tasks align with the service registry and current repository structure.
EOF
)
# ---------------------------
# CALL OPENAI API
# ---------------------------

echo "Generating tasks using ChatGPT..."

python3 <<EOF >> "$SUGGESTIONS"
import os
import requests
import sys

prompt = """$PROMPT"""

api_key = os.environ.get("OPENAI_API_KEY")

if not api_key:
    print("OPENAI ERROR: API key missing")
    sys.exit(1)

response = requests.post(
    "https://api.openai.com/v1/responses",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
json={
    "model": "gpt-5-mini",
    "input": [
        {
            "role": "user",
            "content": prompt
        }
    ],
    "text": {"format": {"type": "text"}},
    "reasoning": {"effort": "minimal"},
    "max_output_tokens": 800
},
    timeout=60
)
data = response.json()

text = ""

# Extract text output from Responses API
if "output" in data:
    for item in data["output"]:
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    text += content.get("text", "")

# Fallback for other formats
if not text:
    text = data.get("output_text", "")

print(text.strip())
EOF

echo "Planner suggestions generated."
