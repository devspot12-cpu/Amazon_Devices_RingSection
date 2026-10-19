import type { RingClient, RingSnapshot } from '@predator-guard/ring';

export interface LatestFrame {
  snapshot: RingSnapshot;
  /** The instant the frame stands for: "now", or the newest event's start. */
  atMs: number;
  /** True when "now" had no frame and the newest event's timestamp was used. */
  fromEvent: boolean;
}

/** Skip the often-dark opening second when requesting an event frame. */
export const EVENT_FRAME_OFFSET_MS = 1500;

export async function fetchLatestFrame(
  client: RingClient,
  accessToken: string,
  ringDeviceId: string,
  options: { resolution?: { width: number; height: number } } = {},
): Promise<LatestFrame | null> {
  const now = Date.now();
  const live = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
    atMs: now,
    resolution: options.resolution,
  });
  if (live) return { snapshot: live, atMs: now, fromEvent: false };

  const events = await client.listHistoryEvents(accessToken, ringDeviceId, { maxPages: 1 });
  const newest = [...events].reverse().find((event) => event.startMs > 0);
  if (!newest) return null;

  const replay = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
    atMs: newest.startMs + EVENT_FRAME_OFFSET_MS,
    resolution: options.resolution,
  });
  if (!replay) return null;
  return { snapshot: replay, atMs: newest.startMs, fromEvent: true };
}
