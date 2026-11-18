// Motion tokens. Every scene uses these instead of ad-hoc numbers so the whole video
// moves with one consistent feel (see references/motion_rules.md).
import { Easing, interpolate } from 'remotion';

export const EASE = {
  enter: Easing.bezier(0.2, 0.8, 0.2, 1),     // UI blocks arriving
  out: Easing.bezier(0.16, 1, 0.3, 1),        // snappy settle
  inOut: Easing.bezier(0.65, 0, 0.35, 1),     // camera moves
  outBack: Easing.bezier(0.34, 1.56, 0.64, 1), // pops with a little overshoot
  exit: Easing.bezier(0.7, 0, 0.84, 0),       // leaving the frame
};

/** 0→1 progress of a move starting at `start` seconds lasting `dur` seconds. */
export const prog = (t: number, start: number, dur: number, ease = EASE.enter) =>
  !Number.isFinite(start) ? 0
    : interpolate(t, [start, start + Math.max(dur, 1e-3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/** Map progress to a value range. */
export const mix = (p: number, a: number, b: number) => a + (b - a) * p;

/** Staggered start time for item i: 40 + 65·i ms. */
export const stagger = (i: number, base = 0, step = 0.065) => base + 0.04 + step * i;

/** Gentle never-static drift (every shot moves at least ~2%). */
export const drift = (t: number, amp = 1, period = 7) => ({
  x: Math.sin((t / period) * Math.PI * 2) * 6 * amp,
  y: Math.cos((t / (period * 1.3)) * Math.PI * 2) * 4 * amp,
  r: Math.sin((t / (period * 1.7)) * Math.PI * 2) * 0.6 * amp,
});

/** Scene envelope: in for `inDur`, hold, out for `outDur` before `total`. 0..1 */
export const envelope = (t: number, total: number, inDur = 0.45, outDur = 0.3) =>
  Math.min(prog(t, 0, inDur, EASE.out), 1 - prog(t, total - outDur, outDur, EASE.exit));

/** Time of the n-th beat with a given action, else fallback (seconds, scene-relative). */
export type Beat = { action: string; t: number; [k: string]: unknown };
export const beatAt = (beats: Beat[] | undefined, action: string, n: number, fallback: number) => {
  const hits = (beats ?? []).filter((b) => b.action === action);
  return hits[n]?.t ?? fallback;
};

/** Characters of `text` visible when typing starts at `start` at `cps` chars/sec. */
export const typed = (text: string, t: number, start: number, cps = 32) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - start) * cps))));
