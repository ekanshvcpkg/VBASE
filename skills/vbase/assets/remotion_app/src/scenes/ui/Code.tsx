import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, drift, mix, prog } from '../../lib/motion';
import { Device, Stage } from '../Device';
import type { SceneProps } from '../types';

// A code editor writing a file line by line (e.g. "I wrote the skill" → SKILL.md appearing).
// props: { filename, lines: string[], tabs?: string[], badge?: string }   badge: corner chip, e.g. "built in 1 day"
const color = (ln: string, accent: string) => {
  if (/^\s*#/.test(ln)) return accent;                 // markdown heading / comment
  if (/^\s*[\w-]+:/.test(ln)) return THEME.info;       // yaml key
  if (/^\s*(---|```)/.test(ln)) return THEME.dim;
  if (/^\s*(import|export|const|def|function|return)\b/.test(ln)) return '#C084FC';
  return THEME.text;
};

export const Code: React.FC<SceneProps> = ({ t, dur, props, accent, index, w, h }) => {
  const lines: string[] = props.lines ?? [];
  const per = Math.min(0.32, (dur - 1.0) / Math.max(lines.length, 1));
  const cam = prog(t, 0, dur, EASE.inOut);
  const dr = drift(t, 0.6);
  const side = index % 2 ? 1 : -1;
  const pose = { s: mix(cam, 1.0, 1.045) }; // flat + one push; see references/visual_direction.md
  const tabs: string[] = props.tabs ?? [props.filename ?? 'untitled'];
  const badgeP = props.badge ? prog(t, dur * 0.45, 0.5, EASE.out) : 0;

  return (
    <Stage>
      <div style={{ position: 'relative', transformStyle: 'preserve-3d' }}>
        <Device kind="window" pose={pose} width={Math.round(w * 0.86)} height={Math.round(h * 0.78)} title={props.filename}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${THEME.line}` }}>
            {tabs.map((tb, i) => (
              <div key={tb} style={{ padding: '12px 22px', fontFamily: THEME.font, fontSize: 20, color: i === 0 ? THEME.text : THEME.dim,
                borderBottom: i === 0 ? `2px solid ${accent}` : 'none' }}>{tb}</div>
            ))}
          </div>
          <div style={{ padding: '18px 0', fontFamily: THEME.mono, fontSize: 23, lineHeight: 1.6 }}>
            {lines.map((ln, i) => {
              const s0 = 0.3 + i * per;
              if (t < s0) return null;
              const p = prog(t, s0, 0.22);
              const chars = Math.floor(ln.length * prog(t, s0, per * 0.9, EASE.out));
              return (
                <div key={i} style={{ display: 'flex', opacity: p }}>
                  <span style={{ width: 64, textAlign: 'right', paddingRight: 22, color: 'rgba(255,255,255,0.25)' }}>{i + 1}</span>
                  <span style={{ color: color(ln, accent), whiteSpace: 'pre-wrap', paddingRight: 20 }}>{ln.slice(0, chars)}</span>
                </div>
              );
            })}
          </div>
        </Device>
        {props.badge && badgeP > 0 && (
          // a quiet editorial label, not a rotated sticker
          <div style={{ position: 'absolute', right: 0, top: -54, opacity: badgeP, transform: `translateY(${(1 - badgeP) * 8}px)`,
            fontFamily: THEME.font, fontSize: 24, fontWeight: 600, color: THEME.text, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: accent }} />{props.badge}
          </div>
        )}
      </div>
    </Stage>
  );
};
