# Stage 1 — Setup & Technical Intake

You handle the human onboarding and raw media inspection before autonomous production
begins. Your output is a plan the user can approve in one glance.

## Step 1: Apply the profile (fast path)

Onboarding (`agents/00_onboarding.md`) already learned how this creator edits. Turn their
profile into this video's settings, with any per-video overrides they mentioned ("make this one
vertical", "no music this time"):
```bash
source ~/.vidbase/env.sh 2>/dev/null || true
mkdir -p "$EDIT_DIR"
python3 "$SKILL_DIR/scripts/profile.py" apply --dir "$EDIT_DIR" --input "$INPUT_VIDEO" [target_aspect=9:16 music=none ...]
```
It writes `$EDIT_DIR/setup.json` and prints an `ask` list. **Ask only those items**, in one
short message (`AskUserQuestion` when available), then re-run `apply` with the answers as
`key=value`. The items are:
- `target_aspect`: the profile says "ask each video". Offer 9:16 / 16:9 / 1:1 / 4:5 / original,
  and mention the source's shape from a quick `ffprobe`.
- `elevenlabs_key`: generated music is on but the key is missing. See "Connecting ElevenLabs" below.
- `music_file`: their track path is missing or moved.
- `hook`: the hook policy is "ask". Propose the strongest line and ask to cold-open on it or keep the intro.

If `ask` is empty, ask nothing and continue.

**Connecting ElevenLabs.** If generated music or SFX is on and `ELEVENLABS_API_KEY` is empty,
ask them to connect it. Don't silently skip music they chose. Tell them:
> To generate music and sound effects I need your ElevenLabs API key (elevenlabs.io →
> Profile → API keys). Add it to your shell profile so every command sees it:
> `! echo 'export ELEVENLABS_API_KEY=sk_...' >> ~/.zshrc && source ~/.zshrc`

If they'd rather not, run `apply` with `music=none` (or their own file), and mention it in the
final report.

*No profile at all (e.g. the user refuses onboarding):* ask the four essentials in one message
(format, pacing, music, graphics), then save them as a minimal profile with `profile.py save`.

## Step 2: Automated media inspection

Run these without asking. They're independent, so batch them where you can.

1. **Metadata probe**
   ```bash
   ffprobe -v quiet -print_format json -show_format -show_streams "$INPUT_VIDEO" > "$EDIT_DIR/metadata.json"
   ```
   Note: width/height, `r_frame_rate`, duration, whether an audio stream exists, and
   any rotation (`side_data_list[].rotation` or `tags.rotate`) — phone footage is often
   stored landscape with a 90° flag, which flips the real orientation.

2. **Speaker position (for the smart crop)**: only needed when the target is narrower than
   the source, e.g. landscape → 9:16, 4:5 or 1:1. Grab 3 frames spread across the video so one
   odd frame (speaker leaning, B-roll) doesn't mislead you:
   ```bash
   D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT_VIDEO")
   for p in 10 50 85; do
     ffmpeg -v error -y -ss $(python3 -c "print($D*$p/100)") -i "$INPUT_VIDEO" -frames:v 1 -vf scale=640:-1 "$EDIT_DIR/probe_$p.jpg"
   done
   ```
   View them with `Read`. Estimate `speaker_center_x_ratio` (0.0 = far left, 0.5 = center,
   1.0 = far right) as the horizontal center of the face, averaged across frames.
   Also note the face's vertical position — the designer needs it to keep 3D away from it.

3. **Silence detection**
   ```bash
   ffmpeg -i "$INPUT_VIDEO" -af silencedetect=noise=-30dB:d=0.4 -f null - 2> "$EDIT_DIR/silence.log"
   # silences are used to trim Whisper's stretched word edges and to sample room tone,
   # not to decide cuts. Cuts come from word gaps (see finalize_edl.py).
   python3 "$SKILL_DIR/scripts/parse_silence.py" --dir "$EDIT_DIR"
   ```
   If the speaker is quiet or the room is noisy, -30 dB can over/under-detect; if the
   reported silence total looks absurd (e.g. >60% or 0%), re-run with -35 dB or -25 dB.

4. **Word-level transcription** — try in this order:
   - Onboarding's persistent install (fastest, no setup): `"$VIDBASE_WHISPER" "$INPUT_VIDEO" --model "$VIDBASE_WHISPER_MODEL" --word_timestamps True --output_format json --output_dir "$EDIT_DIR" --fp16 False`
     (after `source ~/.vidbase/env.sh`)
   - Local CLI: `whisper "$INPUT_VIDEO" --model base --word_timestamps True --output_format json --output_dir "$EDIT_DIR"`
     (use `--model small` for non-English or noisy audio; it's slower but much more accurate).
   - If `whisper` is missing: `pip3 install -U openai-whisper` and retry.
   - If that fails and `OPENAI_API_KEY` is set, use the API (25 MB limit, so send compressed audio):
     ```bash
     ffmpeg -v error -y -i "$INPUT_VIDEO" -vn -ac 1 -ar 16000 -b:a 48k "$EDIT_DIR/audio_16k.mp3"
     curl -s https://api.openai.com/v1/audio/transcriptions \
       -H "Authorization: Bearer $OPENAI_API_KEY" \
       -F file=@"$EDIT_DIR/audio_16k.mp3" -F model=whisper-1 \
       -F response_format=verbose_json -F "timestamp_granularities[]=word" \
       -F "timestamp_granularities[]=segment" > "$EDIT_DIR/whisper_api.json"
     ```
   Then normalize whichever output you got:
   ```bash
   python3 "$SKILL_DIR/scripts/normalize_transcript.py" --dir "$EDIT_DIR" --input <whisper json path>
   ```
   This writes `$EDIT_DIR/transcript.json` (`{language, duration, words:[{i,word,start,end}], segments:[...]}`).

## Step 3: Plan, then greenlight only if the profile asks for it

Read the transcript (segments are the quickest way to skim it) and form a short plan:
- the source, and the target format
- what will be cut, and the estimated final duration
- the hook (following `editorial.hook_policy`)
- the 3–6 scenes, as "spoken line → what we show", allowed by `editorial.elements`
- the audio

- **`setup.json` has `"autopilot": true` (the usual case):** state the plan in two or three lines
  and continue straight to `agents/02_content_director.md`. Don't wait.
- **`"autopilot": false`:** ask **"Shall I start production with this plan?"** and apply any tweaks.

Then read `agents/02_content_director.md` and start Phase A. Don't ask anything else until delivery.
