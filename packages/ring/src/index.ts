/**
 * `@predator-guard/ring` - the shared domain vocabulary for Predator Guard.
 *
 * The demo feeds its own snapshots and videos instead of calling Ring's
 * device, webhook and OAuth endpoints, so everything I/O-shaped was removed
 * and only the pure types remain (species, zone kinds, severities...).
 */
export * from './types.js';
