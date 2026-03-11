#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"
# DAILY API LIMIT CONTROL
LIMIT_FILE="$WORKSPACE/.daily_api_calls"
TODAY=$(date +%Y-%m-%d)

if [ -f "$LIMIT_FILE" ]; then
    LAST_DAY=$(head -n 1 "$LIMIT_FILE")
    COUNT=$(tail -n 1 "$LIMIT_FILE")
else
    LAST_DAY=""
    COUNT=0
fi

# Reset counter each day
if [ "$TODAY" != "$LAST_DAY" ]; then
    COUNT=0
fi

# Max 10 calls per day (~$1 safety margin)
if [ "$COUNT" -ge 10 ]; then
    echo "Daily AI limit reached. Skipping planner."
    exit 0
fi

COUNT=$((COUNT+1))
echo "$TODAY" > "$LIMIT_FILE"
echo "$COUNT" >> "$LIMIT_FILE"
echo "Scanning project for planning..."

# Collect sample project files
FILES=$(find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) | head -n 15)

CONTEXT=""

for FILE in $FILES
do
  CONTENT=$(head -n 60 "$FILE" 2>/dev/null)
  CONTEXT="$CONTEXT\n\nFILE: $FILE\n$CONTENT"
done

# Load context files
PROJECT_CONTEXT=$(cat PROJECT_CONTEXT.md 2>/dev/null)
DEV_MEMORY=$(cat DEV_MEMORY.md 2>/dev/null)
ARCH_MEMORY=$(cat ARCHITECTURE_MEMORY.md 2>/dev/null)

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

PROMPT=$(cat <<EOF
You are the lead software architect for a production medical claims dashboard system.

Site structure:
$STRUCTURE

Project context:
$PROJECT_CONTEXT

Development history:
$DEV_MEMORY

Architecture memory:
$ARCH_MEMORY

Your job is to propose **major architectural improvements** for the system.
Use the architecture memory to detect missing systems.

Identify important infrastructure that is not yet implemented.

Focus on architecture gaps such as:

- monitoring
- observability
- rate limiting
- caching
- API gateway
- deployment pipelines
- analytics infrastructure

Do not repeat systems already listed in the architecture memory.
Generate EXACTLY 3 architecture tasks.

These must be **large, high-impact engineering improvements** that a senior software engineer or system architect would recommend.

Focus on:

- backend architecture
- database design
- scalability
- security
- system reliability
- workflow automation
- developer infrastructure
- CI/CD
- API design
- data pipelines
- observability

Avoid:

- CSS tweaks
- UI adjustments
- icon changes
- spacing fixes
- cosmetic improvements
- small HTML changes

Do not repeat ideas that appear in Development History.

Rules:

- Output EXACTLY 3 tasks
- Each task must start with "-"
- One task per line
- No explanations
- Do not output anything except the tasks

EOF
)
echo "Generating tasks using ChatGPT..."
python3 <<EOF > "$SUGGESTIONS"
import os
import requests
import json
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
        "max_output_tokens": 1500
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
