'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { bestAnimal, formatTimeframe } from '@/lib/animal-filter';
import { thumbnailFromCanvas } from '@/lib/thumbnail';
import { regionLabel } from '@predator-guard/rules';

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

/** The reply of POST /api/analyze (no camera). */
interface ManualResult {
  source: 'camera' | 'manual';
  camera: null;
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

function frameFromImageFile(file: File): Promise<{ dataUrl: string; thumbnail: string | null }> {
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
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        thumbnail: thumbnailFromCanvas(canvas),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" as an image.`));
    };
    image.src = url;
  });
}

export function QuickCheckView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const busyRef = useRef(false);

  const [region, setRegion] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [watching, setWatching] = useState(false);
  const [status, setStatus] = useState('Ready — upload a photo or video to check any animal.');
  const [frame, setFrame] = useState<string | null>(null);
  const [result, setResult] = useState<ManualResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<number | null>(null);
  const [localDetector, setLocalDetector] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/farm');
        const body = (await response.json().catch(() => null)) as { farm?: { region: string | null } } | null;
        if (cancelled) return;
        setRegion(body?.farm?.region ?? null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const analyze = useCallback(
    async (dataUrl: string, thumbnail: string | null, capturedSeconds: number | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setFrame(dataUrl);
      setResult(null);
      setFailure(null);
      setTimeframe(capturedSeconds);
      setStatus('Identifying the animal with the AI model...');
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            thumbnailBase64: thumbnail ?? undefined,
            timeframeSeconds: capturedSeconds ?? undefined,
          }),
        });
        const body = (await response.json().catch(() => null)) as (ManualResult & ErrorBody) | null;
        if (!response.ok) {
          const message = body?.detail ?? body?.error ?? `Identification failed (HTTP ${response.status}).`;
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
        setStatus('Saved to history as a manual check.');
      } catch {
        setFailure('Could not reach the server to identify the frame.');
        setStatus('Identification failed - see below.');
      } finally {
        busyRef.current = false;
      }
    },
    [],
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
    const thumbnail = thumbnailFromCanvas(canvas);
    video.pause();
    setWatching(false);
    await analyze(dataUrl, thumbnail, video.currentTime);
    return true;
  }, [analyze]);

  const watch = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setWatching(true);
    setStatus('Loading the local animal detector (first time can take a few seconds)...');
    let model: CocoModel;
    try {
      model = await loadDetector();
    } catch {
      setWatching(false);
      setStatus('Could not load the animal detector. Check your connection, or use "Identify current frame".');
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
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
    }
    setWatching(false);
  }, [videoUrl, captureCurrentFrame]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalDetector(null);
    setFrame(null);
    setResult(null);
    setFailure(null);
    setVideoUrl(URL.createObjectURL(file));
    setStatus(`Loaded "${file.name}" — press play, then "Watch for animal".`);
  }

  async function onSnapshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalDetector(null);
    setStatus('Reading the snapshot...');
    try {
      const { dataUrl, thumbnail } = await frameFromImageFile(file);
      await analyze(dataUrl, thumbnail, null);
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
    setStatus('Ready — upload a photo or video to check any animal.');
  }

  return (
    <section className="stack">
      <div className="row">
        <label className="field">
          Video file
          <input type="file" accept="video/*" onChange={onFileChange} />
        </label>
        <label className="field">
          Photo to check
          <input type="file" accept="image/*" onChange={onSnapshotChange} />
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
        <button type="button" onClick={() => void watch()} disabled={!videoUrl || watching}>
          {watching ? 'Watching...' : 'Watch for animal'}
        </button>
        <button type="button" onClick={() => void captureCurrentFrame()} disabled={!videoUrl}>
          Identify current frame
        </button>
        {frame ? (
          <button type="button" onClick={reset}>
            Clear result &amp; check again
          </button>
        ) : null}
        <Link href="/">Dashboard</Link>
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
            <p className="muted">Captured from an uploaded photo.</p>
          )}
          {localDetector ? (
            <p className="muted">Local detector spotted: {localDetector}.</p>
          ) : null}
          {region ? (
            <p className="muted">Region profile: {regionLabel(region)}</p>
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
                <span className="muted">Manual quick check</span>
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
        Quick check needs no camera. Only the single captured frame is sent to the server for
        identification. The animal name is an estimate — always check the frame before acting.
      </p>
    </section>
  );
}
