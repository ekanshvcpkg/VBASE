import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, drift, prog } from '../../lib/motion';
import { Stage } from '../Device';
import type { SceneProps } from '../types';

// A number that counts up (cubic ease-out over 0.9 s) with a label — for any metric / result.
// props: { value: number, prefix?, suffix?, label, decimals? }
export const Stat: React.FC<SceneProps> = ({ t, props, accent }) => {
  const v = Number(props.value ?? 0);
  const p = prog(t, 0.15, 0.9, (x) => 1 - Math.pow(1 - x, 3));
  const enter = prog(t, 0, 0.5, EASE.out);
  const dr = drift(t, 0.5);
  const shown = (v * p).toFixed(props.decimals ?? (Number.isInteger(v) ? 0 : 1));
  return (
    <Stage>
      <div style={{ transform: `translateY(${(1 - enter) * 24}px)`, opacity: Math.min(1, enter * 1.4), textAlign: 'center',
        fontFamily: THEME.font, background: THEME.panel, border: `1px solid ${THEME.line}`, borderRadius: 40, padding: '50px 80px',
        boxShadow: THEME.shadow }}>
        <div style={{ fontSize: 190, fontWeight: 850, color: THEME.text, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {props.prefix}{shown}<span style={{ color: accent }}>{props.suffix}</span>
        </div>
        <div style={{ fontSize: 40, color: THEME.dim, marginTop: 18, fontWeight: 600 }}>{props.label}</div>
      </div>
    </Stage>
  );
};
