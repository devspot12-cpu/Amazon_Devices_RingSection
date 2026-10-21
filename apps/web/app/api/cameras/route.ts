import { z } from 'zod';

import { createCamera, deleteCamera, listCameras } from '@/lib/cameras';
import { getDb } from '@/lib/db';
import { ensureFarm } from '@/lib/farm';
import { jsonError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const ZONE_KINDS = ['coop', 'pasture', 'shed', 'gate'] as const;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  zoneKind: z.enum(ZONE_KINDS).default('gate'),
});

const DeleteQuery = z.object({
  id: z.string().uuid(),
});

/** List every camera for the farm's current region (auto-provisions farm + default cameras). */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const farm = await ensureFarm(db);
    return Response.json({
      cameras: await listCameras(db, farm.region),
      farm: { region: farm.region },
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Create (or re-zone) one camera for the current region: { name, zoneKind }. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = CreateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Bad camera request' }, { status: 400 });
    const db = await getDb();
    const farm = await ensureFarm(db);
    const camera = await createCamera(db, { ...parsed.data, region: farm.region });
    return Response.json({ camera }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

/** Remove one camera and its history: DELETE /api/cameras?id=<uuid>. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const parsed = DeleteQuery.safeParse({ id: new URL(request.url).searchParams.get('id') });
    if (!parsed.success) return Response.json({ error: 'Bad camera id' }, { status: 400 });
    const db = await getDb();
    await ensureFarm(db);
    const deleted = await deleteCamera(db, parsed.data.id);
    if (!deleted) return Response.json({ error: 'camera_not_found' }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
