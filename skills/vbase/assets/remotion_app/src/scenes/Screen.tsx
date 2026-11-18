// Screen: the professional way to show software. A flat, crisp UI (never tilted or wobbling)
// with a camera that is LOCKED by default and makes deliberate moves: it pushes in on exactly
// the region being talked about, holds, and pulls back. Plus a cursor that travels on a gentle
// arc and clicks. This is how high-end product films and demo edits are cut — the "floating
// 3D glass window" is the AI tell we avoid.
import React from 'react';
import { EASE, mix, prog } from '../lib/motion';

/** Camera key: from time t, move (over `dur`, default 0.8 s) to frame focus point (x,y) at scale s. */
export type CamKey = { t: number; x: number; y: number; s: number; dur?: number };

export const camAt = (keys: CamKey[], t: number, cw: number, ch: number) => {
  let cur = { x: cw / 2, y: ch / 2, s: 1 };
  for (const k of keys) {
    if (t < k.t) break;
    const p = prog(t, k.t, k.dur ?? 0.8, EASE.inOut);
    cur = { x: mix(p, cur.x, k.x), y: mix(p, cur.y, k.y), s: mix(p, cur.s, k.s) };
  }
  return cur;
};

type ScreenProps = {
  t: number;
  w: number; h: number;          // viewport (the frame on screen)
  cw: number; ch: number;        // content canvas the UI is laid out on
  cam?: CamKey[];
  radius?: number;
  bg?: string;
  frame?: boolean;               // draw the window frame + shadow (false = full-bleed)
  children: React.ReactNode;
};

export const Screen: React.FC<ScreenProps> = ({ t, w, h, cw, ch, cam = [], radius = 14, bg = '#fff', frame = true, children }) => {
  const fit = Math.min(w / cw, h / ch);
  const c = camAt(cam, t, cw, ch);
  // portrait frames show a wide product canvas at ~60% — push harder so the action fills the frame
  const boost = h > w * 1.1 ? 1.45 : 1;
  const s = fit * c.s * boost;
  // keep the focus point centred, but never show past the canvas edge
  const vx = Math.min(0, Math.max(w - cw * s, w / 2 - c.x * s));
  const vy = Math.min(0, Math.max(h - ch * s, h / 2 - c.y * s));
  const ox = cw * s < w ? (w - cw * s) / 2 : vx;
  const oy = ch * s < h ? (h - ch * s) / 2 : vy;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: frame ? radius : 0, overflow: 'hidden',
      background: bg, boxShadow: frame ? '0 0 0 1px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.16), 0 28px 56px -14px rgba(0,0,0,0.42), 0 70px 140px -50px rgba(0,0,0,0.5)' : 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: cw, height: ch, transformOrigin: '0 0',
        transform: `translate(${ox}px, ${oy}px) scale(${s})` }}>
        {children}
      </div>
    </div>
  );
};

/** Cursor key: be at (x,y) by time t (content coords). click: press at arrival. */
export type CurKey = { t: number; x: number; y: number; click?: boolean };

/** Where the cursor is at time t (content coords) — shared so dragged items ride it exactly. */
export const cursorAt = (keys: CurKey[], t: number) => {
  let x = keys[0]?.x ?? 0, y = keys[0]?.y ?? 0;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    const start = Math.max(a.t, b.t - Math.min(0.75, Math.max(0.35, Math.hypot(b.x - a.x, b.y - a.y) / 1400)));
    if (t >= start) {
      const p = prog(t, start, b.t - start, EASE.inOut);
      // hands move on a slight arc, not a ruler line
      const arc = Math.sin(p * Math.PI) * Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
      x = mix(p, a.x, b.x) - arc * 0.4;
      y = mix(p, a.y, b.y) - arc;
    }
  }
  return { x, y };
};

export const Cursor: React.FC<{ t: number; keys: CurKey[]; scale?: number }> = ({ t, keys, scale = 1 }) => {
  if (!keys.length || t < keys[0].t - 0.6) return null;
  const { x, y } = cursorAt(keys, t);
  const click = keys.find((k) => k.click && t >= k.t && t < k.t + 0.5);
  const d = click ? t - click.t : 1;
  const press = click && d < 0.12 ? 0.86 : 1;
  const ring = click ? Math.min(1, d / 0.45) : 1;
  const appear = prog(t, keys[0].t - 0.6, 0.3, EASE.out);
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', opacity: appear, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      {click && ring < 1 && (
        <div style={{ position: 'absolute', left: -26, top: -26, width: 52, height: 52, borderRadius: 26,
          border: '2px solid rgba(0,0,0,0.35)', background: 'rgba(0,0,0,0.06)', transform: `scale(${0.5 + ring * 0.8})`, opacity: 1 - ring }} />
      )}
      <svg width="30" height="38" viewBox="0 0 30 38" style={{ transform: `scale(${press})`, transformOrigin: '2px 2px',
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
        <path d="M2 2 L2 30 L9.5 23.5 L14.5 35 L19 33 L14 21.8 L24 21.8 Z" fill="#111" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
