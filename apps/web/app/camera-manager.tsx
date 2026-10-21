'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ZONE_OPTIONS, zoneLabel } from '@/lib/zones';

import { CaptureRow, type CapturePreview } from './capture-preview';

/**
 * Camera registry UI: add a camera (name + zone) or remove one. The zone is
 * what the danger rules read - a fox in the coop at night rates higher than
 * the same fox at the gate.
 */

export interface CameraItem {
  id: string;
  name: string;
  zoneKind: string;
  /** Most recent capture of this camera - shown when the row is hovered. */
  latest?: CapturePreview | null;
}

interface ErrorBody {
  error?: string;
  detail?: string;
}

function errorMessage(body: ErrorBody | null, status: number, fallback: string): string {
  return body?.detail ?? body?.error ?? `${fallback} (HTTP ${status}).`;
}

export function CameraManager({ cameras }: { cameras: CameraItem[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [zoneKind, setZoneKind] = useState<string>('gate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addCamera(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, zoneKind }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorBody | null;
        setError(errorMessage(body, response.status, 'Adding the camera failed'));
        return;
      }
      setName('');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function removeCamera(camera: CameraItem) {
    if (busy) return;
    // The delete also drops the camera's whole history - one stray click must not do that.
    if (!window.confirm(`Remove "${camera.name}" and all of its history? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cameras?id=${encodeURIComponent(camera.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorBody | null;
        setError(errorMessage(body, response.status, 'Removing the camera failed'));
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form className="row" onSubmit={(event) => void addCamera(event)}>
        <label className="field">
          Camera name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Back pasture cam"
            maxLength={80}
          />
        </label>
        <label className="field">
          Zone
          <select value={zoneKind} onChange={(event) => setZoneKind(event.target.value)}>
            {ZONE_OPTIONS.map((zone) => (
              <option key={zone.kind} value={zone.kind}>
                {zone.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || name.trim() === ''}>
          {busy ? 'Working...' : 'Add camera'}
        </button>
      </form>

      {error ? (
        <p className="failure" role="alert">
          {error}
        </p>
      ) : null}

      {cameras.length === 0 ? (
        <p className="muted">
          No cameras in this region yet. Add one above - cameras and their history belong to the
          region they were added in.
        </p>
      ) : (
        <div className="scroll-area scroll-area--cameras" tabIndex={0}>
          <ul className="feed">
            {cameras.map((camera) => (
              <CaptureRow key={camera.id} preview={camera.latest ?? null}>
                <strong>{camera.name}</strong>
                <span className="muted">{zoneLabel(camera.zoneKind)}</span>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void removeCamera(camera)}
                  disabled={busy}
                  aria-label={`Remove camera ${camera.name}`}
                >
                  Remove
                </button>
              </CaptureRow>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
