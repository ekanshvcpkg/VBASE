import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Cue3D, Cue } from './Cue3D';
import { Captions, Word } from './Captions';
import { SceneLayer, SceneCue, layoutWeight } from './scenes';
import { useCurrentFrame as useFrame2 } from 'remotion';
import { EASE, prog } from './lib/motion';
import { EditorOverlay, WhipFilter, cameraAt } from './EditorFX';

type Seg = { timeline_start: number; timeline_end: number; push?: number };
type Edl = {
  style?: string;
  words?: Word[];
  three_d_cues?: (Cue & Partial<SceneCue>)[];
  keep_segments?: Seg[];
  speaker_face_y_ratio?: number;
  holds?: [number, number][];
  brand?: { accent?: string; palette?: 'paper' | 'ink'; captions?: string };
};

// The speaker layer: slow sub-pixel push-in per shot (from the EDL), and it makes room for
// scenes — slides down for `split`, blurs + dims behind full-screen `broll`.
const Speaker: React.FC<{ edl: Edl; sceneCues: SceneCue[]; children?: React.ReactNode }> = ({ edl, sceneCues, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const seg = (edl.keep_segments ?? []).find((s) => t >= s.timeline_start && t < s.timeline_end);
  // the first shot is already moving on frame 0 (ease-out from speed), later shots ease in-out
  const first = !!seg && seg.timeline_start < 1e-3;
  const segPush = seg ? Math.max(seg.push ?? 0, first ? 0.03 : 0) : 0;
  // a slow continuous camera breath across the whole video (never resets at a cut), plus any per-shot push
  const breath = 1 + 0.012 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 14));
  const push = breath * (1 + segPush * prog(t, seg?.timeline_start ?? 0, (seg?.timeline_end ?? 1) - (seg?.timeline_start ?? 0), first ? EASE.out : EASE.inOut));
  // holds: the edit slams the brakes — one slow, deliberate creep in, no cuts, no graphics
  let creep = 1;
  for (const [a, b] of edl.holds ?? []) creep *= 1 + 0.06 * prog(t, a, b - a, EASE.inOut) * (1 - prog(t, b, 0.6, EASE.inOut));
  let split = 0, broll = 0, splitL = 0;
  for (const c of sceneCues) {
    const w = layoutWeight(c, t);
    if (c.layout === 'split') { split = Math.max(split, w); if ((c as any).props?.side === 'left') splitL = Math.max(splitL, w); }
    if (c.layout === 'broll') broll = Math.max(broll, w);
  }
  const vertical = height >= width * 0.95;
  // face lands centred in the free 58%: away from a right panel, or towards the right for a left panel
  const tx = vertical ? 0 : -width * 0.21 * (split - splitL) + width * 0.21 * splitL;
  const ty = vertical ? height * 0.19 * split : 0;
  const fy = (edl.speaker_face_y_ratio ?? 0.4) * 100;
  const cam = cameraAt(t, width); // editor moves: punches, shakes, whip, zoom-blur (EditorFX.tsx)
  const filters = [
    cam.blurX > 0.3 ? 'url(#whipblur)' : '',
    cam.blur > 0.2 ? `blur(${cam.blur}px)` : '',
    cam.bright !== 1 ? `brightness(${cam.bright})` : '',
    // behind b-roll the footage stays present as soft, warm light (not a dark void)
    broll > 0.01 ? `blur(${36 * broll}px) brightness(${1 - 0.38 * broll}) saturate(1.1)` : '',
  ].filter(Boolean).join(' ');
  return (
    <AbsoluteFill style={{
      transform: `translate(${tx + cam.x}px, ${ty + cam.y}px) rotate(${cam.rot}deg) scale(${push * creep * cam.scale * (1 + 0.05 * broll)})`, transformOrigin: `50% ${fy}%`,
      filter: filters || undefined,
    }}>
      {cam.blurX > 0.3 && <WhipFilter blurX={cam.blurX} />}
      {/* base_cut.mp4 already has the mastered audio; OffthreadVideo carries it into the render */}
      <OffthreadVideo src={staticFile('base_cut.mp4')} />
      {children /* tracked objects ride the same transform as the footage */}
    </AbsoluteFill>
  );
};

export const MainComposite: React.FC<{ edl: Edl }> = ({ edl }) => {
  const { fps } = useVideoConfig();
  const tNow = useFrame2() / fps;
  const cues = edl.three_d_cues ?? [];
  const sceneCues = cues.filter((c) => c.scene) as SceneCue[];

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 70% at 50% 15%, #23232b 0%, #0b0b0f 70%)' }}>
      <Speaker edl={edl} sceneCues={sceneCues}>
        {cues.map((cue, idx) => cue.layout !== 'tracked' ? null : (
          <Sequence key={idx} from={Math.round(cue.timeline_start * fps)}
            durationInFrames={Math.max(1, Math.round((cue.timeline_end - cue.timeline_start) * fps))} name={`tracked ${idx}: ${cue.scene}`}>
            <SceneLayer cue={cue as SceneCue} index={idx} brand={edl.brand} />
          </Sequence>
        ))}
      </Speaker>
      {cues.map((cue, idx) => {
        if (cue.layout === 'tracked') return null;
        const from = Math.round(cue.timeline_start * fps);
        const durationInFrames = Math.max(1, Math.round((cue.timeline_end - cue.timeline_start) * fps));
        // Inside a Sequence, useCurrentFrame() restarts at 0 -> each cue animates from its own start.
        return (
          <Sequence key={idx} from={from} durationInFrames={durationInFrames} name={`cue ${idx}: ${cue.scene ?? cue.label ?? cue.type}`}>
            {cue.scene ? <SceneLayer cue={cue as SceneCue} index={idx} brand={edl.brand} /> : <Cue3D cue={cue} />}
          </Sequence>
        );
      })}
      <EditorOverlay accent={edl.brand?.accent ?? '#C96442'} />
      {edl.brand?.captions !== 'none' && (
        <Captions words={edl.words ?? []} style={edl.style ?? 'natural'} look={edl.brand?.captions} accent={edl.brand?.accent}
          split={Math.max(0, ...sceneCues.filter((c) => c.layout === 'split' && (c as any).props?.side !== 'left').map((c) => layoutWeight(c, tNow)))}
          splitLeft={Math.max(0, ...sceneCues.filter((c) => c.layout === 'split' && (c as any).props?.side === 'left').map((c) => layoutWeight(c, tNow)))} />
      )}
    </AbsoluteFill>
  );
};
