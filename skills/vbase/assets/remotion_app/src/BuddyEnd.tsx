import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { EASE, mix, prog } from './lib/motion';
import { BuddySprite, UNIT } from './scenes/three/Buddy';

// The buddy on the Take One end card (rendered with alpha, laid over endcard.mp4 by takeone_finish.sh):
// it drops in beside the CTA button, glances at it, presses it on `press`, cheers, then waves at the viewer.
// props: btn = [x0, y0, x1, y1] of the CTA button measured on the end card; press = seconds
export const BuddyEnd: React.FC<{ btn: number[]; press: number }> = ({ btn, press }) => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  const [, y0, x1, y1] = btn, S = 300, ppu = S * UNIT;
  const cx = x1 + 2.5 * ppu - 22, cy = (y0 + y1) / 2 + 0.45 * ppu;
  const land = 1.35, drop = prog(t, land - 0.4, 0.4, EASE.enter);
  const squash = 0.16 * Math.exp(-Math.pow((t - land - 0.04) / 0.08, 2)) - 0.08 * Math.exp(-Math.pow((t - land + 0.08) / 0.06, 2));
  const reach = prog(t, press - 0.35, 0.3, EASE.out) * (1 - prog(t, press + 0.35, 0.3, EASE.inOut));
  const tap = Math.exp(-Math.pow((t - press) / 0.07, 2));
  const cheer = prog(t, press + 0.15, 0.25, EASE.outBack), turn = prog(t, press + 0.6, 0.35, EASE.inOut);
  if (t < land - 0.4) return <AbsoluteFill />;
  return (
    <AbsoluteFill>
      <BuddySprite t={t} x={cx} y={mix(drop, -S, cy)} size={S} res={1.6} pose={{
        yaw: mix(turn, -0.3, 0.05), lookX: mix(turn, -0.9, 0), lookY: turn ? 0 : 0.2, reach, tap,
        happy: Math.max(cheer * (1 - turn * 0.3), 0), hop: Math.abs(Math.sin((t - press - 0.15) * 8)) * 0.35 * cheer * (1 - turn),
        wave: turn, squash: squash + 0.12 * tap }} />
    </AbsoluteFill>
  );
};
