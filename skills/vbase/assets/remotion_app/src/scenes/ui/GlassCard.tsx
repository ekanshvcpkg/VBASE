import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// A frosted-glass title card that pops over the footage on a key line: an eyebrow pill, a line,
// then a big accent line whose words land one by one. Layout `tracked` (drawn at full frame).
// props: { eyebrow, line1, line2, pos?: 'left'|'right', accent?, logo?: boolean }
const Mark: React.FC<{ s: number }> = ({ s }) => (
  <svg width={s} height={s} viewBox="0 0 40 40" style={{ display: 'inline-block', verticalAlign: '-0.08em', marginRight: s * 0.22 }}>
    <path d="M5 5.5 H19 V28.5 Z" fill="#111" /><path d="M21 5.5 H35 L21 28.5 Z" fill="#6B6B6B" />
    <rect x="4.5" y="33.5" width="31" height="2.6" rx="1.3" fill="#BDBDBD" /><rect x="4.5" y="33.5" width="12.5" height="2.6" rx="1.3" fill="#111" />
  </svg>
);
export const GlassCard: React.FC<SceneProps> = ({ t, dur, props, accent, w, h }) => {
  const A = props.accent ?? '#2F6BFF';
  const inn = prog(t, 0, 0.5, EASE.outBack), out = prog(t, dur - 0.35, 0.35, EASE.exit);
  const left = (props.pos ?? 'left') === 'left';
  const words: string[] = String(props.line2 ?? '').split(' ');
  const cw = Math.min(760, w * 0.4);
  // props.place (from person_matte.py): the free wall beside the speaker's head; the card fits inside it
  const pl = props.place, fit = pl ? Math.min(1, pl.w / cw) : 1;
  const pos = pl ? { left: left ? pl.x : pl.x + pl.w - cw * fit, top: pl.y } : { [left ? 'left' : 'right']: w * 0.04, top: h * 0.43 };
  return (
    <div style={{ position: 'absolute', ...pos, width: cw, boxSizing: 'border-box', padding: '30px 38px 36px',
      borderRadius: 30, background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(22px) saturate(1.4)', WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
      border: '1.5px solid rgba(255,255,255,0.85)', boxShadow: '0 30px 70px -20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)',
      fontFamily: THEME.font, opacity: Math.min(1, inn * 1.4) * (1 - out),
      transform: `translateY(${(1 - inn) * 40 - out * 20}px) scale(${fit * mix(Math.min(inn, 1), 0.9, 1) * (1 - out * 0.04)})`, transformOrigin: pl ? 'top left' : left ? '20% 80%' : '80% 80%' }}>
      {props.eyebrow && (
        <div style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 999, border: `2px solid ${A}`, color: A, fontSize: 26, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase', opacity: prog(t, 0.15, 0.3, EASE.out) }}>{props.eyebrow}</div>
      )}
      <div style={{ marginTop: 18, fontSize: 52, fontWeight: 700, color: '#0E1014', letterSpacing: '-0.02em', lineHeight: 1.1,
        opacity: prog(t, 0.25, 0.35, EASE.out), transform: `translateY(${(1 - prog(t, 0.25, 0.4, EASE.out)) * 14}px)` }}>{props.line1}</div>
      <div style={{ marginTop: 6, fontSize: 92, fontWeight: 800, color: A, letterSpacing: '-0.04em', lineHeight: 1.02 }}>
        {props.logo && <span style={{ opacity: prog(t, 0.4, 0.3, EASE.out) }}><Mark s={84} /></span>}
        {words.map((wd, i) => {
          const k = prog(t, 0.45 + i * 0.12, 0.4, EASE.outBack);
          return <span key={i} style={{ display: 'inline-block', marginRight: '0.22em', opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * 34}px) scale(${mix(Math.min(k, 1), 0.8, 1)})` }}>{wd}</span>;
        })}
      </div>
    </div>
  );
};
