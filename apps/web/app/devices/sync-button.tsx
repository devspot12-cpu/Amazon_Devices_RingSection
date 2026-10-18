'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Pulls the device list from Ring (F3 criterion 1) and refreshes the page. */
export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sync() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/devices/sync', { method: 'POST' });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = (body as { detail?: unknown } | null)?.detail;
        setError(typeof detail === 'string' ? detail : 'Sync failed.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the app.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <p>
      <button type="button" disabled={busy} onClick={() => void sync()}>
        {busy ? 'Syncing…' : 'Sync devices from Ring'}
      </button>
      {error ? (
        <span role="alert">
          {' '}
          {error}
        </span>
      ) : null}
    </p>
  );
}
