import React, { useLayoutEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// A real 3D object living in the speaker's hand: it drops into one palm (tracked by
// scripts/track_hands.py), follows that palm, flies in an arc when they throw, and is caught by
// the other palm. Layout must be "tracked": it renders inside the speaker layer, so push-ins and
// layout moves carry the object with the footage.
// Realism: a procedural pebbled basketball skin (colour + bump), lit like the room (soft warm
// window key from screen-left), gravity drop-in instead of a scale pop, shutter motion blur in
// flight, warm bounce light on the palm, and lens softness so CG matches webcam footage.
// props: { object: 'ball', color?, label?, sub?, track (written by track_hands.py) }
// beats: 'hold' {side}, 'throw' {side: destination}, 'label'

type P = [number, number, number] | null; // x, y (0..1), hand size (fraction of height)
type Track = { fps: number; left: P[]; right: P[] };

const at = (track: Track | undefined, side: 'left' | 'right', t: number): P => {
  const seq = track?.[side];
  if (!seq?.length) return null;
  const i = Math.round(t * track!.fps);
  for (let d = 0; d <= track!.fps * 0.6; d++) {     // nearest valid sample within 0.6 s
    for (const j of [i - d, i + d]) if (seq[j]) return seq[j];
  }
  return null;
};
const firstFrom = (track: Track | undefined, side: 'left' | 'right', t: number, limit: number) => {
  const seq = track?.[side] ?? [];
  for (let i = Math.ceil(t * (track?.fps ?? 30)); i < seq.length; i++) {
    if (i / track!.fps > limit) break;
    if (seq[i]) return i / track!.fps;
  }
  return limit;
};

const LocalEnvironment: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.82;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
};

// ---- procedural basketball skin (deterministic: same pixels on every render tab) ----
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const TW = 2048, TH = 1024;
// seams: equator, one meridian great circle, and two "C" curves (small circles centred on the
// equator at ±90° longitude) — sampled on the sphere, projected to equirect UV
const seamPaths = (): [number, number][][] => {
  const paths: [number, number][][] = [];
  const toUV = (v: THREE.Vector3): [number, number] => {
    const lon = Math.atan2(v.z, v.x), lat = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1));
    return [((lon / (2 * Math.PI)) + 0.5) * TW, (0.5 - lat / Math.PI) * TH];
  };
  const circle = (center: THREE.Vector3, radius: number) => {
    const c = center.clone().normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(c).normalize();
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    const v = c.clone().cross(u).normalize();
    const pts: [number, number][] = [];
    for (let i = 0; i <= 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      const p = c.clone().multiplyScalar(Math.cos(radius))
        .add(u.clone().multiplyScalar(Math.sin(radius) * Math.cos(a)))
        .add(v.clone().multiplyScalar(Math.sin(radius) * Math.sin(a)));
      pts.push(toUV(p));
    }
    return pts;
  };
  paths.push(circle(new THREE.Vector3(0, 1, 0), Math.PI / 2));   // equator
  paths.push(circle(new THREE.Vector3(0, 0, 1), Math.PI / 2));   // meridian through the poles
  paths.push(circle(new THREE.Vector3(1, 0, 0), 0.92));          // the two curved panels
  paths.push(circle(new THREE.Vector3(-1, 0, 0), 0.92));
  return paths;
};
const strokeWrapped = (g: CanvasRenderingContext2D, pts: [number, number][]) => {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0 || Math.abs(x - pts[i - 1][0]) > TW / 2) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
};
const makeBallMaps = (base: string) => {
  const r = rng(1337);
  const color = document.createElement('canvas'); color.width = TW; color.height = TH;
  const bump = document.createElement('canvas'); bump.width = TW; bump.height = TH;
  const c = color.getContext('2d')!, b = bump.getContext('2d')!;
  c.fillStyle = base; c.fillRect(0, 0, TW, TH);
  // large-scale tonal variation (real leather is never one flat colour)
  for (let i = 0; i < 90; i++) {
    const x = r() * TW, y = r() * TH, rad = 80 + r() * 260;
    const gr = c.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    gr.addColorStop(0, dark ? 'rgba(70,25,5,0.10)' : 'rgba(255,190,140,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  b.fillStyle = '#6a6a6a'; b.fillRect(0, 0, TW, TH);
  // pebbles: thousands of tiny raised bumps
  for (let i = 0; i < 70000; i++) {
    const x = r() * TW, y = r() * TH, rad = 1.6 + r() * 1.8;
    b.fillStyle = `rgba(230,230,230,${0.55 + r() * 0.4})`; b.beginPath(); b.arc(x, y, rad, 0, Math.PI * 2); b.fill();
    if (i % 3 === 0) { c.fillStyle = `rgba(255,200,160,${0.05 + r() * 0.06})`; c.beginPath(); c.arc(x - 0.6, y - 0.6, rad * 0.7, 0, Math.PI * 2); c.fill(); }
  }
  // seams: dark rubber channels, recessed in the bump map
  const paths = seamPaths();
  c.lineCap = b.lineCap = 'round';
  c.strokeStyle = '#140d0a'; c.lineWidth = 19; paths.forEach((p) => strokeWrapped(c, p));
  b.strokeStyle = '#141414'; b.lineWidth = 26; paths.forEach((p) => strokeWrapped(b, p));
  b.strokeStyle = '#3a3a3a'; b.lineWidth = 30; b.globalAlpha = 0.5; paths.forEach((p) => strokeWrapped(b, p)); b.globalAlpha = 1;
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bump);
  return { map, bumpMap };
};

const Ball: React.FC<{ maps: ReturnType<typeof makeBallMaps>; opacity?: number }> = ({ maps, opacity = 1 }) => (
  <mesh>
    <sphereGeometry args={[1, 128, 128]} />
    <meshPhysicalMaterial map={maps.map} bumpMap={maps.bumpMap} bumpScale={2.2} roughness={0.68} metalness={0}
      clearcoat={0.05} clearcoatRoughness={0.7} envMapIntensity={0.28}
      transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
  </mesh>
);

const FOV = 30, CAM_Z = 10;
const GRAV_DROP = 0.42; // seconds the ball falls into the palm

export const HeldObject: React.FC<SceneProps> = ({ t, dur, props, beats, accent, w, h }) => {
  const track: Track | undefined = props.track;
  const b = (a: string) => beats.find((x) => x.action === a);
  const hold = b('hold'), thr = b('throw'), lab = b('label');
  const fromSide = ((hold?.side as string) ?? 'left') as 'left' | 'right';
  const toSide = ((thr?.side as string) ?? (fromSide === 'left' ? 'right' : 'left')) as 'left' | 'right';
  const holdT = hold?.t ?? 0.4;
  const throwT = thr?.t ?? Infinity;
  // land when the catching hand is visible again (≥0.35 s of flight, ≤1.4 s)
  const landT = Number.isFinite(throwT) ? firstFrom(track, toSide, throwT + 0.35, throwT + 1.4) : Infinity;
  const base = props.color ?? '#B4470E';
  const maps = useMemo(() => makeBallMaps(base), [base]);

  // --- position of the ball centre at any time (normalised x, y, hand size) ---
  const posAt = (tt: number): P => {
    if (tt < throwT) {
      const p = at(track, fromSide, tt);
      if (!p) return null;
      const fall = (holdT - tt) / GRAV_DROP;              // >0 while still falling
      return fall > 0 ? [p[0], p[1] - 0.45 * fall * fall, p[2]] : p;
    }
    if (tt < landT) {
      const a = at(track, fromSide, throwT), z = at(track, toSide, landT);
      if (!a || !z) return null;
      const p = (tt - throwT) / (landT - throwT);
      // ballistic: linear in x, parabolic in y (a real throw, not an eased UI curve)
      return [mix(p, a[0], z[0]), mix(p, a[1], z[1]) - 0.36 * 4 * p * (1 - p), mix(p, a[2], z[2])];
    }
    return at(track, toSide, tt);
  };
  if (t < holdT - GRAV_DROP) return null;
  const pos = posAt(t);
  if (!pos) return null;
  const flying = t >= throwT && t < landT;
  const falling = t < holdT;
  // impact squash on the drop-in and on the catch
  const impact = (t0: number) => { const k = t - t0; return k >= 0 && k < 0.2 ? Math.sin((k / 0.2) * Math.PI) * Math.exp(-k * 8) : 0; };
  const squash = 1 - 0.16 * impact(holdT) - 0.2 * impact(landT);
  const spin = flying ? (t - throwT) * 11 : falling ? (t - holdT) * 3 : t * 0.25;
  const leave = 1 - prog(t, dur - 0.06, 0.06, EASE.exit); // the next cut takes it away; only a 2-frame softening

  // pixels → world units on the z=0 plane
  const halfH = CAM_Z * Math.tan((FOV / 2) * Math.PI / 180), halfW = halfH * (w / h);
  const toWorld = (p: [number, number, number]) => {
    const rPx = Math.max(38, p[2] * h * 0.5);
    const yLift = rPx * 0.12 / h;   // sits down in the palm, not on the fingertips
    return { X: (p[0] - 0.5) * 2 * halfW, Y: (0.5 - (p[1] - yLift)) * 2 * halfH, R: (rPx / h) * 2 * halfH, rPx, yLift };
  };
  const cur = toWorld(pos);
  // shutter motion blur: ghost copies along the path within ~half a frame (180° shutter)
  const ghosts: { X: number; Y: number; o: number }[] = [];
  if (flying || falling) {
    const N = 6;
    for (let k = 1; k <= N; k++) {
      const pp = posAt(t - (k / N) * (0.5 / 30) * 1.6);
      if (pp) { const g = toWorld(pp); ghosts.push({ X: g.X, Y: g.Y, o: 0.42 * (1 - k / (N + 1)) }); }
    }
  }
  const px = pos[0] * w, py = (pos[1] - cur.yLift) * h, rPx = cur.rPx;
  const onPalm = !flying && !falling;
  const palmP = onPalm ? prog(t, t < landT ? holdT : landT, 0.15, EASE.out) : 0;
  const labelP = lab ? prog(t, lab.t, 0.45, EASE.enter) * leave : 0;
  const labelLeft = pos[0] > 0.62; // keep the label inside the frame

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: leave }}>
      {/* the palm under the ball: a soft occlusion shadow and warm bounce light off the leather */}
      {palmP > 0 && (
        <>
          <div style={{ position: 'absolute', left: px - rPx * 1.0, top: py + rPx * 0.45, width: rPx * 2.0, height: rPx * 0.8, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(25,12,6,0.55) 0%, rgba(25,12,6,0.18) 45%, rgba(25,12,6,0) 72%)', opacity: palmP,
            mixBlendMode: 'multiply', filter: 'blur(5px)' }} />
          <div style={{ position: 'absolute', left: px - rPx * 1.6, top: py - rPx * 0.2, width: rPx * 3.2, height: rPx * 2.2, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,120,50,0.22) 0%, rgba(255,120,50,0) 65%)', opacity: palmP, mixBlendMode: 'screen' }} />
        </>
      )}
      <ThreeCanvas width={w} height={h} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        // webcam lens: a touch soft, a touch less saturated than raw CG
        style={{ position: 'absolute', left: 0, top: 0, backgroundColor: 'transparent', filter: 'blur(0.55px) saturate(0.88) contrast(0.96)' }}
        camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 100 }}>
        {/* lit like the room: soft warm window key from screen-left, dim cool fill, faint rim */}
        <hemisphereLight args={['#fff1e0', '#2a1d16', 0.18]} />
        <directionalLight position={[-7, 3.5, 3]} intensity={2.4} color="#ffe6cc" />
        <directionalLight position={[6, -2, 3]} intensity={0.25} color="#c3d5ff" />
        <directionalLight position={[2, 4, -6]} intensity={0.9} color="#ffffff" />
        <LocalEnvironment />
        {ghosts.map((g, i) => (
          <group key={i} position={[g.X, g.Y, -0.01 * (i + 1)]}>
            <group scale={cur.R}><group rotation={[0.35, spin - (i + 1) * 0.04, 0.2]}><Ball maps={maps} opacity={g.o} /></group></group>
          </group>
        ))}
        <group position={[cur.X, cur.Y, 0]}>
          <group scale={[cur.R / Math.sqrt(squash), cur.R * squash, cur.R / Math.sqrt(squash)]}>
            <group rotation={[0.35, spin, 0.2]}><Ball maps={maps} /></group>
          </group>
        </group>
      </ThreeCanvas>
      {props.label && labelP > 0 && (() => {
        // editorial callout: a hairline leader from the object, then type — no pill, no glow
        const dir = labelLeft ? -1 : 1;
        const x0 = px + dir * rPx * 0.85, y0 = py - rPx * 0.6;
        const x1 = x0 + dir * 70, y1 = y0 - 70, x2 = x1 + dir * 60 * labelP;
        return (
          <>
            <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={w} height={h}>
              <polyline points={`${x0},${y0} ${x0 + (x1 - x0) * Math.min(1, labelP * 2)},${y0 + (y1 - y0) * Math.min(1, labelP * 2)} ${labelP > 0.5 ? `${x2},${y1}` : ''}`}
                fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
              <circle cx={x0} cy={y0} r="4" fill="#fff" />
            </svg>
            <div style={{ position: 'absolute', top: y1 - 96, left: labelLeft ? undefined : x2 + 14, right: labelLeft ? w - x2 + 14 : undefined,
              textAlign: labelLeft ? 'right' : 'left', fontFamily: THEME.font, opacity: Math.max(0, labelP * 2 - 1),
              background: 'rgba(10,10,12,0.74)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 18px 12px' }}>
              <div style={{ color: '#fff', fontSize: 46, fontWeight: 600, letterSpacing: '-0.015em' }}>{props.label}</div>
              {props.sub && <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 34, fontWeight: 400, marginTop: 2 }}>{props.sub}</div>}
            </div>
          </>
        );
      })()}
    </div>
  );
};
