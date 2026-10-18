'use client';

import { useState, type FormEvent } from 'react';

/**
 * The sign-in form behind the Account Link URL.
 *
 * Sign-in is mandatory before the nonce is matched (F1) - in this project the
 * farmer identifies with name + email, since there is no other auth system
 * yet; a real deployment would hand the same POST a session token instead.
 * Submitting is the only action on the page: nothing happens automatically.
 */

export function LinkForm({ nonce, time }: { nonce: string; time: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'linked' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('submitting');
    try {
      const response = await fetch('/api/ring/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nonce, time, name, email }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && (body as { status?: unknown } | null)?.status === 'linked') {
        setPhase('linked');
        return;
      }
      const detail = (body as { detail?: unknown } | null)?.detail;
      setPhase('error');
      setMessage(
        typeof detail === 'string' ? detail : 'Linking failed. Start the flow again from Ring.',
      );
    } catch {
      setPhase('error');
      setMessage('Could not reach the app. Check the connection and try again.');
    }
  }

  if (phase === 'linked') {
    return (
      <p role="status">
        <strong>Linked.</strong> Next: <a href="/devices">map your cameras to zones</a>.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <p>
        <label>
          Name{' '}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </label>
      </p>
      <p>
        <label>
          Email{' '}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
      </p>
      <p>
        <button type="submit" disabled={phase === 'submitting'}>
          {phase === 'submitting' ? 'Linking…' : 'Sign in and link'}
        </button>
      </p>
      {phase === 'error' ? <p role="alert">{message}</p> : null}
    </form>
  );
}
