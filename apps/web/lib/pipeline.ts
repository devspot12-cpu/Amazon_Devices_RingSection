import { eq } from 'drizzle-orm';
import { events, type Db } from '@predator-guard/db';
import type { RingSnapshot } from '@predator-guard/ring';
import { findCaptureDevice, getDetectionForEvent, markCapturePending, saveCapture } from './captures';
import type { RingConfig } from './config';
import { EVENT_FRAME_OFFSET_MS } from './frame';
import { ensureFreshAccessToken, createRingClient } from './ring';
import { identifyAnimal, saveAnimalVerdict } from './vision';
import type { JobHandler } from './jobs';
export const PROCESS_EVENT_JOB = 'process_event';
export interface ProcessEventPayload { eventId: string; ringEventId: string; subType: string; componentIds?: string[]; }
export interface EventSnapshotRequest { farmId: string; ringDeviceId: string; atMs: number; componentId: string | null; }
export interface PipelineDeps { db: Db; config: RingConfig; fetchSnapshot?: (request: EventSnapshotRequest) => Promise<RingSnapshot | null>; }
async function fetchEventSnapshot(deps: PipelineDeps, request: EventSnapshotRequest): Promise<RingSnapshot | null> { if (deps.fetchSnapshot) return deps.fetchSnapshot(request); const { accessToken } = await ensureFreshAccessToken(deps.db, deps.config, request.farmId); return createRingClient(deps.config).fetchImageSnapshot(accessToken, request.ringDeviceId, { atMs: request.atMs, componentId: request.componentId }); }
export function createJobHandlers(deps: PipelineDeps): Record<string, JobHandler> {
  const { db } = deps;
  return { [PROCESS_EVENT_JOB]: async (payload) => {
    const job = payload as Partial<ProcessEventPayload> | null; if (!job?.eventId) throw new Error('process_event payload is missing eventId');
    const eventRows = await db.select({ id: events.id, farmId: events.farmId, ringDeviceId: events.ringDeviceId, ringEventId: events.ringEventId, occurredAt: events.occurredAt }).from(events).where(eq(events.id, job.eventId)).limit(1); const event = eventRows[0]; if (!event) throw new Error(`process_event cannot find event ${job.eventId}`);
    if (!event.farmId) { console.warn(JSON.stringify({ stage: 'capture.skipped', reason: 'farm_not_linked', eventId: job.eventId })); return; }
    const device = await findCaptureDevice(db, event.farmId, event.ringDeviceId); if (!device) { console.warn(JSON.stringify({ stage: 'capture.skipped', reason: 'camera_not_synced', eventId: job.eventId, ringDeviceId: event.ringDeviceId })); return; }
    if (device.e2ee) { console.info(JSON.stringify({ stage: 'capture.skipped', reason: 'e2ee_device', eventId: job.eventId, ringDeviceId: event.ringDeviceId })); return; }
    const componentIds = Array.isArray(job.componentIds) ? job.componentIds.filter((id): id is string => typeof id === 'string') : [];
    const snapshot = await fetchEventSnapshot(deps, { farmId: event.farmId, ringDeviceId: event.ringDeviceId, atMs: event.occurredAt.getTime() + EVENT_FRAME_OFFSET_MS, componentId: componentIds[0] ?? null });
    if (!snapshot) { console.info(JSON.stringify({ stage: 'capture.skipped', reason: 'no_frame_for_event', eventId: event.id, ringEventId: event.ringEventId })); return; }
    const capture = await saveCapture(db, { bytes: snapshot.bytes, contentType: snapshot.contentType, capturedAt: event.occurredAt, device, farmId: event.farmId, eventId: event.id, ringEventId: event.ringEventId, source: `event:${event.ringEventId}` });
    await markCapturePending(db, event.id, capture.id);
    const existing = await getDetectionForEvent(db, event.id);
    if (!existing || existing.status === 'pending') { const animal = await identifyAnimal({ bytes: snapshot.bytes, contentType: snapshot.contentType, capturedAt: event.occurredAt, eventId: event.ringEventId }); if (animal) await saveAnimalVerdict(db, event.id, capture.id, animal); }
  } };
}
