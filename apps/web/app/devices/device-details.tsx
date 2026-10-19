'use client';

import { useState } from 'react';

/**
 * Calls the app's server-side Ring proxy and shows its parsed JSON response.
 * Credentials remain on the server and are never returned to this component.
 */
export function DeviceDetails({ ringDeviceId }: { ringDeviceId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [invoked, setInvoked] = useState(false);

  async function invoke() {
    setBusy(true);
    setError('');
    setResult(null);
    setInvoked(false);
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(ringDeviceId)}`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = (body as { detail?: unknown } | null)?.detail;
        setError(typeof detail === 'string' ? detail : 'Could not load device details.');
        return;
      }
      setResult(body);
      setInvoked(true);
    } catch {
      setError('Could not reach the app.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Device details for ${ringDeviceId}`}>
      <button type="button" disabled={busy} onClick={() => void invoke()}>
        {busy ? 'Invoking…' : 'Invoke device details'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {invoked ? (
        <pre aria-label={`JSON response for ${ringDeviceId}`}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
