import Link from 'next/link';

import { getFarm, ensureFarm, listFarmWatchlist } from '@/lib/farm';
import { listCameras } from '@/lib/cameras';
import { getDb } from '@/lib/db';
import { listRecentDetections, speciesSummaryByCamera } from '@/lib/history';
import { zoneLabel } from '@/lib/zones';
import { regionLabel, REGIONS, DEFAULT_REGION, regionWatchlist as ruleWatchlist } from '@predator-guard/rules';

import { CameraManager, type CameraItem } from './camera-manager';
import { PredatorWatchlist } from './predator-watchlist';
import { RegionForm } from './region-form';

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

  const trackedSpecies = new Set(summary.map((row) => row.species)).size;
  const peakThreat = recent.reduce((max, row) => Math.max(max, row.dangerScore), 0);
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
            <Link className="cta" href="/check" style={{ background: 'linear-gradient(140deg,#38bdf8,#0ea5e9)' }}>
              Quick check (no camera) →
            </Link>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{cameras.length}</div>
            <div className="stat-label">Cameras</div>
          </div>
          <div className="stat">
            <div className="stat-value">{recent.length}</div>
            <div className="stat-label">Recent alerts</div>
          </div>
          <div className="stat">
            <div className="stat-value">{trackedSpecies}</div>
            <div className="stat-label">Species tracked</div>
          </div>
          <div className="stat">
            <div className={`stat-value${peakThreat >= 60 ? ' is-alert' : ''}`}>
              {peakThreat > 0 ? peakThreat : '—'}
            </div>
            <div className="stat-label">Peak threat</div>
          </div>
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
          region={farm.region ?? DEFAULT_REGION}
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

      <section className="stack">
        <h2>
          Cameras <span className="muted">· {regionLabel(farm.region)}</span>
        </h2>
        <CameraManager cameras={cameras} />
      </section>

      <section className="stack">
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
                          <span className="muted"> · max {row.worstDangerScore}</span>
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

      <section className="stack">
        <h2>
          Threat log <span className="muted">· {regionLabel(farm.region)}</span>
        </h2>
        {recent.length === 0 ? (
          <p className="muted">Nothing logged in {regionLabel(farm.region)} yet — the board is calm.</p>
        ) : (
          <div className="scroll-area scroll-area--log" tabIndex={0}>
            <ul className="feed">
              {recent.map((row) => (
                <li key={row.id}>
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
                    {new Date(row.capturedAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
