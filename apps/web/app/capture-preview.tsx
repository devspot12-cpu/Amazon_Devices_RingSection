'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Hover preview of a captured frame.
 *
 * The dashboard lists cameras and threat alerts, and both are backed by the
 * analysis history. Hovering a row shows the picture that was captured -
 * nothing else, no click, no extra panel.
 */

/** What the preview shows about one capture. */
export interface CapturePreview {
  /**
   * Id of the detection whose frame is shown. The picture itself lives in
   * the object bucket and is fetched through `/api/captures/<id>`.
   */
  captureId: string | null;
  species?: string;
  animalScore?: number;
  dangerType?: string;
  /** ISO timestamp of the capture. */
  capturedAt?: string;
  /** Server-formatted capture time (farm time zone); wins over capturedAt so row and card agree. */
  capturedLabel?: string;
  /** Text shown instead of the frame when there is nothing to show. */
  emptyNote?: string;
}

interface Spot {
  left: number;
  top: number;
}

const MARGIN = 8;

/**
 * One list row that floats the captured frame next to it on hover.
 *
 * The card is `position: fixed` on purpose: the camera and alert lists live
 * in scroll panels, and an absolutely positioned card would be clipped by
 * them. Fixed positioning escapes the clip and is placed from the row's own
 * rectangle instead.
 */
export function CaptureRow({
  preview,
  children,
}: {
  preview: CapturePreview | null;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  /**
   * The frame that has already been mounted. Keeping it in the DOM after the
   * first hover means a second hover reuses the decoded image instead of
   * asking `/api/captures/<id>` (and therefore Postgres) again.
   *
   * It is only set on hover, so the dashboard still loads with no images.
   */
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  const place = useCallback(() => {
    const row = rowRef.current;
    const card = cardRef.current;
    if (!row || !card) return;
    const rowBox = row.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    // Under the row, or over it when there is no room below.
    let top = rowBox.bottom + MARGIN;
    if (top + cardBox.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, rowBox.top - cardBox.height - MARGIN);
    }
    let left = rowBox.left;
    if (left + cardBox.width > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, window.innerWidth - cardBox.width - MARGIN);
    }
    setSpot({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onViewportChange = () => place();
    // Capture phase: the lists scroll inside their own panels.
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [open, place]);

  if (!preview) return <li>{children}</li>;

  const when =
    preview.capturedLabel ?? (preview.capturedAt ? new Date(preview.capturedAt).toLocaleString() : '');

  return (
    <li
      ref={rowRef}
      onMouseEnter={() => {
        setOpen(true);
        // Same id -> same string -> React keeps the existing <img> and its
        // bytes; only a changed capture triggers a new request.
        if (preview.captureId) setFrameSrc(`/api/captures/${preview.captureId}`);
        place();
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      <div
        ref={cardRef}
        className={open ? 'capture-card is-open' : 'capture-card'}
        role="tooltip"
        style={spot ? { left: spot.left, top: spot.top } : undefined}
      >
        <div className="capture-card-frame">
          {preview.captureId ? (
            // Mounted after the first hover and kept, so re-hovering does not
            // fetch it (or hit the database) again.
            frameSrc ? (
              <img
                className="capture-card-image"
                src={frameSrc}
                alt={preview.species ? `Captured frame: ${preview.species}` : 'Captured frame'}
                decoding="async"
              />
            ) : null
          ) : (
            <p className="capture-card-empty">
              {preview.emptyNote ?? 'No frame stored for this capture'}
            </p>
          )}
        </div>
        {preview.species ? (
          <div className="capture-card-meta">
            <strong>{preview.species}</strong>
            <span className="muted">Animal Score {preview.animalScore}%</span>
            <span className="muted">
              {preview.dangerType}
              {when ? ` · ${when}` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}
