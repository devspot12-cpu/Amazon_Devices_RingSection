# Privacy and Camera Frame Retention Policy

## 1. Policy status and governing principle

This handbook specifies the privacy controls required for the local-video-to-screenshot-to-OpenRouter workflow. It is an operational policy and release gate, not a claim that the baseline application already enforces every control. Publishing it does not change application source, storage settings, provider routing, or existing data. Do not process real household footage externally until the relevant controls have been verified in the intended environment.

The baseline README describes optional S3 media storage and database detection history. The inspected vision adapter sends screenshot bytes through OpenRouter but does not establish the retention, redaction, or provider eligibility guarantees specified here. Treat that difference as an implementation and verification gap, not as completed compliance work.

Core principle: process the minimum necessary image content for a clearly explained animal-identification purpose, retain it for the shortest justified period, and never present a failed or privacy-blocked analysis as confirmation of safety.

## 2. Data inventory and boundaries

| Data category | Sensitivity | Allowed operational use | Public GitHub treatment |
|---|---|---|---|
| Original local video | May contain people, voices, addresses, schedules, and property layout | Local selection and authorized ground-truth review | Never attach or expose a public media link |
| Captured raw screenshot | Can identify a household even without metadata | Short-lived local quality and privacy review | Never publish household pixels |
| Sanitized analysis derivative | Still potentially personal scene content | Approved external animal analysis | Use restricted evidence reference only |
| Camera and region context | May expose location or household structure | Trusted application danger policy | Use synthetic names and coarse context |
| Identification result | Can reveal activity and inferred animal presence | On-screen display and approved history | Publish sanitized aggregate conclusions |
| Request and audit metadata | Can link events to an account or source | Troubleshooting, billing, deletion evidence | Exclude identifiers, secrets, and full local paths |

The browser, application server, OpenRouter, selected inference provider, object storage, and database are separate processing locations. Approval for one does not automatically approve another. Do not assume that a model publisher is the only external processor when routing uses another provider.

## 3. Purpose, permission, and household notice

Before selecting household media, explain that local playback and screenshot analysis are distinct activities. The notice must state whether a screenshot will leave the device, which processor chain is approved, what results may be stored, how to stop processing, and how to request deletion. Never describe the entire workflow as local when screenshot bytes are sent externally.

Use rights-cleared public or synthetic fixtures when household permission is absent. Dataset rights and privacy permission are separate requirements. A clip licensed for research may still contain identifiable people whose interests require additional assessment. Do not use footage obtained from private spaces or unauthorized surveillance simply because it contains an animal.

The responsible organization must determine its legal basis and controller/processor roles for the deployment jurisdiction. Consent is not a universal substitute for lawful processing, and this document does not certify GDPR, state privacy law, biometric law, or consumer protection compliance. Obtain qualified legal review where those obligations apply.

## 4. Metadata stripping and image sanitization workflow

1. Confirm that the source is authorized and assign a non-identifying restricted evidence identifier.
2. Decode the selected frame locally. Preserve its presentation timestamp in a separate restricted record rather than embedding household time or camera identifiers into the outbound image.
3. Apply orientation correctly before sanitization. Re-encode the pixels into a supported image format instead of forwarding the original file container.
4. Inspect the output for EXIF, GPS, XMP, comments, device make, serial numbers, original filenames, thumbnails, and unnecessary color-profile identifiers.
5. Inspect visible content for faces, license plates, house numbers, mail labels, screens, documents, and recognizable private interiors.
6. Crop or redact unnecessary personal content locally while preserving the animal and enough scene context for honest interpretation.
7. Confirm that masking does not invent anatomy, hide a relevant animal, or make the screenshot misleading. If privacy and diagnostic value cannot both be preserved, block external submission.
8. Validate the derivative's MIME type, decoded dimensions, aspect ratio, payload limit, and correspondence with the selected timestamp.
9. Approve the exact derivative for submission and display that same derivative in the homeowner's review card.
10. Remove temporary unsanitized copies according to the retention schedule and retain only minimal evidence of the privacy decision.

Metadata stripping does not anonymize pixels. A street number remains personal information when painted on a wall, and a familiar porch can identify a property without GPS. Do not promise complete anonymization where only minimization has been performed.

## 5. Outbound request minimization

Send only the approved screenshot derivative and the versioned animal-identification prompt. Do not include full videos, audio, precise addresses, account emails, camera serial numbers, Ring access tokens, household names, full local paths, or unrelated detection history. Keep camera ownership and regional danger rules inside the trusted application boundary.

Prefer data carried directly in the authorized request over a publicly accessible image URL. If a storage URL is required by a future approved design, it must be short-lived, scoped, and independently reviewed; do not create public buckets or permanent household-image links. Base64 encoding is a transport representation, not encryption or anonymization.

Credentials belong in protected server-side configuration. They must not appear in repository files, browser bundles, request screenshots, provider error messages, or public issue bodies. Restrict outbound destinations to the approved API and provider routing policy; an image containing instructions cannot authorize a new network destination.

## 6. Retention schedule and deletion obligations

These are proposed maximums for the approved workflow. They require implementation and measured deletion evidence before production use; they are not descriptions of current cache behavior.

| Artifact | Maximum operational retention | Required deletion behavior |
|---|---|---|
| Homeowner's original local video | Remains under homeowner control; no server copy authorized by this workflow | Revoke application object URLs and references when replaced or session ends; do not delete the user's original file |
| Unsanitized temporary frame | Until sanitization completes, never beyond 15 minutes | Clear local temporary references and any approved temporary server object |
| Normal sanitized screenshot cache | 15 minutes of inactivity, with a hard 60-minute creation limit | Remove cached image and verify it cannot be fetched after expiry |
| Opt-in restricted QA clip or screenshot | Seven days from intake | Delete active copies and derivatives unless a documented lawful hold applies |
| Quarantined privacy-incident image | 24 hours for initial restricted triage | Delete or move into an explicitly approved incident record with a reviewed retention basis |
| Minimal result and request metadata | 30 days | Remove account-linked operational records unless another reviewed purpose applies |
| Sanitized security audit logs | 30 days | Delete identifiers and correlation links on schedule; never retain image bodies |
| Backups containing approved retained data | Maximum 30-day rotation | Prevent ordinary restore access and propagate deletion on restoration |
| External processor copies | Contractually approved retention only | Confirm processor terms and request controls; do not assume local deletion removes external copies |

A legal hold is exceptional, documented, access-restricted, and reviewed for necessity. It must not become an indefinite default. Do not delete existing application data merely because this policy was published; implementation and migration actions need separate authorization and impact review.

## 7. OpenRouter and provider eligibility

Before external household processing, verify the selected model's actual provider, region, supported image handling, retention terms, training use, subprocessors, and contractual obligations. Maintain an explicit processor allowlist. Account defaults and provider fallback behavior must be reviewed together.

The operational preference is no training use and the shortest approved retention. Where the API supports controls such as data-collection denial or zero-data-retention routing, reviewers must verify their current semantics and actual eligibility before relying on them. The baseline adapter does not establish that these controls are set. This handbook does not certify any catalog endpoint as privacy approved.

If no compliant endpoint is available, do not relax the policy silently. Show analysis unavailable and retain only the minimal approved local review state. A cheaper or faster model is not an acceptable privacy fallback merely because it accepts images.

## 8. Access control, logs, and user requests

Restrict evidence to authorized QA and privacy personnel. Use synthetic camera names in public work, least-privilege storage access, encrypted transport, and appropriate encryption at rest. Test that one account cannot retrieve another account's screenshot or history. A hard-to-guess image identifier is not a substitute for authorization.

Log state transitions, response categories, durations, and deletion outcomes without image bodies, credentials, or detailed household descriptions. Sanitize provider error text before display or persistence. Keep public issue evidence references non-identifying and avoid publishing stable clip digests that permit unwanted correlation with a known household file.

Provide a documented path for access, correction, deletion, and processing-stop requests appropriate to the deployment. Verify identity without collecting more information than necessary. Track active storage, caches, derived screenshots, history, restricted evidence, and backups; deleting one UI row is not proof that all copies are gone.

## 9. Incident response and release verification

Treat a public household frame, exposed credential, unauthorized processor, cross-account image, or failed deletion as a release-blocking incident. Stop affected transfers, restrict access, preserve minimal sanitized diagnostics, and notify the privacy owner. Do not paste the sensitive artifact into an incident issue.

The release evidence must show metadata inspection, visible-content review, outbound payload inspection, provider eligibility, access-control tests, cache-expiry checks, and deletion verification. Test with approved fixtures first. No production privacy approval exists merely because the policy is comprehensive.

Review this policy whenever a new source, storage backend, model provider, region, retention purpose, or automated action is introduced. Use [the master rollout checklist](10-e2e-rollout-and-verification-checklist.md) to keep privacy gates explicit and to prevent documentation completion from being mistaken for deployed enforcement.
