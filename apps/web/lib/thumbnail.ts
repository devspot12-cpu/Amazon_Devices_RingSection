/**
 * Browser-only helper: shrink a captured frame to a small JPEG.
 *
 * The analyse request already carries the full frame; this makes the little
 * copy that travels with the detection, so the dashboard can show the
 * captured picture on hover without shipping megabytes of image data.
 *
 * Only import this from client components - it needs `document` and a canvas.
 */

/** Longest edge of the preview, in pixels. */
const MAX_EDGE = 320;
const QUALITY = 0.7;

/**
 * A small JPEG data URL of the canvas content, or null when the browser
 * refuses to draw (no canvas 2d context).
 */
export function thumbnailFromCanvas(canvas: HTMLCanvasElement): string | null {
  const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(canvas.width * scale));
  thumb.height = Math.max(1, Math.round(canvas.height * scale));
  const context = thumb.getContext('2d');
  if (!context) return null;
  context.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL('image/jpeg', QUALITY);
}
