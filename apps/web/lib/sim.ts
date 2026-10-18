import { createFakeRing, type FakeRing } from '@predator-guard/sim';

/**
 * The process-wide fake Ring API instance.
 *
 * Pinned to `globalThis` for the same reason as the database handle: dev-mode
 * hot reload re-evaluates modules, and a fresh fake Ring per edit would drop
 * issued codes, tokens and integrations mid-demo. State resets when the
 * server restarts - which is a feature for a simulator.
 */

interface GlobalWithFakeRing {
  __predatorGuardFakeRing?: FakeRing;
}

export function getFakeRing(): FakeRing {
  const globalRef = globalThis as unknown as GlobalWithFakeRing;
  globalRef.__predatorGuardFakeRing ??= createFakeRing();
  return globalRef.__predatorGuardFakeRing;
}
