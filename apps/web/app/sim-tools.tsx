'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Simulator shortcuts for the local demo (F10): start the linking flow the way
 * Ring would, and deliver one signed motion webhook. Both buttons hit the same
 * routes a real Ring would; only the server decides these exist.
 */

export function SimTools() {
  const router = useRouter();
  const [busy, setBusy] = useState<'link' | 'webhook' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function startLink() {
    setBusy('link');
    setError(false);
    setMessage('');
    try {
      const response = await fetch('/api/sim/demo', { method: 'POST' });
      const body: unknown = await response.json().catch(() => null);
      const linkUrl = (body as { linkUrl?: unknown } | null)?.linkUrl;
      if (!response.ok || typeof linkUrl !== 'string') {
        setError(true);
        setMessage('Could not start the simulator linking flow.');
        return;
      }
      router.push(linkUrl);
    } catch {
      setError(true);
      setMessage('Could not reach the app.');
    } finally {
      setBusy(null);
    }
  }

  async function sendWebhook() {
    setBusy('webhook');
    setError(false);
    setMessage('');
    try {
      const response = await fetch('/api/ring/webhook/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(true);
        setMessage('The signed webhook was rejected - check the server log.');
        return;
      }
      const eventId = (body as { webhook?: { body?: { eventId?: unknown } } } | null)?.webhook
        ?.body?.eventId;
      setMessage(
        typeof eventId === 'string'
          ? `Webhook accepted - event ${eventId.slice(0, 8)}… is on the feed below.`
          : 'Webhook accepted.',
      );
      router.refresh();
    } catch {
      setError(true);
      setMessage('Could not reach the app.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p>
        <button type="button" disabled={busy !== null} onClick={() => void startLink()}>
          {busy === 'link' ? 'Preparing…' : 'Link the fake Ring account'}
        </button>{' '}
        <button type="button" disabled={busy !== null} onClick={() => void sendWebhook()}>
          {busy === 'webhook' ? 'Sending…' : 'Send a signed test webhook'}
        </button>
      </p>
      {message ? (
        <p role={error ? 'alert' : 'status'}>{message}</p>
      ) : null}
    </div>
  );
}
