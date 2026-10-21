import { eq } from 'drizzle-orm';

import { mediaUploads, type Db, type MediaUpload } from '@predator-guard/db';

/**
 * Uploaded files in the database.
 *
 * The bucket holds the bytes; a row holds the object key and the metadata.
 * Links are never stored: `/api/media/<id>` signs a fresh one on every read.
 */

export interface SaveMediaInput {
  /** The analysis this file belongs to, or null for a file stored on its own. */
  detectionId: string | null;
  kind: 'image' | 'video';
  filename: string;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
}

export async function saveMedia(db: Db, input: SaveMediaInput): Promise<MediaUpload> {
  const rows = await db.insert(mediaUploads).values(input).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error('Media insert did not return a row');
  return inserted;
}

/** One stored upload by id, or null when it does not exist. */
export async function getMedia(db: Db, id: string): Promise<MediaUpload | null> {
  const rows = await db.select().from(mediaUploads).where(eq(mediaUploads.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Point a stored upload at the analysis it fed. Null when the id is unknown. */
export async function linkMedia(
  db: Db,
  id: string,
  detectionId: string,
): Promise<MediaUpload | null> {
  const rows = await db
    .update(mediaUploads)
    .set({ detectionId })
    .where(eq(mediaUploads.id, id))
    .returning();
  return rows[0] ?? null;
}

/** The public shape of a stored upload; the bucket key stays server-side. */
export function mediaView(media: MediaUpload) {
  return {
    id: media.id,
    kind: media.kind,
    filename: media.filename,
    contentType: media.contentType,
    sizeBytes: media.sizeBytes,
    /** Stable app link; resolves to a fresh signed URL on every request. */
    url: `/api/media/${media.id}`,
    detectionId: media.detectionId,
  };
}
