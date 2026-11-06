# Proposed initial Jira backlog

Create an epic/parent for the personal read-only release, then create these issues as needed. Let Jira assign actual keys and record those URLs. Avoid creating duplicate issues on a repeated run.

| Order | Proposed issue | Acceptance outcome |
| --- | --- | --- |
| 1 | Bootstrap repository and traceability | GitHub PR and commit link to the actual Jira issue; Jira displays them; CI contract exists |
| 2 | Implement fixture MCP transport and first tool | initialize/list/call succeeds locally; fixture output schema validated |
| 3 | Implement read-only YNAB adapter and tools | Mocked tests prove allowed routes, amounts, date semantics and result limits |
| 4 | Protect MCP with Auth0 and owner authorization | Invalid credentials/wrong owner/unauthorized plan denied; no upstream call occurs |
| 5 | Deploy fixture service to Railway | HTTPS, metadata, health, stable URL and deployed SHA verified; no live token |
| 6 | Connect Codex and ChatGPT | Both actual clients authenticate and call fixture tools; callbacks/registration documented |
| 7 | Enable private live YNAB reads | Allowlisted plan reads match YNAB UI; errors/logs redacted; no write tools |
| 8 | Qualify restart, new machine and rollback | Existing endpoint reusable; last good release recoverable; configuration rechecked |

Suggested later issues: Jira-aware Codex CI review; repeat-safe Jira stage triggers; release/commit-range traceability explorer; write tools with explicit confirmation and duplicate protection; multi-user YNAB OAuth. Each requires its own specification and approval. Do not include these in the first release by implication.
