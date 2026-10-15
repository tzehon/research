import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { local, type Config } from './config.ts';
import { git, run, repo } from './system.ts';
import type { Incident } from './state.ts';
export function prBody(i: Incident) {
  const v = i.validation;
  const outcome = i.outcome as {
    diagnosis?: string;
    changes?: string[];
    evidence?: string[];
    uncertainties?: string[];
  };
  const bullets = (items: string[] = []) => items.map((item) => `- ${item}`).join('\n');
  return `## Observed symptom
Sustained p95 latency breach in local storefront revision \`${i.revision}\`, deployment \`${i.deployment}\`. Incident ${i.id}.

## Diagnosis
${outcome?.diagnosis || i.diagnosis}

## Changes

${bullets(outcome?.changes)}

## Supporting evidence

${bullets(outcome?.evidence)}

## Independent validation
Correctness checks: ${v.correctness.candidate.checks} passed. Candidate revision: \`${i.candidateRevision}\`.

| Measurement | Affected baseline | Candidate |
| --- | ---: | ---: |
| Client p95 | ${v.baseline.p95Ms.toFixed(1)} ms | ${v.candidate.p95Ms.toFixed(1)} ms |
| Requests | ${v.baseline.requests} | ${v.candidate.requests} |
| Errors | ${v.baseline.errors} | ${v.candidate.errors} |

Improvement: ${(v.improvement * 100).toFixed(1)}%. Per-round candidate/baseline p95 ratios: ${v.ratios.map((n: number) => n.toFixed(3)).join(', ')}.

${v.methodology.rounds} alternating rounds at ${v.methodology.rps} requests/s, with ${v.methodology.warmupSeconds}s warm-up before each ${v.methodology.secondsPerRound}s measurement. Identical read-only fixture and runtime settings; monitored-app traffic remains running. Aggregate cumulative client histograms determine p95. No errors or missed load slots are allowed; aggregate improvement must be at least 30%, with at least 15% improvement in every round.

## Remaining uncertainties
Local synthetic fixture and workload; laptop contention and short windows affect results. This is local candidate improvement, not production recovery.

${bullets(outcome?.uncertainties)}

Screenshots, distributed spans, browser traces, event history and benchmark JSON remain local under the incident ID and are not uploaded automatically.
`;
}
export async function publish(i: Incident, c: Config) {
  if (!i.validation?.passed || !i.candidateRevision)
    throw new Error(
      'Publishing requires independent validation and an immutable candidate revision'
    );
  const body = prBody(i);
  const file = path.join(local, 'results', i.id, 'PR.md');
  writeFileSync(file, body);
  if (!c.targetRemote) return { publishing: 'unconfigured — local branch and PR body ready' };
  const target = c.targetRemote
    .replace(/^git@github.com:/, '')
    .replace(/^https:\/\/github.com\//, '')
    .replace(/\.git$/, '');
  const remotes = await git(['remote']);
  if (remotes.split('\n').includes('demo-target')) {
    if ((await git(['remote', 'get-url', 'demo-target'])) !== c.targetRemote)
      throw new Error('Configured remote differs from existing demo-target');
  } else await git(['remote', 'add', 'demo-target', c.targetRemote]);
  const remoteBase = await git(['ls-remote', '--heads', 'demo-target', c.targetBase]);
  if (!remoteBase)
    throw new Error(
      `Remote base ${c.targetBase} missing. Follow README setup; no remote base is created automatically.`
    );
  if (remoteBase.split(/\s/)[0] !== i.revision)
    throw new Error(
      'Remote target base must match the affected revision; refusing an unrelated PR'
    );
  // Looking up first makes retries safe after an unknown PR-create outcome.
  const find = async () =>
    JSON.parse(
      await run(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          target,
          '--head',
          i.branch!,
          '--base',
          c.targetBase,
          '--state',
          'all',
          '--json',
          'url,state,isDraft,headRefOid',
        ],
        repo
      )
    );
  let existing = await find();
  if (existing.length) {
    if (
      existing[0].state !== 'OPEN' ||
      !existing[0].isDraft ||
      existing[0].headRefOid !== i.candidateRevision
    )
      throw new Error('Existing PR must be open, draft, and point at the validated candidate');
    return { publishing: 'draft published', prUrl: existing[0].url };
  }
  await git(['push', 'demo-target', `${i.candidateRevision}:refs/heads/${i.branch}`]);
  try {
    await run(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        target,
        '--draft',
        '--base',
        c.targetBase,
        '--head',
        i.branch!,
        '--title',
        'Improve storefront search latency',
        '--body-file',
        file,
      ],
      repo
    );
  } catch (e) {
    existing = await find();
    if (!existing.length) throw e;
  }
  existing = await find();
  if (
    !existing[0]?.url ||
    existing[0].state !== 'OPEN' ||
    !existing[0].isDraft ||
    existing[0].headRefOid !== i.candidateRevision
  )
    throw new Error('GitHub did not return an open draft PR at the validated revision');
  return { publishing: 'draft published', prUrl: existing[0].url };
}
