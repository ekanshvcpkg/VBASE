import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, beatAt, drift, mix, prog } from '../../lib/motion';
import { Stage } from '../Device';
import type { SceneProps } from '../types';

// A workflow / pipeline laid on a tilted 3D plane. Nodes light up in order, a pulse travels
// along each connector, and the camera tracks the active node.
// props: { title?, nodes: [{label, icon?, sub?}], vertical?: boolean }
// beats: 'step' × n (node i activates)
export const Flow: React.FC<SceneProps> = ({ t, dur, props, beats, accent, index, vertical: portrait, w, h }) => {
  const nodes: any[] = props.nodes ?? [];
  const n = Math.max(nodes.length, 1);
  const vertical = props.vertical ?? portrait;
  // nodes share the available axis; cards shrink when space is tight so nothing overflows
  const axis = (vertical ? h : w) * 0.88 - (props.title ? 90 : 0);
  const gap = Math.min(vertical ? 230 : 300, axis / n);
  const nodeScale = Math.min(1, gap / (vertical ? 210 : 230));
  const fits = gap * n <= axis + 1;
  const starts = nodes.map((_, i) => beatAt(beats, 'step', i, 0.35 + (i * (dur - 1.2)) / n));
  let active = -1;
  starts.forEach((s, i) => { if (t >= s) active = i; });
  // camera follows the active node
  const followTo = active < 0 ? 0 : active;
  const prevStart = starts[Math.max(0, active)] ?? 0;
  const follow = mix(prog(t, prevStart, 0.6, EASE.inOut), Math.max(0, followTo - 1), followTo);
  const offset = fits ? 0 : (follow - (n - 1) / 2) * gap; // camera only travels when the chain is longer than the frame
  const dr = drift(t, 0.6);
  const side = index % 2 ? 1 : -1;
  const plane = vertical
    ? `translateY(${-offset}px)`   // flat: a diagram on a page, not a tilted 3D plane
    : `translateX(${-offset}px)`;
  const enter = prog(t, 0, 0.6, EASE.out);

  return (
    <Stage perspective={1600}>
      {props.title && (
        <div style={{ position: 'absolute', top: 40, width: '100%', textAlign: 'center', fontFamily: THEME.font, fontSize: 58,
          fontWeight: 800, color: '#1A1916', letterSpacing: '-0.02em', opacity: enter }}>{props.title}</div>
      )}
      <div style={{ transform: `${plane} scale(${mix(enter, 0.9, 1)})`, transformStyle: 'preserve-3d', position: 'relative',
        width: vertical ? 420 : gap * n, height: vertical ? gap * n : 300, marginTop: props.title ? 90 : 0 }}>
        {nodes.map((nd, i) => {
          const on = i <= active;
          const p = prog(t, starts[i], 0.45, EASE.outBack);
          const x = vertical ? 210 : gap * i + gap / 2;
          const y = vertical ? gap * i + gap / 2 : 150;
          const link = i < n - 1 ? prog(t, starts[i] + 0.15, Math.max(0.3, (starts[i + 1] ?? dur) - starts[i] - 0.2), EASE.inOut) : 0;
          return (
            <React.Fragment key={i}>
              {i < n - 1 && (
                <div style={{ position: 'absolute', left: x, top: y, width: vertical ? 6 : gap, height: vertical ? gap : 6,
                  transform: vertical ? 'translateX(-3px)' : 'translateY(-3px)', background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                  <div style={{ width: vertical ? '100%' : `${link * 100}%`, height: vertical ? `${link * 100}%` : '100%',
                    background: `linear-gradient(${vertical ? '180deg' : '90deg'}, ${accent}00, ${accent})`, borderRadius: 3 }} />
                </div>
              )}
              <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) translateZ(${on ? mix(p, 0, 40) : 0}px)`,
                transformStyle: 'preserve-3d' }}>
                <div style={{ width: 200, padding: '26px 18px', borderRadius: 28, textAlign: 'center', fontFamily: THEME.font,
                  background: on ? THEME.panelSolid : 'rgba(22,22,28,0.6)', border: `2px solid ${on ? accent : THEME.line}`,
                  boxShadow: on ? `0 30px 60px rgba(0,0,0,.55), 0 0 40px ${accent}33` : 'none',
                  transform: `scale(${nodeScale * (on ? mix(p, 0.85, 1) : 0.92)})`, opacity: on ? 1 : 0.55 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: on ? accent : THEME.dim, fontFamily: THEME.mono }}>{nd.icon ?? String(i + 1).padStart(2, '0')}</div>
                  <div style={{ marginTop: 10, fontSize: 50, fontWeight: 750, color: THEME.text }}>{nd.label}</div>
                  {nd.sub && <div style={{ marginTop: 4, fontSize: 30, color: on ? accent : THEME.dim, whiteSpace: 'nowrap' }}>{nd.sub}</div>}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Stage>
  );
};
