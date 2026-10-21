/**
 * `@predator-guard/vision` - species detection from a photo/frame (F5).
 *
 * The OpenRouter adapter and species prompt/parser live next door. This
 * module owns the shared classifier shapes without depending on keys or
 * network transport.
 */

/** One photo/frame to classify - a snapshot or a frame from a video. */
export interface FrameInput {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  deviceId?: string;
  componentId?: string;
  eventId?: string;
}

export type ClassificationStatus = 'done' | 'fallback';

export interface Classification {
  species: string;
  confidence: number;
  model: string;
  peopleOnly: boolean;
  status: ClassificationStatus;
}

export interface SpeciesClassifier {
  readonly modelId: string;
  classify(frame: FrameInput): Promise<Classification>;
}
