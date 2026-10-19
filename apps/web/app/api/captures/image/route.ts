import { NextResponse } from 'next/server';

import { readCaptureImage } from '@/lib/captures';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const image = await readCaptureImage(await getDb(), id);
  if (!image) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response(new Uint8Array(image.bytes).buffer, {
    status: 200,
    headers: { 'content-type': image.contentType, 'cache-control': 'private, max-age=3600' },
  });
}
