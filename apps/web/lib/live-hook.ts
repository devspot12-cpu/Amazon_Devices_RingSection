import { fetchRingSnapshot } from './ring-live';
import { findOrCreateCameraByName } from './cameras';
import { ensureFarm } from './farm';
import { getDb } from './db';
import { evaluateDanger } from './danger';
import { saveDetection, setDetectionImageKey } from './history';
import { captureKey, putCapture, storageConfigured } from './storage';
import { classifyAnimal } from './vision';
import type { ZoneKind } from '@predator-guard/ring';

/**
 * The live hook.
 *
 * A Ring motion event (or the user pressing "check now") pulls one snapshot
 * of that device at the event's own timestamp, and the frame goes through the
 * same OpenRouter classifier the manual feed uses. The user-facing contract
 * is a bucket rule: **an animal lands in S3, no animal does not.** People
 * frames and model fall-backs are analysed, reported, and then dropped -
 * nothing is written to the bucket or the dashboard history.
 */

export interface HookOutcome {
  animalDetected: boolean;
  /** What happened to the snapshot. */
  snapshot: 'saved' | 'discarded' | 'not_configured';
  mediaTimestampMs: number | undefined;
  verdict: {
    species: string;
    confidence: number;
    model: string;
    peopleOnly: boolean;
    status: string;
    reason: string | undefined;
  } | undefined;
  danger: { dangerType: string; severity: string; dangerScore: number } | undefined;
  detectionId: string | undefined;
  cameraName: string | undefined;
}

/** True only when the model actually named an animal it recognizes. */
function isAnimalVerdict(
  verdict: Awaited<ReturnType<typeof classifyAnimal>>,
): boolean {
  if (!verdict) return false;
  if (verdict.peopleOnly) return false;
  if (verdict.species === 'none') return false;
  // The classifier's failure path answers 'unknown' at confidence 0 - that is
  // "the check failed", not "an animal was found".
  if (verdict.species === 'unknown' && verdict.confidence === 0) return false;
  return true;
}

export async function runLiveHook(input: {
  deviceId: string;
  cameraName?: string;
  timestampMs?: number;
}): Promise<HookOutcome> {
  const db = await getDb();
  const farm = await ensureFarm(db);
  const region = farm.region;

  // Step 1: the frame itself, at the event's own instant when we have one.
  const shot = await fetchRingSnapshot(input.deviceId, input.timestampMs);

  // Step 2: the same classifier as the manual feed.
  const verdict = await classifyAnimal({ bytes: shot.bytes, contentType: shot.contentType });

  const peopleOrNothing =
    verdict && (verdict.peopleOnly || verdict.species === 'unknown' || verdict.species === 'none');
  if (!peopleOrNothing && verdict) {
    // Step 3a: an animal - persist like any other detection.
    const camera = await findOrCreateCameraByName(db, {
      name: input.cameraName ?? input.deviceId,
      region,
    });
    const capturedAt = new Date(shot.mediaTimestampMs ?? Date.now());
    const zoneKind: ZoneKind = camera.zoneKind as ZoneKind;
    const danger = evaluateDanger(verdict.species, zoneKind, capturedAt, region);
    const saved = await saveDetection(db, {
      cameraId: camera.id,
      source: 'camera',
      region,
      species: verdict.species,
      animalScore: Math.round(verdict.confidence * 100),
      dangerType: danger.dangerType,
      severity: danger.severity,
      dangerScore: danger.dangerScore,
      model: verdict.model,
      peopleOnly: verdict.peopleOnly,
      status: verdict.status,
      capturedAt,
    });
    if (storageConfigured()) {
      const key = captureKey(saved.id, shot.contentType);
      await putCapture(key, shot.bytes, shot.contentType);
      await setDetectionImageKey(db, saved.id, key);
    }
    return {
      animalDetected: true,
      snapshot: storageConfigured() ? 'saved' : 'not_configured',
      mediaTimestampMs: shot.mediaTimestampMs,
      verdict: {
        species: verdict.species,
        confidence: Math.round(verdict.confidence * 100),
        model: verdict.model,
        peopleOnly: verdict.peopleOnly,
        status: verdict.status,
        reason: verdict.reason,
      },
      danger: { dangerType: danger.dangerType, severity: danger.severity, dangerScore: danger.dangerScore },
      detectionId: saved.id,
      cameraName: camera.name,
    };
  }

  // Step 3b: no animal (or only people, or the model failed) - the snapshot is
  // analysed, reported... and then dropped. No S3 write, no history row.
  return {
    animalDetected: false,
    snapshot: 'discarded',
    mediaTimestampMs: shot.mediaTimestampMs,
    verdict: verdict
      ? {
          species: verdict.species,
          confidence: Math.round(verdict.confidence * 100),
          model: verdict.model,
          peopleOnly: verdict.peopleOnly,
          status: verdict.status,
          reason: verdict.reason,
        }
      : undefined,
    danger: undefined,
    detectionId: undefined,
    cameraName: undefined,
  };
}
