#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Generating AI suggestions using Claude..."

RESPONSE=$(curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 400,
    "messages": [
      {
        "role": "user",
        "content": "Analyze a web project for a medical claims dashboard and return a list of development improvements in bullet points."
      }
    ]
  }')

echo "$RESPONSE" > raw_response.json

python3 <<EOF > "$SUGGESTIONS"
import json

with open("raw_response.json") as f:
    data = json.load(f)

if "content" in data:
    print(data["content"][0]["text"])
else:
    print("ERROR RESPONSE FROM CLAUDE:")
    print(json.dumps(data, indent=2))
EOF

rm raw_response.json

echo "Suggestions generated."
