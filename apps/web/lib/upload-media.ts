/**
 * Upload one photo or video to the app's object storage.
 *
 * The file is sent to `/api/media`, which writes it to the bucket and returns
 * the stable link `/api/media/<id>`. Pass the detection id when the file has
 * just been analysed, so the database row points at that analysis.
 */

export interface UploadedMedia {
  id: string;
  kind: 'image' | 'video';
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Stable app link; resolves to a fresh signed URL on every request. */
  url: string;
  detectionId: string | null;
}

interface MediaReply {
  media?: UploadedMedia;
  error?: string;
  detail?: string;
}

export async function uploadMedia(file: File, detectionId?: string): Promise<UploadedMedia> {
  const form = new FormData();
  form.append('file', file);
  if (detectionId) form.append('detectionId', detectionId);

  const response = await fetch('/api/media', { method: 'POST', body: form });
  const body = (await response.json().catch(() => null)) as MediaReply | null;
  if (!response.ok || !body?.media) {
    throw new Error(body?.detail ?? body?.error ?? `Upload failed (HTTP ${response.status}).`);
  }
  return body.media;
}

/** Point an already-stored upload at the detection it was analysed as. */
export async function linkMedia(mediaId: string, detectionId: string): Promise<UploadedMedia> {
  const response = await fetch(`/api/media/${mediaId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detectionId }),
  });
  const body = (await response.json().catch(() => null)) as MediaReply | null;
  if (!response.ok || !body?.media) {
    throw new Error(body?.detail ?? body?.error ?? `Linking failed (HTTP ${response.status}).`);
  }
  return body.media;
}
