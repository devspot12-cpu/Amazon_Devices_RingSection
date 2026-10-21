'use client';

import { useState } from 'react';

/**
 * Predator watchlist for the selected farm region, with a one-click
 * "all regions" comparison so the local-danger tuning can be checked against
 * the rest of the US. The region rows come from Postgres (seeded from the
 * rules tables); the comparison groups come from the same rules tables.
 */

export interface WatchlistEntry {
  species: string;
  label: string;
  threat: string;
}

export interface WatchlistGroup {
  id: string;
  label: string;
  states: string;
  entries: WatchlistEntry[];
}

function Chips({ entries }: { entries: WatchlistEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted">No predators profiled for this region.</p>;
  }
  return (
    <ul className="chip-list">
      {entries.map((entry) => (
        <li key={entry.species}>
          {entry.label} <span className="muted">· {entry.threat}</span>
        </li>
      ))}
    </ul>
  );
}

export function PredatorWatchlist({
  region,
  regionLabel,
  entries,
  allRegions,
}: {
  region: string;
  regionLabel: string;
  entries: WatchlistEntry[];
  allRegions: WatchlistGroup[];
}) {
  const [scope, setScope] = useState<'region' | 'all'>('region');

  return (
    <div className="card stack-sm">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {scope === 'region'
            ? `Predator watchlist for ${regionLabel}`
            : 'Predator watchlist — all regions'}
        </strong>
        <div className="tabs" role="group" aria-label="Watchlist scope">
          <button
            type="button"
            className="tab"
            aria-pressed={scope === 'region'}
            onClick={() => setScope('region')}
          >
            This region
          </button>
          <button
            type="button"
            className="tab"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All regions
          </button>
        </div>
      </div>

      {scope === 'region' ? (
        <Chips entries={entries} />
      ) : (
        <div className="region-list">
          {allRegions.map((group) => (
            <div key={group.id} className="stack-sm">
              <div className="row" style={{ gap: '0.5rem' }}>
                <strong>{group.label}</strong>
                {group.id === region ? <span className="badge badge-monitor">Current</span> : null}
                <span className="muted">{group.states}</span>
              </div>
              <Chips entries={group.entries} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
