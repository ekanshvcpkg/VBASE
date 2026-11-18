import React, { useLayoutEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// An original copper voxel character floating in a dark, starry card: pops in, sways, bobs,
// blinks, steps its legs. Layout `tracked` (full frame); the card sits to one side of the speaker.
// props: { eyebrow?, pos?: 'right'|'left', color? }
const LocalEnvironment: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
};

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; m: React.ReactNode }> = ({ p, s, m }) => (
  <mesh position={p}><boxGeometry args={s} />{m}</mesh>
);

const Critter: React.FC<{ t: number; color: string; run?: number }> = ({ t, color, run = 0 }) => {
  const body = <meshPhysicalMaterial color={color} metalness={0.45} roughness={0.32} clearcoat={0.5} clearcoatRoughness={0.25} envMapIntensity={1.2} />;
  const eye = <meshStandardMaterial color="#FFF1DC" emissive="#FFD8A8" emissiveIntensity={2.2} />;
  const blink = (t % 2.6) > 2.45 ? 0.15 : 1;                 // a quick blink every ~2.6 s
  const step = (i: number) => (run ? 0.34 : 0.18) * Math.max(0, Math.sin(t * (run ? 17 : 9) + i * Math.PI));   // legs lift in turn
  return (
    <group rotation={run ? [0.12, -run * 0.75, -run * 0.12] : [0.18 + Math.sin(t * 1.3) * 0.05, Math.sin(t * 1.1) * 0.55, Math.sin(t * 0.9) * 0.04]}
      position={[0, run ? Math.abs(Math.sin(t * 8.5)) * 0.35 : Math.sin(t * 2.2) * 0.12, 0]}>
      <Box p={[0, 0.25, 0]} s={[3.2, 2.1, 1.3]} m={body} />                       {/* body */}
      <Box p={[-2.0, 0.05, 0]} s={[0.8, 0.7, 0.9]} m={body} />                    {/* arms */}
      <Box p={[2.0, 0.05, 0]} s={[0.8, 0.7, 0.9]} m={body} />
      <Box p={[0, 1.55, 0]} s={[0.25, 0.5, 0.25]} m={body} />                     {/* antenna */}
      <mesh position={[0, 1.9, 0]}><sphereGeometry args={[0.2, 24, 24]} />{eye}</mesh>
      <group scale={[1, blink, 1]} position={[0, 0.55, 0.66]}>
        <Box p={[-0.7, 0, 0]} s={[0.3, 0.62, 0.05]} m={eye} />                    {/* eyes */}
        <Box p={[0.7, 0, 0]} s={[0.3, 0.62, 0.05]} m={eye} />
      </group>
      {[-1.15, -0.4, 0.4, 1.15].map((x, i) => (
        <Box key={i} p={[x, -1.15 + step(i), 0]} s={[0.36, 0.75, 0.6]} m={body} />   // legs
      ))}
    </group>
  );
};

const Runner: React.FC<SceneProps> = ({ t, dur, props, w, h }) => {
  // the character runs across the room at wall height (it passes behind the speaker: see person.webm)
  const W = Math.round(w), H = Math.round(h), FOV = 30, Z = 10;
  const halfH = Z * Math.tan((FOV / 2) * Math.PI / 180), halfW = halfH * (W / H);
  const dir = props.from === 'right' ? -1 : 1;
  const k = Math.min(1, t / dur), ease = k < 0.12 ? 0.5 * k * k / 0.12 : k - 0.06;   // a quick start, then a steady run
  const X = dir * mix(ease / 0.94, -halfW - 1.6, halfW + 1.6), Y = props.y ?? 0.75;
  const sx = (X / halfW * 0.5 + 0.5) * W, sy = (0.5 - Y / (2 * halfH)) * H;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ThreeCanvas width={W} height={H} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'transparent' }} camera={{ fov: FOV, position: [0, 0, Z], near: 0.1, far: 100 }}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[-6, 4, 5]} intensity={2.0} color="#FFE6CC" />
        <directionalLight position={[5, -1, 3]} intensity={0.5} color="#C3D5FF" />
        <pointLight position={[X, Y + 1.2, 2.5]} intensity={6} distance={6} color="#FFB37A" />
        <LocalEnvironment />
        <group position={[X, Y, 0]} scale={0.42}><Critter t={t} color={props.color ?? '#C8693E'} run={dir} /></group>
      </ThreeCanvas>
      {props.eyebrow && (
        <div style={{ position: 'absolute', left: sx, top: sy - h * 0.2, transform: 'translateX(-50%)', padding: '8px 18px', borderRadius: 999,
          background: 'rgba(10,10,12,0.78)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontFamily: THEME.font, fontSize: 30,
          fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{props.eyebrow}</div>
      )}
    </div>
  );
};

export const Mascot3D: React.FC<SceneProps> = (sp) => (sp.props?.mode ?? 'run') === 'run' ? <Runner {...sp} /> : <MascotCard {...sp} />;
const MascotCard: React.FC<SceneProps> = ({ t, dur, props, w, h }) => {
  const inn = prog(t, 0, 0.55, EASE.outBack), out = prog(t, dur - 0.35, 0.35, EASE.exit);
  const right = (props.pos ?? 'right') === 'right';
  const S = Math.round(Math.min(560, w * 0.29)), H2 = Math.round(S * 1.08);   // ThreeCanvas needs whole pixels
  // a seeded star field, drawn once
  const stars = useMemo(() => {
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: 90 }, () => ({ x: r() * 100, y: r() * 100, z: 0.4 + r() * 1.6, o: 0.25 + r() * 0.6 }));
  }, []);
  return (
    <div style={{ position: 'absolute', [right ? 'right' : 'left']: w * 0.05, top: h * 0.12, width: S, height: H2, borderRadius: 40, overflow: 'hidden',
      background: 'radial-gradient(120% 90% at 50% 40%, #0E1220 0%, #04050A 70%)', border: '3px solid rgba(255,255,255,0.78)',
      boxShadow: '0 30px 80px -24px rgba(0,0,0,0.7)', opacity: Math.min(1, inn * 1.4) * (1 - out),
      transform: `translateY(${(1 - inn) * 40}px) scale(${mix(Math.min(inn, 1), 0.82, 1) * (1 - out * 0.05)}) rotate(${(1 - Math.min(inn, 1)) * (right ? 4 : -4)}deg)`,
      transformOrigin: right ? '80% 70%' : '20% 70%' }}>
      {stars.map((st, i) => (
        <div key={i} style={{ position: 'absolute', left: `${st.x}%`, top: `${st.y}%`, width: st.z, height: st.z, borderRadius: 2, background: '#fff',
          opacity: st.o * (0.6 + 0.4 * Math.sin(t * 2 + i)) }} />
      ))}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ThreeCanvas width={S} height={H2} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
          style={{ backgroundColor: 'transparent' }} camera={{ fov: 34, position: [0, 0.2, 9.5], near: 0.1, far: 100 }}>
          <ambientLight intensity={0.35} />
          <pointLight position={[0, 1.2, 3.2]} intensity={14} distance={9} color="#FFB37A" />
          <directionalLight position={[3, 4, 5]} intensity={1.6} color="#FFE6CC" />
          <directionalLight position={[-4, -1, 2]} intensity={0.6} color="#8FB5FF" />
          <LocalEnvironment />
          <group scale={mix(Math.min(inn, 1), 0.6, 1)}><Critter t={t} color={props.color ?? '#C8693E'} /></group>
        </ThreeCanvas>
      </div>
      {props.eyebrow && (
        <div style={{ position: 'absolute', left: 26, top: 24, padding: '10px 22px', borderRadius: 999, background: 'rgba(14,20,40,0.9)',
          border: '1.5px solid rgba(140,160,255,0.35)', color: '#fff', fontFamily: THEME.font, fontSize: 28, fontWeight: 700, letterSpacing: '0.1em' }}>{props.eyebrow}</div>
      )}
    </div>
  );
};
