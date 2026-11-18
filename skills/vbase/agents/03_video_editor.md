# Stage 3 — Lead Video & Audio Engineer

You turn `$EDIT_DIR/master_edl.json` into a frame-accurate, smart-cropped, color-graded,
studio-mixed `$EDIT_DIR/base_cut.mp4` (no captions or graphics; those come next).

## Ground rules
- **Non-destructive.** Never write to the source file; everything goes in `$EDIT_DIR`.
- **Constant frame rate and sample rate.** Every segment is forced to `edl.fps` and
  48 kHz stereo before concatenation. Mixed rates are the #1 cause of audio drifting
  out of sync over a long edit.
- **Self-healing.** If an ffmpeg command fails, read the last ~30 lines of stderr, fix
  the cause, and re-run without asking the user. Common causes: an unescaped `,` inside
  a filter expression, a segment with zero length, or the source having no audio stream.

## Step 1: Cut, smart crop, zoom, grade
Generate the filtergraph from the EDL (supports any number of segments):
```bash
python3 "$SKILL_DIR/scripts/build_filtergraph.py" --dir "$EDIT_DIR"
```
For each segment it builds:
1. `trim`/`atrim` at the frame-snapped `source_start`/`source_end`, then `setpts=PTS-STARTPTS`
   and `asetpts=PTS-STARTPTS`, plus 10 ms audio fades at each edge so cuts don't click.
2. A framing chain chosen from the source orientation and the target:
   - landscape → 9:16: speaker-centered crop
     `crop=w=ih*9/16:h=ih:x='clip(iw*X-ih*9/32,0,iw-ih*9/16)':y=0`, then scale to 1080×1920
   - same orientation: scale to cover + center crop
   - portrait → 16:9: blurred, scaled-up copy as the background, with the sharp video fitted on top
3. Punch-in when `zoom > 1`: scale by `zoom`, then crop back to the target size. The crop
   is biased slightly toward `speaker_face_y_ratio`, so the zoom pushes toward the face
   instead of cutting off the top of the head.
4. Grade and sharpen: `eq=contrast=1.08:brightness=0.02:saturation=1.18,unsharp=5:5:0.8:3:3:0.4`
   (cinematic style uses a softer, lower-saturation grade).
5. `fps`, `setsar=1`, `format=yuv420p`, then `concat` of all segments into `[outv][outa]`.

Run it. Recent ffmpeg (7.1+) reads a filtergraph file with `-/filter_complex`; older
builds use `-filter_complex_script`. The script prints which one your ffmpeg supports:
```bash
ffmpeg -y -i "$INPUT_VIDEO" -/filter_complex "$EDIT_DIR/filter_complex.txt" \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -r <fps> \
  -c:a aac -ar 48000 -b:a 192k -movflags +faststart \
  "$EDIT_DIR/step1_visual_cut.mp4"
```
For long sources (> 10 min) with many segments this can be slow; `-preset veryfast` is fine.

## Step 2: ElevenLabs music, SFX and voiceover (only if enabled and `ELEVENLABS_API_KEY` is set)
```bash
node "$SKILL_DIR/scripts/generate_audio.mjs" --dir "$EDIT_DIR"
```
It composes `bgm.mp3` from `music_prompt` with ElevenLabs Music (POST `/v1/music`,
instrumental, the length of the video). It skips this when the user supplied their own
`bgm.*`. It also generates `sfx_<cueIndex>.mp3` for every cue with an `sfx_prompt` (POST
`https://api.elevenlabs.io/v1/sound-generation`), and `vo_<n>.mp3` for `vo_cues` via
text-to-speech. It writes `audio_manifest.json` with each file's timeline offset.
Failures on individual cues are logged and skipped; one bad prompt shouldn't sink the render.
If the key is missing, skip this step and note it for the final report.

## Step 3: Studio vocal chain, SFX placement, optional BGM ducking, loudness
```bash
python3 "$SKILL_DIR/scripts/master_audio.py" --dir "$EDIT_DIR"
```
It detects what's available and builds one filtergraph:
- **Voice:** `highpass=f=80` (rumble) → `afftdn=nf=-25` (broadband noise) →
  `acompressor=threshold=-18dB:ratio=3:attack=5:release=50`
- **SFX / VO:** each file from `audio_manifest.json` is delayed to its `timeline_start`
  with `adelay`, at modest gain (SFX should accent, not compete with the voice)
- **BGM** (if `$EDIT_DIR/bgm.*` exists): looped, trimmed to length, lowered, and
  `sidechaincompress`ed with the voice as the key, so music ducks whenever the
  speaker talks. Mixed with `amix … normalize=0`, because default amix normalization
  quietly halves the voice level.
- **Loudness:** two-pass `loudnorm` to `I=-14:TP=-1.0:LRA=11`. Pass 1 measures, pass 2
  applies a linear correction. Single-pass loudnorm works by pumping the gain dynamically,
  which is audible on speech.
- Video is stream-copied (`-c:v copy`), so this step is fast and lossless for picture.

Output: `$EDIT_DIR/base_cut.mp4`.

## Step 4: Verify before handoff
```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration \
  -of json "$EDIT_DIR/base_cut.mp4"
```
Confirm: one video and one audio stream, the target width/height, duration within
~0.1 s of `master_edl.json.total_duration`, and file size > 0. If the duration is off
by more than a frame or two per segment, the segments weren't frame-snapped —
re-run `finalize_edl.py` before re-cutting rather than patching the EDL by hand.

Then read `agents/04_3d_graphic_designer.md` and continue.
