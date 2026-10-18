import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Account-linking nonce freshness window, in seconds.
 * Ring's documented value is 600 s (10 minutes).
 */
export const NONCE_VALIDATION_WINDOW_SECONDS = 600;

/**
 * Verify a Ring webhook signature.
 *
 * Ring sends `X-Signature: sha256=<hex>`, computed as HMAC-SHA256 over the **raw**
 * request body. Pass the bytes exactly as received: re-serialising the JSON changes
 * whitespace and key order, so the digest will not match and every check fails on a
 * payload that looks correct.
 *
 * The comparison is constant-time.
 */
export function verifyWebhookSignature(
  signingKey: string,
  rawBody: string | Buffer,
  receivedSignature: string,
): boolean {
  const expected = createHmac('sha256', signingKey).update(rawBody).digest('hex');
  const received = receivedSignature.replace(/^sha256=/, '');

  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, receivedBytes);
}

/**
 * Compute the account-linking nonce.
 *
 * `HMAC-SHA256(K_hmac, "<time>:<account_id>")`, encoded as **URL-safe Base64 without
 * padding**. This uses the same key as webhook verification but a different encoding:
 * webhooks are hex, nonces are base64url. Do not substitute one helper for the other.
 */
export function computeLinkNonce(
  timeMs: number | string,
  accountId: string,
  hmacKey: string,
): string {
  const mac = createHmac('sha256', hmacKey).update(`${timeMs}:${accountId}`).digest();
  // Node's base64url output is already unpadded.
  return mac.toString('base64url');
}

/**
 * A link attempt is usable when it is inside the validation window and not from the
 * future (a future timestamp is always invalid).
 */
export function isFreshLinkTime(
  timeParamMs: number,
  nowMs: number = Date.now(),
  windowSeconds: number = NONCE_VALIDATION_WINDOW_SECONDS,
): boolean {
  const deltaSeconds = (nowMs - timeParamMs) / 1000;
  return deltaSeconds >= 0 && deltaSeconds <= windowSeconds;
}
