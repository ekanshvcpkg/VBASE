import React from 'react';
import { PAPER, INK, THEME } from '../../lib/theme';
import { EASE, beatAt, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// Editorial comparison, set like a magazine table: serif headline, thin rules that draw in,
// check marks that stroke themselves on the spoken word, a highlighter sweep down the winning
// column. Flat and typographic — no tilted cards, bubbles or emoji.
// props: { title?, left: 'Other skills', right: 'vidbase', rows: [{label, left: bool, right?: bool}], palette?: 'paper'|'ink' }
// beats: 'row' × n, 'win'
const Check: React.FC<{ p: number; color: string; size?: number }> = ({ p, color, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="30" strokeDashoffset={30 * (1 - p)} />
  </svg>
);

export const Compare: React.FC<SceneProps> = ({ t, dur, props, beats, w, h, layout }) => {
  const P = props.palette === 'ink' ? INK : PAPER;
  const accent = props.accent ?? P.accent;
  const rows: any[] = props.rows ?? [];
  const n = Math.max(rows.length, 1);
  const starts = rows.map((_, i) => beatAt(beats, 'row', i, 0.5 + i * Math.min(0.55, (dur - 1.6) / n)));
  const winAt = beatAt(beats, 'win', 0, (starts[n - 1] ?? 0) + 0.45);
  const win = prog(t, winAt, 0.55, EASE.out);
  const pad = Math.round(w * 0.09);
  const colW = Math.round(w * 0.2);
  const rowH = Math.min(112, (h * 0.52) / n);
  const titleP = prog(t, 0.05, 0.6, EASE.out);
  const tableTop = Math.round(h * 0.38);

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: THEME.font, color: P.ink,
      // inside a split the panel is the surface; anywhere else, paint our own paper sheet
      ...(layout !== 'split' ? { background: P.bg, borderRadius: 14, boxShadow: THEME.shadow } : {}) }}>
      <div style={{ position: 'absolute', left: pad, right: pad, top: Math.round(h * 0.14) }}>
        <div style={{ fontSize: 32, color: P.sub, fontWeight: 500, opacity: titleP }}>{props.kicker ?? `${props.left ?? 'Others'} vs ${props.right ?? 'ours'}`}</div>
        <div style={{ fontFamily: THEME.serif, fontSize: Math.min(76, w * 0.09), lineHeight: 1.08, letterSpacing: '-0.02em', marginTop: 10,
          clipPath: `inset(0 0 ${(1 - titleP) * 100}% 0)`, transform: `translateY(${(1 - titleP) * 14}px)` }}>
          {props.title ?? 'What the others miss'}
        </div>
      </div>

      <div style={{ position: 'absolute', left: pad, right: pad, top: tableTop }}>
        {/* highlighter sweep behind the winning column */}
        <div style={{ position: 'absolute', right: 0, width: colW, top: -64, height: (64 + rowH * n) * win, background: P.highlight, borderRadius: 6 }} />
        <div style={{ display: 'flex', height: 56, alignItems: 'flex-end', paddingBottom: 12, fontSize: 32, position: 'relative' }}>
          <div style={{ flex: 1 }} />
          <div style={{ width: colW, textAlign: 'center', color: P.sub }}>{props.left ?? 'Others'}</div>
          <div style={{ width: colW, textAlign: 'center', fontWeight: 700, color: accent }}>{props.right ?? 'Ours'}</div>
        </div>
        {rows.map((r, i) => {
          const p = prog(t, starts[i], 0.45, EASE.out);
          const line = prog(t, starts[i] - 0.1, 0.6, EASE.out);
          const l = prog(t, starts[i] + 0.12, 0.35, EASE.out);
          const rr = prog(t, starts[i] + 0.24, 0.4, EASE.out);
          return (
            <div key={i} style={{ position: 'relative', height: rowH, display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: 1, width: `${line * 100}%`, background: P.rule }} />
              <div style={{ flex: 1, fontSize: Math.min(46, w * 0.056), fontWeight: 600, clipPath: `inset(${(1 - p) * 100}% 0 0 0)`,
                transform: `translateY(${(1 - p) * 10}px)` }}>{r.label}</div>
              <div style={{ width: colW, display: 'flex', justifyContent: 'center', opacity: l }}>
                {r.left ? <Check p={l} color={P.sub} /> : <div style={{ width: mix(l, 0, 26), height: 2, background: P.sub, opacity: 0.6 }} />}
              </div>
              <div style={{ width: colW, display: 'flex', justifyContent: 'center' }}>
                {r.right !== false ? <Check p={rr} color={accent} /> : <div style={{ width: 26, height: 2, background: P.sub }} />}
              </div>
            </div>
          );
        })}
        <div style={{ height: 1, width: `${prog(t, (starts[n - 1] ?? 0) + 0.2, 0.5, EASE.out) * 100}%`, background: P.rule }} />
      </div>
    </div>
  );
};
