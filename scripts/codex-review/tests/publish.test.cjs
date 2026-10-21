const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publish, MARKER } = require('../publish.cjs');

const HEAD = 'a'.repeat(40), BASE = 'b'.repeat(40);
function fixture(t, { comments = [], status = 'complete', reviewResult = 'success', current = {}, reportHead = HEAD, missing = false } = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-publish-'));
  t.after(() => fs.rmSync(reportDir, { recursive: true, force: true }));
  if (!missing) {
    fs.writeFileSync(path.join(reportDir, 'review.json'), JSON.stringify({ schema_version: 1, status, metadata: { head_sha: reportHead, base_sha: BASE } }));
    fs.writeFileSync(path.join(reportDir, 'review.md'), status === 'complete' ? '## Codex review\n\nNo actionable findings were reported.' : '## Codex review incomplete\n\nTimed out.');
  }
  const calls = [];
  const pr = { number: 7, state: 'open', draft: false, head: { sha: HEAD }, base: { sha: BASE } };
  const github = {
    rest: {
      pulls: { get: async () => ({ data: { ...pr, ...current } }) },
      issues: {
        listComments: Symbol('listComments'),
        createComment: async data => calls.push({ method: 'create', ...data }),
        updateComment: async data => calls.push({ method: 'update', ...data }),
      },
    },
    paginate: async (method, input) => {
      assert.equal(method, github.rest.issues.listComments);
      assert.equal(input.per_page, 100);
      return comments;
    },
  };
  return { calls, args: { github, reportDir, reviewResult, core: { info() {} },
    context: { payload: { pull_request: pr }, repo: { owner: 'owner', repo: 'repo' }, runId: 123 } } };
}

test('creates one clean summary with workflow link', async t => {
  const { args, calls } = fixture(t);
  await publish(args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'create');
  assert.ok(calls[0].body.startsWith(MARKER));
  assert.match(calls[0].body, /No actionable findings/);
  assert.match(calls[0].body, /actions\/runs\/123/);
});

test('updates existing bot comment from paginated results, ignoring forged markers', async t => {
  const comments = Array.from({ length: 101 }, (_, id) => ({ id, user: { login: 'human', type: 'User' }, body: MARKER }));
  comments.push({ id: 999, user: { login: 'github-actions[bot]', type: 'Bot' }, body: `${MARKER}\nOld P1 finding` });
  const { args, calls } = fixture(t, { comments });
  await publish(args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'update');
  assert.equal(calls[0].comment_id, 999);
  assert.doesNotMatch(calls[0].body, /Old P1 finding/);
});

for (const current of [{ state: 'closed' }, { draft: true }, { head: { sha: 'c'.repeat(40) } }, { base: { sha: 'd'.repeat(40) } }]) {
  test(`rejects stale or ineligible PR ${JSON.stringify(current)}`, async t => {
    const { args, calls } = fixture(t, { current });
    await publish(args);
    assert.equal(calls.length, 0);
  });
}

test('rechecks revisions immediately before writing', async t => {
  const { args, calls } = fixture(t);
  let reads = 0;
  args.github.rest.pulls.get = async () => ({ data: { ...args.context.payload.pull_request, state: ++reads === 1 ? 'open' : 'closed' } });
  await publish(args);
  assert.equal(calls.length, 0);
});

for (const options of [{ status: 'incomplete', reviewResult: 'failure' }, { missing: true }, { reportHead: 'c'.repeat(40) }, { reviewResult: 'failure' }]) {
  test(`publishes incomplete rather than clean for ${JSON.stringify(options)}`, async t => {
    const { args, calls } = fixture(t, options);
    await publish(args);
    assert.match(calls[0].body, /review incomplete/);
    assert.doesNotMatch(calls[0].body, /No actionable findings/);
  });
}

test('limits oversized comments and points to the full artifact', async t => {
  const { args, calls } = fixture(t);
  fs.writeFileSync(path.join(args.reportDir, 'review.md'), '## Codex review\n' + 'x'.repeat(70000));
  await publish(args);
  assert.ok(calls[0].body.length < 50000);
  assert.match(calls[0].body, /shortened/);
});

test('workflow only admits internal human non-draft PRs', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../..', '.github/workflows/codex-review.yml'), 'utf8');
  const expression = workflow.match(/review:\n    if: >-\n([\s\S]*?)\n    runs-on:/)[1].trim();
  const admits = new Function('github', `return (${expression});`);
  const github = { repository: 'owner/repo', actor: 'human', event: { sender: { type: 'User' }, pull_request: { draft: false, head: { repo: { full_name: 'owner/repo' } }, user: { type: 'User' } } } };
  assert.equal(admits(github), true);
  const mutations = [g => g.event.pull_request.draft = true, g => g.event.pull_request.head.repo.full_name = 'fork/repo',
    g => g.event.pull_request.user.type = 'Bot', g => g.event.sender.type = 'Bot', g => g.actor = 'dependabot[bot]'];
  for (const mutate of mutations) { const g = structuredClone(github); mutate(g); assert.equal(admits(g), false); }
  assert.doesNotMatch(workflow, /codex-action|pull_request_target/);
  assert.equal((workflow.match(/secrets.CODEX_API_KEY/g) || []).length, 1);
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1], /@[0-9a-f]{40}$/);
});
