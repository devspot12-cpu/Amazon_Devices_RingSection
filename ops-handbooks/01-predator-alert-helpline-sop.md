# Predator Alert Emergency Contact Helpline: Standard Operating Procedure

**Status:** Proposed operational baseline; NOT launch approval. **Prepared:** 2026-11-11. **Accountable roles:** Operations Lead, Support Lead, Regional Dispatch Liaison, Privacy Lead. Named owners, coverage hours, contact verification, and approvals remain pending. This document describes intended operations, not functionality proven to exist in the application.

## 1. Purpose, boundaries, and safety principles

The left-sidebar emergency contact workflow should help a person identify an appropriate contact, initiate a deliberate call, or share limited incident information with a chosen trusted contact during an animal predator alert. It is not an emergency dispatch service, monitored alarm service, wildlife authority, or guarantee of response. An automated animal identification can be incorrect. Never require a user to validate an animal prediction before seeking emergency assistance, and never advise approaching, trapping, or confronting an animal.

The planning geography is the United States; unsupported countries require separate approval. In an immediate emergency, advise contacting 911 directly when safe. A stored residential address may differ from the person's current location. The user must tell the emergency operator their actual location. The physically nearest police station is not necessarily the responding agency or an appropriate emergency destination. Support must not promise that police, wildlife officers, or an emergency contact have been notified merely because a button was selected.

## 2. Before an alert: operational prerequisites

Maintain an approved contact inventory with service purpose, country, agency, jurisdiction, number type, staffed hours, accessibility options, verification evidence, last-reviewed date, expiry date, and a separately verified fallback. Distinguish emergency services, department non-emergency lines, administrative offices, wildlife services, and personal emergency contacts. Never copy one phone number into all categories. Verify through published official pages and an authorized administrative liaison; do not place test emergency calls.

Support coverage and escalation ownership must be recorded in a restricted on-call roster before pilot activation. The customer-facing interface must not advertise continuous human monitoring unless that service actually exists. Prepare translated, plain-language guidance and accessible call instructions. Training should use synthetic fixtures and consenting staff contacts only. See [source governance](03-public-registry-and-data-sources.md) and the [readiness checklist](06-e2e-operational-readiness-checklist.md).

## 3. Left-sidebar quick-dial procedure

1. Ask whether it is safe to continue, without delaying direct emergency calling. If there is immediate danger, direct the user to the appropriate emergency service and stop nonessential troubleshooting.
2. Confirm whether the user wants emergency services, a verified non-emergency department, wildlife assistance, or a personal contact. Read back the service label, not just the displayed number.
3. Check the contact's verification state, jurisdiction, hours, and expiry. Suppress disputed directory recommendations. An unverified local listing must never be presented as an emergency dispatch number.
4. Explain that quick-dial opens the device's calling workflow. The user reviews the number and deliberately initiates the call. An opened dialer is not evidence of a connected call or dispatched assistance.
5. If the user cannot operate that workflow, offer the verified number in an accessible format and explain how to use another available phone. Do not claim a browser can bypass device, carrier, or network restrictions.
6. Encourage the user to provide their current location directly to the emergency operator. Do not require app account verification, address correction, or support ticket completion before emergency contact.
7. Log only the operational outcome category and pseudonymous incident reference. Never record a live emergency conversation or place personal details in the public repository.

## 4. Contact-sharing permissions and consent

Sharing is optional and separate from quick-dial. Before every disclosure, show the selected recipient, the exact message, and the fields included. Default to a short incident category and user-selected callback method. Exact address, current location, photographs, camera feeds, and household member details require specific justification and approval by the user; they must not be silently included. A denied contacts, location, or notification permission must not prevent access to emergency calling instructions.

Obtain affirmative, incident-specific confirmation before sending. Access to the device address book is not permission to message every contact. Selecting a saved contact is not blanket consent to disclose a home address. Offer manual recipient entry without requiring address-book access. Stop when consent is withdrawn; explain that already delivered messages cannot necessarily be recalled. Shared-household accounts, minors, coercion concerns, and disputed recipient authority require the privacy escalation path in [the compliance handbook](04-privacy-and-address-compliance.md).

## 5. Call, SMS, and accessibility fallback

If a call fails, distinguish dialer failure, no signal, busy service, unanswered administrative office, and a disconnected number. Do not repeatedly redial a failing directory entry or create an automated retry loop. For immediate danger, prioritize the ordinary emergency calling route and another available phone when safe. Present a second local number only when independently verified for the intended purpose and service area.

SMS to a personal contact requires separate message approval. A sent SMS is not proof of delivery, reading, or emergency response. Text-to-911 availability varies by location and must never be assumed from ordinary SMS capability. Follow current local emergency-authority guidance and the [National 911 Program](https://www.911.gov/) and [FCC emergency communications guidance](https://www.fcc.gov/911). Voice calling should remain available where possible; accessibility needs must not be treated as user error. This rollout creates documentation and audit tasks, not a text-to-911 integration.

## 6. Escalation tiers and internal targets

| Tier | Trigger | Accountable action | Proposed internal handling |
| --- | --- | --- | --- |
| T0 | Routine setup or informational question | Support explains limitations and optional contact setup | Next staffed support queue; no emergency response promise |
| T1 | Reported immediate danger or injury | Tell the user to contact emergency services directly when safe | Immediate guidance; never wait for a supervisor |
| T2 | Failed call, disputed number, accessibility barrier, or regional mismatch | Supervisor and Dispatch Liaison assess the listing and approved fallback | Acknowledge within 15 minutes during declared pilot coverage |
| T3 | Confirmed unsafe routing, unauthorized disclosure, or repeated regional failures | Incident Commander and Privacy Lead recommend pausing affected recommendations and preserving evidence | Page immediately; proposed acknowledgement target is five minutes during staffed pilot coverage |

These are proposed staff coordination targets, not contracted response times or guaranteed dispatch performance. Approve staffing and measurement before publishing any customer promise. If coverage is unavailable, state that plainly and keep direct emergency guidance independent of support availability.

## 7. Support scripts, closure, and quality review

Opening script: "Are you safe to continue? If someone is in immediate danger, contact 911 directly when safe. This app does not dispatch emergency services. I can help identify a verified contact or explain the calling options."

Sharing script: "You chose this recipient. Please review the exact message and decide whether to include any location information. Nothing should be shared without your confirmation." Failure script: "Opening the dialer does not confirm that help was contacted. This listing may be unavailable; use the verified emergency route for an immediate emergency."

Close only after recording the user's reported outcome without claiming a rescue occurred. Assign unresolved directory faults, record the next owner and review deadline, and provide a safe callback preference. Review de-identified samples weekly during the pilot, including permission denials, inaccessible workflows, false alarms, fallback attempts, and unsupported geography. Rehearse the scenarios in [the incident playbook](05-edge-cases-and-incident-drills.md). Any evidence of unsafe contact labeling blocks regional approval until corrected and independently rechecked.
