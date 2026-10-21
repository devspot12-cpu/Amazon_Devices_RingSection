'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

const EMOJIS = ['🦊', '🐗', '🐺', '🦝', '🐇'];
const SIZE = 52;
/** Keeps the critter at 25% of its original pace (well under 30%). */
const SPEED_SCALE = 0.70;

interface CritterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  dir: number;
  turnIn: number;
}

function bounds() {
  return { w: Math.max(1, window.innerWidth - SIZE), h: Math.max(1, window.innerHeight - SIZE) };
}

function runFromEdge(state: CritterState, edge: 'left' | 'right') {
  const { w, h } = bounds();
  state.x = edge === 'left' ? -SIZE * 0.6 : w + SIZE * 0.6;
  state.y = 60 + Math.random() * Math.max(1, h - 120);
  state.vx = (edge === 'left' ? 1 : -1) * (2.4 + Math.random() * 1.4);
  state.vy = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9);
  state.dir = state.vx < 0 ? -1 : 1;
}

/** Sidebar-launched game: a critter runs across the whole app screen; click it to catch. */
export function CritterCatch() {
  const [enabled, setEnabled] = useState(false);
  const [caught, setCaught] = useState(0);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [pop, setPop] = useState<{ id: number; x: number; y: number } | null>(null);
  const critterRef = useRef<HTMLButtonElement>(null);
  const emojiRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const game = useRef<CritterState>({ x: 0, y: 0, vx: 0, vy: 0, speed: 1, dir: 1, turnIn: 2500 });

  useEffect(() => {
    if (!enabled) return;
    const critter = critterRef.current;
    if (!critter) return;

    const state = game.current;
    state.speed = 1;
    state.turnIn = 2200 + Math.random() * 2000;
    runFromEdge(state, 'left');

    let last = 0;
    const frame = (ts: number) => {
      if (!last) last = ts;
      const dt = Math.min(48, ts - last) / 16.67;
      last = ts;
      const box = bounds();

      state.x += state.vx * state.speed * SPEED_SCALE * dt;
      state.y += state.vy * state.speed * SPEED_SCALE * dt;
      if (state.x < 0) { state.x = 0; state.vx = Math.abs(state.vx); }
      if (state.x > box.w) { state.x = box.w; state.vx = -Math.abs(state.vx); }
      if (state.y < 0) { state.y = 0; state.vy = Math.abs(state.vy); }
      if (state.y > box.h) { state.y = box.h; state.vy = -Math.abs(state.vy); }

      state.turnIn -= dt * 16.67;
      if (state.turnIn <= 0) {
        state.vy = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1);
        state.turnIn = 1800 + Math.random() * 2600;
      }
      state.dir = state.vx < 0 ? -1 : 1;

      critter.style.left = `${state.x.toFixed(1)}px`;
      critter.style.top = `${state.y.toFixed(1)}px`;
      if (emojiRef.current) emojiRef.current.style.transform = `scaleX(${state.dir})`;

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  function catchCritter(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const state = game.current;
    setCaught((count) => count + 1);
    setPop({ id: Date.now(), x: state.x + SIZE / 2, y: state.y + SIZE / 2 });
    if (Math.random() < 0.34) setEmoji(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);

    state.speed = Math.min(2.6, state.speed + 0.08);
    runFromEdge(state, state.x < window.innerWidth / 2 ? 'right' : 'left');
  }

  return (
    <>
      <button
        type="button"
        className="critter-toggle"
        aria-pressed={enabled}
        onClick={() => setEnabled((on) => !on)}
      >
        <span aria-hidden="true">🐾</span>
        {enabled ? 'Stop critter catch' : 'Play critter catch'}
      </button>

      {enabled
        ? createPortal(
            <div className="critter-layer">
              <button
                ref={critterRef}
                type="button"
                className="critter"
                onClick={catchCritter}
                aria-label="Catch the critter"
              >
                <span ref={emojiRef} className="critter-emoji" aria-hidden="true">{emoji}</span>
              </button>

              {pop ? (
                <span key={pop.id} className="critter-pop" style={{ left: pop.x, top: pop.y }} aria-hidden="true">
                  +1
                </span>
              ) : null}

              <div className="critter-hud">
                <span>Caught</span>
                <b aria-live="polite">{caught}</b>
                <button
                  type="button"
                  className="critter-hud-close"
                  onClick={() => setEnabled(false)}
                  aria-label="Stop the critter game"
                >
                  ✕
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
