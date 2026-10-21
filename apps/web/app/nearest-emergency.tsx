'use client';

import { useState, type FormEvent } from 'react';

interface NearbyResult { name: string; phone: string | null; address: string; distanceKm: number; }
interface NearbyResponse { origin?: { label: string }; results?: NearbyResult[]; error?: string; }

/** UI half of nearest-emergency (backend: /api/emergency-nearby). Type an address or share browser geolocation. */
export function NearestEmergency() {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  const [results, setResults] = useState<NearbyResult[] | null>(null);

  async function lookup(query: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/emergency-nearby?${query}`);
      const body = (await response.json().catch(() => null)) as NearbyResponse | null;
      if (!response.ok) { setError(body?.error ?? `Lookup failed (HTTP ${response.status})`); setResults(null); return; }
      setOriginLabel(body?.origin?.label ?? null); setResults(body?.results ?? []);
    } catch { setError('Could not reach the server.'); } finally { setBusy(false); }
  }

  function byAddress(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const t = address.trim(); if (t.length >= 3 && !busy) void lookup(`address=${encodeURIComponent(t)}`); }

  function byLocation() {
    if (!navigator.geolocation) { setError('Geolocation is not available in this browser.'); return; }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition((pos) => void lookup(`lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`), () => { setBusy(false); setError('Location was not shared - type an address instead.'); }, { timeout: 10000 });
  }

  async function share(result: NearbyResult) {
    const text = `Predator alert from Predator Guard - nearest police: ${result.name}${result.phone ? `, ${result.phone}` : ''} (${result.distanceKm} km away). ${result.address}`;
    try { if (navigator.share) await navigator.share({ title: 'Predator alert', text }); else if (navigator.clipboard) await navigator.clipboard.writeText(text); } catch { /* dismissed */ }
  }

  return (
    <section className="sidebar-section" aria-labelledby="nearest-emergency-heading">
      <h2 id="nearest-emergency-heading" className="sidebar-heading">Nearest police</h2>
      <p className="muted sidebar-note">Type your address, or share your location, to get the closest police department. In immediate danger call <strong>911</strong> first.</p>
      <form className="stack-sm" onSubmit={byAddress}>
        <label className="field">Your address<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 1000 Villa Street, Mountain View, CA" maxLength={200} autoComplete="street-address" /></label>
        <span className="emergency-actions"><button type="submit" disabled={busy || address.trim().length < 3}>{busy ? 'Searching...' : 'Find nearest'}</button><button type="button" onClick={byLocation} disabled={busy}>Share my location</button></span>
      </form>
      {error ? <p className="failure" role="alert">{error}</p> : null}
      {results !== null ? (results.length === 0 ? <p className="muted">No police department found nearby in OpenStreetMap data.</p> : (<>{originLabel ? <p className="muted">Near: {originLabel}</p> : null}<ul className="emergency-list">{results.map((r) => (<li key={`${r.name}-${r.address}`} className="emergency-card"><strong>{r.name}</strong><span className="muted">{r.distanceKm} km away - {r.address}</span>{r.phone ? <span className="emergency-phone">{r.phone}</span> : <span className="muted">No public phone in OSM - call 911</span>}<span className="emergency-actions">{r.phone ? <a className="btn-call" href={`tel:${r.phone.replace(/[^+0-9]/g, '')}`}>Call</a> : <a className="btn-call" href="tel:911">Call 911</a>}<button type="button" onClick={() => void share(r)}>Share</button></span></li>))}</ul></>)) : null}
      <p className="muted sidebar-note">Data (c) OpenStreetMap contributors (ODbL).</p>
    </section>
  );
}
