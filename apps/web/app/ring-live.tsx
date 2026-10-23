'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { errorText } from '@/lib/error-text';

/**
 * Ring live - real devices from a pasted OAuth token, live video via WHEP,
 * and the auto hook: poll event history, and on every new motion event pull
 * the snapshot at that exact moment and push it through the classifier.
 * An animal -> snapshot saved to S3 + one history row. No animal -> the
 * result is logged and the snapshot is dropped, untouched.
 */

interface DeviceInfo {
  id: string;
  name: string;
  online: boolean | undefined;
}

interface StatusBody {
  configured?: boolean;
  detail?: string;
  user?: { email?: string };
  devices?: DeviceInfo[];
  error?: string;
}

interface EventInfo {
  eventId: string | undefined;
  startMs: number;
  eventType: string | undefined;
  thirdPartyReviewed: boolean | undefined;
}

interface HookBody {
  animalDetected?: boolean;
  snapshot?: 'saved' | 'discarded' | 'not_configured';
  mediaTimestampMs?: number;
  verdict?: { species: string; confidence: number; status: string; reason?: string; peopleOnly?: boolean };
  danger?: { dangerType: string; severity: string; dangerScore: number };
  detectionId?: string;
  error?: string;
  detail?: string;
}

interface LogEntry {
  at: string;
  event: string;
  outcome: string;
  animal: string | undefined;
}

const HOOK_EVENT_SKIP = new Set(['on_demand']);
const HOOK_POLL_MS = 12_000;

/** Grab the frame that is on screen right now from the live WHEP video. */
function grabLiveFrame(video: HTMLVideoElement | null): { dataUrl: string; png: Promise<Blob | null> } | null {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    png: new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
  };
}

/** Clipboard only accepts image/png everywhere, so convert anything else first. */
function toPngBlob(blob: Blob): Promise<Blob | null> {
  if (blob.type === 'image/png') return Promise.resolve(blob);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * Clipboard writes are best-effort: browsers gate them on secure context +
 * focus + the click gesture. Calling this with the still-pending blob (instead
 * of awaiting the blob first) keeps the gesture alive - the browser resolves
 * the ClipboardItem promise itself.
 */
async function copyImageToClipboard(blob: Blob | Promise<Blob | null>): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    const png = Promise.resolve(blob)
      .then((value) => (value ? toPngBlob(value) : null))
      .then((value) => {
        if (!value) throw new Error('No image to copy.');
        return value;
      });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

export function RingLive() {
  const [status, setStatus] = useState<StatusBody | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('-');
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'playing'>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busyCapture, setBusyCapture] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<string | null>(null);
  const deviceRef = useRef<DeviceInfo | null>(null);
  const knownEventsRef = useRef<Set<string>>(new Set());
  const firstPollRef = useRef(true);

  // --- status + device list -------------------------------------------------
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/ring-live');
        const body = (await response.json().catch(() => null)) as StatusBody | null;
        if (!alive) return;
        if (!response.ok) {
          setStatusError(errorText(body, response.status, 'The live status check failed'));
          return;
        }
        setStatus(body);
        const first = body?.devices?.[0];
        deviceRef.current = first ?? null;
        setDeviceId(first?.id ?? '-');
      } catch {
        if (alive) setStatusError('The live view could not reach the server.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- WHEP live view -------------------------------------------------------
  const stopLive = useCallback(async () => {
    setLiveState('idle');
    setLiveError(null);
    const pc = pcRef.current;
    pcRef.current = null;
    const sessionId = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    pc?.close();
    if (sessionId && deviceRef.current) {
      void fetch(
        `/api/ring-live/whep?deviceId=${encodeURIComponent(deviceRef.current.id)}&session=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
      ).catch(() => false);
    }
  }, []);

  const startLive = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return;
    setLiveError(null);
    setLiveState('connecting');
    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (event) => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        setLiveState('playing');
        setPreviewUrl(null);
        setPreviewNote(null);
      };
      await pc.setLocalDescription(await pc.createOffer());
      // Non-trickle: Ring receives every candidate in the offer itself.
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') resolve();
        });
        // Gathering usually completes in a few hundred ms; stop waiting after 3s.
        setTimeout(resolve, 3000);
      });
      const response = await fetch(`/api/ring-live/whep?deviceId=${encodeURIComponent(device.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/sdp' },
        body: pc.localDescription?.sdp ?? '',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as HookBody | null;
        setLiveError(errorText(body, response.status, 'The live view could not start'));
        setLiveState('idle');
        pc.close();
        pcRef.current = null;
        return;
      }
      sessionRef.current = response.headers.get('X-WHEP-Session');
      setSession(sessionRef.current);
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      // 'playing' is set by ontrack; a few seconds without video is normal.
      setTimeout(() => {
        if (pcRef.current === pc && liveStateRef.current === 'connecting') {
          setLiveError('The session was accepted, but no video has arrived yet. Check the camera or start a motion test.');
        }
      }, 6000);
    } catch {
      setLiveError('Could not establish the live session.');
      setLiveState('idle');
    }
  }, []);

  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;

  // --- preview + hook -------------------------------------------------------
  /**
   * "Check now" grabs the frame the farmer is looking at: inside a live WHEP
   * session that is a canvas copy of the playing video, otherwise the newest
   * snapshot from Ring. Either way the picture is copied to the clipboard so
   * Camera check can take it with Ctrl+V (or a drag of this preview).
   */
  const checkNow = useCallback(async () => {
    const device = deviceRef.current;
    if (!device || previewBusy) return;
    setPreviewBusy(true);
    setPreviewNote(null);
    try {
      const live = grabLiveFrame(videoRef.current);
      // Start the clipboard write in the click itself, before any await, or
      // browsers drop the user gesture and refuse the write.
      const copiedTask = live ? copyImageToClipboard(live.png) : null;

      let dataUrl = live?.dataUrl ?? null;
      if (!dataUrl) {
        const response = await fetch(`/api/ring-live/snapshot?deviceId=${encodeURIComponent(device.id)}`);
        const body = (await response.json().catch(() => null)) as { imageBase64?: string; error?: string; detail?: string };
        if (!response.ok || !body?.imageBase64) {
          setPreviewNote(errorText(body, response.status, 'The snapshot could not be taken'));
          return;
        }
        dataUrl = `data:image/jpeg;base64,${body.imageBase64}`;
      }

      setPreviewUrl(dataUrl);
      const copied = await (copiedTask ?? copyImageToClipboard((await fetch(dataUrl)).blob()));
      setPreviewNote(
        copied
          ? 'Snapshot copied — open Camera check and press Ctrl+V, or drag this preview onto its snapshot box.'
          : 'Snapshot ready — drag this preview onto Camera check, or save it with the snapshot picker.',
      );
    } catch {
      setPreviewNote('Snapshot request failed.');
    } finally {
      setPreviewBusy(false);
    }
  }, [previewBusy]);

  function onPreviewDragStart(event: DragEvent<HTMLImageElement>) {
    if (!previewUrl) return;
    event.dataTransfer.setData('text/plain', previewUrl);
    event.dataTransfer.effectAllowed = 'copy';
  }

  const runHook = useCallback(async (timestampMs: number | undefined, type: string) => {
    const device = deviceRef.current;
    if (!device || busyCapture) return;
    setBusyCapture(true);
    const at = new Date().toLocaleTimeString();
    try {
      const response = await fetch('/api/ring-live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, cameraName: device.name, timestampMs }),
      });
      const body = (await response.json().catch(() => null)) as HookBody | null;
      if (!response.ok || !body) {
        setLog((rows) => [
          {
            at,
            event: type,
            outcome: errorText(body, response.status, 'The motion check failed'),
            animal: undefined,
          },
          ...rows,
        ]);
        return;
      }
      if (body.animalDetected) {
        setLog((rows) => [
          {
            at,
            event: type,
            animal: `${body.verdict?.species} (${body.verdict?.confidence}%)`,
            outcome: `Snapshot saved to the bucket · ${body.danger?.dangerType ?? 'no danger'} · check #${body.detectionId?.slice(0, 8) ?? ''}`,
          },
          ...rows,
        ]);
      } else {
        setLog((rows) => [
          {
            at,
            event: type,
            animal: body.verdict?.species ?? undefined,
            outcome: `No animal → snapshot dropped (${body.verdict ? body.verdict.species : 'classifier said nothing'})`,
          },
          ...rows,
        ]);
      }
    } catch {
      setLog((rows) => [{ at, event: type, outcome: 'Hook request failed.', animal: undefined }, ...rows]);
    } finally {
      setBusyCapture(false);
    }
  }, [busyCapture]);

  // The hook loop: poll the device's real event history and react to every
  // motion-shaped event we have not seen before.
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    const tick = async () => {
      const device = deviceRef.current;
      if (!device) return;
      try {
        const response = await fetch(`/api/ring-live/events?deviceId=${encodeURIComponent(device.id)}`);
        if (!alive || !response.ok) return;
        const body = (await response.json().catch(() => null)) as { events?: EventInfo[] } | null;
        const events = body?.events ?? [];
        const motion = events.filter((event) => !HOOK_EVENT_SKIP.has(event.eventType ?? ''));
        if (firstPollRef.current) {
          // The first pass just baseline; replaying a whole page of old
          // history on toggle-on would spam the log.
          firstPollRef.current = false;
          return;
        }
        for (const event of motion.slice(0, 3)) {
          const key = event.eventId ?? `${event.startMs}`;
          if (knownEventsRef.current.has(key)) continue;
          knownEventsRef.current.add(key);
          void runHook(event.startMs, event.eventType ?? 'motion');
        }
      } catch {
        // transient - the next tick retries
      }
    };
    firstPollRef.current = true;
    knownEventsRef.current = new Set();
    void tick();
    const timer = setInterval(() => void tick(), HOOK_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [watching, runHook]);

  // --- render ---------------------------------------------------------------
  if (statusError) {
    return (
      <p className="failure" role="alert">
        {statusError}
      </p>
    );
  }
  if (!status) {
    return <p className="muted">Checking live camera access…</p>;
  }
  if (!status.configured) {
    return (
      <div className="card stack-sm">
        <strong>Live cameras are not connected on this deployment</strong>
        <p className="muted" style={{ margin: 0 }}>
          {status.detail}
        </p>
      </div>
    );
  }
  const devices = status.devices ?? [];
  if (devices.length === 0) {
    return (
      <div className="card stack-sm">
        <strong>Ring is connected, but no cameras are linked to this account yet.</strong>
        <p className="muted" style={{ margin: 0 }}>
          Add a camera in the Ring app, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <div className="row" style={{ alignItems: 'flex-end', gap: '0.75rem' }}>
        <label className="field" style={{ maxWidth: '320px' }}>
          Device
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} {device.online === undefined ? '' : device.online ? '· online' : '· offline'}
              </option>
            ))}
          </select>
        </label>
        {liveState === 'idle' ? (
          <button type="button" onClick={() => void startLive()}>
            Start live view
          </button>
        ) : (
          <button type="button" onClick={() => void stopLive()}>
            {liveState === 'connecting' ? 'Connecting…' : 'Stop live view'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void checkNow()}
          disabled={previewBusy}
          title="Grab the current live frame and copy it for Camera check"
        >
          {previewBusy ? 'Snapping…' : 'Check now (snapshot)'}
        </button>
        <button type="button" onClick={() => setWatching((on) => !on)} className={watching ? 'watching-on' : ''}>
          {watching ? 'Hook: ON — stop' : 'Hook: watch for motion'}
        </button>
      </div>

      {liveError ? <p className="failure" role="alert">{liveError}</p> : null}

      <div className="card stack-sm">
        {liveState === 'playing' || liveState === 'connecting' ? (
          <video
            ref={videoRef}
            className="ring-live-video"
            autoPlay
            playsInline
            muted
            style={{ width: '100%', maxHeight: '420px', background: '#000' }}
          />
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="Latest Ring snapshot"
            draggable
            onDragStart={onPreviewDragStart}
            title="Drag onto Camera check, or press Ctrl+V there"
            style={{
              width: '100%',
              maxHeight: '420px',
              objectFit: 'contain',
              background: '#000',
              cursor: 'grab',
            }}
          />
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Live video plays via WHEP; “Check now” grabs the current live frame and copies it for
            Camera check. Both need the device online.
          </p>
        )}
        {previewUrl && liveState !== 'idle' ? (
          <img
            src={previewUrl}
            alt="Snapshot taken from the live view"
            draggable
            onDragStart={onPreviewDragStart}
            title="Drag onto Camera check, or press Ctrl+V there"
            style={{
              width: '100%',
              maxHeight: '220px',
              objectFit: 'contain',
              background: '#000',
              borderRadius: '0.4rem',
              cursor: 'grab',
            }}
          />
        ) : null}
        {session ? <p className="muted" style={{ margin: 0 }}>WHEP session {session.slice(0, 12)}…</p> : null}
        {previewNote ? <p className="muted" style={{ margin: 0 }}>{previewNote}</p> : null}
      </div>

      <div className="scroll-area scroll-area--log" tabIndex={0} style={{ maxHeight: '260px' }}>
        {log.length === 0 ? (
          <p className="muted">Hook log — motion events land here once watching is on.</p>
        ) : (
          <ul className="feed">
            {log.map((entry, index) => (
              <li className="card" key={`${entry.at}-${index}`}>
                <strong style={{ width: '7.5rem' }}>{entry.event}</strong>
                <span className="muted">{entry.at}</span>
                <span style={{ marginLeft: 'auto' }}>{entry.outcome}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
