import React from 'react';
import { Composition } from 'remotion';
import { MainComposite } from './MainComposite';
import { SceneQA } from './SceneQA';
import { QA_DURATION } from './qa_cues';
import edl from './master_edl.json';

// Composition geometry comes straight from the EDL so it matches base_cut.mp4 frame-for-frame.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MainComposite"
      component={MainComposite}
      width={edl.width}
      height={edl.height}
      fps={edl.fps}
      durationInFrames={Math.max(1, Math.round(edl.total_duration * edl.fps))}
      defaultProps={{ edl: edl as any }}
    />
    <Composition id="SceneQA" component={SceneQA} width={edl.width} height={edl.height} fps={edl.fps}
      durationInFrames={Math.round(QA_DURATION * edl.fps)} />
  </>
);
