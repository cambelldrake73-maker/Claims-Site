#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Generating AI suggestions using Claude..."

curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 500,
    "messages": [
      {
        "role": "user",
        "content": "Analyze this repository and suggest improvements to UI, usability, and structure for a medical claims dashboard web application. Return a list of development tasks in bullet format."
      }
    ]
  }' > response.json


python3 <<EOF > "$SUGGESTIONS"
import json

with open("response.json") as f:
    data=json.load(f)

if "content" in data:
    print(data["content"][0]["text"])
else:
    print("ERROR:")
    print(json.dumps(data,indent=2))
EOF


rm response.json

echo "Suggestions generated."
