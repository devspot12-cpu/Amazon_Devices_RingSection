import Link from 'next/link';

import { ensureFarm, listFarmWatchlist } from '@/lib/farm';
import { listCameras } from '@/lib/cameras';
import { getDb } from '@/lib/db';
import {
  listLatestDetectionByCamera,
  listRecentDetections,
  speciesSummaryByCamera,
} from '@/lib/history';
import { zoneLabel } from '@/lib/zones';
import {
  regionLabel,
  regionTimeZone,
  REGIONS,
  regionWatchlist as ruleWatchlist,
} from '@predator-guard/rules';

import { CameraManager, type CameraItem } from './camera-manager';
import { CaptureRow } from './capture-preview';
import { PredatorWatchlist } from './predator-watchlist';
import { RegionForm } from './region-form';
import { RingLive } from './ring-live';
import { RingDocs } from './ring-docs';

/**
 * Predator Guard dashboard.
 *
 * The demo loop: feed a frame on /video, see the Animal Score and Danger
 * Type on screen, and find the same result here afterwards - saved to the
 * Postgres history, grouped per camera.
 */

export const dynamic = 'force-dynamic';

const BADGE_KINDS = ['critical', 'danger', 'warning', 'monitor', 'none'];

function badgeClass(dangerType: string): string {
  const slug = dangerType.toLowerCase();
  return BADGE_KINDS.includes(slug) ? `badge badge-${slug}` : 'badge';
}

interface CameraSummary {
  camera: CameraItem;
  species: Array<{ species: string; count: number; worstDangerScore: number }>;
}

export default async function HomePage() {
  const db = await getDb();
  const farm = await ensureFarm(db);
  const cameras = await listCameras(db, farm.region);
  const recent = await listRecentDetections(db, farm.region, 20);
  const summary = await speciesSummaryByCamera(db, farm.region);
  const latestCaptures = await listLatestDetectionByCamera(db, farm.region);
  const latestByCamera = new Map(latestCaptures.map((row) => [row.cameraId, row]));

  // Farm-local time, the same zone as the header clock. Formatting here (not in
  // the browser) keeps the row and its hover card on one clock.
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: regionTimeZone(farm.region),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const farmTime = (iso: string) => timeFormat.format(new Date(iso));

  const cameraItems: CameraItem[] = cameras.map((camera) => {
    const latest = latestByCamera.get(camera.id);
    return {
      id: camera.id,
      name: camera.name,
      zoneKind: camera.zoneKind,
      latest: latest
        ? {
            captureId: latest.imageKey ? latest.id : null,
            species: latest.species,
            animalScore: latest.animalScore,
            dangerType: latest.dangerType,
            capturedAt: latest.capturedAt,
            capturedLabel: farmTime(latest.capturedAt),
          }
        : { captureId: null, emptyNote: 'No captures yet for this camera' },
    };
  });

  const summaries: CameraSummary[] = cameras.map((camera) => ({
    camera: { id: camera.id, name: camera.name, zoneKind: camera.zoneKind },
    species: summary
      .filter((row) => row.cameraId === camera.id)
      .map((row) => ({
        species: row.species,
        count: row.count,
        worstDangerScore: row.worstDangerScore,
      })),
  }));

  const watchlist = await listFarmWatchlist(db, farm.region);

  return (
    <main className="stack">
      <header className="hero stack">
        <div className="hero-top">
          <div className="hero-copy">
            <span className="eyebrow">Autonomous farm watch</span>
            <h1>Predator Guard</h1>
            <p>
              Feed your own video or snapshot, pick the camera it belongs to, and the AI model names
              the animal. You get an <strong>Animal Score</strong> and a <strong>Danger Type</strong>{' '}
              on screen — saved to this camera&apos;s Postgres history in parallel.
            </p>
          </div>
          <div className="stack-sm" style={{ alignItems: 'flex-start' }}>
            <Link className="cta" href="/video">
              Feed a frame →
            </Link>
          </div>
        </div>

        <div className="stat-row">
          <a
            className="stat stat--link"
            href="#cameras"
            aria-label={`${cameras.length} cameras - jump to the camera list`}
          >
            <span className="stat-value">{cameras.length}</span>
            <span className="stat-label">Cameras</span>
          </a>
          <a
            className="stat stat--link"
            href="#threat-alerts"
            aria-label={`${recent.length} recent alerts - jump to the threat alerts`}
          >
            <span className="stat-value">{recent.length}</span>
            <span className="stat-label">Recent alerts</span>
          </a>
          <a
            className="stat stat--link"
            href="#ring-live"
            aria-label="Ring live - jump to the live camera section"
          >
            <span className="stat-value">Live</span>
            <span className="stat-label">Ring cameras</span>
          </a>
        </div>
      </header>

      <section className="stack">
        <h2>Farm location &amp; predator profile</h2>
        <p className="muted" style={{ margin: 0 }}>
          Choose your US farm/homestead location. Each region tunes the danger rules to the
          predators that actually live there (e.g. wolves are critical in the Mountain West, much
          less so in many other regions).
        </p>
        <RegionForm
          region={farm.region}
          regions={REGIONS.map((r) => ({ id: r.id, label: r.label, states: r.states }))}
        />
        <PredatorWatchlist
          region={farm.region}
          regionLabel={regionLabel(farm.region)}
          entries={watchlist}
          allRegions={REGIONS.map((region) => ({
            id: region.id,
            label: region.label,
            states: region.states,
            entries: ruleWatchlist(region.id),
          }))}
        />
      </section>

      <section className="stack" id="cameras">
        <h2>
          Cameras <span className="muted">· {regionLabel(farm.region)}</span>
        </h2>
        <CameraManager cameras={cameraItems} />
      </section>

      <section className="stack" id="ring-live">
        <h2>
          Ring live <span className="muted">· devices, live view and the motion hook</span>
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Real Ring cameras when a Ring account is connected — devices, live video and motion
          events. Live video relays Ring&apos;s WHEP flow server-side; <strong>the hook</strong> watches the
          device&apos;s event history and, on every new motion, pulls the snapshot at the event&apos;s own
          moment and runs the classifier. An animal → snapshot saved to S3 + one history row. No animal →
          the frame is reported and dropped, nothing is stored.
        </p>
        <RingLive />
      </section>

      <section className="stack" id="species">
        <h2>
          Species by camera <span className="muted">· {regionLabel(farm.region)}</span>
        </h2>
        {summaries.length === 0 ? (
          <p className="muted">
            No sightings in {regionLabel(farm.region)} yet. Feed a frame to start building
            history for this region.
          </p>
        ) : (
          <div className="scroll-area scroll-area--grid" tabIndex={0}>
            <div className="camera-grid">
              {summaries.map(({ camera, species }) => (
                <div className="card stack-sm" key={camera.id}>
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <strong>{camera.name}</strong>
                    <span className="badge badge-monitor">{zoneLabel(camera.zoneKind)}</span>
                  </div>
                  {species.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      No detections for this camera yet.
                    </p>
                  ) : (
                    <ul className="chip-list">
                      {species.map((row) => (
                        <li key={row.species}>
                          {row.species} × {row.count}
                          <span className="muted" title="Highest danger score (0-100) seen for this animal">
                            {' '}· peak danger {row.worstDangerScore}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="stack" id="threat-alerts">
        <h2>
          Threat alerts <span className="muted">· {regionLabel(farm.region)}</span>
        </h2>
        {recent.length === 0 ? (
          <p className="muted">Nothing logged in {regionLabel(farm.region)} yet — the board is calm.</p>
        ) : (
          <div className="scroll-area scroll-area--log" tabIndex={0}>
            <ul className="feed">
              {recent.map((row) => (
                <CaptureRow
                  key={row.id}
                  preview={{
                    captureId: row.imageKey ? row.id : null,
                    species: row.species,
                    animalScore: row.animalScore,
                    dangerType: row.dangerType,
                    capturedAt: row.capturedAt,
                    capturedLabel: farmTime(row.capturedAt),
                  }}
                >
                  <span className={badgeClass(row.dangerType)}>{row.dangerType}</span>
                  <strong>{row.species}</strong>
                  <span className="muted">Animal Score {row.animalScore}%</span>
                  {row.source === 'manual' ? (
                    <span className="muted">Manual check{row.region ? ` · ${regionLabel(row.region)}` : ''}</span>
                  ) : (
                    <span className="muted">
                      {row.cameraName ?? 'Camera'} · {zoneLabel(row.zoneKind ?? 'gate')}
                    </span>
                  )}
                  <time className="muted" dateTime={row.capturedAt} style={{ marginLeft: 'auto' }}>
                    {farmTime(row.capturedAt)}
                  </time>
                </CaptureRow>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="stack" id="ring-docs">
        <h2>
          Ring docs <span className="muted">· live via the Ring Appstore Knowledge MCP</span>
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Searches against Ring&apos;s own documentation through the Ring MCP gateway
          (<code>mcp.json</code>, tools <code>search_docs</code> + <code>get_doc</code>). Every answer
          comes from Ring&apos;s servers at request time — nothing is cached or hand-written. Handy while
          setting up cameras, webhook intake or the linking flow.
        </p>
        <RingDocs />
      </section>
    </main>
  );
}
