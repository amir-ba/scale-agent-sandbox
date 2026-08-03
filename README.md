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

## Seed your board (run once after forking)

One script does everything: creates the two issues, opens the stale PR, creates a
GitHub Project board under your own account, and adds all three items to it as **Backlog**.

```bash
bash scripts/seed-issues.sh
```

The script prints your project number at the end — use it in the commands below.

## Activities

### Phase 1 — Triage Engine (read-only)

```bash
node orchestrator.mjs --triage-only --project-number <YOUR_PROJECT_NUMBER>
```

Watch the agent read Issues #1 and #2 and decide:
- Issue #1 → **eligible** (clear bug, specific test, component lock) → moved to **Autonomous** on your board
- Issue #2 → **needs_owner** (vague, no acceptance criteria) → moved to **Needs owner** on your board

### Phase 2 — Autonomous Worker

```bash
node orchestrator.mjs --run-worker --issue 1 --project-number <YOUR_PROJECT_NUMBER>
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
