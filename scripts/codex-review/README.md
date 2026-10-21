# Portable Codex reviews

This reviewer invokes `codex exec` directly. Python 3.10+, Git, and Codex CLI
0.163.0 are required. The core has no third-party Python dependencies and no
GitHub API calls. Node 22 runs the separate GitHub comment publisher.

## Configure GitHub

1. Add the Actions repository secret **CODEX_API_KEY**. The workflow exposes it
   under that same name only in the review step. Do not put it in repository
   variables, workflow-level environment, artifacts, or source files.
2. Optionally set the repository variable **CODEX_REVIEW_MODEL** to a model your
   API account can use. Otherwise the pinned CLI chooses its default model.
3. Deploy `scripts/codex-review/` and `.github/workflows/codex-review.yml` to the
   PR target branch. The first setup PR cannot review itself: scripts, schema,
   prompt, and publisher are deliberately loaded from the base revision. An
   undeployed base produces an explicit bootstrap failure. To smoke-test before
   merging, use the implementation branch as the base of a temporary test PR.
4. Open a non-draft internal PR as a human. Updates, reopening, and marking it
   ready trigger a review. Fork PRs, bot-authored PRs, and bot-triggered events
   are skipped. New runs cancel older runs for that PR.

The `review` job has repository read access. The separate `publish` job has
comment write access and no OpenAI key. One bot-owned comment is updated after
checking both base and head SHAs against the current PR. Closed or newly draft
PRs and stale results are skipped. PR titles, branch names, and model output are
never interpolated into executable shell or JavaScript source.

Findings are advisory and do not fail the review job. Infrastructure errors,
invalid model output, partial review, and timeouts fail it and publish an
**incomplete** result when the publisher is available. Do not configure this
workflow as a required merge check. No branch protection settings are changed.

## Portable invocation

Check out the exact head commit in a clean working directory and fetch both
full commit SHAs and their ancestry. Place the trusted reviewer outside the
review target or use its already-committed copy. Set `CODEX_API_KEY` through your
CI secret facility, then invoke:

```sh
python3 /trusted/tools/codex-review/run.py \
  --repo /checkout \
  --base-sha "$REVIEW_BASE_SHA" \
  --head-sha "$REVIEW_HEAD_SHA" \
  --output-dir /tmp/codex-review-report
```

Inputs must be full commit SHAs. The runner computes `git merge-base BASE HEAD`
and reviews changes from that commit to HEAD, excluding unrelated base-branch
changes. Rename/deletion paths are retained. Findings on deleted content use
`side: old`; other findings normally use `side: new`. Locations must exist in a
changed file on the specified side and have valid line ranges.

Options: `--model` overrides `CODEX_REVIEW_MODEL`; `--timeout` defaults to 900
seconds; `--codex` selects the executable for installation paths or test doubles.
Output must be outside the checkout. The runner rejects dirty or mismatched
checkouts rather than changing them.

Outputs:

- `review.json`: versioned report envelope, `complete`/`incomplete` status,
  validated findings and limitations, runner-owned commit/version/duration
  metadata, and usage counters when emitted by Codex.
- `review.md`: human-readable report. Model text is escaped and mentions are
  disabled. GitHub comments over 45,000 characters are shortened with an
  artifact link; the full report remains in the artifact.
- Exit `0`: successfully completed review, including reviews with findings.
- Exit `1`: incomplete review with a report where possible.
- Exit `2`: invalid arguments/output location; the publisher uses its generic
  incomplete fallback if no report exists.

Raw events and stderr stay in a temporary directory and are deleted after the
run; only validated reports are uploaded, for seven days. The total GitHub
review job timeout is 25 minutes. Timeouts terminate Codex's process group.
Cancellation can stop publication; consult the run link and reviewed SHA to
identify older feedback. No outer API retry is added, to avoid duplicate spend.

## Credential and execution boundaries

The runner gives Codex a fresh HOME and CODEX_HOME and forwards only the API key
and minimal runtime variables. It does not inherit GitHub tokens, provider URLs,
or saved login state. Project `.codex` settings are marked untrusted; user
config and execpolicy rules are ignored. Child commands receive a restricted
environment with credential patterns excluded. Web search is disabled; model
commands use a read-only sandbox and cannot ask for elevated permissions.

The prompt permits static inspection, not project execution, installs, builds,
tests, or fixes. Checkout cleanliness and HEAD are checked before and after the
run. The runner reports unexpected changes but never tries to reset user files.

These measures reduce exposure; environment filtering and prompt instructions
are not a complete security boundary. The model process still has the API key,
and a same-user process may access other process state. This v1 is for trusted
internal contributors on fresh GitHub-hosted runners. Do not extend it to forks
or shared runners without stronger isolation/credential brokering. A future
GitLab deployment must make the same trust decision. Secret echo detection
suppresses literal key occurrences in output; it does not detect every possible
encoding or other confidential source content.

## Tests

```sh
python3 -m unittest discover -s scripts/codex-review/tests -p 'test_*.py' -v
node --test scripts/codex-review/tests/publish.test.cjs
actionlint .github/workflows/codex-review.yml
```

The Python suite uses disposable Git repositories and a fake CLI, so it makes no
API calls. The publisher suite mocks GitHub, including paginated comment lookup,
stale revisions, incomplete reports, and replacement of previous findings.

For a live smoke test, create a small, documented helper on a temporary target
branch; open an internal PR introducing an obvious contract violation; verify a
finding and a successful advisory check; push the fix and verify the same comment
ID updates with the new SHA and a clean result. Close the temporary PR afterward.
Never merge deliberate bugs into the default branch.

## GitLab mapping (future adapter)

The same command and outputs can run in a GitLab merge-request pipeline. Map
`CI_MERGE_REQUEST_DIFF_BASE_SHA` to `--base-sha` and the exact source-branch SHA
to `--head-sha`, fetching both before invocation. In a detached MR pipeline,
`CI_COMMIT_SHA` identifies the source head; merged-results pipelines use a
synthetic merge commit, so resolve/check out the source head explicitly instead.

Provide **CODEX_API_KEY** using an appropriately scoped GitLab CI secret and
**CODEX_REVIEW_MODEL** as an optional variable. Check protected-variable
availability for your MR pipeline without weakening fork restrictions. Keep
tools/prompts on a trusted base revision and pass arguments explicitly; the core
does not read GitLab variables itself.

Upload only `review.json` and `review.md` with seven-day expiration, including on
failure. A separate future publisher job should receive a scoped GitLab token,
verify the MR's current head, and upsert a marker-tagged MR note. GitLab pipeline
YAML and that publisher are intentionally not implemented here.

References: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference).
