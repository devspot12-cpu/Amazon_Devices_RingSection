# Video Frame Animal Detection Standard Operating Procedure

## 1. Scope and operating status

This procedure defines how an operator evaluates uploaded test videos, identifies animal entry, chooses a clean screenshot, and preserves timing evidence. It applies to local test media, not an asserted live Ring feed. The procedure specifies acceptance behavior for future verification; it does not claim that the present application already provides frame-by-frame entry search, blur scoring, privacy redaction, or every recovery path described here.

At baseline `097e901`, the video view samples every approximately 700 milliseconds, screens COCO-SSD predictions through an animal class allowlist, uses a 0.6 threshold, captures native video dimensions as JPEG quality 0.92, and submits to `/api/analyze`. This can miss brief appearances and cannot prove the first visible frame. Treat these limitations as measurable QA questions rather than silently redefining exact timestamp to mean detector response time.

## 2. Intake and chain of custody

Accept a clip only when its owner authorizes processing and its license permits the intended use. Record a restricted evidence identifier, SHA-256 digest, duration, coded dimensions, orientation, codec, container, presentation timestamps, and whether the video has constant or variable frame rate. Preserve the original read-only copy until the ground-truth review is complete, subject to the privacy policy.

Check that the clip decodes from beginning to end. A browser accepting the filename is not sufficient: truncated media, unsupported codecs, corrupt keyframes, rotated mobile footage, and misleading extensions can produce incorrect screenshots. Record decoding failures as failures of intake, not as evidence that the scene contains no animal.

Use a dedicated test browser profile and a synthetic camera context. Keep household addresses, real names, and camera device identifiers outside the public issue. Network inspection must establish whether only screenshots or additional media are transferred. A local file picker does not, by itself, demonstrate that the entire pipeline remains local.

## 3. Required timing vocabulary

| Field | Meaning | Validation rule |
|---|---|---|
| Entry PTS | First decoded presentation timestamp at which animal pixels are visible | Two reviewers agree within one actual frame interval |
| Trigger PTS | Frame presented when automated screening reports a qualifying animal | Recorded separately from entry and processing wall time |
| Selected PTS | Timestamp of the exact pixels encoded into the chosen screenshot | Must correspond to the retained reference frame |
| Detection delay | Trigger PTS minus Entry PTS | Report distribution and maximum; never substitute for entry |
| Selection offset | Selected PTS minus Entry PTS | Explain any move to a later, cleaner image |
| Displayed time | Homeowner-facing elapsed label | Round only for presentation; retain precise evidence |
| Request time | Server or network wall-clock timestamp | Used for latency, never video position |

For a 30 fps constant-rate fixture, one frame interval is about 33.3 milliseconds. For variable-rate footage, use the neighboring presentation timestamps, not a fixed 33.3 millisecond assumption. Preserve the original media timebase and any normalization offset.

## 4. Ground-truth entry workflow

1. Watch the complete clip once without relying on detector output. Mark every animal episode, including small, occluded, and brief appearances.
2. Find the last definitely empty frame before each episode. Record the earliest clearly visible animal frame after it.
3. Inspect the interval frame by frame using decoded presentation timestamps. Do not seek only to keyframes or treat the player slider as an exact measurement.
4. Ask a second reviewer to annotate independently. Resolve disagreements using the original frames rather than the detector score.
5. Mark ambiguous entry as an interval with a stated reason, such as foliage occlusion or crossfade. Do not invent a single exact timestamp when the image cannot support one.
6. Freeze the approved annotation before comparing model or detector performance. A benchmark must not move ground truth after seeing results.

The catalog's numeric timestamps describe designed fixture requirements. They become verified expectations only after the actual uploaded media has been decoded and independently annotated. If a supplied clip differs, record a new fixture revision rather than forcing it to match the catalog.

## 5. Screening and candidate selection

Begin automated screening from the original playback start, not from an unnoticed mid-clip seek. Record detector version, device, browser, threshold, and effective sampling interval. Background tabs, slow devices, and model loading can increase that interval substantially. Measure it rather than quoting the configured timer alone.

When an animal trigger occurs, preserve the trigger reference and inspect surrounding frames. The recommended evaluation window is 500 milliseconds before through 1,000 milliseconds after the trigger, bounded by the episode. This is an operational review window, not permission to replace an entry timestamp with an unrelated later pose.

Select the earliest frame that both depicts the animal and meets the quality rubric. If the first visible frame is too blurred or occluded, retain the entry annotation and choose a later frame with its own timestamp. A clean screenshot and an exact entry record are compatible only when those concepts remain separate.

Do not make multiple unbounded paid model requests while searching for a nicer image. Candidate review is local. Submit one approved screenshot per event unless a separately approved ambiguity review explicitly permits another frame.

## 6. Screenshot quality rubric

| Dimension | Pass | Review | Reject |
|---|---|---|---|
| Resolution | Preserve native decoded dimensions; retain useful subject detail | Source below 1280×720 or animal unusually small | Upscaled image presented as new high-resolution evidence |
| Focus and blur | Head or diagnostic body outline remains distinguishable | Some motion streaking but animal category remains supportable | Smearing prevents meaningful animal identification |
| Exposure | Subject separates from background | Partial highlight clipping or noisy shadows | Animal disappears into black or saturated white |
| Occlusion | Diagnostic body regions remain visible | Partial fence, leaves, or another animal | Only an uninterpretable fragment is visible |
| Framing | Full available context and aspect ratio retained | Tight crop recorded alongside source context | Subject clipped or crop changes interpretation |
| Privacy | Unneeded personal content excluded or redacted | Redaction requires reviewer confirmation | Face, address, or plate remains unnecessarily exposed |

The 1280×720 line is a review threshold, not a universal minimum and not a claim about all source videos. A small but sharp snake may require more diagnostic detail than a large bear. Conversely, a lower-resolution image can support an animal-present warning without supporting a species claim.

Assess quality at actual pixel size. A thumbnail looking sharp does not prove that the encoded image contains useful detail. If a quantitative sharpness score is used later, calibrate it against annotated animal regions; one global threshold across infrared, rain, and daylight is not defensible without evidence.

## 7. False-trigger discrimination

| Confounder | Required local inspection | Correct operational result |
|---|---|---|
| Wind-driven leaves | Confirm no coherent animal body across neighboring frames | No qualifying animal event; retain negative-test evidence |
| Moving shadows | Check whether apparent shape changes with light rather than anatomy | No species claim from silhouette alone |
| Passing vehicle | Inspect driver, roof reflections, logos, and vehicle edges | Vehicle-only scene must not become a dog or bear alert |
| Person only | Separate animal presence from person detection | People-only result without identity inference |
| Television or poster | Establish whether depicted animal is a physical scene subject | Mark depiction confounder; do not claim a real predator |
| Lens insect or spider | Compare scale, focus plane, and obstruction | Camera obstruction or uncertain animal, not large-predator certainty |

The current allowlist includes bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, and giraffe. It does not include every coyote, deer, fox, snake, or mountain lion label. Therefore, absence of an automatic trigger is not equivalent to absence of wildlife. Exercise manual frame selection for unsupported species and record that fallback explicitly.

## 8. Infrared, weather, and camera-angle handling

For nighttime infrared footage, ignore natural-color expectations. Eyeshine, white fur bloom, compression, and a nearby fence can obscure body proportions. Require shape-based evidence and maintain broad identification when species cannot be resolved. Do not infer a venomous snake species or an aggressive dog from an indistinct monochrome silhouette.

For rain, compare candidate frames for droplets and streaks crossing the subject. For fog, retain uncertainty about distance and species. For snow or harsh backlight, inspect clipping rather than relying on automatic contrast. Any enhancement used for review must be documented; an enhanced derivative cannot replace the original evidence without provenance.

For oblique porch, low gate, overhead, and wide driveway views, measure subject visibility separately. A detector tuned to a full side-on dog may fail on a low-angle muzzle or overhead bear. Include left-to-right and right-to-left entry, frame-edge appearance, partial exit, and stationary animals already present at playback start.

## 9. Encoding, privacy, and handoff

Create the screenshot from the decoded frame associated with Selected PTS. Preserve aspect ratio and native dimensions. Do not upscale, concatenate frames, sharpen hallucinated detail, or add identifying text overlays to the image sent externally. If an analysis crop is necessary, record the crop coordinates and retain the protected full-frame reference.

Re-encode the approved derivative to strip embedded metadata, then inspect for visual personal information. Metadata removal does not remove a street number painted on a wall. Follow [the privacy policy](09-privacy-and-camera-frame-retention-policy.md) before transferring pixels outside the local boundary.

The handoff record includes event identifier, selected elapsed timestamp, dimensions, MIME type, quality disposition, privacy disposition, and prompt version. It excludes full local paths and sensitive household context. Confirm the frame shown on screen is the same derivative submitted for analysis.

## 10. Pass, fail, and escalation

A timing run passes only when its ground truth is independent, selected pixels match the recorded timestamp, display rounding is honest, and entry-versus-selection differences are explained. A quality run passes only when the selected frame supports the resulting identification level. A negative run passes only when the system avoids an unsupported animal or predator claim.

Block release for wrong-frame attribution, stale screenshots after file replacement, cross-camera results, fabricated exact times, undisclosed video transfer, or failure presented as safety. Record missing fixtures as not executed, not passed. Follow [the QA catalog](06-test-video-dataset-and-qa-catalog.md) and [the rollout checklist](10-e2e-rollout-and-verification-checklist.md) for evidence packaging and sign-off.
