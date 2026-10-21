import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DEFAULT_REGION, regionById, regionTimeZone } from '@predator-guard/rules';

import { getDb } from '@/lib/db';
import { getFarm } from '@/lib/farm';

import { RegionClock } from './region-clock';

import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Predator Guard',
  description:
    'Feed your own video or snapshot, let the AI name the animal, and get an Animal Score and Danger Type saved to per-camera history.',
};

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The clock follows the farm region the user saved in preferences. If the
  // profile cannot be read, keep the shell (and the clock) usable anyway.
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
        <div className="page">
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark">
                <ShieldIcon />
              </span>
              <span className="brand-text">
                <strong>Predator Guard</strong>
                <small>AI farm watch</small>
              </span>
            </Link>
            <nav className="topnav" aria-label="Primary">
              <Link href="/">Dashboard</Link>
              <Link href="/video">Camera check</Link>
              <Link href="/check">Quick check</Link>
            </nav>
            <div className="live-cluster">
              <span className="live">LIVE</span>
              <RegionClock
                timeZone={regionTimeZone(region)}
                regionLabel={regionById(region)?.label ?? 'Farm'}
              />
            </div>
          </header>
          {children}
          <footer className="footer">
            <span>
              <strong>Predator Guard</strong> — bring-your-own-footage demo. Only the captured frame
              leaves your browser.
            </span>
            <span>Animal ID is an estimate — always check the frame before acting.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
