import { z } from 'zod';

import { jsonError } from '@/lib/http';
import { geocodeAddress, nearestPolice, type NearbyOrigin } from '@/lib/nearest-emergency';

export const dynamic = 'force-dynamic';

const Query = z.object({ address: z.string().trim().min(3).max(200).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lon: z.coerce.number().min(-180).max(180).optional() }).refine((q) => q.address || (q.lat !== undefined && q.lon !== undefined), { message: 'Provide an address or lat+lon' });

/** GET /api/emergency-nearby?address=<text> OR ?lat=<n>&lon=<n> - nearest police (OpenStreetMap/Nominatim, no key), phone when OSM lists one. Immediate danger: call 911. */
export async function GET(request: Request): Promise<Response> {
  try {
    const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ error: 'Provide an address (min 3 chars) or lat+lon' }, { status: 400 });
    let origin: NearbyOrigin;
    if (parsed.data.address) {
      const found = await geocodeAddress(parsed.data.address);
      if (!found) return Response.json({ error: 'Address not found - try adding city and state' }, { status: 404 });
      origin = found;
    } else {
      origin = { lat: parsed.data.lat as number, lon: parsed.data.lon as number, label: 'Shared location' };
    }
    const results = await nearestPolice(origin);
    return Response.json({ origin, results, attribution: 'Data (c) OpenStreetMap contributors, ODbL 1.0', emergencyNote: 'In immediate danger call 911 (US). A missing phone means OpenStreetMap has no public number listed for that station.' });
  } catch (err) {
    return jsonError(err);
  }
}
