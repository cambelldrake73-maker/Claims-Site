#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"
SUGGESTIONS="$WORKSPACE/AI_SUGGESTIONS.md"

cd "$WORKSPACE"

echo "Scanning project for planning..."

# Collect some project files
FILES=$(find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) | head -n 15)

CONTEXT=""

for FILE in $FILES
do
  CONTENT=$(head -n 60 "$FILE" 2>/dev/null)
  CONTEXT="$CONTEXT\n\nFILE: $FILE\n$CONTENT"
done

# Load project context if present
PROJECT_CONTEXT=$(cat PROJECT_CONTEXT.md 2>/dev/null)

PROMPT=$(cat <<EOF
You are the lead software architect for a medical claims dashboard application.

PROJECT CONTEXT:
$PROJECT_CONTEXT

Below are code snippets from the repository:

$CONTEXT

Generate actionable development tasks to improve the project.

Rules:
- Each task must start with "-"
- No headings
- No explanations
- One task per line
EOF
)

echo "Generating tasks using ChatGPT..."

python3 <<EOF > "$SUGGESTIONS"
import os
import requests

api_key = os.environ.get("OPENAI_API_KEY")

response = requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "model": "gpt-5-mini",
        "messages": [
            {"role": "system", "content": "You are a senior full-stack architect."},
            {"role": "user", "content": """$PROMPT"""}
        ],
        "temperature": 0.2
    }
)

data = response.json()
print(data["choices"][0]["message"]["content"])
EOF

echo "Planner suggestions generated."
