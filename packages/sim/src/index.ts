/**
 * `@predator-guard/sim` - everything that lets the app run without a Ring
 * account: the fake Ring Partner API, the webhook sender, canned frames and
 * (see `generator.ts`) the planted-stories event generator.
 *
 * Real Ring is swapped in by configuration only (base URLs and credentials),
 * never by forking code paths.
 */
export * from './fake-ring.js';
export * from './frame-source.js';
export * from './frames.js';
export * from './generator.js';
export * from './webhook-sender.js';
