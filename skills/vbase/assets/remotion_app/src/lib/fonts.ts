// Real typefaces, loaded deterministically (Remotion waits for them before rendering a frame).
// System-font fallbacks are a quiet "template" tell; a deliberate type pairing is not.
import { loadFont as inter } from '@remotion/google-fonts/Inter';
import { loadFont as serif } from '@remotion/google-fonts/SourceSerif4';
import { loadFont as mono } from '@remotion/google-fonts/JetBrainsMono';

const opts = { subsets: ['latin'] as ['latin'] };
export const FONT = {
  sans: inter('normal', { weights: ['400', '500', '600', '700'], ...opts }).fontFamily,
  serif: serif('normal', { weights: ['400', '600'], ...opts }).fontFamily,
  mono: mono('normal', { weights: ['400', '500'], ...opts }).fontFamily,
};
