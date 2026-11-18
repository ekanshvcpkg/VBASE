// Render JPEG stills of a composition at given seconds (bundles once).
// usage: node scripts/stills.mjs <compId> <outDir> <t1,t2,...> [scale]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const [id = 'MainComposite', out = 'stills', times = '1', scale = '0.5'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const comp = await selectComposition({ serveUrl, id, chromiumOptions: { gl: 'angle' } });
for (const t of times.split(',').map(Number)) {
  const frame = Math.min(comp.durationInFrames - 1, Math.round(t * comp.fps));
  const file = path.join(out, `${id}_${t.toFixed(2).padStart(6, '0')}.jpg`);
  await renderStill({ serveUrl, composition: comp, frame, output: file, imageFormat: 'jpeg', scale: Number(scale), chromiumOptions: { gl: 'angle' } });
  console.log(file);
}
