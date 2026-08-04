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
gh label create "P0"        --color "B60205" --description "Priority 0"  --repo "$REPO" 2>/dev/null || true
gh label create "bug"       --color "D93F0B" --description "Bug"         --repo "$REPO" 2>/dev/null || true
gh label create "duplicate" --color "CFD3D7" --description "Duplicate"   --repo "$REPO" 2>/dev/null || true

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

echo "--> Creating Issue #3 (duplicate — maps to Defer/close/supersede)"
ISSUE3_URL=$(gh issue create \
  --repo "$REPO" \
  --title "Badge color prop is ignored" \
  --label "bug,duplicate" \
  --body "## Problem
The badge component ignores the \`color\` prop — it always renders with the default grey background regardless of the value passed.

## Steps to reproduce
\`\`\`html
<scale-badge label=\"Error\" color=\"danger\"></scale-badge>
\`\`\`
Expected: red badge. Actual: grey badge.

## Note
This appears to be the same root cause as the P0 issue already tracked with acceptance criteria and a failing spec. Closing in favour of that issue.")

echo "   $ISSUE3_URL"

# ---------------------------------------------------------------------------
# Stale PR (fails prettier)
# ---------------------------------------------------------------------------
echo ""
echo "--> Creating stale PR #4 (fails prettier CI check)"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
STALE_BRANCH="stale-prettier-fix"

git checkout -b "$STALE_BRANCH" 2>/dev/null || git checkout "$STALE_BRANCH"

# Append a line without a trailing newline to break prettier's end-of-file rule
printf "// wip" >> src/components/scale-badge/scale-badge.tsx

git add src/components/scale-badge/scale-badge.tsx
git commit -m "wip: attempted badge color fix"
git push origin "$STALE_BRANCH"

PR4_URL=$(gh pr create \
  --repo "$REPO" \
  --title "WIP: badge color fix attempt" \
  --body "Stale PR opened before the session. Fails the prettier CI check.")

echo "   $PR4_URL"

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

# Get the project node ID (needed for GraphQL mutations)
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json | jq -r '.id')

# Get the built-in Status single-select field ID
STATUS_FIELD_ID=$(gh api graphql -f query="
  query {
    node(id: \"$PROJECT_ID\") {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes { ... on ProjectV2SingleSelectField { id name } }
        }
      }
    }
  }" | jq -r '.data.node.fields.nodes[] | select(.name=="Status") | .id')

echo "--> Configuring Status options: Backlog, Autonomous, Needs owner, Done"

# Replace the default options (Todo/In Progress/Done) with the ones the orchestrator expects
gh api graphql -f query="
  mutation {
    updateProjectV2Field(input: {
      projectId: \"$PROJECT_ID\"
      fieldId: \"$STATUS_FIELD_ID\"
      singleSelectField: {
        options: [
          {name: \"Backlog\",      color: GRAY,   description: \"\"}
          {name: \"Autonomous\",   color: GREEN,  description: \"\"}
          {name: \"Needs owner\",  color: YELLOW, description: \"\"}
          {name: \"Done\",         color: BLUE,   description: \"\"}
        ]
      }
    }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
  }" > /dev/null

# Re-fetch the Backlog option ID after the update
BACKLOG_OPTION_ID=$(gh api graphql -f query="
  query {
    node(id: \"$PROJECT_ID\") {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id name options { id name }
            }
          }
        }
      }
    }
  }" | jq -r '.data.node.fields.nodes[] | select(.name=="Status") | .options[] | select(.name=="Backlog") | .id')

echo "--> Adding items to the board and setting status to Backlog"

for URL in "$ISSUE1_URL" "$ISSUE2_URL" "$ISSUE3_URL" "$PR4_URL"; do
  ITEM_ID=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$URL" --format json | jq -r '.id')
  gh project item-edit \
    --id "$ITEM_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --project-id "$PROJECT_ID" \
    --single-select-option-id "$BACKLOG_OPTION_ID"
done

# ---------------------------------------------------------------------------
# Set Status = "Backlog" on every item
# (GitHub Projects v2 defaults to "Todo"/"In Progress"/"Done"; the orchestrator
#  filters for status === "Backlog", so we must add that option and assign it.)
# ---------------------------------------------------------------------------
echo "--> Configuring Status field with Backlog option"

# Resolve the project node ID (works for both personal accounts and orgs)
PROJECT_NODE_ID=$(gh api graphql \
  -f query='query($login:String!,$n:Int!){user(login:$login){projectV2(number:$n){id}}}' \
  -F login="$OWNER" -F n="$PROJECT_NUMBER" \
  -q '.data.user.projectV2.id' 2>/dev/null) \
  || PROJECT_NODE_ID=$(gh api graphql \
  -f query='query($login:String!,$n:Int!){organization(login:$login){projectV2(number:$n){id}}}' \
  -F login="$OWNER" -F n="$PROJECT_NUMBER" \
  -q '.data.organization.projectV2.id')

# Fetch the Status single-select field ID
STATUS_FIELD_ID=$(gh api graphql \
  -f query='query($id:ID!){node(id:$id){...on ProjectV2{fields(first:20){nodes{...on ProjectV2SingleSelectField{id name}}}}}}' \
  -F id="$PROJECT_NODE_ID" \
  -q '[.data.node.fields.nodes[] | select(.name=="Status")][0].id')

# Replace the Status options so "Backlog" exists (keeps In Progress and Done)
gh api graphql -f query='
  mutation($pid:ID!,$fid:ID!){
    updateProjectV2Field(input:{
      projectId:$pid, fieldId:$fid,
      singleSelectOptions:[
        {name:"Backlog",    color:GRAY,   description:""},
        {name:"In Progress",color:YELLOW, description:""},
        {name:"Done",       color:GREEN,  description:""}
      ]
    }){projectV2Field{...on ProjectV2SingleSelectField{id}}}
  }' \
  -F pid="$PROJECT_NODE_ID" -F fid="$STATUS_FIELD_ID" > /dev/null

# Fetch the Backlog option ID (now that it exists)
BACKLOG_OPTION_ID=$(gh api graphql \
  -f query='query($id:ID!){node(id:$id){...on ProjectV2{fields(first:20){nodes{...on ProjectV2SingleSelectField{id name options{id name}}}}}}}' \
  -F id="$PROJECT_NODE_ID" \
  -q '[.data.node.fields.nodes[] | select(.name=="Status")][0].options[] | select(.name=="Backlog") | .id')

echo "--> Setting all items to status: Backlog"

gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 50 --format json \
  | jq -r '.items[].id' \
  | while read -r ITEM_ID; do
      gh api graphql -f query='
        mutation($pid:ID!,$iid:ID!,$fid:ID!,$oid:String!){
          updateProjectV2ItemFieldValue(input:{
            projectId:$pid, itemId:$iid, fieldId:$fid,
            value:{singleSelectOptionId:$oid}
          }){projectV2Item{id}}
        }' \
        -F pid="$PROJECT_NODE_ID" -F iid="$ITEM_ID" \
        -F fid="$STATUS_FIELD_ID" -F oid="$BACKLOG_OPTION_ID" > /dev/null
      echo "   set $ITEM_ID → Backlog"
    done

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
