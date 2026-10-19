/**
 * `@predator-guard/vision` - species detection from a photo/frame (F5).
 *
 * The classifier implementations live next door (`./openrouter`,
 * `./species`); this module owns the shared shapes they both satisfy, so
 * the app can use providers without this package knowing about keys or
 * networks.
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
