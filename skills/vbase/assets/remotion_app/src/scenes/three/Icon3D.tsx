import React, { useLayoutEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THEME } from '../../lib/theme';
import { EASE, mix, prog } from '../../lib/motion';
import type { SceneProps } from '../types';

// Real WebGL: an extruded, clear-coated 3D icon that flies in spinning, lands with a little
// overshoot, then idles with a slow turn while sparks orbit. Use it for the "payoff" object
// of a sentence: a star for "give it a star", a check for "done", a bolt for "fast"...
// props: { icon: 'star'|'check'|'heart'|'play'|'bolt', label?, sub?, color? }
// beats: 'land' (when the icon should land; default 0.7 s)

const S = 1;
const SHAPES: Record<string, () => THREE.Shape> = {
  star: () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 * S : 1.05 * S;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return s;
  },
  check: () => {
    const s = new THREE.Shape();
    s.moveTo(-0.95, 0.05); s.lineTo(-0.6, 0.4); s.lineTo(-0.25, 0.05); s.lineTo(0.62, 0.92); s.lineTo(0.97, 0.57); s.lineTo(-0.25, -0.65);
    return s;
  },
  heart: () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-1.4, 0, -0.8, 1.1, 0, 0.45);
    s.bezierCurveTo(0.8, 1.1, 1.4, 0, 0, -0.9);
    return s;
  },
  play: () => {
    const s = new THREE.Shape();
    s.moveTo(-0.6, -0.9); s.lineTo(1.0, 0); s.lineTo(-0.6, 0.9);
    return s;
  },
  bolt: () => {
    const s = new THREE.Shape();
    s.moveTo(0.2, 1.1); s.lineTo(-0.7, -0.1); s.lineTo(-0.05, -0.1); s.lineTo(-0.25, -1.1); s.lineTo(0.7, 0.15); s.lineTo(0.05, 0.15);
    return s;
  },
};

const LocalEnvironment: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
};

const Mesh: React.FC<{ icon: string; color: string; t: number; land: number }> = ({ icon, color, t, land }) => {
  const brushed = useMemo(() => {
    // fine horizontal brushing so highlights streak like machined metal
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d')!; let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},128,${0.05 + r() * 0.08})`; g.fillRect(0, r() * 512, 512, 1); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry((SHAPES[icon] ?? SHAPES.star)(), {
      depth: 0.38, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 8, curveSegments: 24,
    });
    g.center();
    return g;
  }, [icon]);
  const fly = prog(t, land - 0.7, 0.7, EASE.outBack);
  const spin = (1 - prog(t, land - 0.7, 0.9, EASE.out)) * Math.PI * 3;
  const idle = Math.max(0, t - land) * 0.6;
  return (
    <group position={[0, mix(fly, -0.4, 0.15), mix(fly, -9, 0)]} rotation={[0.15 + Math.sin(t * 1.3) * 0.06, spin + Math.sin(idle) * 0.45, 0]}
      scale={mix(fly, 0.4, 1)}>
      <mesh geometry={geo}>
        {/* brushed gold: full metal, reflections from the baked room environment do the shading */}
        <meshPhysicalMaterial color="#E9B44C" metalness={1} roughness={0.26} clearcoat={0.4} clearcoatRoughness={0.2} envMapIntensity={1.6}
          bumpMap={brushed} bumpScale={0.6} />
      </mesh>
    </group>
  );
};

const Sparks: React.FC<{ t: number; land: number; color: string }> = ({ t, land, color }) => {
  const k = prog(t, land, 0.6, EASE.out);
  if (k <= 0) return null;
  return (
    <group rotation={[0.4, 0, 0]}>
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 9) * Math.PI * 2 + t * 0.9;
        const r = mix(k, 0.6, 1.9 + (i % 3) * 0.25);
        return (
          <mesh key={i} position={[Math.cos(a) * r, Math.sin(a * 2) * 0.25, Math.sin(a) * r]} scale={0.07 + (i % 3) * 0.03}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={i % 2 ? color : '#ffffff'} emissive={color} emissiveIntensity={0.4} metalness={0.6} roughness={0.2} />
          </mesh>
        );
      })}
    </group>
  );
};

export const Icon3D: React.FC<SceneProps> = ({ t, dur, props, beats, accent }) => {
  const land = (beats ?? []).find((b) => b.action === 'land')?.t ?? 0.7;
  const color = props.color ?? accent;
  const labelP = prog(t, land, 0.45, EASE.enter);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* landing: a soft light bloom behind the star + a contact shadow below it (no orbiting sparks) */}
      <div style={{ position: 'absolute', left: 150, top: 120, width: 600, height: 600, borderRadius: '50%', mixBlendMode: 'screen',
        background: 'radial-gradient(circle, rgba(255,214,140,0.55) 0%, rgba(255,170,80,0.18) 35%, rgba(0,0,0,0) 65%)',
        opacity: prog(t, land - 0.05, 0.25, EASE.out) * (1 - 0.6 * prog(t, land + 0.2, 0.9, EASE.inOut)),
        transform: `scale(${mix(prog(t, land - 0.05, 0.6, EASE.out), 0.5, 1.15)})` }} />
      <div style={{ position: 'absolute', left: 300, top: 600, width: 300, height: 46, borderRadius: '50%', filter: 'blur(10px)',
        background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 70%)', opacity: prog(t, land - 0.3, 0.4, EASE.out) }} />
      <ThreeCanvas width={900} height={900} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        style={{ backgroundColor: 'transparent', position: 'absolute', left: 0, top: 0 }}
        camera={{ fov: 35, position: [0, 0, 7], near: 0.1, far: 100 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} />
        <directionalLight position={[-4, -1, 2]} intensity={1.0} color="#9ecbff" />
        <LocalEnvironment />
        <Mesh icon={props.icon ?? 'star'} color={color} t={t} land={land} />
      </ThreeCanvas>
      {props.label && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 660, textAlign: 'center', fontFamily: THEME.font,
          opacity: labelP, transform: `translateY(${(1 - labelP) * 20}px)` }}>
          <div style={{ fontSize: 80, fontWeight: 750, color: '#fff', letterSpacing: '-0.03em',
            textShadow: '0 2px 6px rgba(0,0,0,0.5), 0 12px 36px rgba(0,0,0,0.45)' }}>{props.label}</div>
          {props.sub && <div style={{ fontSize: 38, color: 'rgba(255,255,255,0.82)', marginTop: 6, textShadow: '0 2px 10px rgba(0,0,0,0.55)' }}>{props.sub}</div>}
        </div>
      )}
    </div>
  );
};
