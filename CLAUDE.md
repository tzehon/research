# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo containing multiple independent MongoDB research/demonstration projects. Each subdirectory is a self-contained project with its own dependencies and README.

## Project-Specific Guidance

Each project has its own `CLAUDE.md` with build commands and architecture details:
- `mongodb-ops-manager-kubernetes/CLAUDE.md`
- `mongodb-failover-tester/CLAUDE.md`
- `atlas-alerts-creation/CLAUDE.md`
- `ops-manager-alerts-creation/CLAUDE.md`
- `invoice_processor/CLAUDE.md`

When working in a specific project directory, refer to that project's `CLAUDE.md`.

## README Auto-Generation

The root README.md uses [cogapp](https://github.com/nedbat/cog) for automatic project summaries:
```bash
pip install cogapp llm llm-anthropic
cog -r -P README.md
```
Per-project summaries are cached in `_summary.md` files within each project.

## Git Commit Guidelines

Make multiple, self-contained, logically independent commits rather than one large commit:
- Each commit should represent one logical change
- Commits should be independently understandable and reviewable
- Group related changes together, separate unrelated changes
- Use imperative mood in commit messages (e.g., "Add feature" not "Added feature")

## Working Directory Preference

Work directly in the main checkout — do **not** spawn git worktrees for this repo unless the user explicitly asks. Concretely:
- Do not pass `isolation: "worktree"` to `Agent` tool calls.
- Do not call `EnterWorktree`.
- Do not run `git worktree add ...` to isolate changes.

All edits should land in the current working tree on the active branch. If isolation is needed for a risky change, ask before creating a worktree.
