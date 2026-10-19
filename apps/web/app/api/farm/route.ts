import { z } from 'zod';

import { getFarm, setFarmRegion } from '@/lib/farm';
import { getDb } from '@/lib/db';
import { jsonError } from '@/lib/http';
import { REGIONS } from '@predator-guard/rules';

export const dynamic = 'force-dynamic';

const RegionBody = z.object({
  region: z.string().min(1).max(40),
});

/** Get the single-row farm profile (region + cameras pre-seeded). */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const farm = await getFarm(db);
    return Response.json({
      farm: farm
        ? { id: farm.id, region: farm.region, updatedAt: farm.updatedAt.toISOString() }
        : null,
      regions: REGIONS.map((region) => ({
        id: region.id,
        label: region.label,
        states: region.states,
        blurb: region.blurb,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Set the farm's US region (drives predator profiles). */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = RegionBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Bad region request' }, { status: 400 });
    const regionId = parsed.data.region;
    if (!REGIONS.find((region) => region.id === regionId)) {
      return Response.json({ error: 'Unknown region' }, { status: 400 });
    }
    const db = await getDb();
    const farm = await setFarmRegion(db, regionId);
    return Response.json({
      farm: { id: farm.id, region: farm.region, updatedAt: farm.updatedAt.toISOString() },
    });
  } catch (err) {
    return jsonError(err);
  }
}
