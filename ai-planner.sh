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

Evaluate the architecture memory and identify missing critical systems.

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
- small HTML changes

Rules:

- Output EXACTLY 15 architecture tasks
- Each task must start with "-"
- One task per line
- No explanations
- Do not output anything except the tasks

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
        "input": prompt,
        "max_output_tokens": 1200
    },
    timeout=60
)

data = response.json()

text = ""

if "output" in data:
    for item in data["output"]:
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    text += content.get("text", "")

print(text.strip())
EOF

echo "Planner suggestions generated."
