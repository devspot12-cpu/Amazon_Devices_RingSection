# Emergency contacts & nearest police - research and design

## Feature 1 - Helpline in the sidebar (done)
Left sidebar in apps/web/app/layout.tsx with Emergency contacts panel (apps/web/app/emergency-contacts.tsx + apps/web/lib/emergency-contacts.ts): 911 and US Poison Control 1-800-222-1222, Call (tel:) and Share (Web Share API, clipboard fallback) per contact. Farm contact from EMERGENCY_CONTACT_NAME / EMERGENCY_CONTACT_PHONE; no invented number - unset shows No number set yet.

## Feature 2 - Nearest police by address / shared location

### Internet research (live-tested 2026-10-21)
- OpenStreetMap Nominatim: free, no key, ODbL attribution, max 1 req/s public server. Geocoding works; bounded amenity=police search returned Mountain View Police Department and Sunnyvale Dept. of Public Safety (phone +1-408-730-7100) near Mountain View, CA. USED as primary.
- OpenStreetMap Overpass API: free, no key, but repeatedly 502 at-capacity on overpass-api.de; mirrors timed out. Possible but flaky - not primary.
- Google Places / Geoapify: need API key/billing, no active connection here. Fallback for production scale / richer phone coverage.

Conclusion: possible with open-source APIs (OpenStreetMap), no key needed for demo. Limits: OSM phone tags incomplete, so UI always keeps Call 911 visible; public Nominatim must be cached/self-hosted for heavy traffic.

### Division
- Backend: apps/web/lib/nearest-emergency.ts + apps/web/app/api/emergency-nearby/route.ts - GET ?address= or ?lat=&lon=, geocode, bounded police search, haversine sort, max 5, phone/website when OSM has them, attribution + 911 note, JSON errors.
- UI: apps/web/app/nearest-emergency.tsx in sidebar - address form or Share my location (geolocation), results with distance/address and Call/Share per station (Call 911 fallback).

### Left for later
Fire/hospital kinds, routing distance, persisting a farm address, keyed provider if coverage/volume outgrows OSM.
