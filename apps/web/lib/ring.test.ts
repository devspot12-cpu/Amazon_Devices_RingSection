import { describe, expect, it } from 'vitest';

import { RingApiError } from '@predator-guard/ring';

import { loadConfig } from './config';
import { RelinkRequiredError, describeRingError } from './ring';

/**
 * The route-facing error translation: dead sessions become "re-link", a pasted
 * playground token that expired says exactly how to fix it (friction log row
 * 23), everything else stays a Ring error - and none of them is ever a 500
 * (F1 criterion 7).
 */

describe('describeRingError', () => {
  const tokenConfig = loadConfig({ NODE_ENV: 'test', RING_ACCESS_TOKEN: 'pasteless' });

  it('maps a dead session to a re-link instruction, not a 500', () => {
    const described = describeRingError(new RelinkRequiredError(), tokenConfig);
    expect(described).toEqual({
      status: 409,
      body: {
        error: 'relink_required',
        detail: 'The Ring account must be linked again (refresh token rejected)',
      },
    });
  });

  it('names the playground-token fix on a 401 when RING_ACCESS_TOKEN is set', () => {
    const described = describeRingError(new RingApiError('Ring API 401', 401), tokenConfig);
    expect(described?.status).toBe(401);
    expect(described?.body.error).toBe('ring_token_expired');
    expect(described?.body.detail).toContain('apps/web/.env.local');
  });

  it('asks for a re-link on a 401 in vault mode', () => {
    const vaultConfig = loadConfig({ NODE_ENV: 'test', RING_SIM: '1' });
    const described = describeRingError(new RingApiError('Ring API 401', 401), vaultConfig);
    expect(described?.status).toBe(401);
    expect(described?.body.detail).toContain('Link the Ring account again');
  });

  it('keeps other Ring failures a 502 and passes non-Ring errors through', () => {
    expect(describeRingError(new RingApiError('Ring API 503', 503), tokenConfig)).toMatchObject({
      status: 502,
      body: { error: 'ring_error' },
    });
    expect(describeRingError(new Error('boom'), tokenConfig)).toBeNull();
  });
});
