import Link from 'next/link';

import { QuickCheckView } from './quick-check-view';

export const dynamic = 'force-dynamic';

export default function QuickCheckPage() {
  return (
    <main className="stack">
      <header className="hero stack">
        <div className="hero-copy">
          <span className="eyebrow">Manual upload</span>
          <h1>Quick check</h1>
          <p>
            Upload a photo or video <strong>without picking a camera</strong>. The AI will name the
            animal, give an <strong>Animal Score</strong> and <strong>Danger Type</strong>, and save
            the result to history tagged as <strong>Manual</strong> (using your farm&apos;s region
            profile to tune the danger rules).
          </p>
        </div>
        <Link className="cta" href="/">
          ← Back to dashboard
        </Link>
      </header>
      <QuickCheckView />
      <p>
        <Link href="/">Dashboard</Link> · <Link href="/video">Camera check</Link>
      </p>
    </main>
  );
}
