// "VBASE Bed": an original under-voice bed for VBASE edits, written for the take-one code music engine
// (engine adapted from anidoodle, Apache-2.0). Warm, optimistic, F major, ~100 bpm half-time lofi.
// Built to sit UNDER speech: no melody while the speaker talks (a tune fights the voice), the energy
// rises in layers (pad -> +sub, keys, hats -> +kick, snare), and the only melody is the payoff over the
// end card. Fitted to the film's exact length by the engine (render --seconds N).
//
//   chords, one per bar:  Fmaj9  C/E (add9)  Dm9  Bbmaj9
//   sections: intro 4 (pad only) | lift 8 (+sub, e-piano, hats) | pulse 8 (+kick, snare) | payoff 3 (+pluck hook, resolve)
const IMPORT = new URL("plan.mjs", process.env.TAKEONE_MUSIC_DIR ? "file://" + process.env.TAKEONE_MUSIC_DIR + "/" : import.meta.url);
const { line } = await import(IMPORT.href);

const BPB = 4, BPM = 100, BARS = 23;
const L = (t, s, role, v = 0.7, extra = {}) => line(t, s, { role, v, bpb: BPB, ...extra });
const byBar = (from, to, role, v, fn, extra = {}) => {
  const out = [];
  for (let b = from; b < to; b++) { const s = fn(b, b % 4); if (s) out.push(...L(b * 4, s, role, v, extra)); }
  return out;
};
const PAD = ["[A3 C4 E4 G4]", "[G3 C4 D4 E4]", "[F3 A3 C4 E4]", "[F3 A3 C4 D4]"];   // Fmaj9, Cadd9/E, Dm9, Bbmaj9 (rootless)
const SUB = ["F1:3 r:.5 C2:.5", "E1:3 r:.5 G1:.5", "D2:3 r:.5 A1:.5", "Bb1:3 r:.5 F1:.5"];
const STAB = ["r:1.5 [C4 E4 A4]:1 r:1.5", "r:2.5 [C4 D4 G4]:1 r:.5", "r:1.5 [C4 E4 F4]:1 r:1.5", "r:2.5 [A3 D4 F4]:1 r:.5"];
const HOOK = ["C5:1 A4:.5 G4:.5 A4:1 C5:1", "D5:1.5 C5:.5 A4:1 G4:1", "A4:4"];             // payoff, resolves on F

export default () => {
  const pad = byBar(0, BARS, "accomp", 0.55, (b, c) => (b === BARS - 1 ? "[F3 A3 C4 E4]:4" : `${PAD[c]}:4`), { roll: 0.03 });
  const sub = byBar(4, BARS, "bass", 0.72, (b, c) => (b === BARS - 1 ? "F1:4" : SUB[c]));
  const keys = byBar(4, BARS - 1, "inner", 0.5, (b, c) => STAB[c], { roll: 0.02 });
  const hats = byBar(4, BARS - 1, "drum", 0.42, (b) => (b < 12 ? "C4:.5@.6 C4:.5@.3 C4:.5@.5 C4:.5@.3 C4:.5@.6 C4:.5@.3 C4:.5@.5 C4:.5@.35"
    : "C4:.5@.85 C4:.5@.4 C4:.5@.65 C4:.5@.4 C4:.5@.85 C4:.5@.4 C4:.5@.65 C4:.5@.45"));
  const kick = byBar(12, BARS - 1, "drum", 0.7, (b) => (b % 2 ? "C4:1 r:1.5 C4:.5@.7 r:1" : "C4:1 r:1.75 C4:1.25@.75"));
  const snare = byBar(12, BARS - 1, "drum", 0.55, () => "r:2 C4:2");
  const lead = byBar(BARS - 3, BARS, "melody", 0.6, (b) => HOOK[b - (BARS - 3)]);
  const harmony = Array.from({ length: BARS }, (_, b) => ({ t: b * 4, name: b === BARS - 1 ? "Fmaj9" : ["Fmaj9", "C/E", "Dm9", "Bbmaj9"][b % 4] }));
  return {
    title: "VBASE Bed (under-voice, F major, 100)", seed: 2026, tail: 2.2, harmony,
    plan: {
      style: "lofi", tempo: BPM, meter: "4/4", swing: 0.56, phraseBars: 4,
      sections: [
        { id: "intro", bars: 4, mood: "calm", key: "F", mode: "major", melody: [], dyn: [0.35, 0.42] },
        { id: "lift", bars: 8, mood: "calm", key: "F", mode: "major", melody: [], dyn: [0.44, 0.52] },
        { id: "pulse", bars: 8, mood: "nostalgic", key: "F", mode: "major", melody: [], dyn: [0.54, 0.6] },
        { id: "payoff", bars: 3, mood: "wistful", key: "F", mode: "major", melody: ["hook"], dyn: [0.6, 0.5], ending: true },
      ],
    },
    parts: [
      { id: "pad", inst: "warmPad", role: "accomp", notes: pad, gainDb: -3, opts: { cut: 1900, attack: 0.8, release: 1.6, spread: 0.7 }, send: 0.4 },
      { id: "keys", inst: "ePiano", role: "inner", notes: keys, gainDb: -3, opts: { width: 0.4 }, send: 0.32 },
      { id: "sub", inst: "sub", role: "bass", notes: sub, gainDb: -8, opts: { cut: 140 } },
      { id: "hat", inst: "hat", role: "drum", notes: hats, opts: { pan: 0.2 }, gainDb: 14, send: 0.1 },
      { id: "kick", inst: "kick", role: "drum", notes: kick, gainDb: -2, send: 0.08 },
      { id: "snare", inst: "snare", role: "drum", notes: snare, gainDb: 2, send: 0.3 },
      { id: "lead", inst: "softPluck", role: "melody", notes: lead, gainDb: 2, opts: { decay: 0.5, bright: 5000, delay: (60 / BPM) * 0.75, feedback: 0.25, delayMix: 0.22 }, send: 0.25 },
    ],
    fx: { duck: { by: "kick", parts: ["pad", "keys"], depth: 0.12, release: 0.3 }, tape: { wowCents: 4, wowHz: 0.35, flutterCents: 1, flutterHz: 6, drive: 1.1 } },
  };
};
