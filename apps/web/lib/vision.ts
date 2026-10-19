import { detections } from '@predator-guard/db';
import type { Db } from '@predator-guard/db';
import type { Classification } from '@predator-guard/vision';
import { OpenCodeSpeciesClassifier } from '@predator-guard/vision/opencode';

/** Photo -> ONE OpenCode call -> JSON verdict. Never throws. */
export interface AnimalVerdict extends Classification { capturedAt: string; reason?: string; }
const FALLBACK_MODEL = 'opencode';
export function openCodeClassifierFromProcessEnv(): OpenCodeSpeciesClassifier | null {
  try {
    const apiKey = process.env.OPENCODE_API_KEY?.trim(); if (!apiKey) return null;
    return new OpenCodeSpeciesClassifier({ apiKey, model: process.env.OPENCODE_VISION_MODEL?.trim() || undefined, baseUrl: process.env.OPENCODE_BASE_URL?.trim() || undefined });
  } catch (error) { console.warn(JSON.stringify({ stage: 'vision.config_invalid', error: error instanceof Error ? error.message : String(error) })); return null; }
}
export async function identifyAnimal(input: { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png'; capturedAt: Date; eventId?: string; classifier?: OpenCodeSpeciesClassifier | null; }): Promise<AnimalVerdict | null> {
  let classifier: OpenCodeSpeciesClassifier | null;
  try { classifier = input.classifier === undefined ? openCodeClassifierFromProcessEnv() : input.classifier; } catch { classifier = null; }
  if (!classifier) return null;
  try {
    const result = await classifier.classify({ bytes: input.bytes, contentType: input.contentType, eventId: input.eventId });
    const confidence = Math.min(1, Math.max(0, Number.isFinite(result.confidence) ? result.confidence : 0));
    console.info(JSON.stringify({ stage: 'vision.done', model: result.model, species: result.species, confidence, peopleOnly: result.peopleOnly }));
    return { ...result, confidence, capturedAt: input.capturedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({ stage: 'vision.fallback', model: classifier.modelId, error: message }));
    return { species: 'unknown', confidence: 0, model: classifier.modelId || FALLBACK_MODEL, peopleOnly: false, status: 'fallback', reason: 'Animal check failed - photo saved, please check it manually.', capturedAt: input.capturedAt.toISOString() };
  }
}
export async function saveAnimalVerdict(db: Db, eventId: string, captureId: string, verdict: AnimalVerdict): Promise<void> {
  await db.insert(detections).values({ eventId, species: verdict.species, confidence: verdict.confidence, model: verdict.model, frameUrl: `/api/captures/image?id=${encodeURIComponent(captureId)}`, status: verdict.status }).onConflictDoUpdate({ target: detections.eventId, set: { species: verdict.species, confidence: verdict.confidence, model: verdict.model, frameUrl: `/api/captures/image?id=${encodeURIComponent(captureId)}`, status: verdict.status } });
}
