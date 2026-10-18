import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { createDb, devices, ringTokens, zones, type Db } from '@predator-guard/db';
import { encryptToken, parseTokenEncKey } from '@predator-guard/ring';
import { createFakeRing, type FakeRing } from '@predator-guard/sim';

import { loadConfig } from './config';
import { assignDeviceZone, syncDevices } from './devices';
import { createFarm, ensureFarm } from './farms';
import { RelinkRequiredError } from './ring';

/**
 * F3: device discovery stores what Ring reports (and flags E2EE cameras);
 * zone mapping assigns cameras to zones without duplicating zone rows.
 */

let db: Db;
let closeDb: () => Promise<void>;
const config = loadConfig({ NODE_ENV: 'test' });

const asFetch =
  (fake: FakeRing): typeof fetch =>
  (input, init) =>
    fake.handler(new Request(String(input), init));

/** A farm with a claimed, unexpired token, as the link flow would leave it. */
async function linkedFarm(fake: FakeRing, accountId: string): Promise<string> {
  const farm = await createFarm(db, {
    name: `Farm ${accountId}`,
    ownerEmail: `${accountId}@example.test`,
    ringAccountId: accountId,
  });
  const key = parseTokenEncKey(config.tokenEncKey);
  await db.insert(ringTokens).values({
    farmId: farm.id,
    ringAccountId: accountId,
    status: 'claimed',
    accessEnc: encryptToken(fake.issueAccessToken(accountId), key),
    refreshEnc: encryptToken('not-used-here', key),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return farm.id;
}

beforeAll(async () => {
  const opened = await createDb({ pgliteDataDir: 'memory://' });
  db = opened.db;
  closeDb = opened.close;
});

afterAll(async () => {
  await closeDb();
});

describe('syncDevices', () => {
  it('stores every reported camera, including the E2EE flag', async () => {
    const accountId = 'sync-account-1';
    const fake = createFakeRing({
      accounts: [
        {
          accountId,
          name: 'Sync Farmer',
          email: 'sync@example.test',
          devices: [
            {
              ringDeviceId: 'sync-cam-coop',
              name: 'Coop camera',
              deviceType: 'camera',
              online: true,
              e2ee: false,
              capabilities: { motion_detection: true },
              configurations: { motion_detection: { enabled: 'on' } },
            },
            {
              ringDeviceId: 'sync-cam-barn',
              name: 'Barn camera',
              deviceType: 'camera',
              online: false,
              e2ee: true,
              capabilities: { video_codecs: ['H264'] },
              configurations: { e2e_encryption: { enabled: true } },
            },
          ],
        },
      ],
    });
    const farmId = await linkedFarm(fake, accountId);

    const result = await syncDevices(db, config, { farmId, fetchImpl: asFetch(fake) });

    expect(result).toEqual({ farmId, synced: 2 });
    const rows = await db.select().from(devices).where(eq(devices.farmId, farmId));
    expect(rows).toHaveLength(2);

    const coop = rows.find((row) => row.ringDeviceId === 'sync-cam-coop')!;
    expect(coop.name).toBe('Coop camera');
    expect(coop.online).toBe(true);
    expect(coop.e2ee).toBe(false);
    expect(coop.capabilities).toEqual({ motion_detection: true });

    // Criterion 2: unreadable media is flagged at sync time.
    const barn = rows.find((row) => row.ringDeviceId === 'sync-cam-barn')!;
    expect(barn.e2ee).toBe(true);
    expect(barn.online).toBe(false);
  });

  it('is an upsert: re-syncing updates state without duplicating or dropping zones', async () => {
    const accountId = 'sync-account-2';
    const fake = createFakeRing({
      accounts: [
        {
          accountId,
          name: 'Re-sync Farmer',
          email: 'resync@example.test',
          devices: [
            {
              ringDeviceId: 'resync-cam-1',
              name: 'Old name',
              deviceType: 'camera',
              online: true,
              e2ee: false,
              capabilities: {},
              configurations: {},
            },
          ],
        },
      ],
    });
    const farmId = await linkedFarm(fake, accountId);
    await syncDevices(db, config, { farmId, fetchImpl: asFetch(fake) });

    // Map it to a zone, then let Ring report a rename and an outage.
    const mapped = await assignDeviceZone(db, farmId, 'resync-cam-1', 'coop');
    expect(mapped?.zoneKind).toBe('coop');

    const account = fake.state.accounts.get(accountId)!;
    account.devices[0]!.name = 'New name';
    account.devices[0]!.online = false;

    await syncDevices(db, config, { farmId, fetchImpl: asFetch(fake) });

    const rows = await db.select().from(devices).where(eq(devices.farmId, farmId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('New name');
    expect(rows[0]!.online).toBe(false);
    expect(rows[0]!.zoneId).toBe(mapped?.zoneId);
  });

  it('refuses to sync a farm without a linked Ring account', async () => {
    const farm = await createFarm(db, {
      name: 'Unlinked Farm',
      ownerEmail: 'unlinked@example.test',
      ringAccountId: 'sync-account-unlinked',
    });
    await expect(syncDevices(db, config, { farmId: farm.id })).rejects.toBeInstanceOf(
      RelinkRequiredError,
    );
  });
});

describe('assignDeviceZone', () => {
  it('creates a zone on first use, reuses it, and can clear the mapping', async () => {
    const accountId = 'zone-account-1';
    const fake = createFakeRing({
      accounts: [
        {
          accountId,
          name: 'Zone Farmer',
          email: 'zone@example.test',
          devices: [
            {
              ringDeviceId: 'zone-cam-1',
              name: 'Camera one',
              deviceType: 'camera',
              online: true,
              e2ee: false,
              capabilities: {},
              configurations: {},
            },
            {
              ringDeviceId: 'zone-cam-2',
              name: 'Camera two',
              deviceType: 'camera',
              online: true,
              e2ee: false,
              capabilities: {},
              configurations: {},
            },
          ],
        },
      ],
    });
    const farmId = await linkedFarm(fake, accountId);
    await syncDevices(db, config, { farmId, fetchImpl: asFetch(fake) });

    const first = await assignDeviceZone(db, farmId, 'zone-cam-1', 'coop');
    expect(first?.zoneKind).toBe('coop');
    const second = await assignDeviceZone(db, farmId, 'zone-cam-2', 'coop');
    expect(second?.zoneId).toBe(first?.zoneId); // one coop row for the farm

    const zoneRows = await db
      .select()
      .from(zones)
      .where(and(eq(zones.farmId, farmId), eq(zones.kind, 'coop')));
    expect(zoneRows).toHaveLength(1);
    expect(zoneRows[0]!.name).toBe('Coop');

    const cleared = await assignDeviceZone(db, farmId, 'zone-cam-1', null);
    expect(cleared).toEqual({ deviceId: first?.deviceId, zoneId: null, zoneKind: null });
    const deviceRow = (await db.select().from(devices).where(eq(devices.id, first!.deviceId)))[0]!;
    expect(deviceRow.zoneId).toBeNull();

    expect(await assignDeviceZone(db, farmId, 'unknown-camera', 'coop')).toBeNull();
  });
});

/**
 * `RING_ACCESS_TOKEN`: one pasted token, real Ring, no link flow and no vault
 * row. Own database so the "nothing linked yet" state is real.
 */
describe('syncDevices with RING_ACCESS_TOKEN', () => {
  let tokenDb: Db;
  let closeTokenDb: () => Promise<void>;

  beforeAll(async () => {
    const opened = await createDb({ pgliteDataDir: 'memory://' });
    tokenDb = opened.db;
    closeTokenDb = opened.close;
  });

  afterAll(async () => {
    await closeTokenDb();
  });

  it('derives the farm from GET /v1/users/me, reuses it, and syncs with the env token', async () => {
    const accountId = 'token-account-1';
    // Without a token there is nothing to derive a farm from: still "not linked".
    expect(await ensureFarm(tokenDb, config)).toBeNull();

    const fake = createFakeRing({
      accounts: [
        {
          accountId,
          name: 'Token Farmer',
          email: 'token@example.test',
          devices: [
            {
              ringDeviceId: 'token-cam-1',
              name: 'Token coop camera',
              deviceType: 'camera',
              online: true,
              e2ee: false,
              capabilities: {},
              configurations: {},
            },
          ],
        },
      ],
    });
    const tokenConfig = loadConfig({
      NODE_ENV: 'test',
      RING_ACCESS_TOKEN: fake.issueAccessToken(accountId),
    });
    expect(tokenConfig.isSim).toBe(false);

    const farm = await ensureFarm(tokenDb, tokenConfig, asFetch(fake));
    expect(farm?.ringAccountId).toBe(accountId);
    expect(farm?.name).toBe('Token Farmer');

    const again = await ensureFarm(tokenDb, tokenConfig, asFetch(fake));
    expect(again?.id).toBe(farm?.id); // reused, never duplicated

    const result = await syncDevices(tokenDb, tokenConfig, {
      farmId: farm!.id,
      fetchImpl: asFetch(fake),
    });
    expect(result).toEqual({ farmId: farm!.id, synced: 1 });
  });
});
