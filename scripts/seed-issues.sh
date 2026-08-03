#!/usr/bin/env bash
# Run once after creating the repo: ./scripts/seed-issues.sh
# Requires: gh (authenticated), jq
set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Seeding issues in $REPO"

# Issue 1 — The Good Bug (P0, clear reproduction steps)
gh issue create \
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
- The existing failing spec \`applies the color prop as a host attribute\` goes green."

echo "Created Issue #1"

# Issue 2 — The Vague Feature (no reproduction steps, needs owner)
gh issue create \
  --repo "$REPO" \
  --title "Make the badge look more modern" \
  --body "The badge looks outdated. Please make it more modern." \

echo "Created Issue #2"

# Project board setup (requires gh project — needs project-beta scope)
# If you have it, uncomment and fill in your org/user:
# gh project create --owner "$OWNER" --title "Barcamp Board" --format json

echo ""
echo "Done. Now create a stale PR with lint failures:"
echo "  git checkout -b stale-prettier-fix"
echo "  # Add trailing commas to scale-badge.tsx to break prettier"
echo "  git commit -am 'wip: attempted badge fix'"
echo "  gh pr create --title 'WIP: badge color fix attempt' --body 'Stale PR that fails prettier.'"
