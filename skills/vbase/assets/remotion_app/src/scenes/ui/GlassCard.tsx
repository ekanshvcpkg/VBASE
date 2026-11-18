import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';
import { BuddySprite, Heart, UNIT } from '../three/Buddy';

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
  // props.hug: the buddy pops up from behind the card's top edge and hugs it (the card sits a little lower to make room)
  const hugOn = !!props.hug;
  const cardL = pl ? (left ? pl.x : pl.x + pl.w - cw * fit) : left ? w * 0.04 : w * 0.96 - cw;
  const cardT = pl ? (hugOn ? Math.max(pl.y, h * 0.25) : pl.y) : h * 0.43;
  const pos = { left: cardL, top: cardT };
  const S = Math.round(cw * fit * 0.8), ppu = S * UNIT;
  const rise = prog(t, 0.8, 0.45, EASE.outBack) * (1 - prog(t, dur - 0.75, 0.35, EASE.exit));
  const hug = prog(t, 1.25, 0.3, EASE.outBack) * (1 - prog(t, dur - 0.8, 0.25, EASE.inOut));
  const bx = cardL + cw * fit * 0.74, by = cardT - 0.45 * ppu + (1 - rise) * 2.7 * ppu;
  const top = by - S / 2, edge = cardT - top;                    // the card's top edge inside the sprite
  const pose = { armsUp: prog(t, 0.85, 0.3, EASE.out) * (1 - prog(t, 1.2, 0.2, EASE.inOut)), hug, happy: prog(t, 1.3, 0.2, EASE.out),
    tilt: 0.1 * hug * Math.sin((t - 1.3) * 3.2), squash: 0.1 * Math.exp(-Math.pow((t - 1.45) / 0.1, 2)) };
  const squish = 1 - 0.018 * Math.exp(-Math.pow((t - 1.45) / 0.12, 2));
  const card = (
    <div style={{ position: 'absolute', ...pos, width: cw, boxSizing: 'border-box', padding: '30px 38px 36px',
      borderRadius: 30, background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(22px) saturate(1.4)', WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
      border: '1.5px solid rgba(255,255,255,0.85)', boxShadow: '0 30px 70px -20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)',
      fontFamily: THEME.font, opacity: Math.min(1, inn * 1.4) * (1 - out),
      transform: `translateY(${(1 - inn) * 40 - out * 20}px) scale(${fit * squish * mix(Math.min(inn, 1), 0.9, 1) * (1 - out * 0.04)})`, transformOrigin: pl ? 'top left' : left ? '20% 80%' : '80% 80%' }}>
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
  if (!hugOn) return card;
  return (
    <>
      {/* body behind the card, cut at its top edge; then the card; then the arms over it */}
      {rise > 0.01 && <BuddySprite t={t} x={bx} y={by} size={S} pose={{ ...pose, only: 'body' }} style={{ clipPath: `inset(0 0 ${Math.max(0, S - edge)}px 0)` }} />}
      {card}
      {rise > 0.01 && <BuddySprite t={t} x={bx} y={by} size={S} pose={{ ...pose, only: 'arms' }} style={{ clipPath: `inset(0 0 ${Math.max(0, S - edge - hug * 0.95 * ppu)}px 0)` }} />}
      <Heart t={t - 1.5} x={bx + 0.9 * ppu} y={by - 2.0 * ppu} />
    </>
  );
};
