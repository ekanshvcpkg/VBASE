// Sample cues for the SceneQA composition: every scene once, with realistic props.
// Render stills with: node scripts/stills.mjs SceneQA <outdir> 1,2.5,3.8,...
import type { SceneCue } from './scenes';

const D = 4;
const list: Omit<SceneCue, 'timeline_start' | 'timeline_end'>[] = [
  { scene: 'terminal', layout: 'broll', props: { title: 'claude — ~/videos', lines: [
    { kind: 'cmd', text: '/vidbase edit talk.mov' }, { kind: 'step', text: 'Transcribing…' },
    { kind: 'step', text: 'Cutting dead air (kept natural pauses)' }, { kind: 'step', text: 'Adding captions + scenes' },
    { kind: 'ok', text: 'Rendered talk_studio.mp4' }] } },
  { scene: 'chat', layout: 'broll', props: { assistant: 'Claude', file: { name: 'talk.mov', meta: 'Video · 35 s' }, prompt: 'Make me a skill that edits my videos',
    reply: 'Done — I created the vidbase skill with 4 stages: intake, director, editor, designer.',
    card: { title: 'vidbase', subtitle: 'Skill created · SKILL.md + 8 scripts', icon: '✦' } } },
  { scene: 'phone_app', layout: 'broll', props: { app: { name: 'Shorts', color: '#FF3B30' }, screens: [
    { kind: 'upload', title: 'This video was edited by Claude', thumb_text: 'Edited by AI' },
    { kind: 'success', title: 'Uploaded automatically', subtitle: 'No hands touched this' }] } },
  { scene: 'repo', layout: 'broll', props: { owner: 'ekanshvcpkg', repo: 'VID-BASE', stars: 214,
    description: 'Auto-edit talking-head videos with Claude' } },
  { scene: 'flow', layout: 'broll', props: { nodes: [{ label: 'Record' }, { label: 'Edit', sub: 'by Claude' }, { label: 'Upload', sub: 'automatic' }] } },
  { scene: 'code', layout: 'broll', props: { filename: 'SKILL.md', badge: 'built in 1 day', lines: [
    '---', 'name: vidbase', 'description: Auto-edit talking-head videos', '---', '', '# Vidbase — Auto Video Studio',
    '1. Intake → transcript + silences', '2. Director → edit decisions', '3. Editor → cut + audio', '4. Designer → scenes'] } },
  { scene: 'compare', layout: 'split', props: { left: 'Other skills', right: 'vidbase', rows: [
    { label: 'Cuts silences', left: true }, { label: 'Natural pauses', left: false },
    { label: '3D scenes that match', left: false }, { label: 'Any format', left: false }] } },
  { scene: 'stat', layout: 'overlay', props: { value: 1, suffix: ' day', label: 'to build the whole skill' } },
  { scene: 'icon3d', layout: 'broll', props: { icon: 'star', label: 'Star it on GitHub', sub: 'ekanshvcpkg/VID-BASE' } },
];

export const QA_CUES: SceneCue[] = list.map((c, i) => ({ ...c, timeline_start: i * D, timeline_end: (i + 1) * D }));
export const QA_DURATION = list.length * D;
