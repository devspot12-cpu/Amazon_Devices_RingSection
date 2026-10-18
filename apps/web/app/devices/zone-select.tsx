'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ZONE_KINDS, type ZoneKind } from '@predator-guard/ring/types';

/**
 * Zone selector for one camera (F3 criterion 3). Saves on change via
 * `POST /api/devices/{id}/zone`; the server is the source of truth and the
 * page refreshes from it.
 */
export function ZoneSelect({
  ringDeviceId,
  current,
}: {
  ringDeviceId: string;
  current: ZoneKind | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(current ?? '');
  const [saving, setSaving] = useState(false);

  async function save(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(ringDeviceId)}/zone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ zoneKind: next === '' ? null : next }),
      });
      if (!response.ok) {
        setValue(previous);
        return;
      }
      router.refresh();
    } catch {
      setValue(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label>
      <span className="visually-hidden">Zone for {ringDeviceId}</span>
      <select value={value} disabled={saving} onChange={(event) => void save(event.target.value)}>
        <option value="">No zone</option>
        {ZONE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </select>
    </label>
  );
}
