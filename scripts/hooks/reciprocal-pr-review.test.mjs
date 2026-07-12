import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  addDetachedWorktree,
  acquireLock,
  assertCallerUnchanged,
  buildGateArgs,
  buildReviewBundle,
  buildReviewComment,
  changedLineLocations,
  claudePermissionPath,
  classifyHookEvent,
  createOwnedTempDir,
  findReviewerComment,
  forceDraftArgs,
  hookOutput,
  parseGateInvocation,
  releaseLock,
  requiresPassingMarkers,
  reviewCommentMutationArgs,
  removeOwnedTempDir,
  removeVerifiedWorktree,
  resolveTrustedCodexCommand,
  resolveTrustedExecutable,
  reviewMarker,
  reviewOutcome,
  run,
  runReviewWorkflow,
  snapshotCaller,
  tokenize,
  validateReviewFindings,
  verifyReviewMarkers,
} from './reciprocal-pr-review.mjs';

const BASE_A = 'a'.repeat(40);
const HEAD_A = 'b'.repeat(40);
const HEAD_B = 'c'.repeat(40);

function pr(head = HEAD_A, base = BASE_A) {
  return {
    number: 42,
    url: 'https://github.com/acme/repo/pull/42',
    baseRefOid: base,
    headRefOid: head,
    isDraft: true,
  };
}

function visibleReview(reviewer, outcome = 'PASS') {
  return `### ${reviewer === 'claude' ? 'Claude' : 'Codex'} PR review\n\nNo findings.\n\nREVIEW_OUTCOME: ${outcome}`;
}

function reviewComment(reviewer, value, id, outcome = 'PASS', updated = '2026-07-12T12:00:00Z', association = 'OWNER') {
  return {
    id,
    body: buildReviewComment(reviewer, value, visibleReview(reviewer, outcome)),
    author_association: association,
    user: { login: 'fixture-owner' },
    created_at: updated,
    updated_at: updated,
  };
}

function shellEvent(command, extra = {}) {
  return { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra };
}

test('Codex and Claude PreToolUse schemas rewrite standalone gh pr create', () => {
  for (const origin of ['codex', 'claude']) {
    const event = shellEvent("gh pr create --title 'Safe title' --body 'Safe body'", origin === 'codex' ? { turn_id: 'turn-1' } : { session_id: 'session-1', permission_mode: 'dontAsk' });
    const decision = classifyHookEvent(event, origin);
    assert.equal(decision.action, 'rewrite');
    assert.equal(decision.kind, 'create');
    assert.equal(decision.origin, origin);
    assert.match(decision.command, new RegExp(`create --origin ${origin} --command-b64`));
    const output = hookOutput(decision);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
    assert.equal(output.hookSpecificOutput.updatedInput.command, decision.command);
    assert.equal(output.hookSpecificOutput.updatedInput.timeout, origin === 'claude' ? 600_000 : undefined);
  }
});

test('actual Codex and Claude hook entrypoints consume stdin and emit valid rewrite JSON', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const relative of ['.codex/hooks/pr-review.mjs', '.claude/hooks/pr-review.mjs']) {
    const result = spawnSync(process.execPath, [path.join(root, relative)], {
      cwd: root,
      input: JSON.stringify(shellEvent('gh pr create --fill')),
      encoding: 'utf8',
      shell: false,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
    assert.match(output.hookSpecificOutput.updatedInput.command, /reciprocal-pr-review\.mjs" create/u);
  }
});

test('hook configs keep existing guards portable and include ready/auto-merge MCP coverage', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const codex = JSON.parse(readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8'));
  const claude = JSON.parse(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  const codexText = JSON.stringify(codex);
  const claudeText = JSON.stringify(claude);
  assert.doesNotMatch(codexText, /\/home\/alex/u);
  assert.match(codexText, /commandWindows/u);
  for (const text of [codexText, claudeText]) {
    assert.match(text, /ready_for_review/u);
    assert.match(text, /enable_auto_merge/u);
    assert.match(text, /box-scope-guard/u);
    assert.match(text, /azure-route-guard/u);
  }
  const benign = JSON.stringify(shellEvent('npm test'));
  for (const relative of [
    '.codex/hooks/box-scope-guard.mjs',
    '.codex/hooks/azure-route-guard.mjs',
    '.claude/hooks/box-scope-guard.mjs',
    '.claude/hooks/azure-route-guard.mjs',
  ]) {
    const result = spawnSync(process.execPath, [path.join(root, relative)], {
      cwd: path.join(root, 'mockup-app'),
      input: benign,
      encoding: 'utf8',
      shell: false,
      timeout: 10_000,
    });
    assert.equal(result.status, 0, `${relative}: ${result.stderr}`);
  }
});

test('status backstop recalculates on base edits and default-branch pushes without checking out head code', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const workflow = readFileSync(path.join(root, '.github', 'workflows', 'reciprocal-ai-review-markers.yml'), 'utf8');
  assert.match(workflow, /ready_for_review, edited/u);
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/u);
  assert.match(workflow, /state: "open"/u);
  assert.match(workflow, /core\.setFailed\("Unable to resolve a valid pull request number\."\);\s+continue;/u);
  assert.match(workflow, /let writeStatus = null;\s+try \{\s+const \{ data: pull \} = await github\.rest\.pulls\.get/u);
  assert.match(workflow, /if \(writeStatus\) await writeStatus\("failure"[\s\S]*?continue;/u);
  assert.match(workflow, /ref: baseSha/u);
  assert.doesNotMatch(workflow, /actions\/checkout/u);
});

test('non-PR shell commands pass through without hook output', () => {
  assert.deepEqual(classifyHookEvent(shellEvent('npm test'), 'codex'), { action: 'pass' });
  assert.equal(hookOutput({ action: 'pass' }), null);
});

test('tokenizer preserves Windows body-file paths and quoted backslashes literally', () => {
  assert.deepEqual(
    tokenize('gh pr create --title "Path" --body-file C:\\Temp\\pr-body.md').tokens,
    ['gh', 'pr', 'create', '--title', 'Path', '--body-file', 'C:\\Temp\\pr-body.md'],
  );
  assert.deepEqual(
    tokenize('gh pr create --title "Path" --body "Use C:\\Temp\\report.txt"').tokens.at(-1),
    'Use C:\\Temp\\report.txt',
  );
});

test('Claude permission paths use Windows absolute //drive syntax', () => {
  if (process.platform === 'win32') assert.match(claudePermissionPath('C:\\Temp\\review.md'), /^\/\/c\/Temp\/review\.md$/u);
  else assert.equal(claudePermissionPath('/tmp/review.md'), '/tmp/review.md');
});

test('compound, web, interactive, alias, path-qualified, API, GraphQL and MCP bypasses are denied', () => {
  const commands = [
    'npm test && gh pr create --fill',
    'gh pr create --fill --web',
    'gh pr create --title title',
    'gh pr new --fill',
    'gh -R acme/repo pr create --fill',
    'gh --repo acme/repo pr create --fill',
    'C:\\tools\\gh.exe pr create --fill',
    'powershell -Command gh pr create --fill',
    'pwsh -NoProfile -Command gh pr merge 42 --squash',
    'env GH_REPO=acme/repo gh pr create --fill',
    'command gh pr create --fill',
    'GH_REPO=acme/repo gh pr create --fill',
    'nice gh pr merge 42 --squash',
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" pr create --fill',
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 42 --squash',
    'gh api -X POST repos/acme/repo/pulls -f title=x',
    'gh api repos/acme/repo/pulls -f title=x -f head=branch -f base=main',
    'GH API repos/acme/repo/pulls -f title=x -f head=branch -f base=main',
    'gh api -X PUT repos/acme/repo/pulls/42/merge',
    'gh api -XPUT repos/acme/repo/pulls/42/merge',
    'gh api -X POST /repos/acme/repo/pulls -f title=x',
    'gh api repos/acme/repo/pulls -ftitle=x -fhead=branch -fbase=main',
    "gh api graphql -f query='mutation { createPullRequest(input:{}) { pullRequest { id } } }'",
    'gh api graphql --input mutation.json',
    'gh pr merge 42',
    'gh pr merge 42 --squash --auto',
    'gh pr merge 42 --squash --admin',
    'gh pr merge 42 --squash --delete-branch',
    'gh pr merge 42 --squash --repo acme/other',
    'gh pr create --fill --repo acme/other',
    'gh pr create --fill --draft=false',
    'gh pr create --fill=false',
    'gh ship',
    'gh -R acme/repo land 42',
    'gh extension exec prmaker',
  ];
  for (const command of commands) assert.equal(classifyHookEvent(shellEvent(command), 'codex').action, 'deny', command);
  assert.equal(classifyHookEvent({ tool_name: 'mcp__codex_apps__github_create_pull_request', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__github__merge_pull_request', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__github__create_pr', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__github__merge_pr', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__github__ready_for_review', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__codex_apps__github_mark_pull_request_ready_for_review', tool_input: {} }).action, 'deny');
  assert.equal(classifyHookEvent({ tool_name: 'mcp__codex_apps__github_enable_auto_merge', tool_input: {} }).action, 'deny');
  assert.deepEqual(classifyHookEvent(shellEvent('rg "gh pr create" docs'), 'codex'), { action: 'pass' });
  assert.deepEqual(classifyHookEvent(shellEvent('git commit -m "document gh pr merge"'), 'codex'), { action: 'pass' });
  assert.deepEqual(classifyHookEvent(shellEvent('gh issue view 42'), 'codex'), { action: 'pass' });
  assert.deepEqual(classifyHookEvent(shellEvent('gh pr view 42'), 'codex'), { action: 'pass' });
  assert.deepEqual(classifyHookEvent(shellEvent('gh --version'), 'codex'), { action: 'pass' });
});

test('standalone merge and ready commands rewrite to the marker gate', () => {
  for (const command of ['gh pr merge 42 --squash', 'gh pr ready 42']) {
    const decision = classifyHookEvent(shellEvent(command), 'claude');
    assert.equal(decision.action, 'rewrite');
    assert.match(decision.command, / gate --origin claude /u);
  }
});

test('create rewriting always replaces draft assignments with one literal draft flag', () => {
  const forcedFalse = forceDraftArgs(tokenize('gh pr create --fill --draft=false').tokens);
  assert.equal(forcedFalse.requestedDraft, false);
  assert.equal(forcedFalse.args.filter((token) => token === '--draft').length, 1);
  assert.equal(forcedFalse.args.some((token) => token.startsWith('--draft=')), false);
  const forcedTrue = forceDraftArgs(tokenize('gh pr create --fill --draft=true').tokens);
  assert.equal(forcedTrue.requestedDraft, true);
  assert.equal(forcedTrue.args.filter((token) => token === '--draft').length, 1);
});

test('gate parsing reconstructs one repository-bound exact-head mutation', () => {
  const merge = parseGateInvocation(tokenize('gh pr merge 42 --squash --subject "Reviewed merge"').tokens);
  assert.deepEqual(merge, {
    kind: 'merge',
    subject: '42',
    mode: '--squash',
    messageArgs: ['--subject', 'Reviewed merge'],
    undo: false,
  });
  assert.deepEqual(
    buildGateArgs(merge, { url: 'https://github.com/acme/repo/pull/42', headRefOid: HEAD_A }, 'acme/repo'),
    ['pr', 'merge', 'https://github.com/acme/repo/pull/42', '--repo', 'acme/repo', '--squash', '--match-head-commit', HEAD_A, '--subject', 'Reviewed merge'],
  );
  assert.equal(requiresPassingMarkers(parseGateInvocation(tokenize('gh pr ready 42').tokens)), true);
  assert.equal(requiresPassingMarkers(parseGateInvocation(tokenize('gh pr ready 42 --undo').tokens)), false);
  for (const unsafe of [
    'gh pr merge 42 --squash --repo acme/other',
    'gh pr merge 42 --squash --auto',
    'gh pr merge 42 --squash --delete-branch',
    'gh pr merge -t value 42 --squash',
    'gh pr ready 42 99',
  ]) assert.throws(() => parseGateInvocation(tokenize(unsafe).tokens), /refused|unsupported|at most one/iu, unsafe);
});

test('markers bind reviewer, exact head, exact base, and revision digest', () => {
  const current = pr();
  const visible = visibleReview('claude');
  const marker = reviewMarker('claude', current, visible, 'pass');
  assert.match(marker, new RegExp(`head=${HEAD_A} base=${BASE_A} result=sha256:[a-f0-9]{64} outcome=pass`));
  const comments = [reviewComment('claude', current, 1), reviewComment('codex', current, 2)];
  assert.equal(verifyReviewMarkers(current, comments).ok, true);
  assert.throws(() => verifyReviewMarkers({ ...current, headRefOid: HEAD_B }, comments), /stale-head/u);
  assert.equal(reviewOutcome('Looks good\nREVIEW_OUTCOME: PASS'), 'pass');
  assert.equal(reviewOutcome('Fix it\nREVIEW_OUTCOME: CHANGES_REQUESTED'), 'changes-requested');
});

test('changes-requested reviews require severity and a line inside a changed hunk', () => {
  const diff = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -8,3 +8,5 @@ existing',
    ' context',
    '+changed',
    '+more',
  ].join('\n');
  assert.deepEqual([...changedLineLocations(diff).entries()], [['src/example.ts', [[8, 12]]]]);
  assert.deepEqual(
    validateReviewFindings('- [P1] Fix the regression — `src/example.ts:10`\nREVIEW_OUTCOME: CHANGES_REQUESTED', diff),
    [{ file: 'src/example.ts', line: 10 }],
  );
  assert.throws(
    () => validateReviewFindings('Fix the regression\nREVIEW_OUTCOME: CHANGES_REQUESTED', diff),
    /at least one finding/u,
  );
  assert.throws(
    () => validateReviewFindings('- [P1] Wrong line — `src/example.ts:99`\nREVIEW_OUTCOME: CHANGES_REQUESTED', diff),
    /outside the aggregate diff hunks/u,
  );
  assert.throws(
    () => validateReviewFindings('- [P1] Contradiction — `src/example.ts:10`\nREVIEW_OUTCOME: PASS', diff),
    /passing review cannot contain/u,
  );
});

function fakeDeps(options = {}) {
  const events = [];
  const commentsByHead = new Map();
  const resolveSequence = [...(options.resolveSequence || [])];
  let current = { ...pr(), isDraft: !options.existingReady };
  const commentsFor = (value) => {
    if (!commentsByHead.has(value.headRefOid)) commentsByHead.set(value.headRefOid, []);
    return commentsByHead.get(value.headRefOid);
  };
  let nextCommentId = 10;
  let readyHeadChanged = false;
  if (options.existingBoth) commentsByHead.set(HEAD_A, [
    reviewComment('claude', current, 1, options.existingClaudeOutcome || 'PASS'),
    reviewComment('codex', current, 2, options.existingCodexOutcome || 'PASS'),
  ]);
  return {
    events,
    commentsByHead,
    async snapshot() { events.push('snapshot'); return { stable: true }; },
    async create(_command, _cwd, opts) { events.push(`create:draft=${opts.forceDraft}`); return { subject: current.url, requestedDraft: Boolean(options.requestedDraft) }; },
    async makeDraft() { events.push('make-draft'); current = { ...current, isDraft: true }; },
    async resolve() {
      events.push('resolve');
      if (resolveSequence.length) {
        const next = resolveSequence.shift();
        if (next) current = pr(next);
      }
      return { ...current };
    },
    async comments(value) { events.push(`comments:${value.headRefOid}`); return [...commentsFor(value)]; },
    async lock(value) { events.push(`lock:${value.headRefOid}`); return `lock-${value.headRefOid}`; },
    async unlock(value) { events.push(`unlock:${value}`); },
    async addWorktree(value) { events.push(`worktree:add:${value.headRefOid}`); return `temp-${value.headRefOid}`; },
    async removeWorktree(temp) { events.push(`worktree:remove:${temp}`); },
    async claude(_temp, value) {
      events.push(`claude:${value.headRefOid}`);
      if (options.claudeFails) throw new Error('Claude failed');
      if (!options.claudeOmitsComment) commentsFor(value).push(reviewComment('claude', value, nextCommentId++, options.claudeOutcome || 'PASS'));
    },
    async codex(_temp, value) { events.push(`codex:${value.headRefOid}`); if (options.codexFails) throw new Error('Codex failed'); return 'No findings.\nREVIEW_OUTCOME: PASS'; },
    async postCodex(value) { events.push(`codex:post:${value.headRefOid}`); if (!options.codexOmitsComment) commentsFor(value).push(reviewComment('codex', value, nextCommentId++)); },
    async status(value) { events.push(`status:${value.headRefOid}`); },
    async ready(value) {
      events.push(`ready:${value.headRefOid}`);
      if (options.headChangesOnReady && !readyHeadChanged) {
        readyHeadChanged = true;
        current = { ...pr(HEAD_B), isDraft: false };
      } else {
        current = { ...current, isDraft: false };
      }
    },
    async assertUnchanged() { events.push('unchanged'); if (options.stateChanged) throw new Error('Caller changed'); },
  };
}

test('successful workflow forces draft, reviews Claude first, then Codex, verifies, readies, and cleans up', async () => {
  const deps = fakeDeps();
  await runReviewWorkflow({ command: 'gh pr create --fill', origin: 'codex', cwd: 'fixture', deps });
  assert.ok(deps.events.indexOf('create:draft=true') < deps.events.indexOf(`claude:${HEAD_A}`));
  assert.ok(deps.events.indexOf(`claude:${HEAD_A}`) < deps.events.indexOf(`codex:${HEAD_A}`));
  assert.ok(deps.events.indexOf(`codex:post:${HEAD_A}`) < deps.events.indexOf(`status:${HEAD_A}`));
  assert.ok(deps.events.includes(`ready:${HEAD_A}`));
  assert.ok(deps.events.includes(`worktree:remove:temp-${HEAD_A}`));
  assert.equal(deps.events.at(-2), 'unchanged');
  assert.equal(deps.events.at(-1), 'origin:codex');
});

test('an explicitly draft PR stays draft after both reviews', async () => {
  const deps = fakeDeps({ requestedDraft: true });
  await runReviewWorkflow({ command: 'gh pr create --fill --draft', origin: 'claude', cwd: 'fixture', deps });
  assert.equal(deps.events.some((event) => event.startsWith('ready:')), false);
});

test('review-existing returns an originally ready PR to draft, re-reviews, then readies it', async () => {
  const deps = fakeDeps({ existingReady: true });
  await runReviewWorkflow({ origin: 'existing-pr', cwd: 'fixture', existing: { repo: 'acme/repo', pr: 42 }, deps });
  assert.ok(deps.events.includes('make-draft'));
  assert.ok(deps.events.includes(`claude:${HEAD_A}`));
  assert.ok(deps.events.includes(`codex:${HEAD_A}`));
  assert.ok(deps.events.includes(`ready:${HEAD_A}`));
  assert.equal(deps.events.some((event) => event.startsWith('create:')), false);
});

test('same-head marker idempotency skips both model calls', async () => {
  const deps = fakeDeps({ existingBoth: true, requestedDraft: true });
  await runReviewWorkflow({ command: 'gh pr create --fill --draft', origin: 'codex', cwd: 'fixture', deps });
  assert.equal(deps.events.some((event) => event.startsWith('claude:')), false);
  assert.equal(deps.events.some((event) => event.startsWith('codex:') && !event.startsWith('codex:post')), false);
  assert.ok(deps.events.includes(`status:${HEAD_A}`));
});

test('same-head changes-requested marker is not rerun and still blocks final success after both attestations', async () => {
  const deps = fakeDeps({ existingBoth: true, existingClaudeOutcome: 'CHANGES_REQUESTED', requestedDraft: true });
  await assert.rejects(
    runReviewWorkflow({ command: 'gh pr create --fill --draft', origin: 'codex', cwd: 'fixture', deps }),
    /claude: changes-requested/u,
  );
  assert.equal(deps.events.some((event) => event === `claude:${HEAD_A}`), false);
  assert.equal(deps.events.some((event) => event === `codex:${HEAD_A}`), false);
});

test('a fresh Claude changes-requested attestation still runs the independent Codex review', async () => {
  const deps = fakeDeps({ claudeOutcome: 'CHANGES_REQUESTED', requestedDraft: true });
  await assert.rejects(
    runReviewWorkflow({ command: 'gh pr create --fill --draft', origin: 'codex', cwd: 'fixture', deps }),
    /claude: changes-requested/u,
  );
  assert.ok(deps.events.includes(`claude:${HEAD_A}`));
  assert.ok(deps.events.includes(`codex:${HEAD_A}`));
  assert.ok(deps.events.includes(`codex:post:${HEAD_A}`));
});

test('a head change causes a bounded restart and both reviews bind the new head', async () => {
  // initial A; after first Claude resolve B; all remaining resolves stay B
  const deps = fakeDeps({ resolveSequence: [HEAD_A, HEAD_B, HEAD_B, HEAD_B, HEAD_B] });
  const result = await runReviewWorkflow({ command: 'gh pr create --fill', origin: 'codex', cwd: 'fixture', deps });
  assert.equal(result.headRefOid, HEAD_B);
  assert.ok(deps.events.includes(`claude:${HEAD_A}`));
  assert.ok(deps.events.includes(`claude:${HEAD_B}`));
  assert.ok(deps.events.includes(`codex:${HEAD_B}`));
  assert.ok(deps.events.includes(`worktree:remove:temp-${HEAD_A}`));
});

test('a head change while marking ready is returned to draft and fully re-reviewed', async () => {
  const deps = fakeDeps({ headChangesOnReady: true });
  const result = await runReviewWorkflow({ command: 'gh pr create --fill', origin: 'codex', cwd: 'fixture', deps });
  assert.equal(result.headRefOid, HEAD_B);
  assert.ok(deps.events.includes(`ready:${HEAD_A}`));
  assert.ok(deps.events.includes('make-draft'));
  assert.ok(deps.events.includes(`claude:${HEAD_B}`));
  assert.ok(deps.events.includes(`codex:${HEAD_B}`));
  assert.ok(deps.events.includes(`ready:${HEAD_B}`));
});

test('missing Claude comment fails visibly and still cleans worktree and caller state', async () => {
  const deps = fakeDeps({ claudeOmitsComment: true });
  await assert.rejects(runReviewWorkflow({ command: 'gh pr create --fill', origin: 'codex', cwd: 'fixture', deps }), /Claude marker missing/u);
  assert.ok(deps.events.includes(`worktree:remove:temp-${HEAD_A}`));
  assert.ok(deps.events.includes('unchanged'));
});

test('reviewer failure and missing Codex publication both fail visibly with cleanup', async () => {
  for (const options of [{ codexFails: true }, { codexOmitsComment: true }]) {
    const deps = fakeDeps(options);
    await assert.rejects(runReviewWorkflow({ command: 'gh pr create --fill', origin: 'claude', cwd: 'fixture', deps }));
    assert.ok(deps.events.includes(`worktree:remove:temp-${HEAD_A}`));
    assert.ok(deps.events.includes('unchanged'));
  }
});

test('canonical evaluator rejects untrusted, tampered, stale, and changes-requested markers', () => {
  const current = pr();
  const validClaude = reviewComment('claude', current, 10);
  const validCodex = reviewComment('codex', current, 11);
  assert.throws(() => verifyReviewMarkers(current, [{ ...validClaude, author_association: 'NONE' }, validCodex]), /claude: missing/u);
  assert.throws(() => verifyReviewMarkers(current, [{ ...validClaude, body: `tampered\n${validClaude.body}` }, validCodex]), /claude: missing/u);
  assert.throws(() => verifyReviewMarkers(current, [validClaude, reviewComment('codex', current, 12, 'CHANGES_REQUESTED')]), /codex: changes-requested/u);
});

test('reviewer comment selection uses the exact trusted canonical comment id, never edit-last', () => {
  const current = pr();
  const comments = [
    reviewComment('claude', current, 31, 'PASS', '2026-07-12T10:00:00Z'),
    reviewComment('claude', current, 47, 'PASS', '2026-07-12T11:00:00Z'),
    reviewComment('claude', current, 99, 'PASS', '2026-07-12T12:00:00Z', 'NONE'),
  ];
  assert.equal(findReviewerComment(comments, 'claude').commentId, 47);
});

test('review comment creation and updates use payload files rather than body argv', () => {
  const bodyFile = 'C:\\Temp\\comment-body.md';
  const jsonFile = 'C:\\Temp\\comment-body.json';
  const createArgs = reviewCommentMutationArgs({
    slug: 'acme/repo',
    prUrl: 'https://github.com/acme/repo/pull/42',
    bodyFile,
    jsonFile,
  });
  assert.deepEqual(createArgs, ['pr', 'comment', 'https://github.com/acme/repo/pull/42', '--repo', 'acme/repo', '--body-file', bodyFile]);
  const updateArgs = reviewCommentMutationArgs({
    slug: 'acme/repo',
    prUrl: 'https://github.com/acme/repo/pull/42',
    existingCommentId: 123,
    bodyFile,
    jsonFile,
  });
  assert.deepEqual(updateArgs, ['api', '--method', 'PATCH', 'repos/acme/repo/issues/comments/123', '--input', jsonFile]);
  assert.equal([...createArgs, ...updateArgs].some((value) => String(value).includes('REVIEW_OUTCOME')), false);
  assert.throws(() => reviewCommentMutationArgs({ slug: 'acme/repo', prUrl: 'x', existingCommentId: 'not-a-number', bodyFile, jsonFile }), /invalid bound review comment id/iu);
});

test('recursive temporary cleanup requires containment, prefix, and matching ownership sentinel', () => {
  const owned = createOwnedTempDir('collisionspike-test-owned-');
  writeFileSync(path.join(owned.location, 'child.txt'), 'fixture');
  assert.throws(() => removeOwnedTempDir({ ...owned, token: 'wrong' }), /ownership sentinel/u);
  removeOwnedTempDir(owned);
});

test('detached worktree lifecycle leaves caller branch, head, and status unchanged', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'collisionspike-pr-review-git-fixture-'));
  try {
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8', shell: false });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'user.name', 'Fixture');
    writeFileSync(path.join(fixture, 'fixture.txt'), 'one\n');
    git('add', 'fixture.txt');
    git('commit', '-m', 'fixture');
    const before = snapshotCaller(fixture);
    const temp = addDetachedWorktree(before.root, before.head);
    assert.notEqual(path.resolve(temp), path.resolve(fixture));
    removeVerifiedWorktree(before.root, temp, before.head);
    assertCallerUnchanged(before);
    assert.equal(git('worktree', 'list', '--porcelain').includes(path.resolve(temp)), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('trusted Windows-safe Codex command and core CLIs execute without shell shims', { skip: Boolean(process.env.CI) }, () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const name of ['git', 'gh', 'claude']) {
    const executable = resolveTrustedExecutable(name, root);
    assert.equal(path.isAbsolute(executable), true);
    const result = spawnSync(executable, ['--version'], { encoding: 'utf8', shell: false, timeout: 15_000 });
    assert.equal(result.status, 0, `${name}: ${result.error?.message || result.stderr}`);
  }
  const codex = resolveTrustedCodexCommand(root);
  const result = spawnSync(codex.file, [...codex.prefixArgs, '--version'], { encoding: 'utf8', shell: false, timeout: 15_000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /codex/iu);
});

test('command runner enforces reviewer-style timeouts', () => {
  assert.throws(
    () => run(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], { cwd: process.cwd(), timeout: 25 }),
    /timed out|ETIMEDOUT/iu,
  );
});

test('lock contention fails closed and stale ownership can be recovered safely', () => {
  const value = { url: `https://github.com/acme/repo/pull/${Date.now()}`, headRefOid: randomHead() };
  const first = acquireLock(value);
  assert.throws(() => acquireLock(value), /already running/u);
  const stale = JSON.parse(readFileSync(first.lockPath, 'utf8'));
  writeFileSync(first.lockPath, JSON.stringify({ ...stale, pid: process.pid, createdAt: 0 }));
  assert.throws(() => acquireLock(value), /already running/u);
  writeFileSync(first.lockPath, JSON.stringify({ ...stale, pid: 999_999_999, createdAt: 0 }));
  const recovered = acquireLock(value);
  assert.notEqual(recovered.token, first.token);
  releaseLock(recovered);
});

test('review bundle contains every commit patch plus the aggregate diff', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'collisionspike-pr-bundle-fixture-'));
  let bundle;
  try {
    const gitPath = resolveTrustedExecutable('git', fixture);
    const git = (...args) => run(gitPath, args, { cwd: fixture }).stdout.trim();
    git('init');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'user.name', 'Fixture');
    writeFileSync(path.join(fixture, 'fixture.txt'), 'base\n');
    git('add', 'fixture.txt');
    git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(path.join(fixture, 'fixture.txt'), 'base\none\n');
    git('commit', '-am', 'one');
    const first = git('rev-parse', 'HEAD');
    writeFileSync(path.join(fixture, 'fixture.txt'), 'base\none\ntwo\n');
    git('commit', '-am', 'two');
    const head = git('rev-parse', 'HEAD');
    bundle = buildReviewBundle(fixture, { ...pr(head, base), baseRefOid: base, headRefOid: head }, gitPath);
    const context = readFileSync(bundle.file, 'utf8');
    assert.match(context, /PER-COMMIT PATCHES/u);
    assert.match(context, new RegExp(first));
    assert.match(context, new RegExp(head));
    assert.match(context, /AGGREGATE PATCH/u);
    assert.match(context, /\+two/u);
  } finally {
    if (bundle) removeOwnedTempDir(bundle.owned);
    rmSync(fixture, { recursive: true, force: true });
  }
});

function randomHead() {
  return `${Date.now().toString(16).padStart(12, '0')}${'d'.repeat(28)}`.slice(0, 40);
}
