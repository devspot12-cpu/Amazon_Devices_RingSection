import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  NONCE_VALIDATION_WINDOW_SECONDS,
  computeLinkNonce,
  isFreshLinkTime,
  verifyWebhookSignature,
} from './signature.js';

const KEY = 'test-hmac-signing-key';

function sign(body: string, key: string = KEY): string {
  return `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ hello: 'world', n: 1 });

  it('accepts a signature computed over the raw body', () => {
    expect(verifyWebhookSignature(KEY, body, sign(body))).toBe(true);
  });

  it('accepts a Buffer body identical to the signed bytes', () => {
    expect(verifyWebhookSignature(KEY, Buffer.from(body, 'utf8'), sign(body))).toBe(true);
  });

  it('rejects a signature computed over re-serialised JSON', () => {
    // The classic bug: parse, then re-serialise, then sign. Different bytes, 401s.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(KEY, body, sign(reserialised))).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    expect(verifyWebhookSignature(KEY, body, sign(body, 'other-key'))).toBe(false);
  });

  it('rejects an empty or missing signature header without throwing', () => {
    expect(verifyWebhookSignature(KEY, body, '')).toBe(false);
    expect(verifyWebhookSignature(KEY, body, 'sha256=')).toBe(false);
  });
});

describe('computeLinkNonce', () => {
  const accountId = 'ava1.ring.account.XYZ';

  it('produces URL-safe base64 with no padding', () => {
    const nonce = computeLinkNonce(1771130906289, accountId, KEY);
    expect(nonce).not.toContain('=');
    expect(nonce).not.toMatch(/[+/]/);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('matches a hand-rolled HMAC over "<time>:<account_id>"', () => {
    const time = 1771130906289;
    const expected = createHmac('sha256', KEY)
      .update(`${time}:${accountId}`)
      .digest('base64url');
    expect(computeLinkNonce(time, accountId, KEY)).toBe(expected);
  });

  it('changes when the account id changes', () => {
    expect(computeLinkNonce(1, 'a', KEY)).not.toBe(computeLinkNonce(1, 'b', KEY));
  });
});

describe('isFreshLinkTime', () => {
  const now = 1_000_000_000_000;

  it('accepts a timestamp inside the window', () => {
    expect(isFreshLinkTime(now - 5_000, now)).toBe(true);
  });

  it('accepts the window edge and rejects one second past it', () => {
    expect(isFreshLinkTime(now - NONCE_VALIDATION_WINDOW_SECONDS * 1000, now)).toBe(true);
    expect(isFreshLinkTime(now - (NONCE_VALIDATION_WINDOW_SECONDS + 1) * 1000, now)).toBe(false);
  });

  it('rejects a future timestamp', () => {
    expect(isFreshLinkTime(now + 1_000, now)).toBe(false);
  });
});
