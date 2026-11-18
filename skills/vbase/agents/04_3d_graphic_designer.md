# Stage 4 — Motion Graphics Designer (UI scenes + 3D)

You composite three things over `$EDIT_DIR/base_cut.mp4`, using **Remotion**, all driven by
`master_edl.json`. Output: `$EDIT_DIR/final_render.mp4`.
- the speaker layer: push-ins, plus making room for scenes
- the director's **scene cues**: rebuilt UI in CSS-3D, and real WebGL via `@remotion/three`
- word-by-word captions

Your bar: **each scene must show what the speaker is saying, with their words in it, and must not look generated.**
Read `references/visual_direction.md` first: faithful product replicas built on `scenes/Screen.tsx`
(flat UI, locked camera, decisive pushes, a cursor that performs the action), not floating tilted windows.
 If a
cue in the EDL is too weak for that, improve its props or build the scene it needs. See
`references/scene_catalog.md` for the scenes and `references/motion_rules.md` for how they
should move.

A ready-made Remotion project ships in `$SKILL_DIR/assets/remotion_app/`. Prefer
adjusting it over writing a new one: it already handles everything below.

## Rules for headless 3D (why the template is built the way it is)
1. **No `useFrame()`, `ScrollControls`, `OrbitControls`, `Clock` or `requestAnimationFrame`.**
   Remotion renders frames out of order, in parallel browser tabs. Anything driven by
   wall-clock time freezes or jitters. Derive every rotation, scale and position from
   `useCurrentFrame()` with `spring()` / `interpolate()`.
2. **`gl={{ alpha: true }}` and a transparent background on `<ThreeCanvas>`.** Otherwise
   WebGL draws an opaque black rectangle over the video.
3. **No network at render time.** drei's `<Environment preset="city">` downloads an HDR
   from a CDN; offline or rate-limited, it suspends forever and the render times out.
   The template bakes its reflections locally: a `RoomEnvironment` goes through `PMREMGenerator`.
4. **Place objects in camera space.** The visible width at z=0 depends on the aspect ratio:
   with `fov=40` at `z=5` the half-height is ≈1.82 units, but the half-width is only
   ≈1.02 in 9:16. A fixed `x=1.4` that looks fine in 16:9 is off-screen in vertical.
   The legacy `Cue3D.tsx` maps `position` names to normalized screen coordinates.
   Scenes avoid the problem entirely: each one draws on its own design canvas, sized to the
   layout box (`scenes/index.tsx`).
6. **Text lives in the DOM, not in WebGL textures.** UI scenes use real DOM inside a CSS
   `perspective` stage (`scenes/Device.tsx`), sized with CSS `zoom`, so type stays sharp.
   Reserve three.js for objects: `scenes/three/Icon3D.tsx`.
7. **Every animation is a pure function of time.** Scenes receive `t` (seconds since the cue
   started) and compute everything from it with `lib/motion.ts` (`prog`, `EASE`, `beatAt`,
   `typed`, `drift`). Never use component state or effects for animation.
5. **Compress custom `.glb` models first**, or the renderer may time out loading them:
   ```bash
   npx -y @gltf-transform/cli optimize "$GLB_PATH" "$EDIT_DIR/remotion_app/public/opt.glb" \
     --compress draco --texture-compress webp
   ```

## Step 0: Hand tracking (only if a cue has `"layout": "tracked"`)
```bash
source ~/.vidbase/env.sh 2>/dev/null   # onboarding's venv already has mediapipe
"${VIDBASE_PY:-python3}" "$SKILL_DIR/scripts/track_hands.py" --dir "$EDIT_DIR"
# no venv? pip3 install -q mediapipe opencv-python-headless
```
This samples `base_cut.mp4` over each tracked cue and writes the palm track into the cue's props.
Run it after the cut and before bootstrap, since bootstrap copies `master_edl.json` into the app.

## Step 1: Bootstrap (first run) or refresh (QC retry)
```bash
bash "$SKILL_DIR/scripts/bootstrap_remotion.sh" "$EDIT_DIR"
```
- **First run:** it copies the template to `$EDIT_DIR/remotion_app` and installs the versions
  pinned in its `package.json` (Remotion 4, React 18, R3F 8, drei 9, three 0.169), which takes
  about 30 s.
- **Every run:** it copies the latest `base_cut.mp4` into `public/` and `master_edl.json` into
  `src/`.
- **`REFRESH_SRC=1`:** also re-copies the template's `src/`, to pick up scene-library changes.

If the install fails (no network), use the SKILL.md fallback: burn captions with ffmpeg.

## Step 2: Review the composition against the EDL
Files in `$EDIT_DIR/remotion_app/src/`:
- `Root.tsx`: registers `MainComposite`, sizing width, height, fps and
  `durationInFrames = round(total_duration * fps)` from the EDL, so the composition matches
  `base_cut.mp4` frame for frame.
- `MainComposite.tsx`:
  - the speaker layer: `OffthreadVideo`, which also carries the audio, with a per-shot `push`
    and a slide, blur and feather for `split`/`broll`
  - one `<Sequence>` per cue: `SceneLayer` for scene cues, `Cue3D` for legacy cues
  - the caption track
- `scenes/index.tsx`: the scene registry, the layout boxes, and how a layout moves the speaker.
- `scenes/ui/*.tsx`: `Terminal`, `Chat`, `Code`, `PhoneApp`, `Repo`, `Flow`, `Stat`.
- `scenes/three/Icon3D.tsx`: an extruded WebGL icon.
- `scenes/Device.tsx`: phone, window and laptop frames, `Stage`, and `Touch`.
- `Cue3D.tsx`: the legacy primitives and the `badge_2d` fallback.
- `Captions.tsx`: word-grouped captions with the active word popped and highlighted.

Things you might tune per video (edit, don't rewrite):
- Caption size and position: 9:16 sits ~320 px above the bottom to clear TikTok/Reels UI.
- Accent color: default `#00FF88`. Match the creator's brand if they mentioned one.
- For "cinematic" style, captions are smaller and sentence-case; `style` comes from the EDL.

**Always check stills before the full render.** A full render takes minutes; stills take seconds.
```bash
cd "$EDIT_DIR/remotion_app"
# entry + middle + exit of every cue, in seconds of the timeline
node scripts/stills.mjs MainComposite stills 2.0,3.1,4.2,... 0.5
ffmpeg -v error -y -pattern_type glob -i 'stills/*.jpg' -vf "scale=360:-2,tile=6x2:padding=4" ../stills_contact.jpg
```
`Read` the contact sheet and check four things:
- Is any text too small to read on a phone?
- Is anything cropped, overflowing, or covering the face?
- Does each action (tap, tick, step) land on its word?
- Does every scene pass the mute test?

To build or tweak a scene in isolation, add sample props to `src/qa_cues.ts` and render
stills from the `SceneQA` composition instead.

## Step 3: Render
```bash
cd "$EDIT_DIR/remotion_app"
npx remotion render src/index.ts MainComposite "$EDIT_DIR/final_render.mp4" \
  --gl=angle --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=192k --concurrency=2 --timeout=120000
```
- `--gl=angle` gives WebGL in headless Chrome on macOS and most Linux setups. On Linux
  without a GPU, if 3D comes out blank, try `--gl=swangle` (software, slower but reliable).
- Keep `--concurrency` low (2). Blurred B-roll frames and WebGL contexts are heavy, and
  higher concurrency makes frames time out even though each frame renders alone in about 3 s.
- Self-heal TypeScript/bundle errors by reading the error, fixing the file, and re-rendering.

Once `final_render.mp4` exists, go back to `agents/02_content_director.md` → **Phase B**.
