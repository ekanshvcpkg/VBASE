#!/usr/bin/env node
// Generate ElevenLabs audio from $EDIT_DIR/master_edl.json:
//   * background music (master_edl.music_prompt) -> bgm.mp3, which master_audio.py loops,
//     lowers and sidechain-ducks under the voice. Skipped if a bgm.* file already exists
//     (the user supplied their own track).
//   * SFX (one per cue with sfx_prompt) -> sfx_<cueIndex>.mp3
//   * optional voiceover (vo_cues) -> vo_<n>.mp3
// Writes audio_manifest.json ([{file, timeline_start, kind, gain}]) for master_audio.py.
//
// Usage: node generate_audio.mjs --dir $EDIT_DIR
// Env:   ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID (optional, for VO)
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = args[args.indexOf('--dir') + 1];
if (!dir || args.includes('--help')) {
  console.log('Usage: node generate_audio.mjs --dir $EDIT_DIR');
  process.exit(dir ? 0 : 1);
}
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY not set — skipping SFX/VO generation.');
  fs.writeFileSync(path.join(dir, 'audio_manifest.json'), '[]');
  process.exit(0);
}
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // premade "George"
const edl = JSON.parse(fs.readFileSync(path.join(dir, 'master_edl.json'), 'utf8'));

async function post(url, body, outPath) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
      return;
    }
    const text = await res.text();
    // 429 / 5xx are worth retrying; 4xx (bad key, quota, bad prompt) are not
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${text}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error('gave up after 3 attempts');
}

export async function generateSFX(prompt, durationSeconds, outPath) {
  await post('https://api.elevenlabs.io/v1/sound-generation',
    { text: prompt, duration_seconds: durationSeconds, prompt_influence: 0.5 }, outPath);
}

export async function generateMusic(prompt, lengthMs, outPath) {
  // Eleven Music compose (POST /v1/music). Instrumental only: lyrics would fight the speaker.
  // Prefer the newest model; fall back to the API default if this account can't use it.
  const url = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128';
  const body = { prompt, music_length_ms: lengthMs, force_instrumental: true };
  try {
    await post(url, { ...body, model_id: 'music_v2_5' }, outPath);
  } catch (e) {
    if (!/^4\d\d/.test(String(e.message))) throw e;
    await post(url, body, outPath);
  }
}

export async function generateVO(text, voiceId, outPath) {
  await post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    { text, model_id: 'eleven_multilingual_v2' }, outPath);
}

const manifest = [];
const failures = [];
const haveBgm = fs.readdirSync(dir).some((f) => /^bgm\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
if (edl.music_prompt && !haveBgm) {
  // a little longer than the video so the fade-out never runs out of music; API: 3 s – 10 min
  const ms = Math.round(Math.min(600000, Math.max(3000, (edl.total_duration + 2) * 1000)));
  try {
    await generateMusic(edl.music_prompt, ms, path.join(dir, 'bgm.mp3'));
    console.log(`music: ok (${edl.music_prompt})`);
  } catch (e) {
    failures.push(`music: ${e.message}`);
  }
}
for (const [i, cue] of (edl.three_d_cues || []).entries()) {
  if (!cue.sfx_prompt) continue;
  const out = path.join(dir, `sfx_${i}.mp3`);
  // short accents read better than long beds; ElevenLabs accepts 0.5–22 s
  const dur = Math.min(Math.max(cue.timeline_end - cue.timeline_start, 0.5), 2.0);
  try {
    await generateSFX(cue.sfx_prompt, Number(dur.toFixed(2)), out);
    // start a touch early so the whoosh peaks as the graphic lands
    manifest.push({ file: out, timeline_start: Math.max(0, cue.timeline_start - 0.1), kind: 'sfx', gain: 0.6 });
    console.log(`sfx ${i}: ok (${cue.sfx_prompt})`);
  } catch (e) {
    failures.push(`sfx ${i}: ${e.message}`);
  }
}
for (const [i, vo] of (edl.vo_cues || []).entries()) {
  if (!vo.text) continue;
  const out = path.join(dir, `vo_${i}.mp3`);
  try {
    await generateVO(vo.text, vo.voice_id || VOICE_ID, out);
    manifest.push({ file: out, timeline_start: vo.timeline_start, kind: 'vo', gain: 1.0 });
    console.log(`vo ${i}: ok`);
  } catch (e) {
    failures.push(`vo ${i}: ${e.message}`);
  }
}
fs.writeFileSync(path.join(dir, 'audio_manifest.json'), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ generated: manifest.length, failures }, null, 1));
