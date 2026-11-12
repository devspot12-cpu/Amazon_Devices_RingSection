# Legacy Feature Deprecation and Retention Audit

## 1. Audit scope and meaning of retirement

This audit distinguishes retired operational assumptions from retained product capabilities. It authorizes no source deletion, refactor, configuration change, database migration, or historical branch rewrite. In this document, retired means a workflow may no longer serve as release evidence or the preferred test procedure. It does not mean application files have been removed by this initiative.

The baseline is commit `097e901bdc6eec2d669cf528ff90c3b63640f7ef`. Evidence includes the current README, `docs/E2E_SCENARIOS.md`, dashboard and video-view source inspected read-only, the animal-filter helper, the OpenRouter adapter, and upstream PR metadata and changed-file lists. Source existence establishes an inventory, not proof that a feature works in the current environment.

Direct Ring hardware access is unavailable for this initiative. Preserve optional real Ring integration while using local video as the test source. Do not convert the absence of credentials into a conclusion that the Ring concept or integration surfaces are obsolete.

## 2. Historical PR facts

| Record | Verified historical state | Operational implication |
|---|---|---|
| [Upstream PR #10](https://github.com/suchet-kapoor/Amazon_Devices_RingSection/pull/10) | Merged on 2026-10-19; merge commit `2a784c32928f65f37791ebd5b11702b7bffc1378`; 39 changed files | Treat its live-watch and capture work as historical baseline evolution, not an open PR awaiting merge |
| [Upstream PR #11](https://github.com/suchet-kapoor/Amazon_Devices_RingSection/pull/11) | Closed without merging on 2026-10-19; head `f8301a9441aea03d8fa58fcb64acd3db9d2c5a7a`; 11 changed files | Audit proposed video work against current source; do not reopen or merge it as part of documentation |
| Connected fork `main` | Current reference commit `097e901bdc6eec2d669cf528ff90c3b63640f7ef` | Create the operations branch from this reference and preserve all existing source |

PR #11's closed state and a reported mergeable value do not make it an active release candidate. PR #10's old test counts do not certify later source. Historical PR descriptions can explain design intent, but current source and current tests control present acceptance.

## 3. Retained core Ring and dashboard surfaces

| Capability | Retention decision | Required audit evidence |
|---|---|---|
| Dashboard entry and overview counts | Strictly retain | Same seeded data produces understandable camera and alert counts before and after future implementation |
| Camera names and zones | Strictly retain | Add, validation, selection, and isolated removal checks from baseline E2E remain documented |
| Farm region and predator profile | Strictly retain | Region change preserves ownership boundaries and recalculates the appropriate watchlist |
| Threat-alert rows | Strictly retain | Species, Animal Score, Danger Type, camera, zone, and farm-local time remain distinguishable |
| Stored capture previews | Strictly retain | Authorized image preview and meaningful missing-frame state remain available |
| Species summary grid | Strictly retain | Empty states and peak-danger summaries remain understandable |
| Ring live panel | Strictly retain | Devices, optional WHEP, snapshots, event hook, and disabled behavior remain discoverable |
| Ring Docs panel | Strictly retain | Browser uses the application's server route; gateway details and credentials stay server-side |
| Region clock | Strictly retain | Farm timezone remains distinct from video elapsed time |
| Sidebar and header utilities | Strictly retain | Emergency contacts, nearby services, sharing fallbacks, and Critter catch remain keyboard reachable |
| Manual image and frame selection | Strictly retain | Detector limitations do not prevent deliberate review of unsupported species |
| Baseline error states | Strictly retain | Missing configuration, invalid requests, stale-result prevention, and unmount cancellation remain explicit |

A documentation screenshot that omits a panel does not establish a product decision to remove it. The E2E catalog retains sidebar and header scenarios even where the README's walkthrough is shorter.

## 4. Retired mock workflows and unsupported acceptance shortcuts

| Workflow or assumption | Audit disposition | Replacement operating practice |
|---|---|---|
| Calling local media a live Ring device stream | Retired terminology for acceptance | Label it local test video and preserve the future authorized snapshot boundary |
| Scripted species responses presented as vision accuracy | Retired as benchmark evidence | Compare real, authorized screenshot requests against independently annotated fixtures |
| Timer-generated mock events presented as hardware verification | Retired as hardware evidence | Mark hardware execution blocked until real access and permissions exist |
| Unversioned canned screenshots used as universal proof | Retired as release evidence | Require asset rights, digest, conditions, ground truth, and fixture revision |
| Detector hit time presented as first visible animal time | Retired timing assumption | Record entry, trigger, and selected screenshot timestamps separately |
| Blank result or timeout interpreted as safe | Retired safety interpretation | Show unavailable or uncertain; preserve separation advice |
| Automatic detector coverage assumed for every species | Retired coverage assumption | Document the COCO class allowlist and exercise manual review for unsupported categories |
| Historical route names assumed to be current API contracts | Retired documentation shortcut | Inspect pinned routes and current API documentation before writing acceptance steps |

These dispositions retire the use of mocks as proof, not the legitimate use of isolated fixtures for deterministic testing. A mock is acceptable when explicitly labeled, limited to contract testing, and never substituted for measured wildlife recognition.

## 5. Route and storage reconciliation

PR #10 described `/live`, `/api/frame`, capture scan routes, and local JPEG/JSON-line capture storage. Current product documentation instead describes a dashboard Ring live section, current Ring-live routes, analysis history, and optional S3 storage. Preserve current behavior; do not restore old routes or storage modules merely because an old PR mentions them.

PR #11 proposed `/api/video/identify` and a dedicated screenshot wrapper. The pinned current video view calls `/api/analyze`. Its result participates in camera context, danger assessment, and saved history. Therefore, operational instructions must use the observed current route and treat the old endpoint as historical, not a required compatibility target.

The E2E findings log states that the quick-check page was removed afterwards. This is evidence of an earlier removal, not permission to remove anything else. Preserve `/video` as the current camera-check journey and do not invent a second supported entry point.

## 6. Concrete overlap audit log

The historical changed-file lists share exactly three paths. Shared paths are conflict candidates, not proof of unresolved textual conflicts.

| Audit ID | Shared path | Risk | Required disposition for this initiative |
|---|---|---|---|
| A01 | `.env.example` | Old documentation can reintroduce obsolete variables or credentials | Leave unchanged; document current variable names without real values |
| A02 | `apps/web/app/page.tsx` | Competing edits can drop navigation, panels, or alert components | Leave unchanged; use the pinned dashboard as the preservation reference |
| A03 | `packages/vision/package.json` | Historical exports or dependency edits can overwrite current packaging | Leave unchanged; document adapter boundaries without package changes |
| A04 | Old video-specific endpoint | Historical instructions can bypass current camera and history contracts | Do not create or restore it; audit current `/api/analyze` behavior |
| A05 | Capture persistence assumptions | Local-only historical storage can be confused with present configured storage | Record actual environment behavior during execution; no migration in this branch |

A01 through A05 are operational audit findings with concrete dispositions. They are not claims that an application merge conflict was resolved. Actual resolution requires separately authorized implementation work and reproducible comparison evidence.

## 7. Regression walkthrough

Start with an isolated test database and synthetic camera data. Capture the dashboard, region profile, camera list, alert empty state, sidebar, and clock before any future implementation. Record baseline commit and environment. Never remove a real camera or its history to produce a clean audit screenshot.

Run the video journey with a positive animal fixture, a negative fixture, and an uncertain image. Confirm camera selection and region context remain stable. Verify that replacing the file during an in-flight request cannot revive an old verdict. Navigate back to the dashboard and compare every retained surface, including panels unrelated to vision.

Inspect configuration-unavailable states without live hardware credentials. Ring live must remain discoverable and honest about availability. Emergency utilities must remain present without placing test calls, sending messages, or sharing personal contacts externally. Record any operation requiring an additional side effect as a separate authorized test.

## 8. Retirement approval process

A proposed future retirement requires a concrete feature inventory, reason, user impact, replacement path, rollback plan, migration impact, and accountable product approval. QA then confirms the replacement covers existing workflows. Privacy review is required whenever storage or external processing changes.

Do not infer approval from issue closure, a merged documentation PR, or absence of recent use. Keep the decision in version-controlled documentation and link the implementation proposal. Until approved, the retention matrix wins over convenience-driven removal.

For mock workflows, distinguish three statuses: contract fixture retained, operational acceptance path retired, or implementation removal proposed. This prevents the common mistake of deleting useful tests while trying to eliminate misleading demos.

## 9. Release disposition and continuing ownership

This audit approves only the documentation scope and establishes preservation requirements. It does not certify live Ring access, successful video execution, model accuracy, storage durability, privacy compliance, or production rollout. Those decisions remain subject to [branch governance](08-pr-conflict-resolution-and-branch-governance.md), [the privacy policy](09-privacy-and-camera-frame-retention-policy.md), and [the master sign-off checklist](10-e2e-rollout-and-verification-checklist.md).

Before merging the operations PR, verify that every changed repository path is under `wildlife-ops-docs/`. Before any later implementation release, repeat the retained-feature walkthrough against that candidate commit. Escalate missing panels, altered alert semantics, cross-camera results, exposed credentials, and false safety assurances as blockers rather than accepting them as incidental cleanup.
