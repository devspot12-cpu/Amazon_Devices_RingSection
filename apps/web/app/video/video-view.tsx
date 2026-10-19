'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { bestAnimal, formatTimeframe } from '@/lib/animal-filter';
import { zoneLabel } from '@/lib/zones';

/** Predictions as returned by @tensorflow-models/coco-ssd (kept structural to avoid a type-only import). */
interface CocoPrediction {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface CocoModel {
  detect(input: HTMLVideoElement): Promise<CocoPrediction[]>;
}

interface DetectorModule {
  load(): Promise<CocoModel>;
}

interface CameraOption {
  id: string;
  name: string;
  zoneKind: string;
}

/** The reply of POST /api/analyze. */
interface AnalysisResult {
  source: 'camera' | 'manual';
  camera: { id: string; name: string; zoneKind: string } | null;
  farm?: { region: string | null };
  animal: {
    species: string;
    score: number;
    model: string;
    peopleOnly: boolean;
    status: string;
    reason?: string;
  };
  danger: { type: string; severity: string; score: number };
  detectionId: string;
  capturedAt: string;
  timeframeSeconds: number;
}

interface ErrorBody {
  error?: string;
  detail?: string;
}

const SAMPLE_MS = 700;
const ANIMAL_THRESHOLD = 0.6;
const BADGE_KINDS = ['critical', 'danger', 'warning', 'monitor', 'none'];

declare global {
  interface Window {
    tf?: unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/** Lazy-load TF.js + COCO-SSD from CDN - browser only, no npm deps added. */
async function loadDetector(): Promise<CocoModel> {
  const globalWindow = window as unknown as { cocoSsd?: DetectorModule; tf?: unknown };
  if (!globalWindow.cocoSsd) {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
  }
  const cocoSsd = (window as unknown as { cocoSsd?: DetectorModule }).cocoSsd;
  if (!cocoSsd) throw new Error('COCO-SSD failed to load');
  return cocoSsd.load();
}

function badgeClass(dangerType: string): string {
  const slug = dangerType.toLowerCase();
  return BADGE_KINDS.includes(slug) ? `badge badge-${slug}` : 'badge';
}

/**
 * Read any image file the user picks (even a 12 MP phone snapshot) into a
 * JPEG data URL, downscaled to at most 1600 px so the analyze request stays
 * well under the server's size cap.
 */
function frameFromImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas unavailable in this browser.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" as an image.`));
    };
    image.src = url;
  });
}

export function VideoView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);

  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [watching, setWatching] = useState(false);
  const [status, setStatus] = useState('Loading cameras...');
  const [frame, setFrame] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<number | null>(null);
  const [localDetector, setLocalDetector] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/cameras');
        const body = (await response.json().catch(() => null)) as { cameras?: CameraOption[] } | null;
        if (cancelled) return;
        const list = Array.isArray(body?.cameras) ? body.cameras! : [];
        setCameras(list);
        if (list.length > 0) {
          setCameraId(list[0]!.id);
          setStatus('Choose a video file or a snapshot to start.');
        } else {
          setStatus('No cameras yet - add one on the dashboard first.');
        }
      } catch {
        if (!cancelled) setStatus('Could not load cameras - is the server running?');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  /** One frame -> /api/analyze -> verdict + danger + saved history row. */
  const analyze = useCallback(
    async (dataUrl: string, capturedSeconds: number | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setFrame(dataUrl);
      setResult(null);
      setFailure(null);
      setTimeframe(capturedSeconds);
      setStatus('Frame captured - identifying the animal with the AI model...');
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            cameraId,
            timeframeSeconds: capturedSeconds ?? undefined,
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | (AnalysisResult & ErrorBody)
          | null;
        if (!response.ok) {
          const message =
            body?.detail ??
            body?.error ??
            `Identification failed (HTTP ${response.status}).`;
          setFailure(message);
          setStatus('Identification failed - see below.');
          return;
        }
        if (!body?.animal || !body.danger) {
          setFailure('The server returned an unexpected reply.');
          setStatus('Identification failed - see below.');
          return;
        }
        setResult(body);
        setStatus(`Saved to history${body.camera ? ` for ${body.camera.name}` : ''} - see the dashboard.`);
      } catch {
        setFailure('Could not reach the server to identify the frame.');
        setStatus('Identification failed - see below.');
      } finally {
        busyRef.current = false;
      }
    },
    [cameraId],
  );

  const captureCurrentFrame = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return false;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    video.pause();
    setWatching(false);
    await analyze(dataUrl, video.currentTime);
    return true;
  }, [analyze]);

  const watch = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (!cameraId) {
      setStatus('Choose a camera first - add one on the dashboard.');
      return;
    }
    setWatching(true);
    setStatus('Loading the local animal detector (first time can take a few seconds)...');
    let model: CocoModel;
    try {
      model = await loadDetector();
    } catch {
      setWatching(false);
      setStatus(
        'Could not load the animal detector. Check your connection, or use "Identify current frame" while the video plays.',
      );
      return;
    }
    setStatus('Watching the video - the first animal frame will be captured automatically...');
    void video.play().catch(() => undefined);
    let captured = false;
    while (!video.paused && !video.ended && !captured) {
      try {
        const predictions = await model.detect(video);
        const hit = bestAnimal(predictions, ANIMAL_THRESHOLD);
        if (hit) {
          captured = true;
          setLocalDetector(`${hit.label} (about ${Math.round(hit.score * 100)}% sure)`);
          await captureCurrentFrame();
          break;
        }
      } catch {
        // One bad frame must not stop watching.
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
    }
    setWatching(false);
  }, [videoUrl, cameraId, captureCurrentFrame]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalDetector(null);
    setFrame(null);
    setResult(null);
    setFailure(null);
    setVideoUrl(URL.createObjectURL(file));
    setStatus(`Loaded "${file.name}" - press play, then "Watch for animal".`);
  }

  async function onSnapshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!cameraId) {
      setStatus('Choose a camera first - add one on the dashboard.');
      return;
    }
    setLocalDetector(null);
    setStatus('Reading the snapshot...');
    try {
      const dataUrl = await frameFromImageFile(file);
      await analyze(dataUrl, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFailure(message);
      setStatus('Could not read that file.');
    }
  }

  function reset() {
    setLocalDetector(null);
    setFrame(null);
    setResult(null);
    setFailure(null);
    setStatus('Ready - press play, then "Watch for animal", or feed a snapshot.');
  }

  return (
    <section className="stack">
      <div className="row">
        <label className="field">
          Camera
          <select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
            {cameras.length === 0 ? <option value="">No cameras yet</option> : null}
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name} ({zoneLabel(camera.zoneKind)})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Video file
          <input type="file" accept="video/*" onChange={onFileChange} />
        </label>
        <label className="field">
          Snapshot (instead of a video)
          <input type="file" accept="image/*" onChange={onSnapshotChange} disabled={!cameraId} />
        </label>
      </div>

      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          muted
          playsInline
          style={{ width: '100%', maxWidth: 720, display: 'block', background: '#000' }}
        />
      ) : null}

      <div className="row">
        <button type="button" onClick={() => void watch()} disabled={!videoUrl || watching || !cameraId}>
          {watching ? 'Watching...' : 'Watch for animal'}
        </button>
        <button
          type="button"
          onClick={() => void captureCurrentFrame()}
          disabled={!videoUrl || !cameraId}
        >
          Identify current frame
        </button>
        {frame ? (
          <button type="button" onClick={reset}>
            Clear result &amp; watch again
          </button>
        ) : null}
        <Link href="/">Manage cameras</Link>
      </div>

      <p className="status" role="status" aria-live="polite">
        {status}
      </p>

      {frame ? (
        <section className="card stack">
          <h2>Analysed frame</h2>
          <img
            src={frame}
            alt="Frame sent for animal identification"
            style={{ width: '100%', maxWidth: 720, display: 'block', borderRadius: '0.4rem' }}
          />
          {timeframe !== null ? (
            <p className="muted">Captured at {formatTimeframe(timeframe)} ({timeframe.toFixed(2)}s).</p>
          ) : (
            <p className="muted">Captured from an uploaded snapshot.</p>
          )}
          {localDetector ? (
            <p className="muted">Local detector spotted: {localDetector}.</p>
          ) : null}
          {failure ? (
            <p className="failure" role="alert">
              {failure}
            </p>
          ) : null}
          {result ? (
            <>
              <div className="row">
                <span className={badgeClass(result.danger.type)}>{result.danger.type}</span>
                <strong>
                  {result.animal.peopleOnly ? 'People only - no animal' : result.animal.species}
                </strong>
                <span className="muted">
                  {result.source === 'camera' && result.camera
                    ? `on ${result.camera.name} (${zoneLabel(result.camera.zoneKind)})`
                    : 'Manual quick check'}
                </span>
              </div>
              <div className="result-grid">
                <div className="stack-sm">
                  <span className="label">Animal Score</span>
                  <span className="big-score">{result.animal.score}%</span>
                  <span className="score-bar">
                    <span style={{ width: `${result.animal.score}%` }} />
                  </span>
                  <span className="muted">
                    {result.animal.model} · {result.animal.status}
                    {result.animal.reason ? ` · ${result.animal.reason}` : ''}
                  </span>
                </div>
                <div className="stack-sm">
                  <span className="label">Danger Type</span>
                  <span className="big-score">{result.danger.type}</span>
                  <span className="score-bar">
                    <span style={{ width: `${result.danger.score}%` }} />
                  </span>
                  <span className="muted">
                    danger score {result.danger.score} · rules say {result.danger.severity}
                  </span>
                </div>
              </div>
              <p className="muted">
                Saved to history at {new Date(result.capturedAt).toLocaleString()} -{' '}
                <Link href="/">open the dashboard</Link> to see the full history.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <p className="muted">
        The video never leaves your browser - only the single captured frame is sent to the server
        for identification. The animal name is an estimate - always check the frame before acting.
      </p>
    </section>
  );
}
