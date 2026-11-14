# PR Conflict Resolution and Branch Governance

## 1. Purpose and current branch map

This runbook coordinates the documentation initiative with historical upstream PR #10, historical upstream PR #11, and the current Ring baseline. It provides an operational resolution procedure, not authorization to edit application source, reopen old PRs, merge branches, force-push, delete files, or deploy. The approved deliverable is a documentation-only pull request in the connected fork.

| Reference | Role | Verified state or policy |
|---|---|---|
| `suchet-kapoor/Amazon_Devices_RingSection` | Upstream historical product repository | Read-only reference for this work |
| Upstream PR #10 | Live-watch and capture history | Merged; merge commit `2a784c32928f65f37791ebd5b11702b7bffc1378` |
| Upstream PR #11 | Proposed local-video screenshot workflow | Closed without merging; head `f8301a9441aea03d8fa58fcb64acd3db9d2c5a7a` |
| Connected fork `main` | Default-branch baseline | Pinned at `097e901bdc6eec2d669cf528ff90c3b63640f7ef` when the operations branch was created |
| `ops/ring-animal-detection-openrouter` | Documentation working branch | Only `wildlife-ops-docs/` may change |
| Existing emergency operations branch | Unrelated operational work | Preserve without modification or merge |

The new PR targets the fork's default branch, not upstream. Issue and milestone numbers belong to the fork. Historical PR references must always include their upstream repository context to avoid confusing them with unrelated fork issue numbers.

## 2. Required governance principles

Preserve current product behavior over historical implementation shape. A newer baseline may intentionally consolidate routes or storage without deleting the underlying Ring concept. Reintroducing every old file is not preservation; keeping the current supported journeys intact is preservation.

Separate textual conflicts, semantic conflicts, and evidence gaps. Two PRs touching one file create an overlap candidate, not necessarily a textual conflict. Two cleanly merging edits can still remove a sidebar panel or misroute an alert. An unexecuted hardware check is an evidence gap, not a solved conflict.

Never choose an entire older file merely to eliminate conflict markers. Never force-update shared history to make a comparison appear clean. A documentation branch must not be used to sneak in dependency upgrades, environment changes, route restoration, or camera-data cleanup.

## 3. Preflight inventory procedure

1. Confirm the connected GitHub identity and repository permissions. Verify the fork relationship and that Issues are enabled.
2. Read the default branch and record its exact commit, rather than assuming `main` points to an earlier inspected revision.
3. Check whether the requested branch, labels, and milestones already exist. Reuse matching objects only after verifying their meaning; never overwrite unrelated work.
4. Read authoritative PR metadata for state, base, head, merge commit, and closure. Preserve the distinction between merged and merely closed.
5. Retrieve complete changed-file lists and inspect pagination. PR #10 has 39 changed files and PR #11 has 11 in the audited snapshot.
6. Compare shared paths and map historical routes to the pinned current source inventory.
7. Establish the allowed-path rule before any write. For this initiative, every repository file change must remain under `wildlife-ops-docs/`.
8. Record which tests were run, inspected, blocked, or not executed. Historical successful tests are not current test results.

These checks must be repeated if the default branch moves before release review. Do not synchronize the fork automatically if doing so would introduce unreviewed application changes or invalidate the approved scope.

## 4. Historical overlap and semantic risk register

| Register ID | Evidence | Risk | Required disposition |
|---|---|---|---|
| C01 | Both historical PR lists include `.env.example` | Old configuration and accidental credential exposure | Preserve current file; keep real values out of documentation |
| C02 | Both lists include `apps/web/app/page.tsx` | Navigation or dashboard panels lost during whole-file selection | Preserve pinned dashboard; require surface-by-surface review in future implementation |
| C03 | Both lists include `packages/vision/package.json` | Export or dependency rollback | Preserve current package definition and record any future change separately |
| C04 | PR #11 proposes `/api/video/identify`; current video uses `/api/analyze` | Operational checks bypass current camera/history contract | Document current route; do not restore the historical proposal |
| C05 | PR #10 describes old local capture storage | Storage retention assumptions become inaccurate | Measure actual environment persistence; no storage migration here |
| C06 | Current screening interval is about 700 ms | Exact-entry claim exceeds observed behavior | Keep entry ground truth separate from trigger time |
| C07 | Ring hardware is unavailable | Hardware preservation mistaken for hardware verification | Preserve surfaces and mark live testing blocked |

The three shared file paths are verified overlaps. C04 through C07 are semantic and evidence risks. None is presented as an actual source conflict fixed by this operations branch.

## 5. Documentation conflict resolution workflow

When two documentation edits conflict, freeze new writes to the affected file and record both revisions. Identify the underlying product statements each side is trying to preserve. Compare those statements with pinned source, authoritative PR state, current model metadata, and the approved operating policy.

Choose the statement supported by evidence, retain useful non-conflicting detail, and explicitly label proposed behavior. If source behavior contradicts a new policy, describe the gap rather than changing source in this branch. Update related cross-links and review tables so that resolving one paragraph does not create contradictory instructions elsewhere.

For this project, current-route instructions take precedence over old PR route names. Exact entry-time requirements coexist with the observed sampling limitation by distinguishing ground truth from runtime trigger. Privacy requirements are release gates, not claims that the current adapter already enforces provider routing or frame deletion.

After an authorized documentation resolution, read the complete file, verify its word range and link targets, and compare the full branch again. Do not accept a clean textual merge as evidence that the operating procedure is coherent.

## 6. Application conflict escalation workflow

An overlap outside `wildlife-ops-docs/` stops this branch's resolution process. The release coordinator records the path, baseline revision, competing intent, preserved user journeys, and suspected regression. Product and engineering owners decide whether a separate implementation proposal is warranted.

That future proposal must include focused tests for camera ownership, sidebar navigation, alert meaning, screenshot timing, stale results, storage outcomes, and disabled hardware behavior as relevant. Reviewers must examine semantic behavior rather than merely choose ours or theirs. No application edit is applied as part of this handbook or its PR.

If the candidate introduces a real credential or private camera frame, follow incident handling rather than copying the secret into an audit comment. Record a redacted description and restrict evidence access. Secret rotation, deletion, and history remediation are separate, explicitly authorized operations.

## 7. Tracking and review coordination

| Workstream | Milestone | Primary label | Review responsibility |
|---|---|---|---|
| Ten Ring preservation audits | Milestone 1 | `ring-core-preservation` | Product and QA confirm baseline journey coverage |
| Twelve video screenshot tasks | Milestone 1 | `video-screenshot-ops` | QA confirms timing, quality, and angle evidence |
| Twelve vision operations tasks | Milestone 2 | `openrouter-vision` | Vision and privacy reviewers confirm evaluated behavior |
| Eleven species QA and release audits | Milestone 2 | `wildlife-qa-dataset`, `pr-conflict-audit` | QA and release coordinator confirm final evidence |
| Alert accessibility and wording | Cross-cutting | `user-alert-ux` | Product and accessibility reviewers confirm user states |

Create each issue individually and retain its actual GitHub number. Logical task ordinals are not GitHub issue numbers. Link the final PR to all forty-five new issues using references, not automatic closing keywords, because documentation creation does not complete their execution checklists.

Do not assign arbitrary deadlines, reviewers, or completed status. Existing unrelated milestones and labels remain untouched. The new milestones organize the backlog; they do not imply release approval or funded benchmark authorization.

## 8. Release review and conflict audit record

The release record contains base commit, head commit, comparison timestamp, changed paths, addition/deletion status, issue count, label and milestone mappings, handbook word counts, link checks, and unresolved limitations. Store actual comparison results, not a generic statement that there are no conflicts.

Before opening the PR, confirm that the branch contains ten requested Markdown files and no application changes. After opening it, inspect the PR's reported mergeability and changed-file list. If mergeability is unknown, report unknown and recheck rather than treating it as clear. If the base moves, repeat the comparison and preservation review.

The current documentation-only change should remain additive. Any unexpected deletion, rename, configuration edit, or binary artifact is a blocker. A CI success, when present, supplements but does not replace this allowed-path audit.

## 9. Rollback, incidents, and final authority

Opening the PR does not merge it. Keep rollback decisions proportional: an unmerged documentation PR can be revised through authorized follow-up commits, while reverting shared history or deleting branches requires separate approval. Preserve issue evidence and do not close tasks simply to create a clean milestone chart.

Escalate a missing Ring panel, wrong-camera result, unsafe alert, privacy disclosure, or unreviewed processor as a release blocker. The coordinator pauses the affected rollout, preserves sanitized evidence, and assigns review responsibility. Production restoration and code fixes remain outside this documentation scope.

Final release requires product, QA, privacy, and release dispositions from [the master checklist](10-e2e-rollout-and-verification-checklist.md). This runbook provides coordination and auditability; it does not reopen historical PRs, resolve source conflicts by assertion, or authorize production deployment.

## 10. Resumable publication and duplicate prevention

Persist a concise [progress record](PROGRESS.md) after each small publication group. Include verified handbook revisions, actual task-to-issue mappings, tracker assignments, remaining work, and unresolved dependencies. Never store credentials, private account details, raw household imagery, or unsupported claims of success.

To resume safely, read the live branch and tracker before writing. Compare requested task ordinals with issue titles and bodies; issue numbers alone are not task identities. Reuse a verified label or milestone and correct an incomplete issue rather than creating a replacement. Treat a timed-out write as uncertain until the target file or issue is read back.

For files, retain the current blob revision and apply only the intended documentation change. For PRs, locate the exact head and base combination before opening another request. Preserve valid existing summary sections when updating the single matching PR. A checkpoint records what the tools confirmed, while final verification separately establishes lengths, links, catalog counts, and the complete documentation-only diff. No progress entry grants runtime, spending, privacy, merge, or deployment approval.
