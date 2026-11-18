# Editing sense

How a senior human editor thinks, translated into the levers vidbase gives you. Read this
**before** making any cut or picking any scene (Stage 2, step 0). Everything else in the
skill makes the edit *possible*; this file decides whether it feels *edited* or *generated*.

## Contents
1. Priorities: Murch's Rule of Six
2. The anti-AI signature (5 rules)
3. The hook
4. Cut mechanics and micro-timing
5. Retention in the body
6. Sound: the invisible 50%
7. Tactile polish
8. The editorial pass (`edit_plan.md`)
9. Lever cheat-sheet

---

## 1. Priorities: Murch's Rule of Six

Judge every decision in this order. When two of them conflict, the higher one wins.

1. **Emotion (51%).** How does this moment make the viewer *feel*?
2. **Story (23%).** Does it advance the point, or open a curiosity loop?
3. **Rhythm (10%).** Does the change land on the vocal or kinetic heartbeat?
4. **Eye-trace (7%).** Where is the eye on frame A, and does frame B catch it in the same place?
5. **Planarity (5%).** Can the brain parse the frame in under 0.4 s?
6. **Continuity (4%).** Does motion flow naturally across the screen?

A technically clean cut that kills the emotion is wrong. An emotionally right moment with a
small continuity bump is fine.

## 2. The anti-AI signature

Generated edits look cheap for three reasons: they are literal, uniform and over-stimulated.
Five rules fix that.

### Rule 1. Proof, not "see-say"
- **Literal illustration of abstract or emotional lines is the AI tell.** "I was stuck for
  weeks" → a calendar flipping. "He lost everything" → burning cash. Don't do it.
- **For those lines, edit for subtext.** Use a slow push on the face, hold in silence, or
  drop the graphics and let the face carry it.
- **Product proof is different.** When the speaker *demonstrates or claims something about a
  product*, show the real thing doing it: their command running, their app, their repo, their
  numbers. That's evidence, not illustration, and it's the vidbase scene catalog's job.
- **The test:** does the picture add a *second layer* the words alone don't (proof, scale,
  contrast)? Or does it just repeat the noun? If it only repeats, cut the scene.

### Rule 2. Accordion pacing (fast-fast-fast-HOLD)
- **Uniform rhythm puts the brain to sleep,** even when it's fast. `finalize_edl.py` warns
  when visual changes are metronomic.
- **Build momentum with a cluster of changes** during energetic explanation: scene beats,
  steps, a cut or two.
- **Then slam the brakes before the profound line, the turn, or the payoff.**
  - Use `holds` (3–6 s): no cuts, no graphics, one slow creep in, the face carrying it.
  - Aim for one or two holds in a 30–60 s video.
- **Contrast creates perceived speed.**

### Rule 3. Keep the breath, kill the hesitation
- **Remove** ums, false starts and dead thinking time.
- **Keep purposeful breaths:** the inhale before a big statement makes the speaker sound
  alive and urgent. Put the first word of each big line in `emphasis_word_ids`, which holds
  ≥ 0.65 s before it.
- **Questions keep ≥ 0.8 s after them** (automatic), so the viewer's brain answers.
- **The engine already compresses rather than deletes pauses.** Never "fix" a natural
  pause by cutting it to nothing.

### Rule 4. Earned motion
- **About 80% of edits should be invisible hard cuts** (or no cut at all). Save stylised
  moves (B-roll, split, match-like pushes) for real chapter shifts and payoffs.
- **Not every scene needs to pop, and not every line needs a graphic.**
- **Easing:** an explosive impulse followed by a long, friction-heavy settle:
  `EASE.out` = `cubic-bezier(0.16, 1, 0.3, 1)`. Overshoot (`EASE.outBack`) is for small
  playful payoffs only, never for serious or emotional content.

### Rule 5. Restraint is a choice
- **Each scene must earn its seconds.** If the edit_plan can't say *why* a scene is there
  (proof, scale, contrast, re-hook), drop it.
- **Face-only stretches are a feature,** not a gap to fill.

## 3. The hook

The opening decides most of the retention curve. Scale these phases to the video's length:
for a 30 s short the whole arc happens in about 8 s; for a 10-minute video, use the full
30 s.

**Phase 1. Pattern interrupt (the first ~3 s)**
- **Frame 0 is already moving.** The first shot's push eases out from speed, which is
  automatic.
- **Never open on throat-clearing** ("hey guys, so…").
  - Open on the strongest claim or the result.
  - Use `hook` to cold-open a line from later in the video, or `remove_ranges` to drop
    the greeting.
  - Score the opening honestly (see the director doc).

**Phase 2. Proof (to ~10 s, or ~3–6 s in a short)**
- **Prove the premise immediately:** the result, the product, the scale.
- **This is where the first scene usually goes,** at the densest point of change.

**Phase 3. Tension**
- **Open the curiosity gap:** "everyone does X… but".
- **Let changes tighten as the thesis approaches.**

**Phase 4. Silence drop**
- **Right before the core line, cut the music to zero** with `music_drops` spanning the
  thesis line.
- **Let the raw voice deliver it,** ideally inside a hold.
- **The music returns on the line's last word.** That silence-to-drop contrast is the
  single strongest signature of a human editor.
- **No music in the video?** The hold does the same job.

## 4. Cut mechanics and micro-timing

- **Graphics land on the consonant.** Scenes start ~2 frames into their anchor word, where
  the plosive's energy peaks. This is automatic; override it with a cue's `offset`.
- **L-cuts (visual leads).** To reveal a payoff a beat *before* the speaker finishes saying
  it, anchor the cue on the word before, or give it a negative `offset` (−0.2 to −0.4 s).
  The voice then trails over the new picture.
- **J-cuts (audio leads).** In a single-take talking head the speaker's audio is continuous.
  So the "audio lead" comes from SFX and music: an SFX starts ~0.1 s before its graphic
  (automatic in `generate_audio.mjs`), and music returns on the drop.
- **Cut on the kinetic peak.** Mid-gesture, mid-turn. A jump cut is least visible when the
  speaker is moving. When the cut audit shows a cut on a still, frozen face, prefer the
  nearest gap where they move, or cover it with a scene.
- **Eye-trace.** In a run of scenes, keep the focal point in the same screen region. Don't
  bounce the eye from top-left to bottom-right on consecutive scenes; the layouts help with
  this.

## 5. Retention in the body

- **State changes, not noise.** Every 45–60 s (longer videos) change the *mode*: face only →
  split with a scene → full B-roll → a hold. Within a short, alternate face and scene.
- **One-channel rule.** The brain can't read dense text and follow speech at the same time.
  - Keep on-screen text to the words being spoken.
  - Highlight only **anchor nouns, numbers and contrast verbs** in `highlight_word_ids`,
    never "and / the / because". `finalize_edl.py` warns when a filler word is highlighted.
- **Re-hooks.** Don't fully resolve one section before the next begins. Let the next idea's
  first words start while the previous scene is still leaving.
- **Progressive disclosure.** Diagrams build step by step in sync with the words (flow
  steps, compare rows, terminal lines are all beat-locked). Never dump a finished diagram.

## 6. Sound: the invisible 50%

Think in four lanes:
1. **Dialogue is king.** Mastered to −14 LUFS; everything else ducks around it.
2. **Music sits about 18–26 dB under the voice and rises in gaps** (`master_audio.py` ducks
   it with a sidechain).
   - Use `music_drops` for the thesis.
   - In longer videos, don't let one bed run unchanged past ~90 s: write the music prompt
     with sections, or generate two beds.
3. **Punctuation SFX are sparse.** A soft hit on a chapter turn or a major reveal. Never on
   every scene.
4. **Tactile foley over cartoon sounds.**
   - Write `sfx_prompt`s as real textures: "muted mechanical keyboard click", "soft paper
     slide", "low felt thump". Never "pop" or "whoosh-zap".
   - Room tone is automatic.

## 7. Tactile polish

- **Camera presence.** Nothing on screen is dead still. Scenes drift and creep 1–5%, holds
  creep about 6%, and shots push in slowly. Static pixels feel pasted; drifting pixels feel
  filmed.
- **Surface.** Deep charcoal (`#0D0E11`) instead of pure black. Graphics get moving film
  grain (about 4%) so they share the footage's lens. Both are automatic.
- **Sharp type.** Never wide-tracked uppercase. See `motion_rules.md`.

## 8. The editorial pass: write `$EDIT_DIR/edit_plan.md` before any cut

Read the whole transcript as an editor, not as a parser. Then write this file. It takes
five minutes, and it is the difference between an edit and an output.

```markdown
## Emotional spine
- Hook line (what opens the video, and why it stops the scroll): "…" (word ids)
- Peak / turn / payoff: "…" (ids) → hold? emphasis?
- Where it must breathe: …
- Throat-clearing / retakes / tangents to remove: …

## Rhythm wave
0–4 s: fast (hook + proof scene) · 4–9 s: face, building · 9–13 s: cluster (compare rows) ·
13–17 s: HOLD on "…" · …   (fast-fast-fast-HOLD, never uniform)

## See-say audit
| Line | First idea | Proof or illustration? | Decision |
| "I created this in one day" | calendar graphic | illustration | ✗ → SKILL.md being written with a "1 day" chip (proof) |
| "it was honestly so frustrating" | angry emoji | illustration | ✗ → no scene; emphasis + hold on face |

## Sound plan
music: none / prompt "…" · drops: thesis "…" (ids) · SFX: [scene → tactile texture] · L-cuts: [cue → offset]
```

Then turn the plan into the EDL: `holds`, `emphasis_word_ids`, `music_drops`, cue
`offset`s, scenes and highlights.

## 9. Lever cheat-sheet (all in `edl_draft.json`)

| Editorial intent | Lever |
|---|---|
| Slam the brakes on a profound line | `"holds": [{"from_word_id": 88, "to_word_id": 101}]`: no cuts, no scenes, slow creep |
| Keep the breath before a big line | `"emphasis_word_ids": [88]`: ≥ 0.65 s held before the word |
| Let a question land | automatic: ≥ 0.8 s after `?` |
| Silence drop before the thesis | `"music_drops": [{"from_word_id": 88, "to_word_id": 101}]` |
| Visual payoff before the words finish (L-cut) | cue `"offset": -0.3` |
| Cold open on the strongest line | `"hook": {...}` |
| Remove throat-clearing / retakes | `remove_ranges`, `remove_word_ids` |
| Highlight the words that matter | `highlight_word_ids`: anchor nouns, numbers, contrast verbs |
| Correct a misheard name in captions | `word_fixes` |
