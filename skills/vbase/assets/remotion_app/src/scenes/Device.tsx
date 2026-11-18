// CSS-3D device frames. UI is real DOM inside a perspective stage, so text stays razor sharp
// at any zoom (a three.js texture would blur). Pose = how the device sits in space.
import React from 'react';
import { THEME } from '../lib/theme';

export type Pose = { x?: number; y?: number; s?: number; rx?: number; ry?: number; rz?: number; z?: number };

export const Stage: React.FC<{ children: React.ReactNode; perspective?: number }> = ({ children, perspective = 2200 }) => (
  <div style={{ position: 'absolute', inset: 0, perspective, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </div>
);

const poseTransform = (p: Pose) =>
  `translate3d(${p.x ?? 0}px, ${p.y ?? 0}px, ${p.z ?? 0}px) rotateX(${p.rx ?? 0}deg) rotateY(${p.ry ?? 0}deg) rotateZ(${p.rz ?? 0}deg) scale(${p.s ?? 1})`;

type Props = {
  kind: 'phone' | 'window' | 'laptop';
  pose: Pose;
  width: number;
  height: number;
  title?: string;
  url?: string;
  opacity?: number;
  children: React.ReactNode;
};

export const Device: React.FC<Props> = ({ kind, pose, width, height, title, url, opacity = 1, children }) => {
  // glare drifts against the tilt so the glass reads as a physical surface
  const glareX = 50 - (pose.ry ?? 0) * 2.5;
  const glare = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit',
      background: `linear-gradient(115deg, transparent ${glareX - 30}%, rgba(255,255,255,0.07) ${glareX}%, transparent ${glareX + 22}%)` }} />
  );

  if (kind === 'phone') {
    return (
      <div style={{ transform: poseTransform(pose), transformStyle: 'preserve-3d', opacity }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 72, transform: 'translateZ(-40px)', filter: 'blur(30px)',
          background: 'rgba(0,0,0,0.6)', top: 40 }} />
        <div style={{ width: width + 28, height: height + 28, borderRadius: 72, padding: 14, boxSizing: 'border-box',
          background: 'linear-gradient(145deg,#3a3a42,#121216 40%,#2a2a30)', boxShadow: THEME.shadow, position: 'relative' }}>
          <div style={{ width, height, borderRadius: 58, overflow: 'hidden', position: 'relative', background: THEME.bg }}>
            {children}
            <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', width: 120, height: 34,
              borderRadius: 20, background: '#000' }} />
            {glare}
          </div>
        </div>
      </div>
    );
  }

  const chrome = (
    <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px',
      borderBottom: `1px solid ${THEME.line}`, background: 'rgba(255,255,255,0.03)' }}>
      {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
        <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
      ))}
      {url ? (
        <div style={{ marginLeft: 18, flex: 1, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', padding: '0 16px', color: THEME.dim, fontSize: 20, fontFamily: THEME.font }}>
          {url}
        </div>
      ) : (
        <div style={{ flex: 1, textAlign: 'center', color: THEME.dim, fontSize: 34, fontWeight: 600, fontFamily: THEME.font, marginRight: 60 }}>
          {title}
        </div>
      )}
    </div>
  );
  const win = (
    <div style={{ width, height, borderRadius: 14, overflow: 'hidden', position: 'relative', background: THEME.panelSolid,
      border: `1px solid ${THEME.line}`, boxShadow: THEME.shadow, display: 'flex', flexDirection: 'column' }}>
      {chrome}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
  if (kind === 'window') {
    return <div style={{ transform: poseTransform(pose), transformStyle: 'preserve-3d', opacity }}>{win}</div>;
  }
  // laptop: the window becomes the screen, with a hinge + keyboard deck folding toward camera
  return (
    <div style={{ transform: poseTransform(pose), transformStyle: 'preserve-3d', opacity }}>
      <div style={{ padding: 18, borderRadius: 30, background: '#0d0d10', border: '2px solid #2b2b31' }}>{win}</div>
      <div style={{ width: width + 140, marginLeft: -52, height: 36, borderRadius: '0 0 30px 30px',
        background: 'linear-gradient(#3b3b42,#1c1c21)', transformOrigin: 'top', transform: 'rotateX(-70deg)' }} />
    </div>
  );
};

/** A fingertip touch: dot lands, presses (scale .82), ripple expands. t/at in seconds. */
export const Touch: React.FC<{ x: number; y: number; t: number; at: number }> = ({ x, y, t, at }) => {
  const d = t - at;
  if (d < -0.35 || d > 0.7) return null;
  const arrive = Math.min(1, Math.max(0, (d + 0.35) / 0.35));
  const press = d >= 0 && d < 0.15 ? 0.82 : 1;
  const ripple = d > 0 ? Math.min(1, d / 0.5) : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', width: 120, height: 120, left: -60, top: -60, borderRadius: 60,
        border: '3px solid rgba(255,255,255,0.8)', transform: `scale(${0.4 + ripple})`, opacity: (1 - ripple) * (d > 0 ? 1 : 0) }} />
      <div style={{ position: 'absolute', width: 56, height: 56, left: -28, top: -28, borderRadius: 28,
        background: 'rgba(255,255,255,0.85)', boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        transform: `scale(${press * arrive})`, opacity: d > 0.45 ? 1 - (d - 0.45) / 0.25 : arrive }} />
    </div>
  );
};
