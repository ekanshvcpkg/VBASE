import React from 'react';
import { Img, staticFile } from 'remotion';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// "…this level of editing": the same instant of the take, raw beside the finished edit.
// props: { before, after, beforeLabel, afterLabel }   beats: 'after' (when the edited half lands)
export const BeforeAfter: React.FC<SceneProps> = ({ t, dur, props, beats, accent, w, h }) => {
  const afterT = beats.find((b) => b.action === 'after')?.t ?? 0.35;
  const gap = 24, pw = (w - gap * 3) / 2, ph = pw * 9 / 16, top = (h - ph) / 2;
  const a = prog(t, 0, 0.35, EASE.out), b = prog(t, afterT, 0.4, EASE.outBack), out = prog(t, dur - 0.3, 0.3, EASE.exit);
  const panel = (src: string, label: string, x: number, k: number, hot: boolean) => k > 0 && (
    <div style={{ position: 'absolute', left: x, top, width: pw, height: ph, borderRadius: 18, overflow: 'hidden', boxShadow: THEME.shadow,
      opacity: Math.min(1, k * 1.5) * (1 - out), transform: `translateY(${(1 - k) * 30}px)`, outline: hot ? `3px solid ${accent}` : '2px solid rgba(255,255,255,0.14)' }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', left: 24, top: 20, padding: '8px 18px', borderRadius: 12, background: hot ? accent : 'rgba(13,14,17,0.8)',
        color: '#fff', fontFamily: THEME.font, fontSize: 52, fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {panel(props.before, props.beforeLabel ?? 'Raw take', gap, a, false)}
      {panel(props.after, props.afterLabel ?? 'vidbase edit', gap * 2 + pw, b, true)}
    </div>
  );
};
