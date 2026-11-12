# Ring Preservation and Architecture Charter

## 1. Purpose, authority, and evidence

This charter governs the Wildlife & Animal Detection Screenshot-to-OpenRouter initiative. Its purpose is to preserve the Ring doorbell product concept while providing a repeatable, standalone test path: select a local video, locate an animal appearance, capture a useful screenshot, request vision identification, and present a cautious safety result. It is an operational specification, not an application implementation, hardware certification, or permission to change source code.

The reference baseline is commit `097e901bdc6eec2d669cf528ff90c3b63640f7ef` in the connected fork. The [baseline README](https://github.com/devspot12-cpu/Amazon_Devices_RingSection/blob/097e901bdc6eec2d669cf528ff90c3b63640f7ef/README.md) and [existing E2E catalog](../docs/E2E_SCENARIOS.md) provide the product inventory. They describe optional real Ring integration when credentials exist. For this initiative, direct hardware access is unavailable; those optional capabilities must remain intact and must not be represented as successfully exercised.

The documentation branch adds only this handbook directory. Existing application files, environment examples, dependencies, database migrations, deployment configuration, and historical tracking work remain unchanged. Any later implementation requires a separate reviewed change with its own evidence.

## 2. Non-negotiable preservation inventory

| Surface | Baseline responsibility | Preservation obligation | Evidence required before implementation release |
|---|---|---|---|
| Dashboard home | Camera, alert, and activity overview | Preserve layout meaning, counts, empty states, and home entry point | Before/after captures using identical seeded data |
| Camera management | Camera names, zones, registration, and removal | Preserve validation and region ownership; never delete real cameras during an audit | Isolated test-camera lifecycle record |
| Farm region | Regional watchlist and danger context | Preserve region-specific cameras and local time interpretation | Two-region navigation comparison |
| Camera check `/video` | Local video and snapshot analysis | Preserve manual frame selection and existing error feedback | Video and image walkthroughs |
| Threat alerts | Species, Animal Score, Danger Type, camera, zone, time | Preserve field meaning and history linkage | Successful and failed-analysis examples |
| Capture preview | Stored-frame preview and missing-image state | Preserve authorization and meaningful unavailable states | Authorized preview and inaccessible-frame test |
| Ring live | Optional devices, WHEP, snapshots, motion hook | Preserve the section and disabled/error behavior without credentials | Credential-free inspection; hardware execution explicitly blocked |
| Ring Docs | Server-side documentation gateway access | Preserve browser-to-application boundary and navigation | Route inventory and sanitized error review |
| Sidebar utilities | Emergency contacts, nearby services, Critter catch | Preserve keyboard reachability and existing behavior | Accessibility walkthrough without live emergency calls |
| Region clock | Farm-local clock and alert time context | Preserve timezone agreement while video uses elapsed time | Clock comparison with explicit timezone |

An absent mention in the current README is not evidence that a UI feature was retired. The existing E2E catalog explicitly includes sidebar and header checks. Product preservation therefore relies on both documentation and the pinned source inventory.

## 3. Architectural boundaries

The local video is a test source, not a simulated claim of Ring hardware connectivity. Browser selection, playback, detector execution, screenshot extraction, and homeowner review form the local boundary. The application server forms the secrets, validation, routing, and persistence boundary. OpenRouter and its selected inference provider form an external processing boundary. The homeowner must be able to understand when information crosses each boundary.

The baseline video view samples approximately every 700 milliseconds, uses COCO-SSD, and accepts configured animal classes at confidence 0.6 or greater. It captures a native video-sized JPEG at quality 0.92 and sends analysis to `/api/analyze`. These are observed implementation details, not proof of frame-exact entry detection, blur filtering, privacy redaction, or production readiness. The SOP specifies stronger verification gates without silently claiming those gates already exist.

The shared vision adapter accepts an image and returns identification fields. Region-based danger assessment and alert wording remain product responsibilities. A vision model must not directly control emergency contacts, unlock doors, alter camera settings, suppress baseline alerts, or write executable instructions into the application.

## 4. Responsibility and decision rights

| Role | Required decision | May not authorize alone |
|---|---|---|
| Product owner | Approve preserved user journeys and new alert language | Claims of measured accuracy or regulatory compliance |
| QA lead | Approve ground truth, scenario coverage, and defect evidence | Production deployment or deletion of homeowner data |
| Vision evaluator | Record model, provider, prompt version, cost, and latency | Provider privacy exceptions |
| Privacy reviewer | Approve minimization, retention, and external processing | Reclassification of an uncertain animal as safe |
| Release coordinator | Confirm branch alignment and complete sign-off | Force-pushes or historical PR reopening |

One person may hold several roles, but the release record must identify the decisions separately. Writing a handbook or opening an issue does not constitute any of these approvals.

## 5. End-to-end operational workflow

1. Establish an isolated test account and record the baseline commit, browser, operating system, camera context, and farm region.
2. Obtain a licensed or homeowner-authorized clip. Record its cryptographic digest, duration, dimensions, frame timing, and capture conditions in restricted evidence storage.
3. Select the video locally. Confirm whether network inspection shows any full-video transfer; do not assume privacy from UI wording alone.
4. Run animal screening and retain distinct times for first visible entry, detector trigger, and selected screenshot.
5. Review candidate frames for subject visibility, motion blur, exposure, occlusion, and privacy. Reject unsuitable frames rather than fabricate detail.
6. Approve the sanitized screenshot for external analysis. Keep precise location, camera identifiers, and household identities out of the prompt.
7. Submit through the application server to an approved OpenRouter model and provider, subject to the routing and spending policy.
8. Validate the returned identification. Apply deterministic product threat policy and approved homeowner wording; retain uncertainty where evidence is weak.
9. Confirm that the screenshot, elapsed timestamp, result state, and selected camera correspond to the same analysis request.
10. Revisit the dashboard and every preserved navigation surface. Record regressions, verify retention behavior, and require sign-off before release.

This workflow is deliberately source-agnostic after screenshot creation. A future authorized Ring snapshot can use the same operational checks, but hardware onboarding, authentication, event permissions, and provider contracts require separate acceptance.

## 6. Data and timing contracts

A frame evidence record contains a restricted clip digest, decoded presentation timestamp, dimensions, crop description, quality disposition, redaction disposition, and request correlation identifier. The public tracker stores only a sanitized evidence reference and pass/fail conclusion. It must not contain raw camera images, addresses, device tokens, or public links to household footage.

Three times must remain distinct. Entry time is the earliest decoded frame showing the animal. Trigger time is when the detector reacts. Screenshot time is the presentation timestamp of the pixels actually encoded. The on-screen elapsed timestamp is not the household clock, upload time, or network request time. When a cleaner later frame is selected, both entry and screenshot times remain available in the QA evidence.

The current display helper rounds elapsed time to tenths of a second. Operators retain higher-precision presentation timestamps for validation and do not interpret rounded labels as proof of one-frame precision. Variable-frame-rate clips require timestamp-based inspection rather than multiplication by an assumed frame rate.

## 7. Failure isolation and degraded operation

| Failure | Required homeowner state | Preservation rule |
|---|---|---|
| Ring credentials unavailable | Hardware connection unavailable; local testing remains available | Do not remove Ring live or mislabel test media as live |
| Detector unavailable | Manual screenshot selection available or explicit failure | Do not report that no animal exists |
| No approved vision configuration | Frame remains visible; identification unavailable | Do not replace failure with a low-danger verdict |
| External timeout or rate limit | Analysis incomplete with safe retry guidance | Preserve navigation and cancel stale requests |
| Storage unavailable | Distinguish analysis result from persistence failure | Do not imply history was saved |
| Uncertain species | Animal uncertain; maintain distance and review | Never equate unknown with harmless |

A fallback may change model or provider only within the approved privacy allowlist. It must not transfer a full video merely because screenshot analysis failed. The operational target is recoverable, understandable degradation, not a false appearance of uninterrupted certainty.

## 8. Scope controls and preservation audit

Every implementation proposal must identify which existing feature it touches and why an additive boundary is insufficient. A proposal that changes shared navigation, camera ownership, persistence, alert severity, or model response parsing requires an explicit preservation review. A documentation-only proposal must produce an empty diff outside `wildlife-ops-docs/`.

Historical [PR #10](https://github.com/suchet-kapoor/Amazon_Devices_RingSection/pull/10) is merged; [PR #11](https://github.com/suchet-kapoor/Amazon_Devices_RingSection/pull/11) is closed without merging. Their descriptions are historical evidence, not current endpoint specifications. In particular, the old `/api/video/identify` proposal must not be substituted for the observed baseline `/api/analyze` workflow.

No operational audit may remove sidebar utilities, legacy Ring packages, optional integration routes, or existing issue labels merely to simplify screenshots. Record conflicts and proposed retirement decisions in [the retention audit](07-legacy-feature-deprecation-and-retention-audit.md), then follow [branch governance](08-pr-conflict-resolution-and-branch-governance.md).

## 9. Acceptance, escalation, and review cadence

The charter is satisfied only when the documentation scope is isolated, every preserved surface has a named regression check, the local-to-external boundary is explained, and unsupported claims are absent. Operational readiness remains blocked until uploaded fixtures, model measurements, privacy review, and the master rollout checks have real evidence.

During evaluation, review new defects daily. Before each candidate release, repeat navigation, camera-context, alert, timing, and failure-state checks. Revisit provider availability and prices immediately before any paid run. Review this charter whenever a new input source, external processor, storage location, or automated response is proposed.

Escalate a missing core panel, cross-camera result, leaked screenshot, secret exposure, or unsafe reassurance as a release blocker. Preserve sanitized diagnostics, stop the affected test, and use existing support contacts without placing test emergency calls. Resolve the defect in a separately authorized implementation change; this branch remains an operations record, not a vehicle for unreviewed repairs.
