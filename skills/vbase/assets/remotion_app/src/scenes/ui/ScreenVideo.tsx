import React from 'react';
import { OffthreadVideo, staticFile } from 'remotion';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// A real screen recording of the product, played in a flat browser window (proof, not a mock-up).
// The window settles in, holds with a slow push, and leaves; the recording plays at its own speed.
// props: { src (under public/), url?, title?, from? (seconds into the recording) }
export const ScreenVideo: React.FC<SceneProps> = ({ t, dur, props, w, h }) => {
  const inn = prog(t, 0, 0.5, EASE.out), out = prog(t, dur - 0.3, 0.3, EASE.exit);
  const push = 1 + 0.03 * prog(t, 0, dur, EASE.inOut);
  const ww = w * 0.94, wh = Math.min(h * 0.94, (ww - 2) * 0.6 + 52);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: ww, height: wh, borderRadius: 16, overflow: 'hidden', background: '#0A0A0A', border: '1px solid #2E2E2E',
        boxShadow: THEME.shadow, transformOrigin: props.side === 'left' ? '85% 60%' : props.side === 'right' ? '15% 60%' : '50% 50%', opacity: Math.min(1, inn * 1.4) * (1 - out), transform: `translateY(${(1 - inn) * 30}px) scale(${mix(inn, props.side ? 0.6 : 0.97, 1) * push})` }}>
        <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', borderBottom: '1px solid #1F1F1F' }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
          <div style={{ marginLeft: 16, flex: 1, height: 32, borderRadius: 8, background: '#161616', display: 'flex', alignItems: 'center',
            padding: '0 14px', color: '#A1A1A1', fontFamily: THEME.mono, fontSize: 22 }}>{props.url ?? 'localhost:4400'}</div>
        </div>
        <OffthreadVideo src={staticFile(props.src)} startFrom={Math.round((props.from ?? 0) * 30)} muted
          style={{ width: '100%', height: wh - 53, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
      </div>
    </div>
  );
};
