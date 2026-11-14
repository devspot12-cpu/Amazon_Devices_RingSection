# Test Video Dataset and QA Catalog

## 1. Catalog status and permitted claims

This is a complete planning catalog for twenty-five video fixtures that the project owner will supply or authorize. Execution status for every scenario is **NOT EXECUTED — test videos have not been supplied**. Numeric times below are designed fixture targets, not measurements of unseen media. No screenshot, model answer, actual timestamp, or pass result has been invented.

A submitted clip must be decoded and independently annotated before its expected times are accepted. If the actual clip does not match the designed target, issue a documented fixture revision with measured presentation timestamps. Do not change the clip's annotation to make the current detector appear correct. Preserve the distinction between the test design, received asset, ground truth, and observed application result.

The catalog covers daylight, infrared, rain, fog, camera angles, multiple animals, brief appearances, variable frame rate, negative controls, and unusable images. It supplements rather than replaces [the baseline E2E catalog](../docs/E2E_SCENARIOS.md), which remains authoritative for preserved dashboard and sidebar journeys.

## 2. Fixture intake requirements

Use rights-cleared footage or household-authorized media. Record its restricted identifier, SHA-256 digest, owner permission, capture conditions, duration, orientation, codec, dimensions, media timebase, and presentation timestamps. Do not publish raw media, household addresses, full local paths, or identifying camera metadata in a GitHub issue.

Default designed fixtures are fifteen seconds long, 1920×1080, and 30 fps unless a row states otherwise. Preserve actual source quality rather than upscaling to satisfy this design. Each positive clip includes an empty lead-in except V21, allowing entry-time annotation. Each negative clip remains free of physical animals throughout its duration.

Two reviewers independently annotate the first visible animal frame, acceptable screenshot interval, broad category, supportable species, and quality limitations. Disagreement becomes an explicit uncertain interval until resolved. Ground truth is frozen before model comparison, and adjacent frames from one clip remain in the same evaluation partition.

## 3. Twenty-five designed video cases

Times are elapsed `minutes:seconds.milliseconds`. Selected time is the target clean screenshot, not necessarily the first visible frame. A one-frame tolerance uses the actual decoded neighboring timestamps, not a fixed approximation for variable-rate media.

| ID | Condition and subject | Designed first entry | Designed selected screenshot | Expected observation and principal pass rule |
|---|---|---|---|---|
| V01 | Daylight driveway, side-on coyote | 0:05.000 | 0:05.033 | Coyote or cautious wild canine; preserve head and tail, correct elapsed time, and pet-separation advice. |
| V02 | Daylight porch, black bear at frame edge | 0:08.000 | 0:08.100 | Bear category supported; separate entry from cleaner later frame and retain full useful body context. |
| V03 | Daylight low gate, mountain lion | 0:06.000 | 0:06.067 | Large wild cat when diagnostic; no exact size estimate or claim of aggressive intent. |
| V04 | Daylight oblique porch, unfamiliar dog | 0:04.000 | 0:04.033 | Dog identified without inferring ownership, breed danger, friendliness, or stray status. |
| V05 | Daylight wide pasture, deer | 0:03.000 | 0:03.033 | Deer or broad herbivore; manual selection exercised if screening lacks a matching class. |
| V06 | Daylight overhead bin area, raccoon | 0:07.000 | 0:07.067 | Supported small-mammal label; preserve context and reject disease claims from appearance. |
| V07 | Infrared porch, bear with eyeshine | 0:10.000 | 0:10.133 | Bear or uncertain large mammal; glare must not create false anatomical detail. |
| V08 | Infrared driveway, coyote-like canine | 0:05.000 | 0:05.100 | Cautious canine result; natural-color assumptions absent and low-light uncertainty visible. |
| V09 | Infrared low camera, domestic cat | 0:04.000 | 0:04.067 | Cat or uncertain cat; perspective alone must not produce a confident mountain-lion warning. |
| V10 | Infrared path, snake-like subject | 0:12.000 | 0:12.200 | Snake category or uncertainty; no unsupported venomous species claim or handling advice. |
| V11 | Rain, red fox through droplet streaks | 0:06.000 | 0:06.133 | Fox-like animal if supported; select clear anatomy rather than a water streak. |
| V12 | Rain, wild boar at diagonal gate angle | 0:09.000 | 0:09.100 | Boar or uncertain large mammal; rain artifacts and partial clipping recorded. |
| V13 | Fog, moose crossing a wide view | 0:11.000 | 0:11.167 | Large herbivore with cautious identification; no fabricated distance or speed. |
| V14 | Fog, distant coyote-sized silhouette | 0:07.000 | 0:07.200 | Broad animal or unknown; abstention is preferable to an unsupported precise species. |
| V15 | Daylight, coyote and domestic dog together | 0:05.000 | 0:05.100 | Distinct observations or count uncertainty; visible dog must not hide possible wild canine. |
| V16 | Daylight, bear behind a nearby squirrel | 0:08.000 | 0:08.100 | Whole-frame review retains bear concern; benign foreground subject cannot cancel it. |
| V17 | Daylight fence, partly hidden wild cat | 0:06.000 | 0:06.200 | Broad cat or unknown; record occlusion and avoid invented hidden body features. |
| V18 | Daylight bird visible only until 0:02.600 | 0:02.400 | 0:02.433 | Brief-event coverage measured; a 700 ms sampling miss is recorded honestly. |
| V19 | Variable-frame-rate coyote clip | 0:04.080 | 0:04.160 | Validate actual presentation timestamps; assumed constant frame-index arithmetic fails the case. |
| V20 | Rotated mobile clip, dog near camera | 0:03.000 | 0:03.067 | Correct orientation and aspect ratio; native pixels and selected time remain attributable. |
| V21 | Animal already present at video start | 0:00.000 | 0:00.100 | Entry treated as present at start; no negative time or fabricated preceding empty frame. |
| V22 | Entire animal episode severely blurred | 0:05.000 | No acceptable frame | Report unusable quality or uncertainty; no forced species result and no high-resolution claim. |
| V23 | Wind-driven leaves, no animal | No animal entry | No automatic screenshot | No false animal event; retain negative-control playback evidence without unnecessary external calls. |
| V24 | Moving shadows and passing car, no animal | No animal entry | No automatic screenshot | No dog or bear classification from vehicle edges, headlights, or shifting shadows. |
| V25 | People beside animal poster, no physical animal | No animal entry | No automatic screenshot | People-only or depiction-aware result during authorized manual review; no physical predator claim. |

## 4. Per-case execution workflow

1. Confirm asset permission, integrity, environment, camera context, and fixture revision before playback.
2. Reset prior analysis state and confirm no old screenshot or result remains associated with the new file.
3. Observe local playback and effective detector cadence while recording entry, trigger, and selected presentation times separately.
4. Inspect the chosen screenshot at native resolution for subject detail, blur, exposure, occlusion, rotation, and privacy.
5. Confirm whether a manual selection was required, especially for deer, fox, snake, or other unsupported screening labels.
6. Approve the sanitized derivative for external processing only after the privacy gate passes.
7. Record model, provider, prompt, request settings, response validity, latency, usage, and rendered alert state.
8. Compare output against frozen ground truth and the threat-classification catalog without rewarding confident guesses.
9. Revisit dashboard, camera selection, history, sidebar utilities, and region clock to detect cross-journey regressions.
10. Store restricted evidence, publish only a sanitized result summary, and obtain reviewer disposition.

Every run records one of pass, fail, blocked, or not executed. Blocked means a required prerequisite prevented a meaningful test. It is not a partial pass. The current catalog remains not executed until real assets and authorized test execution exist.

## 5. Pass/fail rubric

| Dimension | Pass criterion | Failure example |
|---|---|---|
| Entry annotation | Independent reviewers agree within one actual frame interval or preserve an honest uncertainty interval | Detector trigger substituted for first visible animal |
| Screenshot attribution | Selected pixels and recorded Selected PTS match the same decoded frame | Seeking delay captures another frame while retaining old timestamp |
| Quality | Image supports the claimed identification level | Blurred snake receives confident species and venom assertion |
| Presence | Positives and negative controls handled according to visible evidence | Car shadow becomes a bear or failed model becomes no animal |
| UX consistency | Screenshot, camera, region, elapsed time, and result belong to one request | Previous file's answer reappears after replacement |
| Privacy | Only approved derivative crosses the boundary; restricted evidence stays private | Full video or identifying image appears in public logs |
| Preservation | Existing dashboard and sidebar behavior remains available | New workflow hides Ring live or emergency contacts |

For the designed clean 30 fps cases, the target screenshot tolerance is one decoded frame around the approved selected timestamp. Blurred, foggy, or ambiguous cases assess honest uncertainty rather than forcing identical species wording. A correctly unresolved answer can pass when the reference annotation is also unresolved.

## 6. Cross-cutting recovery and accessibility probes

Repeat representative cases with missing vision configuration, timeout, 429 response, malformed JSON, provider refusal, storage failure, file replacement during analysis, tab backgrounding, and unmount while watching. These are execution dimensions applied to the twenty-five fixtures, not additional invented video cases.

Verify keyboard-only selection and cancellation, visible focus, non-color severity cues, readable errors, and accessible result announcements. Never make live emergency test calls. Confirm that a failed analysis preserves the screenshot and reports unavailability without granting a safety clearance.

## 7. Dataset governance and release evidence

Keep rights, ground truth, and model output reviews separable. Do not tune prompt wording on held-out clips and then report the same clips as independent accuracy evidence. Expand the dataset before making broad wildlife performance claims, especially for rare predators and global species outside the supplied media.

The QA lead publishes a sanitized coverage summary identifying received fixtures, executed cases, failures, uncertainty, and blocked conditions. The privacy reviewer confirms retention and processor eligibility. The release coordinator uses [the master checklist](10-e2e-rollout-and-verification-checklist.md) to prevent documentation completion from being mistaken for production approval.

## 8. Fixture revision and replay control

When a supplied clip differs from its designed scenario, preserve both identities and explain the difference before execution. A revision may change measured entry time, duration, resolution, visibility, or rights restrictions; none may be silently overwritten to improve a result. Keep the original annotation decision and record which candidate used each revision.

For a replay, verify the restricted digest and the frozen reviewer annotations before comparing outcomes. Reuse of a clip does not create an independent sample. Any revised prompt, model, derivative, or ground truth requires explicit version attribution so later reviewers can reproduce the comparison without relying on memory or a public screenshot of household footage.
