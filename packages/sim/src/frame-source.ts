import { cannedFrame } from './frames.js';

/**
 * Where frames come from (FEATURES.md F10 criterion 3).
 *
 * The vision funnel takes bytes; this interface is the seam between "which
 * bytes" and "what species". `CannedFrameSource` serves the simulator JPEGs.
 * The real source - Ring's image-snapshot endpoint, then clip fallback - is
 * swapped in by configuration when media fetch (F4) lands, exactly as
 * `@predator-guard/ring` swaps real Ring for the fake.
 */

export interface CapturedFrame {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  deviceId: string;
  componentId: string | null;
  capturedAt: Date;
}

export interface FrameSource {
  fetchFrame(input: {
    deviceId: string;
    /** Event timestamp to bias the snapshot window around. */
    at?: Date;
    componentId?: string | null;
  }): Promise<CapturedFrame>;
}

/** Serves the bundled simulator JPEGs. No network, no camera. */
export class CannedFrameSource implements FrameSource {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async fetchFrame(input: {
    deviceId: string;
    at?: Date;
    componentId?: string | null;
  }): Promise<CapturedFrame> {
    const frame = cannedFrame();
    return {
      bytes: frame.bytes,
      contentType: frame.contentType,
      deviceId: input.deviceId,
      componentId: input.componentId ?? null,
      capturedAt: input.at ?? this.now(),
    };
  }
}
