#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Scanning project..."

PROJECT_FILES=$(find . -type f | head -n 40)
PROMPT="You are reviewing a medical claims dashboard web application.

Project files:
$PROJECT_FILES

Return ONLY actionable development tasks.

Rules:
- Each line must start with '-'
- No explanations
- No headings
- One task per line
"

echo "Generating AI suggestions using Claude..."

python3 <<EOF > "$SUGGESTIONS"
import os
import requests
import json

api_key=os.environ.get("ANTHROPIC_API_KEY")

prompt="""$PROMPT"""

response=requests.post(
    "https://api.anthropic.com/v1/messages",
    headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    },
    json={
        "model": "claude-sonnet-4-6",
        "max_tokens": 400,
        "messages":[{"role":"user","content":prompt}]
    }
)

data=response.json()

if "content" in data:
    print(data["content"][0]["text"])
else:
    print("ERROR:")
    print(json.dumps(data,indent=2))
EOF

echo "Suggestions generated."
