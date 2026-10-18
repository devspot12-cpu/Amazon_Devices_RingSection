/**
 * `@predator-guard/ring` - the typed Ring Partner API surface.
 *
 * This package owns everything that knows about Ring's shapes: the webhook envelope,
 * the domain vocabulary, and (as it lands) the typed HTTP client and the fake Ring
 * server used in tests and demos.
 */
export * from './client.js';
export * from './signature.js';
export * from './token-vault.js';
export * from './types.js';
export * from './webhook.js';
