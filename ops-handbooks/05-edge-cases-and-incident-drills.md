# Operational Edge Cases, Failures, and Incident Drills

**Status:** Proposed playbook; every drill is NOT RUN until evidence is recorded. **Prepared:** 2026-11-11. **Accountable roles:** Incident Commander, Support Lead, Directory Steward, Regional Dispatch Liaison, Privacy Lead, Exercise Observer. This handbook authorizes no live emergency test calls, actual contact messages, application changes, or launch activation.

## 1. Exercise rules and safety invariant

Every exercise must establish a synthetic fixture, expected user-facing explanation, simulated contact outcome, escalation owner, evidence location, and pass/fail decision. Use an approved mock dialer, tabletop walkthrough, or consenting staff-only test destination. Never call 911, send text-to-911 messages, submit fabricated emergency reports, or load a real customer's residential address to make a drill realistic. Testing with an agency requires prior explicit authorization and a non-emergency test method defined by that agency.

The invariant is simple: uncertainty in the directory must not become false certainty about emergency response. A quick-dial action, sent message, displayed station, or saved address never proves assistance has been dispatched. In immediate danger, explain how to contact emergency services directly when safe without requiring support troubleshooting first. For animal alerts, do not encourage approaching or handling the animal; an automated prediction can be wrong.

## 2. Unverified or ambiguous residential address

**Trigger:** Low-confidence geocoding, multiple candidate streets, missing country, a PO box, a rural route, a new development, a shelter, or an address outside the approved geography. Confirm the user's intended locality through a private channel only if needed for the requested lookup. Do not silently replace the address with a city centre or postal-code centroid and display a precise station recommendation.

The expected outcome is an honest limitation: the address-to-jurisdiction match cannot yet be verified. Offer general emergency guidance and an optional manual-review case. Keep emergency calling instructions available even when address saving is declined. The Directory Steward owns routine investigation; an urgent user must not wait for that investigation. Evidence should show match state, source version, and fixture ID, not a real household address.

**Pass criteria:** No invented contact or jurisdiction; no automatic address disclosure; the user can cancel; the case has an owner and next action.

## 3. Cross-jurisdiction and border locations

**Trigger:** A home lies near a state, county, municipal, tribal, campus, transit, military, federal, or international boundary, or the nearest station is physically across a water barrier. A postal city and a map distance are insufficient. Compare the actual service-area evidence and refer unresolved responsibility to the authorized administrative liaison.

For the M01, M03, M06, and M08 fixtures, explicitly simulate a state-border ambiguity. For M11 and M15, test tribal or special-service responsibility without assuming municipal coverage. For M14 and the held M16 region, ensure a nearby foreign station is not recommended as a domestic emergency authority. A resident currently travelling must be told that the saved residence is not their current emergency location.

**Pass criteria:** Informational proximity and jurisdiction are separate; disputed routing is withheld; the appropriate direct emergency guidance remains visible; no call is transferred or initiated merely to resolve a test fixture.

## 4. Offline contact caching and stale records

**Trigger:** Network loss, a clock mismatch, an expired directory release, or a cached number that was later withdrawn. Separate public agency records from private saved contacts. An operational cache policy must record release ID, verification date, expiry, source, allowed region, and whether the device can demonstrate freshness. If those facts cannot be established, treat the cached recommendation as unverified.

Proposed policy: local directory records expire at the approved verification deadline, with a maximum proposed age of 90 days unless a shorter source or regional rule applies. Do not silently extend expiry because the device is offline. Keep device-native emergency calling guidance accessible, while clearly stating that app connectivity and a cached listing do not guarantee carrier service or emergency routing. A cached home address must not be broadcast as current location.

Private information needs explicit storage approval, sign-out and revocation handling, and shared-device protection under [the privacy handbook](04-privacy-and-address-compliance.md). Offline availability must not become an excuse to retain unrestricted address books or incident messages indefinitely.

**Pass criteria:** The stale label is explicit; disputed contacts are not promoted as verified; revoked sharing permission is respected; the fallback does not promise a working signal or emergency response.

## 5. False alarms and conflicting animal predictions

**Trigger:** The user reports a harmless animal, duplicate detection, incorrect species, outdated image, or repeated alert. Acknowledge uncertainty without dismissing the user's concern. Let the user correct the record or stop optional personal-contact sharing. Do not suppress access to emergency assistance because a confidence score is low or because earlier alerts were false.

If a user reports that they already contacted emergency services, advise following that operator's instructions and communicating changed information through the appropriate channel. Support must not independently cancel an emergency response or claim that a correction in the app recalls responders. Avoid automatic repeated messages to contacts, blame, or pressure to disclose camera footage. Record the de-identified defect for product review without changing source code in this rollout.

**Pass criteria:** No unwanted repeat messages; no claim of cancelling dispatch; uncertainty is communicated; sensitive imagery remains optional; a legitimate later emergency is not blocked.

## 6. Unreachable helpline and fallback-number failure

**Trigger:** Busy line, unanswered office, carrier failure, disconnected number, wrong recipient, unexpected premium charge, inaccessible voice menu, or an office closed outside published hours. Identify whether the problem is the personal contact, non-emergency department, or device calling route. Stop repeated attempts to a suspected wrong number and quarantine the affected directory record.

For immediate danger, direct the user to emergency services when safe. For a routine non-emergency lookup, show a separately verified fallback for the same purpose and jurisdiction or state that no verified fallback is available. Do not fabricate alternate numbers, route all failures to a neighbouring city, or use a private administrative liaison number as a public dispatch fallback. Text-to-911 is not presumed available; consult current local authority guidance rather than treating ordinary SMS as equivalent.

**Pass criteria:** Number category and hours are correct; no automated redial storm; no delivery guarantee; the Directory Steward and Dispatch Liaison receive a redacted fault with urgency and ownership.

## 7. Consent withdrawal, shared devices, and accidental disclosure

**Trigger:** Permission denial, user cancellation after recipient selection, wrong contact selection, coercion concern, or sign-out on a shared device. Stop optional pending sharing, explain the state honestly, and offer emergency guidance independently. Do not claim a delivered message has been recalled. For suspected disclosure, use the restricted privacy incident route and remove sensitive material from any public artifact through the appropriate response process.

The observer must test that support does not ask for an address in a public issue and does not equate household membership with blanket access. Evidence should record the consent state and a redacted payload template, not actual recipient numbers or message contents. Privacy and Legal determine further action; ordinary support closure cannot substitute for incident review.

## 8. Incident coordination, recovery, and exercise schedule

Classify an incorrect emergency-number label, confident misrouting, or unauthorized location disclosure as a proposed critical release blocker. The Incident Commander coordinates containment with authorized service owners, documents affected regions and the last known good directory release, and recommends pausing unsafe recommendations. This document does not claim that a pause control exists or execute a configuration change; readiness requires a rehearsed, authorized operational path.

Use a protected timeline containing detection time, decision owner, approved communications, mitigation, and recovery evidence. Support must distinguish a directory incident from the user's real emergency. Legal evaluates notification duties. Reactivation requires independent re-verification, privacy clearance if relevant, and renewed regional approval; reopening a source page alone is not sufficient.

Run a tabletop before each phase, weekly sample drills during the proposed pilot, and a quarterly cross-functional exercise after approval. Record observer, fixture IDs, expected versus actual outcomes, accessibility findings, elapsed staff coordination time, and remediation tasks. The debrief must identify owners and deadlines, and a failed critical scenario blocks sign-off. Feed results into [the helpline SOP](01-predator-alert-helpline-sop.md), [mapping operations](02-nearest-police-directory-mapping.md), and [the readiness decision](06-e2e-operational-readiness-checklist.md); an unchecked item remains unproven rather than implicitly passed.
