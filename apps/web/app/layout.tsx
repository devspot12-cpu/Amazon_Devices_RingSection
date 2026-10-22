import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DEFAULT_REGION, regionById, regionTimeZone } from '@predator-guard/rules';

import { getDb } from '@/lib/db';
import { emergencyContactsFromEnv } from '@/lib/emergency-contacts';
import { getFarm } from '@/lib/farm';
import { siteUrl } from '@/lib/site';

import { CritterCatch } from './critter-catch';
import { EmergencyContacts } from './emergency-contacts';
import { NearestEmergency } from './nearest-emergency';
import { RegionClock } from './region-clock';

import './globals.css';
import './sidebar.css';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Feed your own video or snapshot, let the AI name the animal, and get an Animal Score and Danger Type saved to per-camera history.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'Predator Guard', template: '%s · Predator Guard' },
  description: DESCRIPTION,
  // Points AI tools and agents at the Markdown site map and the API spec.
  alternates: { types: { 'text/plain': '/llms.txt', 'application/openapi+json': '/openapi.json' } },
  openGraph: { title: 'Predator Guard', description: DESCRIPTION, type: 'website', siteName: 'Predator Guard' },
};

// schema.org description of the app, read by search engines and AI agents.
const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Predator Guard',
  url: siteUrl(),
  description: DESCRIPTION,
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  let region: string = DEFAULT_REGION;
  try {
    const db = await getDb();
    const farm = await getFarm(db);
    if (farm) region = farm.region;
  } catch {
    // Fall through to the default region.
  }

  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
        <div className="page">
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark"><ShieldIcon /></span>
              <span className="brand-text"><strong>Predator Guard</strong><small>AI farm watch</small></span>
            </Link>
            <nav className="topnav" aria-label="Primary">
              <Link href="/">Dashboard</Link>
              <Link href="/video">Camera check</Link>
            </nav>
            <div className="live-cluster">
              <span className="live">LIVE</span>
              <RegionClock timeZone={regionTimeZone(region)} regionLabel={regionById(region)?.label ?? 'Farm'} />
            </div>
          </header>
          <div className="shell">
            <aside className="sidebar" aria-label="Emergency tools">
              <CritterCatch />
              <EmergencyContacts contacts={emergencyContactsFromEnv()} />
              <NearestEmergency />
            </aside>
            <div className="content">{children}</div>
          </div>
          <footer className="footer">
            <span><strong>Predator Guard</strong> — bring-your-own-footage demo. Only the captured frame leaves your browser.</span>
            <span>Animal ID is an estimate — always check the frame before acting.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
