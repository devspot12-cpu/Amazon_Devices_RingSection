import Link from 'next/link';

import { isFreshLinkTime } from '@predator-guard/ring';

import { LinkForm } from './link-form';

/**
 * The Account Link URL (F1 criterion 1).
 *
 * Ring redirects the user's browser here with `nonce` + `time`. This page
 * renders a **sign-in form and nothing else** - opening it never verifies or
 * claims anything; only submitting the form POSTs to `/api/ring/link`.
 * Freshness is checked here for a readable error and again on the POST, which
 * is the check that counts (criterion 2).
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RingLinkPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nonce = typeof params.nonce === 'string' ? params.nonce : '';
  const timeParam = typeof params.time === 'string' ? params.time : '';
  const timeMs = Number(timeParam);

  if (!nonce || !timeParam || !Number.isFinite(timeMs)) {
    return (
      <main>
        <h1>Link your Ring account</h1>
        <p role="alert">
          This link is missing its <code>nonce</code> or <code>time</code> parameter. Start the
          linking flow again from the Ring app.
        </p>
      </main>
    );
  }

  if (!isFreshLinkTime(timeMs)) {
    return (
      <main>
        <h1>Link your Ring account</h1>
        <p role="alert">
          This link has expired - links are valid for 10 minutes. Start the linking flow again from
          the Ring app.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Link your Ring account</h1>
      <p>
        Sign in to Predator Guard to finish connecting your cameras. The Ring authorization that
        brought you here is matched to your account only when you submit this form.
      </p>
      <LinkForm nonce={nonce} time={timeParam} />
      <p>
        <Link href="/">Back to the dashboard</Link>
      </p>
    </main>
  );
}
