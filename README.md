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

# 4. Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# 5. Install the claude CLI
npm install -g @anthropic-ai/claude-code
```

## Activities

### Phase 1 — Triage Engine (read-only)

```bash
node orchestrator.mjs --triage-only
```

Watch the agent read Issues #1 and #2 and decide:
- Issue #1 → **eligible** (clear bug, specific test, component lock)
- Issue #2 → **needs_owner** (vague, no acceptance criteria)

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

## GitHub Actions (automated mode)

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Every push / PR | `npm run lint` + `npm test` |
| `triage.yml` (triage job) | Every 15 min | Read-only triage scan (project #2) |
| `triage.yml` (worker job) | Manual dispatch | Fix issue or PR by number |

Add `ANTHROPIC_API_KEY` to **Settings → Secrets** to enable the AI workflows.

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
