import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { SceneLayer } from './scenes';
import { QA_CUES } from './qa_cues';

// Every scene back to back over a neutral backdrop — for stills / contact-sheet review.
export const SceneQA: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%, #2a2a33, #0b0b0f)' }}>
      {QA_CUES.map((c, i) => (
        <Sequence key={i} from={Math.round(c.timeline_start * fps)} durationInFrames={Math.round((c.timeline_end - c.timeline_start) * fps)}>
          <SceneLayer cue={c} index={i} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
