# scale-barcamp-sandbox

Minimal sandbox for the **AI Barcamp** hands-on session on proactive AI agents.

## Quick start (5 min setup)

```bash
# 1. Fork this repo, then clone your fork
git clone https://github.com/YOUR_USER/scale-barcamp-sandbox
cd scale-barcamp-sandbox

# 2. Install dependencies
npm install

# 3. Authenticate with GitHub CLI
gh auth login


# 4. Install the claude CLI and use the gitlab auth flow to authenticate
npm install -g @anthropic-ai/claude-code
```

## Seed the board (run once)

Before the session, populate the repo with the pre-baked issues and stale PR:

```bash
# Creates Issue #1 (P0 bug) and Issue #2 (vague feature)
bash scripts/seed-issues.sh

# Create the stale PR that fails prettier (PR #3)
git checkout -b stale-prettier-fix
# Make a trivial whitespace change that breaks prettier rules
echo "" >> src/components/scale-badge/scale-badge.tsx
git commit -am "wip: attempted badge color fix"
gh pr create \
  --title "WIP: badge color fix attempt" \
  --body "Stale PR that fails the prettier CI check."
git checkout main
```

Then add all three items to the **GitHub Project #2** board with status **Backlog**.

## Activities

### Phase 1 — Triage Engine (read-only)

```bash
node orchestrator.mjs --triage-only
```

Watch the agent read Issues #1 and #2 and decide:
- Issue #1 → **eligible** (clear bug, specific test, component lock)
- Issue #2 → **needs_owner** (vague, no acceptance criteria)
-
this should move the instanses in the project board

### Phase 2 — Autonomous Worker

```bash
node orchestrator.mjs --run-worker --issue 1
```

Watch the agent:
1. Create an isolated git worktree
2. Read `scale-badge.tsx` and the failing test
3. Add `@Prop({ reflect: true })` to the `color` prop
4. Run `npm test` (now green)
5. Push a branch and open a PR

### Phase 3 — Guardrails & Prompt Tweaking

**Challenge A — The Strict Linter:**
Edit the prompt in `orchestrator.mjs` → `buildWorkerPrompt()` to require a JSDoc comment on every component. Delete the last PR, rerun the worker, verify the agent writes the doc.

**Challenge B — The CI Fixer:**
```bash
node orchestrator.mjs --run-worker --pr 3
```
Watch the agent pull the stale PR branch, fix prettier violations, and update the PR.


all the steps and the integaraion of this in claude code is flaky so we atempt to fix this as we go to learn together.
## Architecture

```
orchestrator.mjs          ← simplified one-file CLI orchestrator
  ├── runTriageOnly()     ← calls claude CLI in read-only mode
  └── runWorker()         ← creates git worktree, runs claude agent, opens PR

.github/workflows/
  ├── ci.yml              ← standard test + lint gate
  └── triage.yml          ← scheduled triage + manual worker dispatch

src/components/scale-badge/
  ├── scale-badge.tsx     ← Stencil component (has a deliberate bug)
  ├── scale-badge.css     ← styles (color variants via :host([color="..."]))
  └── scale-badge.spec.ts ← one passing test, one failing test
```
