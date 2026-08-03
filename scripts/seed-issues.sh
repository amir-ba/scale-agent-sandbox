#!/usr/bin/env bash
# Run once from your fork after cloning: bash scripts/seed-issues.sh
# Requires: gh (authenticated), node >= 18
set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(echo "$REPO" | cut -d/ -f1)

echo "==> Setting up your sandbox in $REPO (owner: $OWNER)"

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
gh label create "P0" --color "B60205" --description "Priority 0" --repo "$REPO" 2>/dev/null || true
gh label create "bug" --color "D93F0B" --description "Bug" --repo "$REPO" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------
echo ""
echo "--> Creating Issue #1 (P0 bug — clear reproduction steps)"
ISSUE1_URL=$(gh issue create \
  --repo "$REPO" \
  --title "P0: scale-badge does not apply the color property correctly" \
  --label "bug,P0" \
  --body "## Problem
\`scale-badge\` accepts a \`color\` prop but it is never reflected as a host attribute, so the CSS selector \`:host([color=\"danger\"])\` never matches and the badge stays grey.

## Steps to reproduce
\`\`\`html
<scale-badge label=\"Error\" color=\"danger\"></scale-badge>
\`\`\`
Expected: red badge. Actual: grey badge.

## Acceptance criteria
- Pass \`color=\"danger\"\` → badge has red background.
- The existing failing spec \`applies the color prop as a host attribute\` goes green.")

echo "   $ISSUE1_URL"

echo "--> Creating Issue #2 (vague feature — no acceptance criteria)"
ISSUE2_URL=$(gh issue create \
  --repo "$REPO" \
  --title "Make the badge look more modern" \
  --body "The badge looks outdated. Please make it more modern.")

echo "   $ISSUE2_URL"

# ---------------------------------------------------------------------------
# Stale PR (fails prettier)
# ---------------------------------------------------------------------------
echo ""
echo "--> Creating stale PR #3 (fails prettier CI check)"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
STALE_BRANCH="stale-prettier-fix"

git checkout -b "$STALE_BRANCH" 2>/dev/null || git checkout "$STALE_BRANCH"

# Append a line without a trailing newline to break prettier's end-of-file rule
printf "// wip" >> src/components/scale-badge/scale-badge.tsx

git add src/components/scale-badge/scale-badge.tsx
git commit -m "wip: attempted badge color fix"
git push origin "$STALE_BRANCH"

PR3_URL=$(gh pr create \
  --repo "$REPO" \
  --title "WIP: badge color fix attempt" \
  --body "Stale PR opened before the session. Fails the prettier CI check.")

echo "   $PR3_URL"

git checkout "$CURRENT_BRANCH"

# ---------------------------------------------------------------------------
# GitHub Project board
# ---------------------------------------------------------------------------
echo ""
echo "--> Creating GitHub Project board 'Sandbox Board'"

PROJECT_URL=$(gh project create \
  --owner "$OWNER" \
  --title "Sandbox Board" \
  --format json | jq -r '.url')

PROJECT_NUMBER=$(echo "$PROJECT_URL" | grep -oE '[0-9]+$')

echo "   $PROJECT_URL (number: $PROJECT_NUMBER)"

echo "--> Adding items to the board with status Backlog"

gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE1_URL"
gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE2_URL"
gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$PR3_URL"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "================================================"
echo "  Board ready!"
echo "  Project number: $PROJECT_NUMBER"
echo "  View it at:     $PROJECT_URL"
echo ""
echo "  Run the triage:"
echo "    node orchestrator.mjs --triage-only --project-number $PROJECT_NUMBER"
echo ""
echo "  Run the worker:"
echo "    node orchestrator.mjs --run-worker --issue 1 --project-number $PROJECT_NUMBER"
echo "================================================"
