# Scene catalog

Read this while writing the storyboard (Stage 2). Each visual moment in the video becomes a
**scene cue**: a short animated scene that *shows what the speaker is saying*, filled with
props taken from the speaker's own words.

## Contents
1. The question to ask
2. Cue schema
3. Layouts
4. Scenes: terminal · chat · code · phone_app · repo · flow · compare · stat · icon3d · held_object
5. Worked example
6. Adding a new scene

## 1. The question to ask

For each sentence worth illustrating, ask: **"If the sound were off, what picture would make
this sentence obvious?"**
- "I built this skill in Claude" → the chat where it got built (`chat`), or the file being written (`code`).
- "my Android app tracks habits" → a phone popping up with that app running (`phone_app`).
- "it edits and uploads automatically" → the pipeline lighting up step by step (`flow`).

A floating shape with a keyword label fails this test. That is why the legacy `procedural_*`
cues are now a last resort.

**Proof, not see-say** (`editing_sense.md`, rule 1). Scenes are for **evidence**: the real command,
app, repo, numbers or comparison the speaker is claiming. They are not for illustrating
emotional or abstract lines ("I was so frustrated", "it changed my life"). Those lines get the
face, a `hold` or `emphasis`. A scene that only repeats the noun the speaker just said, without
adding proof, scale or contrast, should be cut.

## 2. Cue schema (in `edl_draft.json` → `cues[]`)

```json
{ "anchor_word_id": 53, "duration": 6.0, "scene": "flow", "layout": "split",
  "props": { "nodes": [{"label": "Record"}, {"label": "Edit", "sub": "by Claude"}] },
  "beats": [ {"action": "step", "anchor_word_id": 56}, {"action": "step", "anchor_word_id": 65} ] }
```

**Fields**
- `anchor_word_id`: the scene starts on this word. Choose the word *just before* the idea lands, so the picture arrives with it.
- `duration`: 2–8 s. It gets clamped to that range, and trimmed if it would overlap the next cue.
- `beats`: in-scene actions locked to specific words. `finalize_edl.py` converts each one into seconds after the cue start. Each scene lists the beat actions it understands.
- `props`: put the speaker's real words in here: their prompt, their app name, their numbers, their repo. Generic placeholder text is the main thing that makes a scene look AI-generated.
- `accent` (optional): the creator's brand colour.

## 3. Layouts

**`overlay`**
- 9:16: a card in the top third. 16:9: the right-hand panel.
- The speaker is not moved.
- Use for small payoffs such as `stat`. On 9:16 the overlay box is short, so a square scene like `icon3d` renders small there; give it `split` when it is the payoff.

**`split`**
- An opaque paper (or ink) panel wipes in over the right 42% (16:9) or the top half (9:16). The speaker is reframed beside it, face visible.
- Panel scenes are drawn at the panel's true size.
- Use when the face matters while the visual explains.

**`broll`**
- The scene fills the frame. The speaker is blurred and dimmed behind it and keeps talking.
- Any jump cut that happens underneath is invisible.
- Use for the main "show it" moments.
- Limit: about 1 per 15–20 s of video.

**`tracked`**
- The scene lives *in the footage*: a 3D object sitting on the speaker's palm.
- Only `held_object` uses it.
- After the cut, run `scripts/track_hands.py` (see `held_object` below).

## 4. Scenes

**`terminal`: a CLI or agent session**
- **When:** "I ran…", "Claude Code did…", commands, builds, automation.
- **Props:**
  - `title`
  - `device`: `window` or `laptop`
  - `prompt`: default `>`
  - `lines`: a list of `{kind, text}`, where `kind` is one of `cmd`, `step`, `ok`, `out`, `dim`
- **Behaviour:** `cmd` lines type out; `step` lines spin, then tick.
- **Beats:** `line` × n (when each line starts).

**`chat`: an assistant conversation** (a faithful Claude-style interface; use `broll`)
- **When:** "I asked Claude to…", "I created the skill in Claude", prompting.
- **Props:**
  - `assistant`
  - `prompt`: what the user typed
  - `reply`
  - `file`: optional `{name, meta}`. The cursor drags it in and drops it into the composer ("I uploaded my video").
  - `card`: optional `{title, subtitle}`, the result card
  - `title`, `initials`: the top bar
- **Beats:** `drop`, `send`, `card`. The camera pushes in on each one.

**`code`: a file being written**
- **When:** "I wrote…", "the skill file", configs, a code snippet.
- **Props:**
  - `filename`
  - `lines`: a list of strings
  - `tabs`: optional
  - `badge`: optional corner chip, e.g. "built in 1 day"

**`phone_app`: a phone pops up with an app running**
- **When:** any mobile app, posting, uploading, signing up, notifications.
- **Props:**
  - `app`: `{name, color, icon}`
  - `screens`: a list of screens
  - `tap_y`: optional
- **Screen kinds:**
  - `upload`: `{title, thumb_text, seconds}`
  - `success`: `{title, subtitle}`
  - `list`: `{title, items: [{title, meta}]}`
  - `feed`: `{items}`
  - `form`: `{title, fields, button}`
- **Beats:** `screen` × n (each screen pushes in), `tap`.

**`repo`: a faithful GitHub repo page; the cursor clicks Star** (use `broll`)
- **When:** "it's on my GitHub", "star the repo", open source.
- **Props:** `owner`, `repo`, `description`, `stars`, `forks`, `files: [{name, msg, dir}]`, `topics`, `commit`.
- **Beats:** `star`. The camera pushes in toward the button just before this beat.

**`flow`: a pipeline on a tilted 3D plane**
- **When:** "workflow", "first X, then Y", "how it works", before → after.
- **Props:**
  - `nodes`: `[{label, sub}]`, 2–5 nodes, numbered automatically. Never use emoji icons.
  - `title`
  - `vertical`: auto in 9:16
- **Beats:** `step` × n. Lock each one to the word that names that node.

**`compare`: "others vs ours"**
- **When:** "there are other tools, but this one…", before/after, old way vs new way.
- **Props:**
  - `title`, `kicker`: a serif headline, and the small line above it
  - `left`, `right`: the two column titles
  - `rows`: `[{label, left: bool, right: bool}]`, 3–6 rows. Take the labels from what the speaker claims.
- **Beats:** `row` × n (lock each row to the word that names that feature), `win` (the winning column lifts).

**`stat`: a count-up number**
- **When:** results, metrics, money, time ("in one day", "10x", "2,000 users").
- **Props:** `value`, `prefix`, `suffix`, `label`, `decimals`.

**`icon3d`: a real-WebGL extruded icon**
- **What it does:** flies in spinning, lands, and sparks orbit it.
- **When:** the emotional payoff of a sentence: a star ("give it a star"), a check ("done"), a heart, play, or a bolt ("fast").
- **Props:** `icon`, `label`, `sub`, `color`.
- **Beats:** `land`.

**`held_object`: a real 3D object in the speaker's hand (layout `tracked`)**
- **When:** the speaker mimes holding something: "I'm holding a ball", "this phone", "look at this". Watch for open palms raised toward the camera while they say it.
- **Props:** `object` (currently `ball`), `color`, `label`, `sub`. `track` is filled in by the script; don't write it yourself.
- **Beats:**
  - `hold` `{side: left|right}`: the object appears on that palm. Sides are as seen on screen.
  - `throw` `{side}`: the object flies in an arc to the other palm and is caught.
  - `label`: a caption appears next to the object.
- **How to run it:**
  1. Make sure no jump cut falls inside the cue (check `cut_audit.json`).
  2. After `build_filtergraph.py` and `master_audio.py`, run `track_hands.py --dir "$EDIT_DIR"`. It needs `pip install mediapipe opencv-python-headless`.
  3. Re-run the tracker whenever `finalize_edl.py` runs again, because finalizing rewrites `master_edl.json`.
- **Check:** if coverage is under 50%, move the beats to where the hands are visible.

## 5. Worked example (a 35 s clip about building an editing skill)

| Spoken | Scene | Layout | Props from the speech |
|---|---|---|---|
| "this whole video is edited by Claude" | terminal | split | `/vidbase edit Movie.mov` → steps → "Edited by Claude" |
| "this skill I created in one single day" | code | broll | SKILL.md being written, badge "built in 1 day" |
| "a whole workflow… editing… uploading" | flow | split | Record → Edit (by Claude) → Upload, beats on "workflow / editing / uploading" |
| "automatically edited… and uploaded by Claude" | phone_app | broll | upload screen then success, the second screen on "uploaded" |
| "it is already in my GitHub… give me a star" | repo | broll | owner/repo from the speaker, star beat on "star" |
| "…to promote this" | icon3d | overlay | star, "Give it a star" |

A second, 16:9 example: "there are multiple skills, but this is far better" → `compare` (split), with each row on the word naming the feature. "I'm holding a ball… throwing it to my other hand… this ball is created by Claude" → `held_object` (tracked), with `hold` on "holding", `throw` on "throwing" and `label` on "this ball".

Between scenes, the speaker's face carries the video. Leave stretches without a scene, because constant graphics feel just as robotic as constant cuts.

## 6. Adding a new scene

If nothing in the catalog fits, for example a dashboard, a map, a spreadsheet, or a before/after slider:
1. Write `assets/remotion_app/src/scenes/ui/<Name>.tsx`.
   - It receives `SceneProps`: `t`, `dur`, `props`, `beats`, `accent`, `index`, `w`, `h`, `vertical`.
   - Build it from `Device`, `Stage` and `Touch` (`scenes/Device.tsx`) and the motion tokens in `lib/motion.ts`.
2. Register it in `scenes/index.tsx` with a `design` canvas size, plus `designV` for portrait.
3. Add sample props to `src/qa_cues.ts`, render stills (`node scripts/stills.mjs SceneQA …`), and check them.
4. Add it to this catalog so future runs can reuse it.


**`proof_grid`: the product's real output, one tile per beat** (layout `broll`)
- **When:** the speaker lists what it does ("it has this, this and this"). Each item lands as a real frame of the result.
- **Props:** `tiles: [{img, label}]` (2-4; images under `public/`, e.g. `proof/ball.jpg`; labels 2-4 words).
- **Beats:** `tile` × n, locked to the words that name each item.

**`before_after`: the same instant, raw vs edited** (layout `broll`)
- **When:** "this level of editing", "look at the difference", any claim about the edit itself.
- **Props:** `before`, `after` (images under `public/`), `beforeLabel`, `afterLabel`.
- **Beats:** `after` (when the edited half lands).
