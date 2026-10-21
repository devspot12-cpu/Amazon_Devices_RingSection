/**
 * Nearest police lookup (backend). Free/open-source, no API key:
 * Nominatim geocodes an address, then a bounded amenity=police search
 * finds departments near the point; extratags may carry phone/website.
 * Live-tested 2026-10-21 - see docs/EMERGENCY_CONTACTS.md.
 * Limits: OSM phone coverage is incomplete (keep 911 visible);
 * public Nominatim is rate-limited to 1 req/s with attribution.
 * Overpass was tested and returned 502 at-capacity, so it is not primary.
 */
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'PredatorGuard/0.1 (nearest-emergency; https://github.com/suchet-kapoor/Amazon_Devices_RingSection)';

export interface NearbyEmergency { name: string; kind: string; phone: string | null; website: string | null; address: string; distanceKm: number; lat: number; lon: number; }
export interface NearbyOrigin { lat: number; lon: number; label: string; }
interface NominatimPlace { lat: string; lon: string; name?: string; display_name?: string; extratags?: Record<string, string | undefined> | null; }

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function nominatim(path: string): Promise<unknown> {
  const response = await fetch(`${NOMINATIM_BASE}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`OpenStreetMap lookup failed (HTTP ${response.status})`);
  return response.json();
}

export async function geocodeAddress(address: string): Promise<NearbyOrigin | null> {
  const query = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '1', q: address });
  const data = (await nominatim(`/search?${query}`)) as NominatimPlace[];
  const first = data[0];
  if (!first) return null;
  return { lat: Number(first.lat), lon: Number(first.lon), label: first.display_name ?? address };
}

async function searchPolice(origin: NearbyOrigin, deltaLat: number, deltaLon: number): Promise<NearbyEmergency[]> {
  const viewbox = [origin.lon - deltaLon, origin.lat + deltaLat, origin.lon + deltaLon, origin.lat - deltaLat].join(',');
  const query = new URLSearchParams({ format: 'jsonv2', limit: '20', amenity: 'police', bounded: '1', extratags: '1', viewbox });
  const data = (await nominatim(`/search?${query}`)) as NominatimPlace[];
  return data.filter((p) => p.name).map((p) => { const lat = Number(p.lat); const lon = Number(p.lon); const tags = p.extratags ?? {}; return { name: p.name as string, kind: 'police', phone: tags.phone ?? tags['contact:phone'] ?? null, website: tags.website ?? tags['contact:website'] ?? null, address: p.display_name ?? '', distanceKm: Math.round(distanceKm(origin.lat, origin.lon, lat, lon) * 10) / 10, lat, lon }; }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);
}

export async function nearestPolice(origin: NearbyOrigin): Promise<NearbyEmergency[]> {
  const nearby = await searchPolice(origin, 0.07, 0.09);
  return nearby.length > 0 ? nearby : searchPolice(origin, 0.22, 0.28);
}
