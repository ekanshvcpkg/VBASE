import React, { Suspense, useLayoutEffect, useMemo } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Cue = {
  timeline_start: number;
  timeline_end: number;
  type: string;
  label?: string;
  position?: string;
  model?: string;
  color?: string;
};

// Normalized screen coords (-1..1, y up). Lower positions sit above the caption band.
const POSITIONS: Record<string, [number, number]> = {
  top_left: [-0.52, 0.58],
  top_right: [0.52, 0.58],
  mid_left: [-0.55, 0.05],
  mid_right: [0.55, 0.05],
  lower_left: [-0.48, -0.3],
  lower_right: [0.48, -0.3],
  center: [0, 0.1],
};
export const posOf = (p?: string): [number, number] => POSITIONS[p ?? ''] ?? POSITIONS.top_right;

const CAMERA_Z = 5;
const FOV = 40;
const ACCENT = '#00FF88';

// Shared enter/exit envelope: springy pop in, quick shrink out over the last 8 frames.
export const useEnvelope = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.5 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return { frame, fps, scale: enter * exit };
};

// Reflections without network: a procedural room baked into a PMREM env map once.
// (drei's <Environment preset> downloads HDRs from a CDN and can hang a headless render.)
const LocalEnvironment: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

// Holds the Remotion frame until async assets (GLB) resolve, instead of rendering empty frames.
const WaitForAssets: React.FC = () => {
  useLayoutEffect(() => {
    const handle = delayRender('Loading 3D asset');
    return () => continueRender(handle);
  }, []);
  return null;
};

const GlassMaterial: React.FC<{ color: string }> = ({ color }) => (
  <meshPhysicalMaterial
    color={color}
    metalness={0.05}
    roughness={0.06}
    transmission={0.55}
    thickness={1.2}
    ior={1.5}
    clearcoat={1}
    clearcoatRoughness={0.05}
    iridescence={1}
    iridescenceIOR={1.3}
    envMapIntensity={1.6}
  />
);

const MetalMaterial: React.FC = () => (
  <meshStandardMaterial color="#dfe3ea" metalness={1} roughness={0.16} envMapIntensity={1.4} />
);

const Glb: React.FC<{ file: string; unit: number }> = ({ file, unit }) => {
  // Draco decoder is served locally from public/draco/ (copied from three by bootstrap).
  const { scene } = useGLTF(staticFile(file), staticFile('draco/'));
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center);
    return { clone, s: (2.2 * unit) / size };
  }, [scene, unit]);
  return (
    <group scale={fitted.s}>
      <primitive object={fitted.clone} />
    </group>
  );
};

const Shape: React.FC<{ cue: Cue; unit: number }> = ({ cue, unit }) => {
  const color = cue.color ?? ACCENT;
  const t = cue.type;
  if (t === 'glb_model') {
    return <Glb file={cue.model ?? 'opt.glb'} unit={unit} />;
  }
  if (t.includes('knot')) {
    return (
      <mesh>
        <torusKnotGeometry args={[0.7 * unit, 0.24 * unit, 220, 32]} />
        <GlassMaterial color={color} />
      </mesh>
    );
  }
  if (t.includes('icosahedron')) {
    return (
      <mesh>
        <icosahedronGeometry args={[0.95 * unit, 0]} />
        <MetalMaterial />
      </mesh>
    );
  }
  if (t.includes('sphere') || t.startsWith('procedural_metal')) {
    return (
      <mesh>
        <sphereGeometry args={[0.85 * unit, 64, 64]} />
        <MetalMaterial />
      </mesh>
    );
  }
  return (
    <mesh>
      <torusGeometry args={[0.75 * unit, 0.3 * unit, 48, 160]} />
      <GlassMaterial color={color} />
    </mesh>
  );
};

const Animated: React.FC<{ cue: Cue; world: [number, number]; unit: number }> = ({ cue, world, unit }) => {
  const { frame, fps, scale } = useEnvelope();
  // Every motion term is a pure function of the frame number -> deterministic across render tabs.
  const rotY = frame * (Math.PI / fps) * 0.9;
  const rotX = 0.35 + Math.sin(frame / 14) * 0.15;
  const floatY = Math.sin(frame / 9) * 0.06 * unit;
  return (
    <group position={[world[0], world[1] + floatY, 0]} rotation={[rotX, rotY, 0]} scale={Math.max(scale, 0.0001)}>
      <Shape cue={cue} unit={unit} />
    </group>
  );
};

const Label: React.FC<{ text: string; css: [number, number]; below: number; big: boolean }> = ({ text, css, below, big }) => {
  const { frame, fps, scale } = useEnvelope();
  const lift = interpolate(spring({ frame: frame - 4, fps, config: { damping: 14 } }), [0, 1], [24, 0]);
  if (!text) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: css[0],
        top: css[1] + below,
        transform: `translate(-50%, ${lift}px) scale(${scale})`,
        fontFamily: "'Arial Black', Impact, 'Helvetica Neue', sans-serif",
        fontWeight: 900,
        fontSize: big ? 64 : 52,
        letterSpacing: 1,
        color: '#fff',
        whiteSpace: 'nowrap',
        textShadow: '0 4px 18px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
      }}
    >
      {text}
    </div>
  );
};

export const Badge2D: React.FC<{ cue: Cue }> = ({ cue }) => {
  const { width, height } = useVideoConfig();
  const { frame, fps, scale } = useEnvelope();
  const [nx, ny] = posOf(cue.position);
  const tilt = interpolate(spring({ frame, fps, config: { damping: 8 } }), [0, 1], [-12, -3]);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: ((nx + 1) / 2) * width,
          top: ((1 - ny) / 2) * height,
          transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`,
          background: cue.color ?? ACCENT,
          color: '#0b0b0b',
          padding: height > width ? '22px 40px' : '16px 32px',
          borderRadius: 22,
          fontFamily: "'Arial Black', Impact, sans-serif",
          fontWeight: 900,
          fontSize: height > width ? 64 : 50,
          whiteSpace: 'nowrap',
          boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
        }}
      >
        {cue.label}
      </div>
    </AbsoluteFill>
  );
};

export const Cue3D: React.FC<{ cue: Cue }> = ({ cue }) => {
  const { width, height } = useVideoConfig();
  if (cue.type === 'badge_2d') return <Badge2D cue={cue} />;

  const [nx, ny] = posOf(cue.position);
  // Visible half-extents of the z=0 plane for this camera — aspect-aware, so 9:16 works.
  const halfH = CAMERA_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
  const halfW = halfH * (width / height);
  const unit = 0.26 * Math.min(halfW, halfH);
  const world: [number, number] = [nx * halfW, ny * halfH];
  const css: [number, number] = [((nx + 1) / 2) * width, ((1 - ny) / 2) * height];
  const objectPx = (2.2 * unit * height) / (2 * halfH);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <ThreeCanvas
        width={width}
        height={height}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        style={{ backgroundColor: 'transparent' }}
        camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={2.2} />
        <directionalLight position={[-4, -2, 3]} intensity={0.8} color="#88ccff" />
        <LocalEnvironment />
        <Suspense fallback={<WaitForAssets />}>
          <Animated cue={cue} world={world} unit={unit} />
        </Suspense>
      </ThreeCanvas>
      {/* lower cues put the label above the object so it never collides with the caption band */}
      <Label text={cue.label ?? ''} css={css} below={ny < 0 ? -objectPx * 0.62 - 70 : objectPx * 0.62} big={height > width} />
    </AbsoluteFill>
  );
};
