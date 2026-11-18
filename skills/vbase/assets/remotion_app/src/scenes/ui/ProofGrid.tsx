import React from 'react';
import { Img, staticFile } from 'remotion';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// "It has something called this, this, this…": each "this" lands on a tile of the product's REAL
// output (frames from the finished edit itself), not a claims table. 2x2, one tile per beat.
// props: { tiles: [{img, label}] }   beats: 'tile' × n
export const ProofGrid: React.FC<SceneProps> = ({ t, dur, props, beats, accent, w, h }) => {
  const tiles: { img: string; label: string }[] = props.tiles ?? [];
  const starts = tiles.map((_, i) => beats.filter((b) => b.action === 'tile')[i]?.t ?? 0.2 + i * 0.5);
  // the broll box already ends above the caption line, so the grid fills it
  const gap = 24, cols = 2, th = Math.min(((w - gap * 3) / cols) * 9 / 16, (h - gap) / 2), tw = th * 16 / 9;
  const top = (h - (th * 2 + gap)) / 2, left0 = (w - (tw * 2 + gap)) / 2;
  const out = prog(t, dur - 0.3, 0.3, EASE.exit);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: THEME.font }}>
      {tiles.map((tl, i) => {
        const k = prog(t, starts[i], 0.35, EASE.outBack);
        if (k <= 0) return null;
        const x = left0 + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + gap);
        const settle = 1 + 0.02 * prog(t, starts[i], dur, EASE.out); // a slow creep inside each tile
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: tw, height: th, borderRadius: 18, overflow: 'hidden',
            transform: `scale(${mix(k, 0.86, 1) * (1 - out * 0.04)})`, opacity: Math.min(1, k * 1.5) * (1 - out),
            boxShadow: THEME.shadow, outline: `3px solid ${i === tiles.length - 1 && t > starts[i] ? accent : 'rgba(255,255,255,0.12)'}` }}>
            <Img src={staticFile(tl.img)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${settle})` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '18px 24px 40px',
              background: 'linear-gradient(rgba(10,10,12,0.78), rgba(10,10,12,0))' }}>
              <div style={{ color: '#fff', fontSize: 52, fontWeight: 700, letterSpacing: '-0.02em' }}>{tl.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
