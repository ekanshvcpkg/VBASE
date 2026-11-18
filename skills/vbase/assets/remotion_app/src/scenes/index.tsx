// Scene registry + layout boxes. The director picks `scene` + `props` + `layout` per cue
// (catalog: references/scene_catalog.md). New scenes: add a component and register it here.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { EASE, mix, prog, envelope, Beat } from '../lib/motion';
import { THEME, PAPER, INK } from '../lib/theme';
import type { SceneDef } from './types';
import { Terminal } from './ui/Terminal';
import { Chat } from './ui/Chat';
import { PhoneApp } from './ui/PhoneApp';
import { Repo } from './ui/Repo';
import { Flow } from './ui/Flow';
import { ProofGrid } from './ui/ProofGrid';
import { BeforeAfter } from './ui/BeforeAfter';
import { ScreenVideo } from './ui/ScreenVideo';
import { Code } from './ui/Code';
import { Stat } from './ui/Stat';
import { Icon3D } from './three/Icon3D';
import { HeldObject } from './three/HeldObject';
import { Compare } from './ui/Compare';

export const SCENES: Record<string, SceneDef> = {
  terminal: { component: Terminal, design: [1100, 820], designV: [680, 0] },
  chat: { component: Chat, design: [1600, 1000], designV: [1000, 1300] },   // Screen-based: broll
  phone_app: { component: PhoneApp, design: [760, 1180] },
  repo: { component: Repo, design: [1600, 1000], designV: [1000, 1300] },   // Screen-based: broll
  flow: { component: Flow, design: [1200, 760], designV: [680, 0] },
  code: { component: Code, design: [1100, 820], designV: [680, 0] },
  stat: { component: Stat, design: [1000, 600] },
  icon3d: { component: Icon3D, design: [900, 900] },
  compare: { component: Compare, design: [1100, 760], designV: [680, 0] },
  proof_grid: { component: ProofGrid, design: [1760, 1000] },
  before_after: { component: BeforeAfter, design: [1760, 1000] },
  screen_video: { component: ScreenVideo, design: [1760, 1000] },
  held_object: { component: HeldObject, design: [0, 0] }, // layout 'tracked': drawn at full frame size
};

export type Layout = 'overlay' | 'split' | 'broll' | 'tracked';
export type SceneCue = {
  timeline_start: number;
  timeline_end: number;
  scene: string;
  layout?: Layout;
  props?: Record<string, any>;
  beats?: Beat[];
  accent?: string;
};

type Box = { x: number; y: number; w: number; h: number };
export const layoutBox = (layout: Layout, W: number, H: number, side: 'left' | 'right' = 'right'): Box => {
  if (layout === 'tracked') return { x: 0, y: 0, w: W, h: H };
  if (H >= W * 0.95) { // portrait and square (9:16, 4:5, 1:1) share the stacked layouts
    if (layout === 'overlay') return { x: W * 0.08, y: H * 0.03, w: W * 0.84, h: H * 0.28 };
    if (layout === 'split') return { x: 0, y: 0, w: W, h: H * 0.47 };
    return { x: 0, y: H * 0.05, w: W, h: H * 0.68 };
  }
  // landscape overlay hugs the right edge: a centred speaker's head spans roughly x 0.38-0.62
  if (layout === 'overlay') return { x: W * 0.68, y: H * 0.1, w: W * 0.3, h: H * 0.6 };
  // split = an opaque editorial panel, full height, exactly covering what the speaker vacates
  if (layout === 'split') return side === 'left' ? { x: 0, y: 0, w: W * 0.42, h: H } : { x: W * 0.58, y: 0, w: W * 0.42, h: H };
  return { x: W * 0.04, y: H * 0.035, w: W * 0.92, h: H * 0.79 };
};

/** How strongly a cue's layout is affecting the speaker video right now (0..1). */
export const layoutWeight = (cue: SceneCue, t: number) => {
  const a = cue.timeline_start, b = cue.timeline_end;
  if (cue.layout === 'broll') return Math.min(prog(t, a - 0.05, 0.35, EASE.out), 1 - prog(t, b - 0.35, 0.35, EASE.inOut)); // eased: a hard switch read as a jolt
  return Math.min(prog(t, a - 0.05, 0.5, EASE.out), 1 - prog(t, b - 0.4, 0.4, EASE.inOut));
};

// Film grain over graphics (4%, re-seeded every frame) so UI feels shot through the same lens
// as the footage instead of pasted on top of it.
const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;
const Grain: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: NOISE, opacity: 0.045,
    mixBlendMode: 'overlay', backgroundPosition: `${(frame * 37) % 220}px ${(frame * 71) % 220}px` }} />
);

export type Brand = { accent?: string; palette?: 'paper' | 'ink'; captions?: string };
export const SceneLayer: React.FC<{ cue: SceneCue; index: number; brand?: Brand }> = ({ cue, index, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const def = SCENES[cue.scene];
  if (!def) return null;
  const t = frame / fps; // inside a <Sequence>, frame 0 = cue start
  const dur = cue.timeline_end - cue.timeline_start;
  const layout = cue.layout ?? 'overlay';
  const side: 'left' | 'right' = cue.props?.side === 'left' ? 'left' : 'right';
  const box = layoutBox(layout, width, height, side);
  const dir = side === 'left' ? -1 : 1; // which way the panel leaves
  const vertical = height >= width * 0.95;
  // portrait: a fixed design width, height matched to the box so the scene fills it (bigger type)
  const tracked = layout === 'tracked';
  const panel = layout === 'split';
  // tracked + panel scenes are drawn at the box's true pixel size (type sizes stay honest)
  const [dw, dh] = tracked || panel ? [Math.round(box.w), Math.round(box.h)] : vertical && def.designV
    ? [def.designV[0], def.designV[1] || Math.round(def.designV[0] * box.h / box.w)]
    : def.design;
  // CSS zoom re-lays out at the new size, so text stays crisp (a transform scale would not)
  const zoom = Math.min(box.w / dw, box.h / dh);
  // entries are cuts or wipes, never a soft fade-and-scale: broll/tracked cut, panels wipe,
  // overlays get a short clean reveal
  const env = tracked || layout === 'broll' || panel ? 1 : envelope(t, dur, 0.35, 0.25);
  const wipeIn = panel ? prog(t, 0, 0.5, EASE.out) : 1;
  const wipeOut = panel ? prog(t, dur - 0.4, 0.4, EASE.inOut) : 0;
  const palette = cue.props?.palette ?? brand?.palette ?? 'paper';
  const P = palette === 'ink' ? INK : PAPER;
  const Comp = def.component;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {panel && (
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, background: P.bg,
          clipPath: vertical ? `inset(0 0 ${(1 - wipeIn) * 100}% 0)` : side === 'left' ? `inset(0 0 0 ${(1 - wipeIn) * 100}%)` : `inset(0 0 0 ${(1 - wipeIn) * 100}%)`,
          transform: vertical ? `translateY(${-wipeOut * 105}%)` : `translateX(${dir * wipeOut * 105}%)`,
          boxShadow: vertical ? '0 18px 40px -20px rgba(0,0,0,0.5)' : `${-dir * 18}px 0 40px -20px rgba(0,0,0,0.5)` }}>
          <Grain frame={frame} />
        </div>
      )}
      {/* position in real pixels on the outer box; `zoom` goes on the inner box only,
          because Chrome also scales a zoomed element's own left/top */}
      <div style={{ position: 'absolute', left: box.x + (box.w - dw * zoom) / 2, top: box.y + (box.h - dh * zoom) / 2,
        width: dw * zoom, height: dh * zoom, opacity: Math.min(1, env * 1.3),
        clipPath: panel ? (vertical ? `inset(0 0 ${(1 - wipeIn) * 100}% 0)` : side === 'left' ? `inset(0 0 0 ${(1 - wipeIn) * 100}%)` : `inset(0 0 0 ${(1 - wipeIn) * 100}%)`) : undefined,
        transform: panel ? (vertical ? `translateY(${-wipeOut * box.h * 1.05}px)` : `translateX(${dir * wipeOut * box.w * 1.05}px)`) : `translateY(${(1 - env) * 24}px)` }}>
        <div style={{ position: 'relative', width: dw, height: dh, zoom }}>
          <Comp t={t} dur={dur} props={{ palette, ...(cue.props ?? {}) }} beats={cue.beats ?? []} accent={cue.accent ?? cue.props?.accent ?? brand?.accent ?? THEME.accent} index={index}
            w={dw} h={dh} vertical={dh > dw * 1.1} layout={layout} />
        </div>
        {!tracked && !panel && layout !== 'broll' && <Grain frame={frame} />}
      </div>
    </AbsoluteFill>
  );
};
