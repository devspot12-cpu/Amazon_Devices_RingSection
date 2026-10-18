import { describe, expect, it } from 'vitest';

import { decryptToken, encryptToken, parseTokenEncKey } from './token-vault.js';

const KEY_HEX = 'a'.repeat(64);
const key = parseTokenEncKey(KEY_HEX);
const OTHER_KEY = parseTokenEncKey('b'.repeat(64));

describe('parseTokenEncKey', () => {
  it('accepts 64 hex characters as 32 bytes', () => {
    expect(parseTokenEncKey(KEY_HEX)).toEqual(Buffer.from(KEY_HEX, 'hex'));
  });

  it('accepts base64 of 32 bytes', () => {
    const base64 = Buffer.alloc(32, 7).toString('base64');
    expect(parseTokenEncKey(base64)).toEqual(Buffer.alloc(32, 7));
  });

  it('rejects a missing, empty or short key with a readable message', () => {
    expect(() => parseTokenEncKey(undefined)).toThrow(/TOKEN_ENC_KEY/);
    expect(() => parseTokenEncKey('')).toThrow(/TOKEN_ENC_KEY/);
    expect(() => parseTokenEncKey('abcd')).toThrow(/32 bytes/);
    expect(() => parseTokenEncKey('a'.repeat(62))).toThrow(/32 bytes/);
  });
});

describe('seal and open', () => {
  it('round-trips a token', () => {
    const sealed = encryptToken('ring-refresh-token-123', key);
    expect(decryptToken(sealed, key)).toBe('ring-refresh-token-123');
  });

  it('starts with the format version', () => {
    expect(encryptToken('x', key).startsWith('v1.')).toBe(true);
  });

  it('uses a fresh IV - the same token seals differently every time', () => {
    expect(encryptToken('same', key)).not.toBe(encryptToken('same', key));
  });

  it('fails to open with the wrong key', () => {
    const sealed = encryptToken('secret', key);
    expect(() => decryptToken(sealed, OTHER_KEY)).toThrow();
  });

  it('fails loudly when the ciphertext is tampered with', () => {
    const sealed = encryptToken('secret', key);
    const parts = sealed.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = flipped[0]! ^ 0x01;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.');
    expect(() => decryptToken(tampered, key)).toThrow();
  });

  it('rejects a malformed seal', () => {
    expect(() => decryptToken('not-a-seal', key)).toThrow(/Unrecognised/);
    expect(() => decryptToken('v2.a.b.c', key)).toThrow(/Unrecognised/);
  });
});
