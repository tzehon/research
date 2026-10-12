# AGENTS.md

This file provides guidance to Codex and other coding agents when working with code in this repository. It is adapted from the root `CLAUDE.md`.

## Repository Overview

This is a monorepo containing multiple independent projects. Each project directory is self-contained with its own dependencies and README.

## Project-Specific Guidance

Project-specific guidance files contain build commands and architecture details.

When working in a specific project directory, read that project's `CLAUDE.md` if present. Also follow any applicable nested `AGENTS.md`; its instructions take precedence over this file within its scope.

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

Work directly in the main checkout — do **not** create git worktrees for this repo unless the user explicitly asks. Concretely:
- Do not request worktree isolation when delegating to another agent.
- Do not call worktree creation tools, including Codex's `create_worktree` or Claude Code's `EnterWorktree`.
- Do not run `git worktree add ...` to isolate changes.

All edits should land in the current working tree on the active branch. If isolation is needed for a risky change, ask before creating a worktree.
