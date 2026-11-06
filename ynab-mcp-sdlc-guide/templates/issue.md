# Jira issue template

Copy sections into the corresponding Jira fields. This file is a reusable blank template, not an active project specification.

## Description / intent

- Problem and affected person:
- Desired outcome:
- Constraints (including data/access boundaries):
- Out of scope:
- Dependencies:
- Open decisions:

## Spec field

- Revision label:
- Required behavior:
- Tool/API contracts:
- Error and boundary cases:
- Data and authorization rules:
- Concerns requiring a decision:
- Linked design/evidence:

## Acceptance criteria field

- AC-1: Given … when … then …
- AC-2: Example for an auth issue: given an unauthorized identity … access is denied before YNAB is called. Replace this with a relevant criterion for other work.
- AC-3: …

## Plan field

- Revision label and approved Spec revision:
- Files/components to change:
- Ordered implementation steps:
- Tests mapped to AC IDs:
- Deployment and rollback implications:
- Risks and unanswered questions:

## Explicit human approval comment

Approved: [intent/spec/plan] revision [label]. Evidence: [retrievable snapshot link; optional SHA-256]. Decision made by: [person]. Scope/conditions: […]. Any material change requires renewed approval. Jira records the comment actor and timestamp.

## Completion comment

- Implementation PR(s):
- Merged commit(s):
- CI evidence for those commits:
- Deployed commit and deployment link:
- AC-1 → test/evidence → pass/fail:
- AC-2 → test/evidence → pass/fail:
- Remaining limitations:
- Release verified by:
