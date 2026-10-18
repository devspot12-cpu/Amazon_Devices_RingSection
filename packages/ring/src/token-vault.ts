import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * The token vault (FEATURES.md F1 criterion 5).
 *
 * Ring access/refresh tokens are persisted sealed with AES-256-GCM, keyed from
 * `TOKEN_ENC_KEY`. A sealed value is `v1.<iv>.<tag>.<ciphertext>`, all parts
 * URL-safe Base64 - self-describing, so a future `v2` can be introduced without
 * guessing at the format of old rows. GCM authentication means a tampered row
 * fails loudly at decrypt time instead of yielding garbage tokens.
 *
 * Never log sealed or plaintext values; the helpers here take and return plain
 * strings so the caller owns that discipline.
 */

const SEALED_PREFIX = 'v1';
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Decode `TOKEN_ENC_KEY` into the 32 bytes AES-256 needs.
 *
 * Accepts 64 hex characters (what `openssl rand -hex 32` prints) or Base64 of
 * 32 bytes. Anything else - including an empty or missing value - throws with
 * the exact expectation, because a silently truncated key would "work" while
 * providing far less entropy than it looks like.
 */
export function parseTokenEncKey(raw: string | undefined): Buffer {
  if (!raw || raw.trim() === '') {
    throw new Error(
      'TOKEN_ENC_KEY is required: provide 32 bytes as 64 hex characters (openssl rand -hex 32) or Base64',
    );
  }
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENC_KEY must decode to exactly ${KEY_BYTES} bytes for AES-256; got ${key.length}`,
    );
  }
  return key;
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Token vault key must be ${KEY_BYTES} bytes; got ${key.length}`);
  }
}

/** Seal a token string. Uses a fresh random IV every call. */
export function encryptToken(plaintext: string, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEALED_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Open a sealed token. Throws on a malformed seal, the wrong key, or any
 * tampering - GCM authenticates as part of decryption, so there is no "pretty
 * sure it's fine" outcome to worry about.
 */
export function decryptToken(sealed: string, key: Buffer): string {
  assertKey(key);
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== SEALED_PREFIX) {
    throw new Error(`Unrecognised sealed token: expected "${SEALED_PREFIX}.<iv>.<tag>.<ciphertext>"`);
  }
  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const ciphertext = Buffer.from(parts[3]!, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== GCM_TAG_BYTES) {
    throw new Error('Sealed token is malformed: bad IV or authentication tag length');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
