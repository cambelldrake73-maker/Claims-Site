#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"
PROJECT_CONTEXT=$(cat PROJECT_CONTEXT.md 2>/dev/null)
cd "$WORKSPACE"

echo "Scanning project for planning..."

FILES=$(find . -type f | head -n 40)

PROMPT="You are the lead architect for a medical claims dashboard web application.

PROJECT DESIGN CONTEXT:
$PROJECT_CONTEXT

Follow the design philosophy and constraints described above when generating development tasks.
"
Project files:
$FILES

Generate actionable development tasks to improve the project.

Rules:
- Each task must start with '-'
- No headings
- No explanations
- One task per line
"

echo "Generating tasks using ChatGPT..."

python3 <<EOF > "$SUGGESTIONS"
import os
import requests

api_key=os.environ.get("OPENAI_API_KEY")

response=requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type":"application/json"
    },
    json={
        "model":"gpt-5-mini",
        "messages":[
            {"role":"system","content":"You are a senior software architect."},
            {"role":"user","content":"""$PROMPT"""}
        ],
        "temperature":0.2
    }
)

data=response.json()

print(data["choices"][0]["message"]["content"])
EOF

echo "Planner suggestions generated."
