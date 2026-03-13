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

Development history:
$DEV_MEMORY

Architecture memory:
$ARCH_MEMORY

Evaluate the architecture memory and ONLY propose backend systems that are NOT already implemented.
Do not repeat any systems listed in the architecture memory.
This system processes denied medical claims and prepares them for resubmission through clearinghouses.

Architecture priorities:

1. Security and compliance
2. Reliability and fault tolerance
3. Scalability and system architecture
4. Observability and monitoring
5. Performance optimization
6. Developer productivity

Focus on backend systems required for:

- claim parsing
- denial intelligence
- claim normalization
- clearinghouse integration
- claim review workflows
- medical claim data pipelines

Avoid:

- CSS tweaks
- UI adjustments
- icon changes
- spacing fixes
- cosmetic improvements
- visual layout improvements
- sidebar changes
- hover effects
- color changes
- typography changes
- accessibility tweaks unless security related
- minor HTML fixes
- trivial front-end improvements

Prioritize backend architecture work in this order:

1. Security and authentication systems
2. Database schema and canonical claim data models
3. Claim ingestion and parsing pipelines
4. Denial intelligence and claim correction systems
5. Clearinghouse integrations (EDI 837 formatting and submission)
6. Document security and PHI access control
7. Distributed job queues and background processing
8. Observability, tracing, and monitoring systems
9. Scaling infrastructure
10. Analytics and reporting pipelines

Rules:

- Generate EXACTLY 30 architecture tasks
- Each task must represent a major backend system improvement
- Do NOT generate UI, CSS, layout, or front-end tasks
- Do NOT repeat systems already present in Architecture Memory
- Output only the tasks
- Each task must start with "- "
- No explanations
EOF
)

# ---------------------------
# CALL OPENAI API
# ---------------------------

echo "Generating tasks using ChatGPT..."

python3 <<EOF > "$SUGGESTIONS"
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
