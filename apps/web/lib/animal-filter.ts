/**
 * Pure helpers for the in-browser animal spotter (`/video`).
 * The detector (COCO-SSD) proposes boxes; these decide what counts as
 * "an animal at this moment" so the capture logic is unit-testable
 * without a model, a video, or a browser.
 */

/** COCO classes we treat as animals (person explicitly excluded). */
export const ANIMAL_CLASSES = new Set([
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
]);

export const DEFAULT_ANIMAL_THRESHOLD = 0.6;

export interface DetectorPrediction {
  class: string;
  score: number;
}

export interface AnimalHit {
  label: string;
  score: number;
}

/** Best animal prediction at/above the threshold, or null. */
export function bestAnimal(
  predictions: readonly DetectorPrediction[],
  threshold = DEFAULT_ANIMAL_THRESHOLD,
): AnimalHit | null {
  let best: AnimalHit | null = null;
  for (const prediction of predictions) {
    const label = prediction.class.trim().toLowerCase();
    if (!ANIMAL_CLASSES.has(label)) continue;
    if (!Number.isFinite(prediction.score) || prediction.score < threshold) continue;
    if (!best || prediction.score > best.score) best = { label, score: prediction.score };
  }
  return best;
}

/** Seconds -> `m:ss.s` for the on-screen timeframe. */
export function formatTimeframe(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}
