import type { Species } from '@predator-guard/ring';

/**
 * `@predator-guard/vision` - species detection from a photo/frame
 * (FEATURES.md F5; PLAN.md tiered funnel).
 *
 * Identify the animal in one Ring frame: return a species and a confidence,
 * drop people-only frames before they are ever stored, escalate low-confidence
 * results to a stronger model, and fail open to `unknown` on any error so a
 * real threat is never silently dropped.
 *
 * No I/O lives in the funnel itself: the classifier implementation (Bedrock in
 * production, a fake in tests) is injected, so the gating logic is fully
 * unit-testable without AWS credentials or real photos.
 */

/** One photo/frame to classify - normally the JPEG from a Ring snapshot. */
export interface FrameInput {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  deviceId?: string;
  componentId?: string;
  eventId?: string;
}

export type ClassificationStatus = 'done' | 'fallback';

export interface Classification {
  species: Species;
  confidence: number;
  model: string;
  peopleOnly: boolean;
  status: ClassificationStatus;
}

export interface SpeciesClassifier {
  readonly modelId: string;
  classify(frame: FrameInput): Promise<Classification>;
}

export interface ClassifyFrameOptions {
  confidenceThreshold?: number;
  timeoutMs?: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_TIMEOUT_MS = 15_000;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalise(result: Classification, fallbackModel: string): Classification {
  return {
    species: result.species,
    confidence: clampConfidence(result.confidence),
    model: result.model || fallbackModel,
    peopleOnly: Boolean(result.peopleOnly),
    status: 'done',
  };
}

function fallback(model: string): Classification {
  return { species: 'unknown', confidence: 0, model, peopleOnly: false, status: 'fallback' };
}

export class TimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super('Vision stage "' + stage + '" timed out after ' + timeoutMs + 'ms');
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(stage: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  if (!(timeoutMs > 0)) return run();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(stage, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class VisionFunnel {
  private readonly confidenceThreshold: number;
  private readonly timeoutMs: number;
  constructor(
    private readonly fast: SpeciesClassifier,
    private readonly strong?: SpeciesClassifier,
    options: ClassifyFrameOptions = {},
  ) {
    this.confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }
  async classify(frame: FrameInput): Promise<Classification> {
    let fastResult: Classification;
    try {
      fastResult = normalise(
        await withTimeout('fast', this.timeoutMs, () => this.fast.classify(frame)),
        this.fast.modelId,
      );
    } catch {
      return fallback(this.fast.modelId);
    }
    if (fastResult.peopleOnly) return fastResult;
    if (fastResult.confidence >= this.confidenceThreshold || !this.strong) return fastResult;
    try {
      const strongResult = normalise(
        await withTimeout('strong', this.timeoutMs, () => this.strong!.classify(frame)),
        this.strong.modelId,
      );
      if (strongResult.peopleOnly) return strongResult;
      return strongResult.confidence >= fastResult.confidence ? strongResult : fastResult;
    } catch {
      return fastResult.confidence > 0 ? fastResult : fallback(this.fast.modelId);
    }
  }
}

export function createClassifier(
  fast: SpeciesClassifier,
  strong?: SpeciesClassifier,
  options?: ClassifyFrameOptions,
): { classify(frame: FrameInput): Promise<Classification> } {
  const funnel = new VisionFunnel(fast, strong, options);
  return { classify: (frame: FrameInput) => funnel.classify(frame) };
}
