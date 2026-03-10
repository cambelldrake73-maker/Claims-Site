#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Scanning project..."

# collect a few relevant files
FILES=$(find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) | head -n 6)

CODE_CONTEXT=""

for file in $FILES
do
    CODE_CONTEXT="$CODE_CONTEXT\nFILE: $file\n$(head -n 120 "$file")\n"
done

PROMPT="You are reviewing a medical claims dashboard web project.

Below are portions of the project code.

$CODE_CONTEXT

Return ONLY small development tasks related to:
- UI improvements
- layout fixes
- CSS styling
- usability improvements

Rules:
- Each line must start with '-'
- No explanations
- No security systems
- No backend architecture
- No authentication systems
"

echo "Generating AI suggestions using Claude..."

python3 <<EOF > "$SUGGESTIONS"
import os
import requests
import json

api_key=os.environ.get("ANTHROPIC_API_KEY")

prompt = """$PROMPT"""

response = requests.post(
    "https://api.anthropic.com/v1/messages",
    headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    },
    json={
        "model": "claude-sonnet-4-6",
        "max_tokens": 300,
        "messages":[{"role":"user","content":prompt}]
    }
)

data = response.json()

if "content" in data:
    print(data["content"][0]["text"])
else:
    print("ERROR:")
    print(json.dumps(data, indent=2))
EOF

echo "Suggestions generated."
