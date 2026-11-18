import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// Frosted-glass chips that pop in as a group under a header pill; each chip "thinks" (•••) then
// resolves to its result on a beat. Layout `tracked`. props: { header, chips: [{label, glyph, tint, done}], pos? }
// beats: 'chip' × n (when each chip resolves)
export const GlassChips: React.FC<SceneProps> = ({ t, dur, props, beats, w, h }) => {
  const chips: { label: string; glyph: string; tint: string; done?: string }[] = props.chips ?? [];
  const at = (i: number) => beats.filter((b) => b.action === 'chip')[i]?.t ?? 0.6 + i * 0.5;
  const out = prog(t, dur - 0.35, 0.35, EASE.exit), right = (props.pos ?? 'right') === 'right';
  const W = Math.min(900, w * 0.47), cw = (W - 20) / 2;
  const glass = (tint: string) => ({ background: `linear-gradient(110deg, ${tint} 0%, rgba(255,255,255,0.82) 55%)`, backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)', border: '1.5px solid rgba(255,255,255,0.8)', boxShadow: '0 18px 40px -16px rgba(0,0,0,0.45)' });
  const hk = prog(t, 0, 0.45, EASE.outBack);
  return (
    <div style={{ position: 'absolute', [right ? 'right' : 'left']: w * 0.04, top: h * 0.4, width: W, fontFamily: THEME.font, opacity: 1 - out }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px 12px 14px', borderRadius: 999, ...glass('rgba(255,255,255,0.9)'),
          opacity: Math.min(1, hk * 1.4), transform: `scale(${mix(Math.min(hk, 1), 0.85, 1)})` }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: '#2F6BFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>✓</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#0E1014', letterSpacing: '-0.02em' }}>{props.header}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {chips.map((c, i) => {
          const k = prog(t, 0.2 + i * 0.09, 0.45, EASE.outBack), done = t >= at(i), dk = prog(t, at(i), 0.3, EASE.out);
          return (
            <div key={i} style={{ width: cw, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', borderRadius: 28, ...glass(c.tint),
              opacity: Math.min(1, k * 1.4), transform: `translateY(${(1 - k) * 30}px) scale(${mix(Math.min(k, 1), 0.88, 1)})` }}>
              <div style={{ width: 58, height: 58, borderRadius: 29, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 800, color: '#0E1014', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>{c.glyph}</div>
              <div style={{ flex: 1, fontSize: 34, fontWeight: 650, color: '#0E1014', letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>{c.label}</div>
              {done
                ? <div style={{ fontSize: 28, fontWeight: 700, color: '#1F9D55', whiteSpace: 'nowrap', opacity: dk, transform: `scale(${mix(dk, 0.6, 1)})` }}>✓ {c.done ?? 'local'}</div>
                : <div style={{ display: 'flex', gap: 7 }}>{[0, 1, 2].map((d) => <div key={d} style={{ width: 11, height: 11, borderRadius: 6, background: '#9AA0A6',
                    opacity: 0.35 + 0.65 * Math.max(0, Math.sin(t * 7 - d * 0.9)) }} />)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
