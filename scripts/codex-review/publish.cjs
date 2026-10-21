// GitHub-only adapter. Load this file from the PR base revision, never its head.
const fs = require('node:fs');
const path = require('node:path');

const MARKER = '<!-- codex-review:v1 -->';
const BOT = 'github-actions[bot]';
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

async function publish({ github, context, core, reportDir, reviewResult }) {
  const pr = context.payload.pull_request;
  const target = { ...context.repo, issue_number: pr.number };
  const current = async () => (await github.rest.pulls.get({ ...context.repo, pull_number: pr.number })).data;
  const eligible = (value) => value.state === 'open' && !value.draft &&
    value.head.sha === pr.head.sha && value.base.sha === pr.base.sha;
  if (!eligible(await current())) {
    core.info('Skipping feedback: PR closed, became draft, or revisions changed.');
    return;
  }

  let markdown;
  try {
    const jsonFile = path.join(reportDir, 'review.json');
    const mdFile = path.join(reportDir, 'review.md');
    if (fs.statSync(jsonFile).size > 200_000 || fs.statSync(mdFile).size > 300_000) throw Error('oversize');
    const report = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    if (report.schema_version !== 1 || !['complete', 'incomplete'].includes(report.status) ||
        !SHA.test(report.metadata?.head_sha) || report.metadata.head_sha !== pr.head.sha ||
        report.metadata.base_sha !== pr.base.sha ||
        (report.status === 'complete' && reviewResult !== 'success')) throw Error('invalid');
    markdown = fs.readFileSync(mdFile, 'utf8');
    if (!markdown.startsWith(report.status === 'complete' ? '## Codex review\n' : '## Codex review incomplete\n')) throw Error('invalid');
    if (markdown.length > 45000) {
      markdown = markdown.slice(0, 45000) + '\n\nReport shortened for this comment; see the complete workflow artifact.';
    }
  } catch {
    markdown = `## Codex review incomplete\n\nCommit: \`${pr.head.sha}\`\n\n` +
      'The workflow did not produce a valid review report. See the workflow run for setup, authentication, or execution failures. Previous findings are not a result for this commit.';
  }
  const runUrl = `${context.serverUrl || 'https://github.com'}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const body = `${MARKER}\n${markdown}\n\n[Workflow run and report artifact](${runUrl})\n\nAdvisory only; this review does not approve or block merging.`;
  const comments = await github.paginate(github.rest.issues.listComments, { ...target, per_page: 100 });
  const previous = comments.find(c => c.user?.login === BOT && c.user?.type === 'Bot' && c.body?.startsWith(MARKER));
  // Recheck after listing comments, which can take multiple API requests.
  if (!eligible(await current())) return;
  if (previous) {
    await github.rest.issues.updateComment({ ...context.repo, comment_id: previous.id, body });
  } else {
    await github.rest.issues.createComment({ ...target, body });
  }
}

module.exports = { publish, MARKER };
