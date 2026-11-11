# Nearest Police Station Directory: Address-to-Jurisdiction Operations

**Status:** Proposed mapping workflow; all regional records UNVERIFIED. **Prepared:** 2026-11-11. **Accountable roles:** Directory Steward, Regional Dispatch Liaison, independent Reviewer, Privacy Lead. No live addresses were processed, no department phone numbers were verified, and no launch territory is approved by this document.

## 1. Scope and the meaning of nearest

The request did not specify a country. This handbook adopts 20 major United States metropolitan planning regions as an explicit assumption, not a ranking of population or approval for nationwide launch. Metropolitan boundaries are planning containers, not police or emergency dispatch jurisdictions. The geographically nearest station can sit across a river, county line, tribal boundary, state border, or international boundary and have no responsibility for an address.

Maintain two separate outputs: an informational nearby-station listing and an independently established service-jurisdiction record. Never substitute straight-line distance for dispatch responsibility. In an immediate emergency, direct the person to 911 when safe and ask them to give their current location to the operator; a stored home address does not establish where the emergency is happening. Ordinary station reception and non-emergency numbers must be clearly distinguished from emergency services.

## 2. Twenty-region planning register

The linked official sites below are discovery starting points, not verified contact records or complete metro coverage. For every row, phone numbers, physical station addresses, jurisdiction polygons, operating hours, administrative liaison details, and source licences remain to be audited. Fifteen pilot regions receive individual tracking tasks; five additional regions are explicitly held outside pilot activation and covered by the final readiness exclusion gate.

| ID | Metropolitan planning region | Official discovery starting point | Particular verification risk | Rollout state |
| --- | --- | --- | --- | --- |
| M01 | New York-Newark-Jersey City, NY/NJ/PA | [New York City](https://www.nyc.gov/) | Separate states, boroughs, and Port Authority responsibilities | Pilot audit pending |
| M02 | Los Angeles-Long Beach-Anaheim, CA | [Los Angeles](https://lacity.gov/) | City police, county sheriff, contract cities, and separate municipalities | Pilot audit pending |
| M03 | Chicago-Naperville-Elgin, IL/IN/WI | [Chicago](https://www.chicago.gov/) | Three-state metro and independent suburban dispatch | Pilot audit pending |
| M04 | Dallas-Fort Worth-Arlington, TX | [Dallas](https://dallascityhall.com/) | Distinct major cities, counties, and airport jurisdiction | Pilot audit pending |
| M05 | Houston metropolitan area, TX | [Houston](https://www.houstontx.gov/) | Annexation, unincorporated areas, constables, and sheriff overlap | Pilot audit pending |
| M06 | Washington-Arlington-Alexandria, DC/VA/MD/WV | [District of Columbia](https://dc.gov/) | State boundaries and federal or special-property police | Pilot audit pending |
| M07 | Miami-Fort Lauderdale-West Palm Beach, FL | [Miami](https://www.miami.gov/) | Municipal police versus county service and coastal locations | Pilot audit pending |
| M08 | Philadelphia-Camden-Wilmington, PA/NJ/DE/MD | [Philadelphia](https://www.phila.gov/) | Interstate boundaries and bridge or transit jurisdictions | Pilot audit pending |
| M09 | Atlanta metropolitan area, GA | [Atlanta](https://www.atlantaga.gov/) | City limits versus county service and separate suburbs | Pilot audit pending |
| M10 | Boston-Cambridge metropolitan area, MA/NH | [Boston](https://www.boston.gov/) | Independent towns, campuses, and interstate coverage | Pilot audit pending |
| M11 | Phoenix-Mesa-Chandler, AZ | [Phoenix](https://www.phoenix.gov/) | Tribal lands, municipal boundaries, and county service | Pilot audit pending |
| M12 | San Francisco-Oakland-Berkeley, CA | [San Francisco](https://www.sf.gov/) | Separate counties, bridges, transit, and water barriers | Pilot audit pending |
| M13 | Riverside-San Bernardino-Ontario, CA | [Riverside](https://riversideca.gov/) | Large county areas and contract sheriff arrangements | Pilot audit pending |
| M14 | Detroit-Warren-Dearborn, MI | [Detroit](https://detroitmi.gov/) | International border and independent suburban agencies | Pilot audit pending |
| M15 | Seattle-Tacoma-Bellevue, WA | [Seattle](https://www.seattle.gov/) | Multiple counties, islands, tribal lands, and ferry access | Pilot audit pending |
| M16 | San Diego-Chula Vista-Carlsbad, CA | [San Diego](https://www.sandiego.gov/) | International border, military property, and county service | HOLD: later verification |
| M17 | Minneapolis-St. Paul-Bloomington, MN/WI | [Minneapolis](https://www.minneapolismn.gov/) | Twin cities, state line, and separate suburban dispatch | HOLD: later verification |
| M18 | Tampa-St. Petersburg-Clearwater, FL | [Tampa](https://www.tampa.gov/) | Bay crossings, county boundaries, and independent cities | HOLD: later verification |
| M19 | Denver-Aurora metropolitan area, CO | [Denver](https://www.denvergov.org/) | Consolidated city-county boundaries and separate suburbs | HOLD: later verification |
| M20 | Baltimore-Columbia-Towson, MD | [Baltimore City](https://www.baltimorecity.gov/) | Baltimore City and Baltimore County are distinct authorities | HOLD: later verification |

## 3. Intake, consent, and address normalization

Use a private approved intake channel. Explain the purpose of using a residential address, the service limitations, retention choices, and whether a geocoding provider receives it. Do not collect a full address simply to show general regional guidance. Avoid identity documents, household member names, camera imagery, or continuous device location. Address entry is not proof of residence or permission to disclose someone else's location.

Normalize country, state, locality, postal code, street, and optional unit without silently rewriting the user's intended location. Preserve the original only in the restricted record where justified; use a pseudonymous fixture identifier in public issues. Ask the user to confirm ambiguous candidates. New developments, rural routes, shelters, PO boxes, and landmark-only locations must enter manual review instead of being forced to a city-centre coordinate.

## 4. Mapping and independent review sequence

1. Establish country and whether the supplied address is a residence or the current incident location. Never infer the latter from account settings.
2. Use an approved geocoding service under the privacy controls in [handbook 04](04-privacy-and-address-compliance.md). Record match quality, coordinate precision, source, version, and any manual correction. Do not send addresses to unapproved public tools.
3. Compare the candidate location with official municipal, county, tribal, and dispatch service-area evidence. Postal names and Census boundaries provide context but do not prove emergency service responsibility.
4. Identify the responsible agency through current local authority documentation or an authorized administrative liaison. Consider sheriff, municipal, state, tribal, transit, campus, federal, and contract-service exceptions.
5. Separately identify nearby public stations and their physical public-facing addresses. Do not use a mailing-only address, headquarters centroid, closed precinct, or administrative office as an emergency destination.
6. Verify every displayed number's purpose, operating hours, service area, accessibility notes, and fallback. Obtain a second source or documented agency confirmation. Do not dial emergency numbers for testing.
7. Have an independent reviewer reproduce the jurisdiction decision from redacted evidence. When sources conflict, mark the record disputed and withhold the recommendation.
8. Release only the approved geographic subset, preserving verification and expiry metadata. A successful sample does not approve the entire metropolitan area.

## 5. Minimum record and quality gates

The controlled directory record should contain region ID, agency identifier, agency name, official source URLs, public physical station address, separate mailing address if relevant, contact category, normalized number, supported area, hours, source update date, human verification date, next review date, reviewer, confidence rationale, and fallback. User addresses belong in a separate restricted system and must not be copied into the public directory dataset.

Before regional acceptance, review synthetic examples for a city centre, suburban boundary, unincorporated location, and one region-specific special jurisdiction. Confirm both an ordinary station lookup and the emergency disclaimer. The gate is zero unresolved critical misrouting or number-category defects in the approved test set, with every displayed contact independently reviewed and unexpired. This is an internal proposed acceptance rule, not evidence that testing has happened.

## 6. Exceptions, maintenance, and expansion

If an address cannot be confidently placed, show uncertainty and provide general emergency guidance rather than guessing a dispatch number. A staffed liaison may resolve the case using administrative channels; never ask an emergency dispatcher to perform routine bulk directory verification. For offline or stale records, apply the expiry and fallback controls in [handbook 05](05-edge-cases-and-incident-drills.md).

Adopt monthly official-source checks, quarterly liaison reconfirmation, and immediate review after a reported error, relocation, merger, or boundary change. These are proposed operational cadences, not statutory schedules. M16-M20 stay on HOLD until the same evidence and approval exist; the final launch task must explicitly verify their exclusion. Expansion requires a sponsor decision and separate regional sign-off, not merely the presence of a row in this handbook. Use [source governance](03-public-registry-and-data-sources.md) and [the readiness checklist](06-e2e-operational-readiness-checklist.md) to document each release decision.
