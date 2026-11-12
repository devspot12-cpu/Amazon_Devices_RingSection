# Privacy, Residential Addresses, Emergency Contacts, and Compliance

**Status:** Proposed controls for legal and privacy review; not legal advice, a completed assessment, or a certification. **Prepared:** 2026-11-11. **Accountable roles:** Privacy Lead, Security Lead, Legal Reviewer, Support Lead, Operations Lead. All sign-offs are pending. Implementation must be evidenced separately; this documentation change does not modify application code or establish that technical controls already exist.

## 1. Purpose limitation and data classification

A residential address associated with an identifiable user, a precise location, a personal emergency-contact number, and a camera-related incident can expose sensitive household information. Classify them as restricted personal data even where a specific statute uses a different definition. A police station's officially published public address is a directory field, not a user's home address; keep those datasets separate.

Permitted proposed purposes are an expressly requested jurisdiction lookup, an optional user-approved contact notification, necessary support troubleshooting, and proportionate security auditing. Do not reuse addresses for advertising, household profiling, animal-risk scoring outside the stated purpose, sale, or undisclosed model training. Do not combine location, contact graphs, footage, and browsing behaviour merely because the data is accessible. Aggregate operational reporting should avoid small groups that allow households or rare incidents to be inferred.

## 2. Collection and notice workflow

Explain what information is requested, why it is needed, which provider receives it, whether it is optional, and how long it will be kept before collection. Use country and region first when that is enough for general guidance. Request a full residential address only for an expressly requested lookup. Unit or apartment details should remain optional unless a demonstrated workflow requires them. Do not demand an identity document or proof of residence to display general emergency guidance.

Distinguish a saved residence from current device location. Do not infer consent to geolocation from a typed address or vice versa. The user should be able to correct ambiguous geocoding matches, cancel a lookup, and avoid saving the address. Access to emergency calling instructions must not depend on agreeing to unrelated processing, opening an account, permitting address-book access, or accepting optional analytics.

## 3. Consent, authority, and recipient controls

Separate the choices to save an address, process a one-time lookup, select a personal contact, and disclose incident information. A legal basis analysis is required even where a consent screen is proposed; a clicked checkbox is not a universal cure for unlawful processing. Legal must approve the applicable basis and the wording for each geography and purpose.

Before sharing, show the recipient and exact payload and obtain incident-specific affirmative confirmation. Default to excluding home address, precise current location, camera images, and household member details. Explain any irreversible aspect of an already delivered message. A device contacts permission permits access only within the stated scope; it does not authorize bulk messages or sharing an address with all contacts. Provide a manual-entry option.

Consider recipient safety, intimate-partner abuse, shared accounts, disputed household authority, and coercion. A person who knows an address is not necessarily entitled to see account information or an incident history. Changes to saved contacts require appropriate account controls and clear user visibility. Children, guardians, and authorized representatives need a documented age and authority assessment; do not assume that every household account holder can consent for every other resident.

## 4. Access, provider, and security requirements

Use least-privilege access with named roles, multifactor authentication where available, logged administrative actions, and periodic access review. Support should see masked values unless a justified, approved case requires more. Public GitHub issues, pull requests, screenshots, logs, analytics events, and documentation must contain only synthetic fixtures or properly redacted evidence. Pseudonymous identifiers can still be personal data when linkable; restrict the re-identification key separately.

Before using a geocoder, messaging provider, or support platform, review data-processing terms, permitted purposes, sub-processors, hosting regions, security commitments, deletion mechanisms, breach procedures, and whether inputs are retained or used for training. Avoid placing raw addresses in URLs, referrers, telemetry, or unapproved browser tools. Require appropriate encryption in transit and at rest, secret handling, and a documented response to unauthorized access. These are release gates requiring proof, not claims about the repository's present implementation.

## 5. Proposed retention schedule and deletion handling

The following is an internal proposal for approval. It is not a statutory retention rule and cannot override a valid legal duty, preservation requirement, or more protective regional rule. Define the accountable system, deletion trigger, verification method, and exception owner before collection begins.

| Record class | Proposed default | Required operational control |
| --- | --- | --- |
| One-time raw address and geocoding response | Session-scoped; delete after the requested lookup and no later than 24 hours unless the user separately saves it | Demonstrate deletion across temporary storage and provider handling; avoid support copies |
| Explicitly saved address and personal contacts | Until the user deletes them or the stated account purpose ends; review necessity at least annually | Offer accessible correction and deletion; process active-system deletion within a proposed 30-day internal target, subject to applicable law |
| Consent and disclosure audit metadata | Proposed 12 months, without raw address or message content where possible | Retain purpose, notice version, timestamp, and recipient reference only as justified by Legal |
| Routine redacted support records | Proposed 90 days after resolution | Restrict access and remove unneeded identifiers; use a separate justified incident schedule if necessary |
| Device-cached private contact or location information | Minimum needed for the approved session and user choice | Provide clear cache controls; purge on sign-out or revocation as applicable; no public shared-device storage |
| Public agency directory verification evidence | Proposed 24 months for non-personal provenance, subject to licence terms | Remove restricted liaison details and honour source restrictions |
| Backups containing personal data | Proposed expiry within 90 days, if technically supported and legally approved | Restrict access, avoid ordinary use, and reapply deletions after restore |

If deletion cannot meet an approved target, identify the affected systems and block launch until a lawful alternative is accepted. Do not promise instant deletion of immutable backups or already delivered messages. Keep a minimal deletion ledger and verify provider deletion rather than assuming a local action covers every copy. A legal hold must be documented, access restricted, periodically reviewed, and released when its basis ends.

## 6. Rights requests and security incidents

Use a private approved channel for access, correction, deletion, and consent-withdrawal requests. Verify identity proportionately without asking the requester to publish an address or supply unnecessary documents. Legal determines applicable deadlines, permitted exemptions, and communications. A proposed internal target must never be described as the legal deadline in every jurisdiction.

For a suspected disclosure, restrict further access, page the Privacy and Security Leads, preserve minimal protected evidence, and document affected fields, recipients, timing, and containment decisions. Do not copy the exposed data into an incident issue. Legal must assess notification obligations and deadlines promptly; support must not make unsanctioned assurances about breach status or regulatory compliance.

## 7. Legal scope, approval evidence, and release gates

The current planning scope is U.S. metropolitan regions, subject to sponsor confirmation. Legal should determine applicability of state privacy and breach laws, precise-geolocation and consumer-protection requirements, children's privacy rules where relevant, communications consent rules, accessibility obligations, and agency data-use terms. If European, UK, or other jurisdictions enter scope, perform a new jurisdiction-specific assessment rather than claiming this handbook provides automatic compliance. Reference [FTC business privacy guidance](https://www.ftc.gov/business-guidance/privacy-security), [California Privacy Protection Agency resources](https://cppa.ca.gov/), and other responsible authorities as research starting points, not endorsements.

Approval requires a data-flow map, processing-purpose register, vendor review, consent walkthrough, access review, retention and deletion evidence, rights-request rehearsal, and a documented privacy-risk assessment. Unresolved high-severity exposure or unsupported legal claims block activation. Link only redacted evidence from [the readiness checklist](06-e2e-operational-readiness-checklist.md). Reassess after a provider change, new region, new data field, changed recipient logic, or an incident; privacy sign-off is a maintained operating decision, not a one-time label on a pull request.
