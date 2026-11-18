import React, { useLayoutEffect } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// The VBASE buddy: an original, soft clay critter (rounded body, big glossy eyes, a small smile, blush),
// built to take part in a video: wave, look at the viewer, press a button, hug a card, hop, run.
// <BuddySprite> draws it in its own small transparent canvas, so any scene can place it in pixels.

export type Pose = {
  yaw?: number; tilt?: number; lean?: number;     // body turn (rad), side tilt, forward lean
  wave?: number;                                  // right arm up and waving (0..1)
  reach?: number; tap?: number;                   // left arm points left (0..1), tap = a press down (0..1)
  armsUp?: number;                                // both arms up, "ta-da" (0..1)
  hug?: number;                                   // both arms forward and down over an edge (0..1)
  happy?: number;                                 // ^ ^ eyes, more blush (0..1)
  hop?: number; squash?: number;                  // world-unit lift; squash (+) / stretch (-)
  lookX?: number; lookY?: number;                 // pupils glance (-1..1)
  run?: number;                                   // -1 | 0 | 1: running, facing that way
  only?: 'arms' | 'body';                         // draw part of it (for layering around a card edge)
};

const Rig: React.FC = () => {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.92;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[-4, 5, 6]} intensity={2.0} color="#FFE9D6" />
      <directionalLight position={[4, 2, -4]} intensity={1.6} color="#BFD4FF" />
      <directionalLight position={[3, -2, 4]} intensity={0.5} color="#FFD9C2" />
    </>
  );
};

export const Buddy: React.FC<{ t: number; pose?: Pose; color?: string }> = ({ t, pose = {}, color = '#C4532F' }) => {
  const clay = <meshPhysicalMaterial color={color} roughness={0.48} metalness={0} clearcoat={0.3} clearcoatRoughness={0.4} sheen={0.2} sheenColor="#FF9A70" envMapIntensity={0.55} />;
  const ink = <meshPhysicalMaterial color="#24140E" roughness={0.18} clearcoat={1} clearcoatRoughness={0.05} />;
  const shine = <meshBasicMaterial color="#FFFFFF" toneMapped={false} />;
  const run = pose.run ?? 0;
  const happy = pose.happy ?? 0;
  const blink = !happy && (t % 3.1) > 2.96 ? 0.12 : 1;                       // a quick blink every ~3 s
  const step = (i: number) => (run ? 0.3 : 0) * Math.max(0, Math.sin(t * 17 + (i % 2) * Math.PI));
  const sq = pose.squash ?? 0;
  const bob = run ? Math.abs(Math.sin(t * 8.5)) * 0.3 : Math.sin(t * 2.4) * 0.05;
  const yaw = run ? -run * 0.7 : pose.yaw ?? 0;
  const wave = pose.wave ?? 0, reach = pose.reach ?? 0, tap = pose.tap ?? 0, up = pose.armsUp ?? 0, hug = pose.hug ?? 0;
  const lx = (pose.lookX ?? 0) * 0.08, ly = (pose.lookY ?? 0) * 0.06;
  // arm angles about z: 0 = hanging down; + swings the right arm up, - swings the left arm up
  const rZ = wave * (2.5 + 0.35 * Math.sin(t * 14)) + up * 2.4 - hug * 0.35 + (run ? Math.sin(t * 17) * 0.5 : 0) + 0.12;
  const lZ = -reach * 1.45 + tap * 0.38 - up * 2.4 + hug * 0.35 - (run ? Math.sin(t * 17) * 0.5 : 0) - 0.12;
  const armX = -hug * 0.62;                                                  // hug: arms come forward and drape down
  const showArms = pose.only !== 'body', showBody = pose.only !== 'arms';
  const arm = (side: 1 | -1, z: number) => (
    <group position={[side * 1.42, 0.5, 0]} rotation={[armX, 0, z]}>
      <RoundedBox args={[0.56, 1.05, 0.62]} radius={0.26} smoothness={5} position={[0, -0.42, 0]}>{clay}</RoundedBox>
    </group>
  );
  return (
    <group position={[0, (pose.hop ?? 0) + bob, 0]} rotation={[0.06 + (pose.lean ?? 0), yaw, (pose.tilt ?? 0) + (run ? -run * 0.08 : 0)]}
      scale={[1 + sq * 0.45, 1 - sq, 1 + sq * 0.45]}>
      {showBody && (
        <>
          <RoundedBox args={[2.9, 2.35, 1.65]} radius={0.62} smoothness={6} position={[0, 0.25, 0]}>{clay}</RoundedBox>
          {/* antenna + glowing bulb, swaying a little behind the motion */}
          <group position={[0, 1.38, 0]} rotation={[0, 0, Math.sin(t * 3.1) * 0.12 + (run ? run * 0.25 : 0)]}>
            <mesh position={[0, 0.28, 0]}><cylinderGeometry args={[0.07, 0.09, 0.56, 16]} />{clay}</mesh>
            <mesh position={[0, 0.66, 0]}><sphereGeometry args={[0.21, 32, 32]} /><meshStandardMaterial color="#FFE4A8" emissive="#FFC766" emissiveIntensity={1.6 + 0.6 * Math.sin(t * 4)} /></mesh>
          </group>
          {/* face */}
          <group position={[0, 0.45, 0.84]}>
            {[-1, 1].map((s) => happy > 0.5 ? (
              // happy: ^ ^ arcs
              <mesh key={s} position={[s * 0.6, 0.12, 0]} rotation={[0, 0, 0]}><torusGeometry args={[0.2, 0.065, 12, 28, Math.PI]} />{ink}</mesh>
            ) : (
              <group key={s} position={[s * 0.6 + lx, 0.1 + ly, 0]} scale={[1, blink, 1]}>
                <RoundedBox args={[0.42, 0.62, 0.12]} radius={0.2} smoothness={5}>{ink}</RoundedBox>
                <mesh position={[0.08, 0.15, 0.07]}><sphereGeometry args={[0.085, 16, 16]} />{shine}</mesh>
                <mesh position={[-0.09, -0.12, 0.07]}><sphereGeometry args={[0.04, 12, 12]} />{shine}</mesh>
              </group>
            ))}
            {/* smile: a bigger one when happy */}
            <mesh position={[0, -0.36, 0.02]} rotation={[0, 0, Math.PI]} scale={1 + happy * 0.35}><torusGeometry args={[0.16, 0.05, 12, 28, Math.PI]} />{ink}</mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 1.0, -0.3, 0.0]} scale={[0.27, 0.15, 0.05]}><sphereGeometry args={[1, 24, 16]} />
                <meshStandardMaterial color="#FF8C7E" transparent opacity={0.5 + 0.45 * happy} roughness={0.8} /></mesh>
            ))}
          </group>
          {[-0.95, -0.32, 0.32, 0.95].map((x, i) => (
            <RoundedBox key={i} args={[0.46, 0.62, 0.56]} radius={0.2} smoothness={4} position={[x, -1.12 + step(i), 0]}>{clay}</RoundedBox>
          ))}
        </>
      )}
      {showArms && <>{arm(1, rZ)}{arm(-1, lZ)}</>}
    </group>
  );
};

// 1 world unit = size / 6.97 px; the sprite centre is world y 0.3 (about the middle of the body)
export const UNIT = 1 / 6.97;
export const BuddySprite: React.FC<{ t: number; x: number; y: number; size: number; pose?: Pose; color?: string; res?: number; style?: React.CSSProperties }> =
  ({ t, x, y, size, pose, color, res = 1.5, style }) => {
    const R = Math.round(size * res);
    return (
      <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, pointerEvents: 'none', ...style }}>
        <div style={{ width: R, height: R, transform: `scale(${size / R})`, transformOrigin: 'top left' }}>
          <ThreeCanvas width={R} height={R} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
            style={{ backgroundColor: 'transparent' }} camera={{ fov: 30, position: [0, 0.3, 13], near: 0.1, far: 100 }}>
            <Rig />
            <Buddy t={t} pose={pose} color={color} />
          </ThreeCanvas>
        </div>
      </div>
    );
  };

/** A small heart that floats up and fades (for a hug). */
export const Heart: React.FC<{ t: number; x: number; y: number; s?: number }> = ({ t, x, y, s = 44 }) => {
  if (t < 0 || t > 1.1) return null;
  const k = t / 1.1;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: 'absolute', left: x - s / 2 + Math.sin(t * 6) * 6, top: y - s / 2 - k * 70,
      opacity: Math.min(1, t * 5) * (1 - k), transform: `scale(${0.6 + 0.5 * Math.min(1, t * 4)})` }}>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.6.8-1.4 2.3-2.6 4.4-2.6 3.6 0 5.7 3.8 4.2 7.3C19.5 16.4 12 21 12 21z" fill="#FF6B81" />
    </svg>
  );
};
