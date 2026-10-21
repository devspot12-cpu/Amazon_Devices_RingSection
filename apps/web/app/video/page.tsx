import type { Metadata } from 'next';
import Link from 'next/link';

import { VideoView } from './video-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Camera check',
  description:
    'Load a video or snapshot, pick the camera it belongs to, and get the Animal Score and Danger Type for the captured frame.',
};

export default function VideoPage() {
  return (
    <main className="stack">
      <header className="hero stack">
        <div className="hero-copy">
          <span className="eyebrow">Live frame analysis</span>
          <h1>Camera check</h1>
          <p>
            Load one of your own videos or a snapshot, pick the camera it belongs to, and the frame
            is sent to the AI model. The answer lands on screen — <strong>Animal Score</strong> and{' '}
            <strong>Danger Type</strong> — and is saved to the Postgres history for that camera in
            parallel.
          </p>
        </div>
        <div className="row">
          <Link className="cta cta--sky" href="/check">
            Go to Quick check (no camera) →
          </Link>
        </div>
      </header>
      <VideoView />
      <p>
        <Link href="/">Dashboard &amp; history</Link> · <Link href="/check">Quick check</Link>
      </p>
    </main>
  );
}
