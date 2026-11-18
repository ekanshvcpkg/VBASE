import type { Beat } from '../lib/motion';

/** Every scene receives scene-relative time and its cue's props. */
export type SceneProps = {
  t: number;        // seconds since the cue started
  dur: number;      // cue length in seconds
  props: Record<string, any>;
  beats: Beat[];    // word-locked actions, t relative to cue start
  accent: string;
  index: number;    // cue index — used to vary camera angles between consecutive scenes
  w: number;        // design canvas size this scene is drawn on
  h: number;
  vertical: boolean; // 9:16-ish output: lay out portrait-first, bigger type
  layout?: string;   // overlay | split | broll | tracked — e.g. panels paint their own surface outside split
};

export type SceneDef = {
  component: React.FC<SceneProps>;
  design: [number, number];  // landscape design canvas; the layout box scales it with CSS zoom
  designV?: [number, number]; // portrait output: [width, height]; height 0 = match the layout box's aspect
};
