# End-to-End Rollout and Verification Checklist

## 1. Release decision and present status

This master checklist governs a future implementation release of the Wildlife & Animal Detection Screenshot-to-OpenRouter journey. It separates completion of documentation and tracking from approval to process household media, spend on benchmarks, merge application changes, or deploy. The current initiative changes documentation only. Actual video execution, measured model accuracy, privacy enforcement, and live Ring hardware verification have not been completed by publishing these handbooks.

A release candidate must identify its exact application commit, configuration, environment, approved processors, dataset revisions, and accountable reviewers. No checkbox is satisfied by a plan, a historical PR test count, a model catalog listing, or the mere existence of a tracking issue. Evidence must describe what was actually inspected or executed, with explicit failures and limitations.

Use four dispositions: pass, fail, blocked, and not executed. Blocked means a prerequisite prevents a meaningful check. Not executed means no run has occurred. Neither counts as approval, and neither may be hidden by a green documentation build.

## 2. Evidence map across the ten handbooks

| Handbook | Release responsibility | Required evidence |
|---|---|---|
| [01 — Preservation charter](01-ring-preservation-and-architecture-charter.md) | Protect existing Ring concepts and product surfaces | Baseline-to-candidate feature inventory and navigation comparison |
| [02 — Detection SOP](02-video-frame-animal-detection-sop.md) | Establish honest entry and screenshot timing | Independent annotations and selected-frame attribution |
| [03 — Model evaluation](03-openrouter-vision-model-evaluation.md) | Compare fifteen verified candidates fairly | Funded benchmark, usage, cost, accuracy slices, and latency distributions |
| [04 — Prompt standards](04-openrouter-system-prompts-and-response-templates.md) | Validate twenty prompts and exact alert language | Structured-response and safe-rendering tests |
| [05 — Species matrix](05-wildlife-species-and-threat-classification-matrix.md) | Apply cautious thirty-category policy | Species confusion and uncertainty review |
| [06 — QA catalog](06-test-video-dataset-and-qa-catalog.md) | Execute twenty-five designed video cases | Received assets, frozen ground truth, and per-case dispositions |
| [07 — Retention audit](07-legacy-feature-deprecation-and-retention-audit.md) | Retain product behavior and retire misleading mock evidence | Surface retention checks and historical-route reconciliation |
| [08 — Branch governance](08-pr-conflict-resolution-and-branch-governance.md) | Preserve history and control conflicts | Base/head comparison, allowed paths, and historical PR audit |
| [09 — Privacy policy](09-privacy-and-camera-frame-retention-policy.md) | Minimize external data and verify deletion | Sanitization, processor approval, access control, and expiry evidence |
| This checklist | Coordinate final decision | Separate product, QA, privacy, and release dispositions |

## 3. Gate A — Scope and baseline preservation

- [ ] Record the connected fork, default branch, exact baseline commit, candidate commit, and comparison time in the release record.
- [ ] Confirm all documentation-initiative repository changes are under `wildlife-ops-docs/`; unexpected source, dependency, configuration, deletion, or binary changes block this PR.
- [ ] Confirm the dashboard, camera management, farm region, species summaries, threat alerts, capture previews, and empty states retain their baseline responsibilities.
- [ ] Walk the sidebar and header using a keyboard, including emergency contacts, nearby-service permission errors, Critter catch, and the region clock.
- [ ] Preserve optional Ring live and Ring Docs surfaces without claiming hardware success when credentials or devices are unavailable.
- [ ] Confirm local test video is never described as a live Ring stream, and hardware availability is separate from screenshot-analysis readiness.

Compare identical seeded data before and after any later implementation. A changed alert count may reflect changed data rather than a UI regression, so preserve the test seed and note every intentional difference. Do not remove real cameras or history to simplify testing.

## 4. Gate B — Dataset and exact-frame evidence

- [ ] Obtain authorized or rights-cleared assets for all twenty-five designed cases and record restricted integrity and provenance information.
- [ ] Have two reviewers establish first visible entry and acceptable selected-frame intervals before inspecting model output.
- [ ] Replace designed numeric targets with measured annotations only through a documented fixture revision; never pretend unseen media was verified.
- [ ] Record entry PTS, detector trigger PTS, selected screenshot PTS, and processing wall time as distinct quantities.
- [ ] Verify selected screenshot pixels against the recorded presentation timestamp, using actual frame intervals for variable-rate clips.
- [ ] Review native dimensions, aspect ratio, orientation, motion blur, exposure, occlusion, infrared glare, rain, fog, and tiny-subject limitations.
- [ ] Exercise manual selection for species outside the screening allowlist and record automatic misses, including brief appearances between samples.

The observed baseline sampling interval is approximately 700 milliseconds. A precise screenshot timestamp does not prove that the first visible animal frame was found. The release record must report detection delay separately and must preserve honest uncertainty where the footage does not support a single exact entry time.

## 5. Gate C — Privacy and outbound processing

- [ ] Explain screenshot transfer and optional persistence before household media is submitted; retain a local-only alternative or explicit unavailable state when approval is absent.
- [ ] Re-encode the approved derivative, inspect metadata, and remove unnecessary faces, plates, addresses, documents, and other identifying scene content locally.
- [ ] Verify through network inspection that only the approved screenshot and minimal prompt cross the external boundary; full video, audio, credentials, and precise household context must not leak.
- [ ] Approve the actual model-and-provider route, training use, retention terms, subprocessors, and applicable legal review before processing household frames.
- [ ] Test account ownership for screenshot and history access; unpredictable identifiers alone do not satisfy authorization.
- [ ] Measure cache expiry and deletion against the privacy schedule, including derivatives, active storage, metadata, and backup restoration behavior.

Where these controls are proposed rather than implemented, record blocked production use. Do not edit storage configuration or delete existing data through this documentation initiative. Use approved synthetic fixtures for contract review while privacy implementation remains incomplete.

## 6. Gate D — Vision evaluation and alert correctness

- [ ] Refresh all fifteen candidate endpoint records and record actual availability, selected provider, prices, supported parameters, and image-input capability.
- [ ] Obtain a funded evaluation budget, request-count ceiling, concurrency limit, retry limit, and shutdown condition before any paid generation.
- [ ] Run identical sanitized screenshots and versioned prompts across the comparison set; keep tuning and held-out clips separate.
- [ ] Report animal-presence precision and recall, species accuracy, predator misses, benign false alarms, abstention, invalid responses, and per-condition sample counts.
- [ ] Measure screenshot-to-visible-result p50, p95, maximum, timeouts, and fallback cost rather than presenting provider telemetry as application latency.
- [ ] Validate all twenty task prompts, contradictory fields, malformed JSON, empty content, numeric confidence limits, and image-text prompt injection.
- [ ] Render exact approved alert text through product policy, preserve baseline Animal Score and Danger Type meaning, and keep unknown distinct from safe.

Catalog prices are planning evidence, and the handbook's cost estimates assume a stated token workload. They are not measured cost per real screenshot. General coding or reasoning benchmarks do not substitute for wildlife evaluation. A model is not approved merely because it is cheapest, fastest, or most confident.

## 7. Gate E — Resilience and preserved user experience

| Probe | Required behavior | Release blocker |
|---|---|---|
| Missing model configuration | Frame remains visible; analysis unavailable | Blank or low-danger result implies safety |
| HTTP 429 or transient failure | Bounded retry or approved fallback within policy | Tight loops, uncontrolled spend, or unapproved processor |
| Malformed or contradictory response | Reject and show honest incomplete state | Raw provider prose becomes a homeowner instruction |
| File replaced during analysis | Old request cannot overwrite current file state | Wrong screenshot, timestamp, or verdict reappears |
| Storage failure | Distinguish analysis from unsaved history | UI claims persistence succeeded |
| Tab backgrounded or view closed | Sampling and stale updates stop appropriately | Background loop leaks or duplicate submissions |
| Keyboard and assistive technology | Focus remains usable; status is announced without color dependence | User cannot discover, cancel, or understand the result |

Repeat representative positive, negative, and uncertain clips through these probes. Use isolated test data and approved simulations for error injection. Never test emergency utilities by placing live calls or dispatch requests.

## 8. Gate F — Tracking, historical PR alignment, and review

The tracker contains forty-five operational tasks: ten Ring preservation audits and twelve screenshot tasks in Milestone 1, then twelve vision tasks and eleven species/release audits in Milestone 2. Each issue requires its own ten-point checklist, test table, and acceptance criteria. Actual GitHub numbers are assigned by the repository and must be linked from the executive PR summary.

Historical upstream PR #10 is merged; upstream PR #11 is closed without merging. Audit their three shared paths and semantic risks without reopening or merging them. A clean textual merge does not prove that navigation, camera ownership, storage, or alerts remain correct.

Before final review, inspect the new PR's changed-file list and mergeability. Unknown mergeability remains unknown until rechecked. Link tracking issues without automatic closing keywords, because documentation completion does not complete the operational tests.

## 9. Sign-off, rollout, and rollback

| Decision owner | Required approval evidence | Current initiative disposition |
|---|---|---|
| Product | Preserved journeys and cautious alert language accepted | Production sign-off not granted; execution evidence absent |
| QA | Ground truth, coverage, failures, and regression results reviewed | Video verification not executed; assets not supplied |
| Privacy | Processor eligibility, minimization, access, and deletion verified | Enforcement approval not granted by policy publication |
| Release coordinator | Candidate comparison and unresolved blockers reviewed | Documentation review only; deployment not authorized |

A future rollout begins with an approved limited cohort and explicit monitoring for unsafe reassurance, predator misses, false alarms, latency, spend, and privacy defects. Expand only after reviewing real evidence. Keep a known-good candidate and a documented process for stopping external analysis while preserving baseline navigation and review access.

Rollback or incident actions that change shared configuration, revert code, delete data, or notify external parties require their own authorization. Record decisions and sanitized evidence rather than improvising repairs through this branch. Final acceptance means every applicable gate has accountable evidence, not simply that every document exists.
