# Automated Codex reviews

The `Codex review` GitHub Actions workflow provides advisory feedback on pull
requests. It runs when a PR is opened, reopened, updated with new commits, or
marked ready for review.

Reviews run only for non-draft, same-repository PRs authored by humans. Forks and
bot-authored PRs are skipped.

## Reading a review

The bot posts a summary comment with the reviewed commit SHA and a link to the
workflow run. New commits trigger another review and update that same comment.
A newer run cancels any older run still in progress for the PR.

Codex performs static inspection in a read-only sandbox. It does not edit files,
run project tests, approve the PR, or merge changes. Review findings are advisory.

If execution fails, the comment says the review is incomplete. Check the linked
workflow run rather than treating an incomplete review as a clean result.
