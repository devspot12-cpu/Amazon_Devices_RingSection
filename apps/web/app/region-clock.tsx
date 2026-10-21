'use client';

import { useEffect, useState } from 'react';

/**
 * Header clock: the current time in the farm region the user picked, in
 * hour:minutes. Formatting goes through `Intl.DateTimeFormat` with the
 * browser locale (`undefined`), so the user's 12/24-hour preference decides
 * whether an AM/PM marker appears - nothing is hard-coded here.
 */

interface RegionClockProps {
  timeZone: string;
  regionLabel: string;
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function RegionClock({ timeZone, regionLabel }: RegionClockProps) {
  // Start empty so server and client render the same markup; the first
  // effect tick fills in the time using the user's own locale preferences.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const label = now ? formatTime(now, timeZone) : '--:--';

  return (
    <time
      className="region-clock"
      dateTime={now?.toISOString()}
      title={`${regionLabel} local time (${timeZone})`}
      aria-label={`${regionLabel} local time: ${label}`}
    >
      <ClockIcon />
      <span>{label}</span>
    </time>
  );
}
