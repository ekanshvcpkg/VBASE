---
name: vbase
description: VBASE — autonomous AI video editing studio that turns a raw talking-head / screen / vlog recording into a polished, high-retention short or long-form video — natural-sounding dead-air and filler removal (pauses compressed, not chopped), cold-open hook, any output format (9:16, 16:9, 1:1, 4:5 or the original shape) with a smart speaker-centered crop, motivated push-ins, color grade, studio vocal chain with room tone, ElevenLabs-generated background music ducked under the voice, ElevenLabs SFX/voiceover, word-by-word animated captions, contextual motion-graphics scenes that show what the speaker is talking about (terminal / chat / code typing, a phone popping up with the app running, repo pages, workflow diagrams, Three.js 3D icons), a self-QC pass, and social titles/hashtags. Use this skill whenever the user wants to edit, cut, trim, repurpose, or "make viral" a video file, turn a long video into a Reel / TikTok / YouTube Short, add captions or subtitles burned into a video, remove silences or "ums", add 3D or motion graphics to footage, or auto-edit a recording — even if they don't say "studio" or name any tool.
compatibility: Requires ffmpeg/ffprobe, Python 3.8+, Node 18+ (for Remotion). Optional - openai-whisper CLI (or OPENAI_API_KEY for the Whisper API), ELEVENLABS_API_KEY.
---

# VBASE — Auto Video Studio

A multi-role production pipeline with a **one-time onboarding**. The first time, you interview
the creator and save their editing profile. After that, every video runs on autopilot in their
style. You play each role in turn by reading its agent file when that stage starts (don't preload
them all; each one is only relevant to its stage).

```
 Stage 0  agents/00_onboarding.md          FIRST RUN ONLY: ~20 questions → ~/.vidbase/profile.json + env setup
 Stage 1  agents/01_setup_intake.md        profile → setup.json, media probe, transcript (asks only what the profile leaves open)
 Stage 2  agents/02_content_director.md    Phase A: editorial pass (edit_plan.md) → edit → master_edl.json
 Stage 3  agents/03_video_editor.md        EDL → cut/crop/zoom/grade + audio master → base_cut.mp4
 Stage 4  agents/04_3d_graphic_designer.md scenes + captions over base_cut → final_render.mp4
 Stage 5  agents/02_content_director.md    Phase B: multimodal QC → fix loop (max 2) → deliver
```

**Always start here:**
```bash
python3 "$SKILL_DIR/scripts/profile.py" status
```
- **Exit 3 (no profile):** run **Stage 0**. It's the slow, careful conversation, and it only
  happens once. Do it even if the user already attached a video; then continue with that video.
- **A profile exists:** the fast path. Don't re-interview. Say one line, e.g.
  > Editing with your profile: 16:9 · natural · editorial look · refined captions · no music.
  > Say "change" to override for this video.

  Then go straight to Stage 1. Ask only what `profile.py apply` reports under `ask`: the format
  when the profile says "ask each video", an ElevenLabs key when music is generated, the hook
  when the policy is "ask". Per-video overrides the user mentions ("make this one vertical")
  are passed to `apply` as `key=value`.
- **"Change my vidbase settings" / "redo onboarding":** use `profile.py set key=value` for a
  single change; re-run Stage 0 to start over.

## The VBASE plugin pipeline (use this when running as the `vbase` plugin)

The plugin bundles a full runner around the stages below. Paths are relative to the plugin root,
`${CLAUDE_PLUGIN_ROOT}` (use it verbatim in Bash).

1. **First run on a machine:** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"` (installs WhisperX, Silero VAD,
   PySceneDetect, OpenTimelineIO, auto-editor, MediaPipe models, DeepFilterNet, Take One; finds a Chromium browser).
   `--check` reports without installing. If it reports anything missing, stop and tell the user exactly what.
2. **Analyze:** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" analyze "<video>"`. Work dir: `<video dir>/.vbase/<name>/`
   (use it as `$EDIT_DIR`). It writes `transcript.json` (WhisperX word timing), `vad.json`, `silences.json`, scene cuts.
3. **Direct (Stage 2 of this skill):** write `edit_plan.md` + `edl_draft.json` in the work dir exactly as described below.
4. **Render:** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" render "<video>"` → `<video dir>/<name>-vbase.mp4`.
   Optional env, set from what the speaker actually says:
   - `ZOOM_WORD=zoom` (default): a camera push on the word's first use, pull-out on its second. Only if both exist.
   - `CLONE_AT=<source seconds of a calm full-body frame> CLONE_WORD=<word>`: a segmented copy of the speaker appears
     behind them on that word. Use only when the speaker talks about it.
   - `BRAND LINE1 LINE2 TAGLINE END1 END2 CTA FOOT`: the Take One open and end-card words (real names only).
   - `SFX=1` adds procedural sound effects. **Off by default**: owners found them distracting under a voice.
   - `TAKEONE=0` skips the open/end card.
5. **Review:** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" review "<video>"` opens the VBASE review room
   (http://localhost:4400). Notes land in `<work>/cuts/review-notes/notes.json` with a snapshot per pinned frame;
   each "Send notes" appends `SENT` to `sent.log`. Treat every note as the next take.

**Two extra scenes** ship with the plugin (see `references/scene_catalog.md`): `proof_grid` (a 2x2 grid of real frames
from the edit, one tile per beat) and `before_after` (the raw take beside the edit at the same instant). Their images go
in `<work>/proof/` (extract them with ffmpeg from the raw video and a first render) and are referenced as `proof/<file>.jpg`;
the render stage copies them into the Remotion project.

**Lessons from real reviews (keep them):** show the product's real output, not mock panels; diagrams of boxes read as
"AI-looking"; never put sound effects under the voice unless asked; zooms are camera moves (spring in, ease out), not snaps;
every on-screen line must be readable on a phone (≥46 px at 1080p); never claim a feature the video does not show.

**Human touchpoints after onboarding:** at most one short question (only what the profile
leaves open). With `autopilot: false` there's also the plan greenlight. Otherwise run end to
end without asking. Self-heal failed commands by reading stderr and fixing them. Only stop if
something is truly unrecoverable (e.g. the input file is corrupt), and then explain precisely
what broke.

## Workspace

All intermediate files live in one work directory. Default:

```bash
export EDIT_DIR=/tmp/tmp_edit        # NOT /tmp_edit — the filesystem root is read-only on macOS
export SKILL_DIR=<absolute path of this skill's folder>
export INPUT_VIDEO=<absolute path to the user's video>
```

If a previous run's `$EDIT_DIR` exists for a *different* input, move it aside
(`mv "$EDIT_DIR" "$EDIT_DIR.$(date +%s)"`) rather than mixing artifacts. The source
video is never modified.

Shell variables don't persist between Bash calls, so either re-export them at the top
of each command or write literal paths.

## Bundled tools (use these instead of rewriting them)

| Script | Purpose |
|---|---|
| `scripts/profile.py` | The creator's saved editing profile (`~/.vidbase/`): `status`, `save`, `show`, `set key=value`, `apply` (profile → this video's `setup.json`, plus what still needs asking) |
| `scripts/setup_env.sh` | One-time environment: `~/.vidbase/venv` with Whisper + MediaPipe and pre-downloaded models; writes `~/.vidbase/env.sh` |
| `scripts/normalize_transcript.py` | Whisper CLI / OpenAI API JSON → `transcript.json` (flat word list) |
| `scripts/parse_silence.py` | `silence.log` → `silences.json` + totals |
| `scripts/finalize_edl.py` | Director's `edl_draft.json` (source times) → `master_edl.json`. Compresses pauses by type, merges short shots, caps cuts/min, assigns motivated framing and push-ins, maps scene beats to words, writes `cut_audit.json` |
| `scripts/test_finalize_edl.py` | Self-test of the cutting engine on a synthetic transcript |
| `scripts/track_hands.py` | After the cut: MediaPipe palm tracking for `tracked` cues (3D objects held or thrown in the speaker's hands), written into `master_edl.json` |
| `scripts/build_filtergraph.py` | `master_edl.json` → `filter_complex.txt` (trim, smart crop, zoom, grade, equal-power fades at edits, room-tone bed, concat) |
| `scripts/generate_audio.mjs` | ElevenLabs background music (from `music_prompt`), SFX and optional voiceover from the EDL |
| `scripts/master_audio.py` | Vocal chain + SFX placement + BGM sidechain ducking + two-pass loudnorm to −14 LUFS |
| `scripts/bootstrap_remotion.sh` | Creates/updates the Remotion + Three.js app in `$EDIT_DIR/remotion_app` |
| `scripts/qc_report.py` | Loudness, true peak, black frames, duration/stream checks, entry/peak/exit strips per scene, tiny-jump-cut list, contact sheet |
| `assets/remotion_app/` | Template Remotion project: scene library (`src/scenes/`), motion tokens (`src/lib/motion.ts`), captions, `SceneQA` composition, `scripts/stills.mjs` |
| `references/editing_sense.md` | **How a senior editor thinks:** Murch's priorities, anti-AI rules (proof not see-say, accordion pacing, keep the breath, earned motion), the hook, cut timing, sound lanes, and the required `edit_plan.md`. Read it first in Stage 2 |
| `references/visual_direction.md` | **How it must look:** the AI tells (floating dark glass windows, tilt-wobble, emoji, glows, fade-scale entrances, system fonts) and the professional replacements (faithful product replicas, locked camera + decisive pushes, cursor-performed actions, hard cuts/wipes, editorial panels, refined subtitles). Read it before building or tuning a scene |
| `references/scene_catalog.md` | Which scene to use for which kind of sentence, the props, the beats and the layouts. Read it when storyboarding |
| `references/motion_rules.md` | How scenes should move (easing, staggers, holds, the avoid list). Read it when building or tuning a scene |

Every script prints `--help`. All take `--dir "$EDIT_DIR"`.

## Key artifacts (contract between stages)

- `~/.vidbase/profile.json` / `profile.md` — the creator's editing profile (onboarding; persists across videos and skill updates)
- `setup.json` — this video's settings: the profile plus per-video overrides (`profile.py apply`)
- `metadata.json`, `probe_frame.jpg`, `silences.json`, `transcript.json` — Stage 1 inspection
- `edit_plan.md` — the editorial pass: emotional spine, rhythm wave, see-say audit, sound plan
- `storyboard.md` — the director's list of visual moments (what is said, what we show, props)
- `edl_draft.json` → `master_edl.json` — the edit decision list (schema in `agents/02_content_director.md`)
- `cut_audit.json` — one row per jump cut (removed seconds, pause class, the words around it)
- `social_metadata.md` — titles, caption, hashtags
- `base_cut.mp4` — edited + mastered video, no graphics
- `final_render.mp4` — with captions and 3D
- `qc_state.json` — retry counter for the Stage 5 circuit breaker

## Delivery

When QC passes (or the circuit breaker finalizes), copy the deliverables next to the
source video so they survive `/tmp` cleanup:

```bash
SRC_DIR=$(dirname "$INPUT_VIDEO"); BASE=$(basename "${INPUT_VIDEO%.*}")
cp "$EDIT_DIR/final_render.mp4" "$SRC_DIR/${BASE}_studio.mp4"
cp "$EDIT_DIR/social_metadata.md" "$SRC_DIR/${BASE}_social.md"
```

Then give the user a short report:
- final duration vs. raw, and cuts per minute
- what was cut, and the hook used
- the scenes, as "spoken line → what we showed"
- loudness reading
- any QC fixes applied
- the paths of the deliverables

## Degrading gracefully

The user's answers enable features; missing tools disable them without failing the job:
- No `ELEVENLABS_API_KEY` → ask the user to connect it if they chose generated music or SFX.
  If they decline, offer their own music file or no music, and say so in the final report.
- `three_d: none` → captions only. (Keep one or two `stat` scenes only if the user wants them.)
- Remotion install fails (offline, npm errors after a self-heal attempt) → burn captions
  with ffmpeg `drawtext`/`subtitles` on `base_cut.mp4` as the final render and say so.
- No Whisper available and no `OPENAI_API_KEY` → ask the user (this is one of the few
  legit reasons to break autonomy, because without words there is no edit).
