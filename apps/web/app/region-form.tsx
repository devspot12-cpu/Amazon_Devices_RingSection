'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { regionLabel } from '@predator-guard/rules';

/**
 * Farm region picker. The save goes to /api/farm as JSON and then refreshes
 * the server component, so the page stays put while the region (and the
 * predator watchlist it drives) is written to Postgres.
 */

export interface RegionOption {
  id: string;
  label: string;
  states: string;
}

interface ErrorBody {
  error?: string;
  detail?: string;
}

interface FarmBody {
  farm?: { id: string; region: string; updatedAt: string };
}

export function RegionForm({ region, regions }: { region: string; regions: RegionOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(region);
  const [current, setCurrent] = useState(region);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRegion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/farm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ region: selected }),
      });
      const body = (await response.json().catch(() => null)) as (ErrorBody & FarmBody) | null;
      if (!response.ok) {
        setError(body?.detail ?? body?.error ?? `Saving the region failed (HTTP ${response.status}).`);
        return;
      }
      // Reflect the saved region right away, then refresh so the watchlist
      // (rendered from Postgres) belongs to the new region too.
      const savedRegion = body?.farm?.region ?? selected;
      setCurrent(savedRegion);
      setSelected(savedRegion);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="row" onSubmit={(event) => void saveRegion(event)}>
        <label className="field" style={{ maxWidth: '320px' }}>
          Farm location
          <select
            name="region"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {regions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} — {option.states}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save region'}
        </button>
      </form>

      {error ? (
        <p className="failure" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
