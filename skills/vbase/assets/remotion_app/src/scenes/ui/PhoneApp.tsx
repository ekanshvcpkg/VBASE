import React from 'react';
import { THEME } from '../../lib/theme';
import { EASE, beatAt, drift, mix, prog } from '../../lib/motion';
import { Device, Stage, Touch } from '../Device';
import type { SceneProps } from '../types';

// A phone that pops up with an app actually running. Screens push in sequence.
// props: { app: {name, color?, icon?}, screens: Screen[] }
//   Screen kinds:
//     {kind:'upload', title, thumb_text?}          progress bar fills → "Posted"
//     {kind:'list', title, items:[{title, meta?}]} rows stagger in
//     {kind:'feed', items:[{title, meta?}]}        tall cards scroll
//     {kind:'success', title, subtitle?}           big tick
//     {kind:'form', title, fields:[label], button} fields fill, button gets tapped
// beats: 'screen' × n (when each screen pushes in), 'tap' (touch on the primary button)
type Screen = Record<string, any> & { kind: string };

const Header: React.FC<{ app: any; title?: string; accent: string }> = ({ app, title, accent }) => (
  <div style={{ padding: '70px 30px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ width: 52, height: 52, borderRadius: 14, background: app.color ?? accent, color: '#fff', fontSize: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{app.icon ?? (app.name ?? 'A')[0]}</div>
    <div>
      <div style={{ color: THEME.text, fontSize: 30, fontWeight: 750 }}>{title ?? app.name}</div>
      {title && <div style={{ color: THEME.dim, fontSize: 20 }}>{app.name}</div>}
    </div>
  </div>
);

const Body: React.FC<{ s: Screen; lt: number; app: any; accent: string }> = ({ s, lt, app, accent }) => {
  const color = app.color ?? accent;
  switch (s.kind) {
    case 'upload': {
      const p = prog(lt, 0.3, Math.max(1.2, s.seconds ?? 1.8), EASE.inOut);
      const done = p >= 1;
      return (
        <div style={{ padding: '10px 30px' }}>
          <div style={{ height: 520, borderRadius: 26, background: `linear-gradient(160deg, ${color}55, #1d1d24)`, position: 'relative',
            display: 'flex', alignItems: 'flex-end', padding: 24, color: '#fff', fontSize: 30, fontWeight: 700 }}>
            {s.thumb_text ?? '▶'}
          </div>
          <div style={{ color: THEME.text, fontSize: 28, fontWeight: 650, marginTop: 24 }}>{s.title}</div>
          <div style={{ marginTop: 22, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: done ? THEME.ok : color }} />
          </div>
          <div style={{ marginTop: 14, color: done ? THEME.ok : THEME.dim, fontSize: 24, fontWeight: 600 }}>
            {done ? '✓ Posted' : `Uploading… ${Math.round(p * 100)}%`}
          </div>
        </div>
      );
    }
    case 'success': {
      const p = prog(lt, 0.1, 0.5, EASE.outBack);
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <div style={{ width: 190, height: 190, borderRadius: 95, background: `${THEME.ok}22`, border: `4px solid ${THEME.ok}`,
            color: THEME.ok, fontSize: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${p})` }}>✓</div>
          <div style={{ color: THEME.text, fontSize: 38, fontWeight: 800, textAlign: 'center', padding: '0 30px' }}>{s.title}</div>
          {s.subtitle && <div style={{ color: THEME.dim, fontSize: 25, textAlign: 'center', padding: '0 40px' }}>{s.subtitle}</div>}
        </div>
      );
    }
    case 'feed': {
      const scroll = mix(prog(lt, 0.4, 2.4, EASE.inOut), 0, -380);
      return (
        <div style={{ padding: '0 24px', transform: `translateY(${scroll}px)` }}>
          {(s.items ?? []).map((it: any, i: number) => (
            <div key={i} style={{ height: 300, borderRadius: 24, marginBottom: 20, padding: 24, display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', background: `linear-gradient(160deg, ${i % 2 ? color + '44' : '#2a2a33'}, #18181e)` }}>
              <div style={{ color: THEME.text, fontSize: 27, fontWeight: 700 }}>{it.title}</div>
              {it.meta && <div style={{ color: THEME.dim, fontSize: 21, marginTop: 6 }}>{it.meta}</div>}
            </div>
          ))}
        </div>
      );
    }
    case 'form': {
      return (
        <div style={{ padding: '10px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {(s.fields ?? []).map((f: string, i: number) => {
            const p = prog(lt, 0.25 + i * 0.35, 0.3);
            return (
              <div key={i} style={{ borderRadius: 18, background: 'rgba(255,255,255,0.06)', padding: '18px 22px', fontSize: 25,
                color: p > 0.5 ? THEME.text : THEME.dim, border: `1px solid ${p > 0 && p < 1 ? color : THEME.line}` }}>{f}</div>
            );
          })}
          <div style={{ marginTop: 14, borderRadius: 20, background: color, color: '#fff', fontSize: 28, fontWeight: 750,
            textAlign: 'center', padding: '22px 0' }}>{s.button ?? 'Continue'}</div>
        </div>
      );
    }
    default: { // list
      return (
        <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(s.items ?? []).map((it: any, i: number) => {
            const p = prog(lt, 0.15 + i * 0.065, 0.45);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 20px', borderRadius: 20,
                background: 'rgba(255,255,255,0.05)', opacity: p, transform: `translateY(${(1 - p) * 18}px) scale(${mix(p, 0.98, 1)})` }}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: i === 0 ? color : 'rgba(255,255,255,0.1)' }} />
                <div>
                  <div style={{ color: THEME.text, fontSize: 26, fontWeight: 650 }}>{it.title}</div>
                  {it.meta && <div style={{ color: THEME.dim, fontSize: 20, marginTop: 3 }}>{it.meta}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
  }
};

export const PhoneApp: React.FC<SceneProps> = ({ t, dur, props, beats, accent, index }) => {
  const app = props.app ?? { name: 'App' };
  const screens: Screen[] = props.screens?.length ? props.screens : [{ kind: 'list', items: [] }];
  const starts = screens.map((_, i) => beatAt(beats, 'screen', i, (i * (dur - 0.4)) / screens.length));
  // phone rises from below with a tilt that settles — "pops up", then keeps drifting
  const rise = prog(t, 0, 0.7, EASE.outBack);
  const cam = prog(t, 0, dur, EASE.inOut);
  const dr = drift(t, 0.7);
  const side = index % 2 ? -1 : 1;
  const pose = { y: mix(rise, 500, 0) + dr.y, x: dr.x, rx: mix(rise, 35, 8) - cam * 4, ry: side * mix(cam, 18, 8) + dr.r, rz: side * mix(rise, -8, -2), s: mix(cam, 0.98, 1.03) };
  const tapAt = beatAt(beats, 'tap', 0, -10);

  return (
    <Stage perspective={1800}>
      <Device kind="phone" pose={pose} width={460} height={960}>
        <div style={{ position: 'absolute', inset: 0, fontFamily: THEME.font, background: '#101014' }}>
          {screens.map((s, i) => {
            const st = starts[i];
            const nx = starts[i + 1] ?? Infinity;
            if (t < st || t > nx + 0.4) return null;
            const pin = i === 0 ? 1 : prog(t, st, 0.36, EASE.out);
            const pout = prog(t, nx, 0.36, EASE.out);
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, background: '#101014',
                transform: `translateX(${(1 - pin) * 100 - pout * 30}%)`, filter: `brightness(${1 - pout * 0.65})` }}>
                <Header app={app} title={s.title && s.kind !== 'success' ? s.title : undefined} accent={accent} />
                <Body s={s} lt={t - st} app={app} accent={accent} />
              </div>
            );
          })}
          <Touch x={230} y={props.tap_y ?? 820} t={t} at={tapAt} />
        </div>
      </Device>
    </Stage>
  );
};
