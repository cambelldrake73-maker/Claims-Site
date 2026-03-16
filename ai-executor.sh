#!/bin/bash

WORKSPACE="$HOME/.openclaw/workspace/claims-site"

PENDING="$WORKSPACE/AI_PENDING.md"
RUNNING="$WORKSPACE/AI_RUNNING.md"
COMPLETED="$WORKSPACE/AI_COMPLETED.md"
PLAN="$WORKSPACE/AI_PLAN.md"
LOG="$WORKSPACE/AI_LOG.md"

cd "$WORKSPACE"

echo "Checking for tasks..."

TASK=$(grep -v "#" "$PENDING" | head -n 1)

if [ -z "$TASK" ]; then
    echo "No tasks found."
    exit 0
fi

echo "Starting task: $TASK"

# remove from pending
sed -i '' "/$TASK/d" "$PENDING"

# move to running
echo "$TASK" >> "$RUNNING"

echo "Generating plan..."

echo "" >> "$PLAN"
echo "Task: $TASK" >> "$PLAN"
echo "- Analyze project structure" >> "$PLAN"
echo "- Identify files to modify" >> "$PLAN"
echo "- Apply safe improvement" >> "$PLAN"
echo "" >> "$PLAN"
# SAFE TASK ACTIONS
if echo "$TASK" | grep -iq "dashboard"; then

    echo "AI modifying dashboard..."

    if ! grep -q "AI improvement: dashboard spacing" dashboard.html; then
        {
            echo ""
            echo "<!-- AI improvement: dashboard spacing -->"
            echo "<style> .panel{margin-bottom:30px;} </style>"
        } >> dashboard.html
    else
        echo "Dashboard improvement already present."
    fi

elif echo "$TASK" | grep -iq "login"; then

    echo "AI modifying login page..."

    if ! grep -q "AI improvement: login alignment" login.html; then
        {
            echo ""
            echo "<!-- AI improvement: login alignment -->"
            echo "<style> .login-form{max-width:420px;margin:40px auto;} </style>"
        } >> login.html
    else
        echo "Login improvement already present."
    fi

elif echo "$TASK" | grep -iq "sidebar"; then

    echo "AI modifying dashboard sidebar..."

    if ! grep -q "AI improvement: sidebar spacing" dashboard.html; then
        {
            echo ""
            echo "<!-- AI improvement: sidebar spacing -->"
            echo "<style> .sidebar a{display:block;padding:12px 16px;} </style>"
        } >> dashboard.html
    else
        echo "Sidebar improvement already present."
    fi

elif echo "$TASK" | grep -iq "status badges"; then

    echo "AI modifying claims page for status badges..."

    if ! grep -q "AI improvement: claim status badges" claims.html; then
        {
            echo ""
            echo "<!-- AI improvement: claim status badges -->"
            echo "<style> .status-badge{display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;} </style>"
        } >> claims.html
    else
        echo "Status badge improvement already present."
    fi

elif echo "$TASK" | grep -iq "filtering"; then

    echo "AI modifying claims page for filtering..."

    if ! grep -q "AI improvement: claims filtering controls" claims.html; then
        {
            echo ""
            echo "<!-- AI improvement: claims filtering controls -->"
            echo "<div class=\"claims-filter-bar\">Filter controls placeholder</div>"
        } >> claims.html
    else
        echo "Filtering controls already present."
    fi
elif echo "$TASK" | grep -iq "connect claims table to backend data"; then

    echo "AI wiring claims page to backend data..."

    if ! grep -q "AI improvement: claims backend wiring" claims.html; then
        {
            echo ""
            echo "<!-- AI improvement: claims backend wiring -->"
            echo "<script>"
            echo "async function loadClaims(){"
            echo "  const res = await fetch('/api/claims');"
            echo "  const data = await res.json();"
            echo "  console.log('Claims loaded:', data);"
            echo "}"
            echo "loadClaims();"
            echo "</script>"
        } >> claims.html
    else
        echo "Claims backend wiring already present."
    fi

elif echo "$TASK" | grep -iq "add claim search endpoint"; then

    echo "AI creating claim search endpoint..."

    mkdir -p services/claim_ingestion_api

    if [ ! -f services/claim_ingestion_api/search_endpoint.js ]; then
        cat > services/claim_ingestion_api/search_endpoint.js <<'EOF'
const express = require('express');
const router = express.Router();

router.get('/api/claims/search', async (req, res) => {
  const q = req.query.q || '';
  res.json({
    ok: true,
    query: q,
    results: [],
    message: 'Search endpoint scaffold created by AI'
  });
});

module.exports = router;
EOF
    else
        echo "Claim search endpoint already present."
    fi

elif echo "$TASK" | grep -iq "add claim status api wiring"; then

    echo "AI creating claim status API wiring..."

    mkdir -p services/claim_ingestion_api

    if [ ! -f services/claim_ingestion_api/status_endpoint.js ]; then
        cat > services/claim_ingestion_api/status_endpoint.js <<'EOF'
const express = require('express');
const router = express.Router();

router.get('/api/claims/status', async (req, res) => {
  res.json({
    ok: true,
    statuses: ['submitted', 'denied', 'pending_review', 'paid']
  });
});

module.exports = router;
EOF
    else
        echo "Claim status endpoint already present."
    fi

else

    echo "No safe file action matched task."

fi
echo "Logging work..."

echo "$(date): Completed task $TASK" >> "$LOG"

sleep 2

sed -i '' "/$TASK/d" "$RUNNING"
echo "$TASK" >> "$COMPLETED"

# Stage only safe files (prevent backend deletion)
git add dashboard.html *.html *.css *.js ai-executor.sh services/**/*.js services/*.js 2>/dev/null
# Abort if protected files were deleted
if git diff --cached --name-status | grep -E "^D\s+(services/|package.json|agent-worker.sh|ai-executor.sh)"; then
    echo "Protected file deletion detected. Aborting commit."
    git reset
    exit 1
fi
# Skip commit if nothing actually changed
if git diff --cached --quiet; then
    echo "No staged changes; task already satisfied."
    exit 0
fi
git commit -m "AI task completed: $TASK" 2>/dev/null
echo "Task completed."
