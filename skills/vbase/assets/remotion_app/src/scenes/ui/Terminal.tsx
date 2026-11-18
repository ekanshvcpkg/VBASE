import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, beatAt, drift, mix, prog, typed } from '../../lib/motion';
import { Device, Stage } from '../Device';
import type { SceneProps } from '../types';

type Line = { kind?: 'cmd' | 'out' | 'ok' | 'step' | 'dim'; text: string };
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

// A terminal / CLI-agent session: commands type out, steps spin then tick, output streams.
// props: { title?, device?: 'window'|'laptop', prompt?: '>' , lines: Line[] }
// beats: { action: 'line' } × n  → when each line starts (else spread evenly)
export const Terminal: React.FC<SceneProps> = ({ t, dur, props, beats, accent, w, h }) => {
  const lines: Line[] = props.lines ?? [];
  const n = Math.max(lines.length, 1);
  const spacing = Math.min(0.9, (dur - 1.0) / n);
  const starts = lines.map((_, i) => beatAt(beats, 'line', i, 0.4 + i * spacing));
  const cam = prog(t, 0, dur, EASE.inOut);
  const dr = drift(t, 0.6);
  // flat and locked; one slow decisive push — never a tilted, wobbling window
  const pose = { s: mix(cam, 1.0, 1.045) };

  return (
    <Stage>
      <Device kind={props.device ?? 'window'} pose={pose} width={Math.round(w * 0.88)} height={Math.round(h * 0.78)} title={props.title ?? 'Terminal'}>
        <div style={{ padding: '26px 30px', fontFamily: THEME.mono, fontSize: 56, lineHeight: 1.45, color: THEME.text }}>
          {lines.map((ln, i) => {
            const s0 = starts[i];
            if (t < s0) return null;
            const appear = prog(t, s0, 0.25, EASE.enter);
            const kind = ln.kind ?? 'out';
            const next = starts[i + 1] ?? s0 + 0.9;
            let body: React.ReactNode = ln.text;
            let lead: React.ReactNode = null;
            let color = THEME.text;
            if (kind === 'cmd') {
              const txt = typed(ln.text, t, s0, 36);
              const caret = txt.length < ln.text.length || Math.floor(t * 2.4) % 2 === 0;
              lead = <span style={{ color: accent }}>{props.prompt ?? '>'} </span>;
              body = (<>{txt}{caret && <span style={{ background: THEME.text, color: 'transparent' }}>_</span>}</>);
            } else if (kind === 'step') {
              const done = t >= next - 0.05;
              lead = done ? <span style={{ color: THEME.ok }}>✓ </span>
                : <span style={{ color: accent }}>{SPIN[Math.floor(t * 14) % SPIN.length]} </span>;
              color = done ? THEME.text : THEME.dim;
            } else if (kind === 'ok') {
              lead = <span style={{ color: THEME.ok }}>✓ </span>;
              color = THEME.ok;
            } else if (kind === 'dim') {
              color = THEME.dim;
            }
            return (
              <div key={i} style={{ opacity: appear, transform: `translateY(${(1 - appear) * 12}px)`, color, whiteSpace: 'pre-wrap' }}>
                {lead}{body}
              </div>
            );
          })}
        </div>
      </Device>
    </Stage>
  );
};
