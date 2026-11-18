import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { THEME } from './lib/theme';
import { EASE, mix, prog } from './lib/motion';
import fxData from './fx.json';

// The "human editor" layer between scenes (timeline written by pipeline/make_fx.py):
//  - camera moves on the speaker layer: jump-zoom punches, impact shakes, whip pan, zoom-blur
//  - overlays: spawn flash + light leak, name lower-third, GitHub chip, grain + vignette
type Fx = {
  punches: { t: number; amt: number; until: number }[];
  shakes: { t: number; dur: number; amp: number }[];
  whips: { t: number; dur: number; dir: number }[];
  flashes: { t: number; dur: number }[];
  zoomblurs: { t: number; dur: number }[];
  lower_thirds: { t0: number; t1: number; name: string; role: string }[];
  chips: { t0: number; t1: number; kind: string; text: string; sub?: string }[];
  callouts?: { t0: number; t1: number; x: number; y: number; text: string; sub?: string }[];
  grain: number;
  vignette: number;
};
export const FX = fxData as Fx;

// deterministic pseudo-noise for handheld shake (a pure function of time)
const wob = (t: number, s: number) => Math.sin(t * 37.1 + s) * 0.6 + Math.sin(t * 61.7 + s * 2.3) * 0.4;

/** Camera state for the speaker layer at time t (seconds). */
export const cameraAt = (t: number, W: number) => {
  let scale = 1, x = 0, y = 0, rot = 0, blurX = 0, blur = 0, bright = 1;
  for (const p of FX.punches) {
    if (t < p.t || t >= p.until) continue;
    // slam in over ~3 frames, then a slow creep while held; the next cut resets it
    scale *= 1 + p.amt * prog(t, p.t, 0.1, EASE.out) + 0.012 * (t - p.t);
  }
  for (const s of FX.shakes) {
    if (t < s.t || t > s.t + s.dur) continue;
    const d = Math.pow(1 - (t - s.t) / s.dur, 2);
    x += wob(t, 1) * s.amp * d; y += wob(t, 4) * s.amp * 0.7 * d; rot += wob(t, 7) * 0.25 * d;
  }
  for (const w of FX.whips) {
    const h = w.dur / 2;
    if (t < w.t - h || t > w.t + h) continue;
    // before the cut the old shot accelerates out; after it the new one decelerates in
    const k = t < w.t ? -Math.pow((t - (w.t - h)) / h, 2) : Math.pow(1 - (t - w.t) / h, 2);
    // travel less, scale up while travelling, so the frame edge never shows black
    x += w.dir * k * W * 0.14; scale *= 1 + 0.32 * Math.abs(k);
    blurX = Math.max(blurX, Math.abs(k) * 70);
  }
  for (const z of FX.zoomblurs) {
    const h = z.dur / 2;
    if (t < z.t - h || t > z.t + h) continue;
    const k = 1 - Math.abs(t - z.t) / h;
    scale *= 1 + 0.22 * k * k; blur = Math.max(blur, 10 * k); bright *= 1 + 0.25 * k;
  }
  return { scale, x, y, rot, blurX, blur, bright };
};

/** Inline SVG filter for horizontal motion blur (CSS blur() is isotropic). */
export const WhipFilter: React.FC<{ blurX: number }> = ({ blurX }) => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <filter id="whipblur" x="-10%" y="0" width="120%" height="100%">
      <feGaussianBlur stdDeviation={`${blurX} 0`} />
    </filter>
  </svg>
);

const GitHubMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="#fff">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const LowerThird: React.FC<{ t: number; lt: Fx['lower_thirds'][0]; accent: string }> = ({ t, lt, accent }) => {
  if (t < lt.t0 - 0.05 || t > lt.t1 + 0.1) return null;
  const local = t - lt.t0;
  const out = prog(t, lt.t1 - 0.35, 0.35, EASE.exit);
  const bar = prog(local, 0, 0.35, EASE.out) * (1 - out);
  const name = prog(local, 0.12, 0.5, EASE.out);
  const role = prog(local, 0.3, 0.5, EASE.out);
  return (
    <div style={{ position: 'absolute', left: 96, top: 600, fontFamily: THEME.font, opacity: 1 - out }}>
      <div style={{ position: 'absolute', left: 0, top: 8, width: 5, height: 190 * bar, background: accent, borderRadius: 3 }} />
      <div style={{ marginLeft: 26, overflow: 'hidden', height: 116 }}>
        <div style={{ transform: `translateY(${(1 - name) * 116}px)`, fontSize: 96, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em',
          textShadow: '0 2px 6px rgba(0,0,0,0.45), 0 10px 30px rgba(0,0,0,0.35)' }}>{lt.name}</div>
      </div>
      <div style={{ marginLeft: 28, overflow: 'hidden', height: 72 }}>
        <div style={{ transform: `translateY(${(1 - role) * 72}px)`, fontSize: 58, fontWeight: 500, color: 'rgba(255,255,255,0.86)',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{lt.role}</div>
      </div>
    </div>
  );
};

const Chip: React.FC<{ t: number; c: Fx['chips'][0] }> = ({ t, c }) => {
  if (t < c.t0 || t > c.t1 + 0.05) return null;
  const local = t - c.t0;
  const inn = prog(local, 0, 0.45, EASE.outBack);
  const out = prog(t, c.t1 - 0.3, 0.3, EASE.exit);
  const k = inn * (1 - out);
  const float = Math.sin(local * 2.2) * 4;
  return (
    <div style={{ position: 'absolute', left: 1180, top: 280 + float, transform: `translateY(${(1 - inn) * 40}px) scale(${mix(k, 0.85, 1) * 1.3}) rotate(${(1 - inn) * -6}deg)`,
      transformOrigin: 'left center', opacity: Math.min(1, k * 1.4), display: 'flex', alignItems: 'center', gap: 18, padding: '18px 28px 18px 20px',
      background: 'rgba(13,14,17,0.92)', borderRadius: 18, boxShadow: THEME.shadow, fontFamily: THEME.font }}>
      <div style={{ width: 64, height: 64, borderRadius: 14, background: '#24292f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GitHubMark size={40} />
      </div>
      <div>
        <div style={{ color: '#fff', fontSize: 44, fontWeight: 650, letterSpacing: '-0.015em' }}>{c.text}</div>
        {c.sub && <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 34, marginTop: 2 }}>{c.sub}</div>}
      </div>
    </div>
  );
};

// editorial callout on something in the footage: a dot, a hairline leader, then the type (no pill, no glow)
const Callout: React.FC<{ t: number; c: NonNullable<Fx['callouts']>[0]; W: number; H: number }> = ({ t, c, W, H }) => {
  if (t < c.t0 || t > c.t1 + 0.05) return null;
  const k = prog(t, c.t0, 0.45, EASE.enter), out = prog(t, c.t1 - 0.3, 0.3, EASE.exit), a = k * (1 - out);
  // the type sits above the clone's head, against the right edge, clear of the speaker's face
  const x0 = c.x * W, y0 = c.y * H, x1 = x0 + 30, y1 = y0 - 110, x2 = mix(k, x1, W - 70);
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: 1 - out }} width={W} height={H}>
        <polyline points={`${x0},${y0} ${mix(Math.min(1, k * 2), x0, x1)},${mix(Math.min(1, k * 2), y0, y1)} ${k > 0.5 ? `${x2},${y1}` : ''}`}
          fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="3" />
        <circle cx={x0} cy={y0} r="6" fill="#fff" />
      </svg>
      <div style={{ position: 'absolute', right: 70, top: y1 - 112, textAlign: 'right', fontFamily: THEME.font, opacity: Math.max(0, a * 2 - 1),
        textShadow: '0 2px 4px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.45)' }}>
        <div style={{ color: '#fff', fontSize: 52, fontWeight: 700, letterSpacing: '-0.02em' }}>{c.text}</div>
        {c.sub && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 38, fontWeight: 500 }}>{c.sub}</div>}
      </div>
    </>
  );
};

const Flash: React.FC<{ t: number; f: Fx['flashes'][0]; W: number }> = ({ t, f, W }) => {
  if (t < f.t - 0.04 || t > f.t + f.dur + 0.6) return null;
    const leak = prog(t, f.t, f.dur + 0.6, EASE.inOut);             // warm leak sweeping across
  const leakA = Math.sin(Math.PI * leak) * 0.45;
  return (
    <>
      <AbsoluteFill style={{ mixBlendMode: 'screen', opacity: leakA,
        background: `radial-gradient(40% 90% at ${mix(leak, -10, 110)}% 40%, rgba(255,150,70,0.9) 0%, rgba(255,90,40,0.35) 40%, rgba(0,0,0,0) 75%)` }} />
    </>
  );
};

/** Moving film grain: shares one lens between footage and CG (seeded per frame). */
const Grain: React.FC<{ amount: number; frame: number }> = ({ amount, frame }) => (
  <AbsoluteFill style={{ mixBlendMode: 'overlay', opacity: amount * 4 }}>
    <svg width="100%" height="100%">
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 97} stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#grain)" opacity="0.5" />
    </svg>
  </AbsoluteFill>
);

export const EditorOverlay: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {FX.lower_thirds.map((lt, i) => <LowerThird key={i} t={t} lt={lt} accent={accent} />)}
      {FX.chips.map((c, i) => <Chip key={i} t={t} c={c} />)}
      {FX.flashes.map((f, i) => <Flash key={i} t={t} f={f} W={width} />)}
      {(FX.callouts ?? []).map((c, i) => <Callout key={i} t={t} c={c} W={width} H={height} />)}
      <AbsoluteFill style={{ background: `radial-gradient(120% 95% at 50% 45%, rgba(0,0,0,0) 55%, rgba(8,6,4,${FX.vignette}) 100%)` }} />
      <Grain amount={FX.grain} frame={frame} />
    </AbsoluteFill>
  );
};
