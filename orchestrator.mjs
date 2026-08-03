/**
 * Barcamp sandbox orchestrator — a simplified, CLI-first version of the
 * scale-matinaner proactive-agent architecture.
 *
 * Usage:
 *   node orchestrator.mjs --triage-only
 *   node orchestrator.mjs --run-worker --issue 1
 *   node orchestrator.mjs --run-worker --pr 3
 *
 * Requires: gh (GitHub CLI, authenticated), git, node >= 18
 * The ANTHROPIC_API_KEY env var must be set (used by the `claude` CLI).
 */

import { spawnSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

function gh(...args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function banner(msg) {
  const line = '─'.repeat(msg.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${msg}  │`);
  console.log(`└${line}┘\n`);
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

function detectRepo() {
  const remote = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (remote.status !== 0) throw new Error('Could not detect repo. Run `gh auth login` first.');
  return JSON.parse(remote.stdout).nameWithOwner;
}

function fetchIssue(repo, number) {
  const data = JSON.parse(
    gh('issue', 'view', String(number), '--repo', repo, '--json',
      'number,title,body,url,labels,createdAt'),
  );
  return { content: { type: 'Issue', ...data } };
}

function fetchPR(repo, number) {
  const data = JSON.parse(
    gh('pr', 'view', String(number), '--repo', repo, '--json',
      'number,title,body,url,labels,createdAt,headRefName,baseRefName'),
  );
  return { content: { type: 'PullRequest', ...data } };
}

function fetchBacklog(repo, projectNumber, projectOwner) {
  banner('Fetching GitHub Project board');
  const board = JSON.parse(
    gh('project', 'item-list', String(projectNumber),
      '--owner', projectOwner, '--limit', '50', '--format', 'json'),
  );
  console.log(`Found ${board.items.length} items on the board.\n`);
  return board;
}

// ---------------------------------------------------------------------------
// Triage — calls claude CLI in read-only mode and parses JSON back
// ---------------------------------------------------------------------------

function triageItem(item, { repo, projectOwner, projectNumber, model = 'claude-sonnet-4-5' }) {
  const prompt = buildTriagePrompt(item, { projectOwner, projectNumber });

  console.log(`  Triaging: #${item.content.number} "${item.content.title}"`);
  const result = spawnSync(
    'claude',
    [
      '-p', prompt,
      '--model', model,
      '--output-format', 'text',
      '--no-ask-user',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000 },
  );

  if (result.status !== 0) {
    throw new Error(`claude triage failed: ${result.stderr || 'no output'}`);
  }

  return parseTriageResponse(result.stdout);
}

function buildTriagePrompt(item, { projectOwner, projectNumber }) {
  return `You are a triage agent for a web component library.
Assess whether this GitHub item can be fixed autonomously by an AI agent.

Rules for ELIGIBLE (eligible: true):
- The issue has clear reproduction steps or acceptance criteria.
- The fix is scoped to a single component.
- You can name a specific test or build command that verifies the fix.

Rules for INELIGIBLE (eligible: false):
- The issue is vague, missing reproduction steps, or requires a design decision.
- The fix touches multiple unrelated components.

GitHub Project: owner="${projectOwner}", number=${projectNumber}
Repository: ${item.content?.url?.split('/').slice(0,5).join('/') ?? 'unknown'}

Return ONLY a valid JSON object — no markdown, no explanation:
{"eligible":true,"locks":["component:scale-badge"],"verification":["npm test"],"rationale":"one sentence"}
OR
{"eligible":false,"locks":[],"verification":[],"blocker":"one sentence","decisionBrief":"comment for the GitHub issue"}

Item:
${JSON.stringify(item, null, 2)}`;
}

function parseTriageResponse(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in triage output: ${output.slice(0, 200)}`);
  const raw = output.slice(start, end + 1);
  const result = JSON.parse(raw);
  if (typeof result.eligible !== 'boolean') throw new Error('Triage JSON missing `eligible` boolean');
  return result;
}

// ---------------------------------------------------------------------------
// Triage-only mode
// ---------------------------------------------------------------------------

async function runTriageOnly({ repo, projectNumber, projectOwner, model }) {
  banner('Phase 1: Triage Engine (read-only)');

  const board = fetchBacklog(repo, projectNumber, projectOwner);
  const backlog = board.items.filter((i) => i.status === 'Backlog');

  if (backlog.length === 0) {
    console.log('No Backlog items to triage.');
    return;
  }

  const results = [];
  for (const item of backlog) {
    try {
      const triage = triageItem(item, { repo, projectOwner, projectNumber, model });
      results.push({ item, triage });
      const icon = triage.eligible ? '✅' : '❌';
      console.log(`  ${icon} #${item.content.number}: eligible=${triage.eligible}`);
      if (triage.eligible) {
        console.log(`     locks: ${triage.locks.join(', ')}`);
        console.log(`     verify: ${triage.verification.join(', ')}`);
        console.log(`     rationale: ${triage.rationale}`);
      } else {
        console.log(`     blocker: ${triage.blocker}`);
      }
    } catch (err) {
      console.error(`  ⚠️  Triage failed for #${item.content.number}: ${err.message}`);
      results.push({ item, triage: null, error: err.message });
    }
  }

  console.log('\n--- Triage summary (JSON) ---');
  console.log(JSON.stringify(results, null, 2));
}

// ---------------------------------------------------------------------------
// Worker — creates a worktree, invokes claude CLI to implement the fix, opens PR
// ---------------------------------------------------------------------------

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/, '')
    .slice(0, 48);
}

function prepareWorktree({ repo, repoPath, item, stateDir }) {
  const { type, number, title } = item.content;
  const slug = slugify(title ?? String(number));
  const prefix = type === 'PullRequest' ? 'pr' : 'issue';
  const branch = `copilot/${prefix}-${number}-${slug}`;
  const worktreeDir = join(stateDir, 'worktrees', `${prefix}-${number}`);

  mkdirSync(join(stateDir, 'worktrees'), { recursive: true });

  // Fetch latest from origin
  console.log('  Fetching latest from origin...');
  git(repoPath, 'fetch', 'origin', '--prune');

  // Remove stale worktree if it exists
  try { git(repoPath, 'worktree', 'remove', '--force', worktreeDir); } catch { /* ok */ }

  // Remove stale branch if it exists
  try { git(repoPath, 'branch', '-D', branch); } catch { /* ok */ }

  // For a PR: check out the PR's branch; for an issue: branch from main
  const startPoint = type === 'PullRequest'
    ? (() => { git(repoPath, 'fetch', 'origin', `pull/${number}/head`); return 'FETCH_HEAD'; })()
    : 'origin/main';

  git(repoPath, 'worktree', 'add', '-b', branch, worktreeDir, startPoint);
  const headSha = git(worktreeDir, 'rev-parse', 'HEAD').trim();

  console.log(`  Worktree ready at ${worktreeDir} (${branch})`);
  return { branch, worktreeDir, headSha };
}

function buildWorkerPrompt({ item, repo, manifest }) {
  const { type, url, number } = item.content;
  const resultPath = manifest.resultPath;

  if (type === 'PullRequest') {
    return `You are reviewing a pull request in an isolated worktree.

PR: ${url}

Tasks:
1. Read the changed files in this worktree.
2. Run \`npm test\` and \`npm run lint\` to check the current state.
3. If tests or lint fail, fix them by editing the source files.
4. Commit any fixes with message "fix: address CI failures in PR #${number}".
5. Push the branch to origin.

DO NOT open a new PR — this is a PR review lane.

Write exactly one JSON object to the file at path: ${resultPath}
Success: {"status":"ready","prUrl":"${url}","headSha":"<git rev-parse HEAD>"}
Needs human: {"status":"needs_owner","reason":"...","comment":"..."}
Failed: {"status":"failed","reason":"..."}`;
  }

  return `You are implementing a GitHub issue in an isolated worktree.

Issue: ${url}

Tasks:
1. Read the issue body to understand the bug.
2. Read the relevant source files (start with src/components/).
3. Fix the bug by editing the source files.
4. Run \`npm test\` to verify the fix — ALL tests must pass.
5. Commit with message "fix: <issue title> (closes #${number})".
6. Push the branch and open a PR against main on ${repo}.

Write exactly one JSON object to the file at path: ${resultPath}
Success: {"status":"ready","prUrl":"<the PR URL you opened>","headSha":"<git rev-parse HEAD>"}
Needs human: {"status":"needs_owner","reason":"...","comment":"..."}
Failed: {"status":"failed","reason":"..."}`;
}

async function runWorker({ repo, repoPath, issueNumber, prNumber, stateDir, model }) {
  const itemNumber = issueNumber ?? prNumber;
  const itemType = issueNumber ? 'Issue' : 'PullRequest';

  banner(`Phase 2: Autonomous Worker — ${itemType} #${itemNumber}`);

  const item = issueNumber ? fetchIssue(repo, issueNumber) : fetchPR(repo, prNumber);
  console.log(`  Title: "${item.content.title}"\n`);

  const { branch, worktreeDir, headSha } = prepareWorktree({ repo, repoPath, item, stateDir });

  const workersDir = join(stateDir, 'workers');
  mkdirSync(workersDir, { recursive: true });

  const prefix = itemType === 'PullRequest' ? 'pr' : 'issue';
  const manifestPath = join(workersDir, `${prefix}-${itemNumber}.json`);
  const resultPath = join(workersDir, `${prefix}-${itemNumber}-result.json`);

  const manifest = {
    sessionId: randomUUID(),
    itemType,
    itemNumber,
    itemUrl: item.content.url,
    title: item.content.title,
    branch,
    worktree: worktreeDir,
    initialHeadSha: headSha,
    resultPath,
    status: 'running',
    startedAt: new Date().toISOString(),
    model,
  };
  writeJsonAtomic(manifestPath, manifest);

  const prompt = buildWorkerPrompt({ item, repo, manifest });

  console.log('  Launching claude CLI worker...\n');

  // Run claude in the foreground so attendees can watch the output
  const worker = spawnSync(
    'claude',
    [
      '-p', prompt,
      '-C', worktreeDir,
      '--model', model,
      '--output-format', 'text',
      '--no-ask-user',
      '--autopilot',
      '--allow-all-tools',
      '--add-dir', workersDir,
      '--allow-tool=write',
      '--allow-tool=shell',
      '--allow-url=github.com',
      '--deny-tool=shell(git push --force)',
      '--deny-tool=shell(git reset --hard)',
      '--deny-tool=shell(git clean)',
    ],
    {
      cwd: worktreeDir,
      encoding: 'utf8',
      windowsHide: false,
      stdio: 'inherit',
      timeout: 10 * 60 * 1000,
    },
  );

  if (worker.status !== 0) {
    console.error(`\n  Worker exited with status ${worker.status}`);
  }

  let result;
  try {
    result = readJson(resultPath);
    console.log('\n  Worker result:');
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error(`\n  No result file written to ${resultPath}`);
    result = { status: 'failed', reason: 'no result file' };
  }

  Object.assign(manifest, { status: result.status, completedAt: new Date().toISOString(), result });
  writeJsonAtomic(manifestPath, manifest);

  if (result.status === 'ready') {
    console.log(`\n  PR opened: ${result.prUrl}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      'triage-only': { type: 'boolean', default: false },
      'run-worker': { type: 'boolean', default: false },
      issue: { type: 'string' },
      pr: { type: 'string' },
      repo: { type: 'string' },
      'project-number': { type: 'string', default: '2' },
      'project-owner': { type: 'string' },
      'state-dir': { type: 'string', default: '.barcamp-state' },
      model: { type: 'string', default: 'claude-sonnet-4-5' },
    },
  });

  const repoPath = process.cwd();
  const repo = values.repo ?? detectRepo();
  const [owner] = repo.split('/');
  const projectOwner = values['project-owner'] ?? owner;
  const projectNumber = Number.parseInt(values['project-number'], 10);
  const stateDir = join(repoPath, values['state-dir']);
  const model = values.model;

  mkdirSync(stateDir, { recursive: true });

  if (values['triage-only']) {
    await runTriageOnly({ repo, projectNumber, projectOwner, model });
    return;
  }

  if (values['run-worker']) {
    if (!values.issue && !values.pr) {
      throw new Error('--run-worker requires --issue <n> or --pr <n>');
    }
    await runWorker({
      repo,
      repoPath,
      issueNumber: values.issue ? Number.parseInt(values.issue, 10) : undefined,
      prNumber: values.pr ? Number.parseInt(values.pr, 10) : undefined,
      stateDir,
      model,
    });
    return;
  }

  console.log(`
Barcamp Sandbox Orchestrator
============================

Usage:
  node orchestrator.mjs --triage-only
      Read-only scan of the GitHub Project board. Prints triage JSON for
      each Backlog item and shows which are eligible for autonomous work.

  node orchestrator.mjs --run-worker --issue 1
      Create an isolated worktree, invoke the claude CLI agent to fix
      Issue #1, run tests, push the branch, and open a PR.

  node orchestrator.mjs --run-worker --pr 3
      Fix CI failures on PR #3 in an isolated worktree.

Options:
  --repo <owner/name>        Override repo detection (default: gh repo view)
  --project-number <n>       GitHub Project number (default: 1)
  --project-owner <org>      GitHub org/user owning the project (default: repo owner)
  --state-dir <path>         Where to store manifests & worktrees (default: .barcamp-state)
  --model <model-id>         Claude model to use (default: claude-sonnet-4-5)
`);
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
