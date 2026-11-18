#!/usr/bin/env bash
# VBASE pipeline runner. Claude (the vbase skill) drives it in two stages, writing the creative decisions in between.
#
#   bash scripts/run.sh analyze <video>    probe, silences, Silero VAD, auto-editor pass, WhisperX words, scene cuts
#   ...Claude writes <work>/edit_plan.md + edl_draft.json (skill Stage 2)...
#   bash scripts/run.sh render  <video>    cut + grade + audio master -> in-footage FX -> 3D/captions -> Take One open/end card -> QC
#   bash scripts/run.sh review  <video>    open the VBASE review room on the cuts (render does this automatically)
#
# Optional env for render:  ZOOM_WORD=zoom   CLONE_AT=<source s> CLONE_WORD=<word>   SFX=1   VBASE_GRADE=natural (camera colours)
#                           MUSIC=1 [BGM_VOLUME=0.22]   ElevenLabs background music (needs ELEVENLABS_API_KEY)
#                           BRAND LINE1 LINE2 TAGLINE END1 END2 CTA FOOT   (Take One words)   TAKEONE=0 (skip Take One)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; VB="${VBASE_HOME:-$HOME/.vbase}"
[[ -f "$VB/env.sh" ]] || { echo "Run first: bash $ROOT/scripts/setup.sh"; exit 1; }
source "$VB/env.sh"; [[ -f "$HOME/.vidbase/env.sh" ]] && source "$HOME/.vidbase/env.sh"
STAGE="${1:?stage: analyze|render|review}"; IN="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
NAME="$(basename "${IN%.*}")"; W="${VBASE_WORK:-$(dirname "$IN")/.vbase/$NAME}"; mkdir -p "$W"
SK="$ROOT/skills/vbase/scripts"; PY="$VB/venv/bin/python"; P="$ROOT/pipeline"
echo "work dir: $W"

# the VBASE review room, detached so it keeps running after this script (and Claude) exit
start_room() {
  local port="${PORT:-4400}" cuts="$W/cuts"; mkdir -p "$cuts"
  # every render becomes the next take (-v2, -v3 ...); notes stay pinned to the take they were written on
  local out="$(dirname "$IN")/$NAME-vbase.mp4" last="" n=1
  if [[ -f "$out" ]]; then
    for f in "$cuts/$NAME-vbase.mp4" "$cuts/$NAME-vbase-v"*.mp4; do [[ -f "$f" ]] && { last="$f"; n=$((n+1)); }; done
    last=$(ls -t "$cuts/$NAME-vbase"*.mp4 2>/dev/null | head -1 || true)
    if [[ -z "$last" ]]; then cp "$out" "$cuts/$NAME-vbase.mp4"
    elif ! cmp -s "$out" "$last"; then cp "$out" "$cuts/$NAME-vbase-v$n.mp4"; echo "new take: $NAME-vbase-v$n"; fi
  fi
  if curl -s -o /dev/null "http://127.0.0.1:$port/api/cuts"; then
    pkill -f "review-room/server.mjs .* $port\$" 2>/dev/null || true; sleep 0.5      # a room for another video: replace it
  fi
  nohup node "$ROOT/review-room/server.mjs" "$cuts" "$port" > "$W/review-room.log" 2>&1 &
  disown 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.3; done
  echo "VBASE review room: http://localhost:$port   (notes: $cuts/review-notes/, stop: pkill -f review-room/server.mjs)"
  command -v open >/dev/null && open "http://localhost:$port" || true
}

case "$STAGE" in
analyze)
  ffmpeg -v error -y -i "$IN" -ac 1 -ar 16000 "$W/audio16k.wav"
  ffprobe -v quiet -print_format json -show_format -show_streams "$IN" > "$W/metadata.json"
  python3 "$SK/profile.py" apply --dir "$W" --input "$IN" || true
  "$PY" - "$W" <<'EOF'
import sys, json, soundfile as sf, torch
from silero_vad import load_silero_vad, get_speech_timestamps
a, sr = sf.read(f"{sys.argv[1]}/audio16k.wav", dtype="float32")
ts = get_speech_timestamps(torch.from_numpy(a), load_silero_vad(), sampling_rate=sr, return_seconds=True, min_silence_duration_ms=250, speech_pad_ms=60)
json.dump(ts, open(f"{sys.argv[1]}/vad.json", "w"), indent=1); print(len(ts), "speech regions (Silero VAD)")
EOF
  auto-editor "$IN" --export v3 -o "$W/ae_timeline.json" --margin 0.15s >/dev/null 2>&1 || echo "auto-editor pass skipped"
  "$VB/venv/bin/whisperx" "$W/audio16k.wav" --model large-v3-turbo --compute_type int8 --output_dir "$W/whisperx" --output_format json --vad_method silero >/dev/null 2>&1
  python3 "$SK/normalize_transcript.py" --dir "$W" --input "$W/whisperx/audio16k.json"
  "$VB/venv/bin/scenedetect" -i "$IN" -o "$W/scenes" detect-adaptive list-scenes -q >/dev/null 2>&1 || true
  ffmpeg -i "$IN" -af silencedetect=noise=-35dB:d=0.3 -f null - 2> "$W/silence.log" || true
  python3 "$SK/parse_silence.py" --dir "$W"
  echo "ANALYZED. Next: write $W/edit_plan.md and $W/edl_draft.json, then: bash $0 render \"$2\""
  ;;
render)
  python3 "$SK/finalize_edl.py" --dir "$W"
  # smooth camera: the same framing on every shot (alternating punch-ins and per-shot push resets read as jitter at cuts)
  [[ "${SMOOTH:-1}" == 1 ]] && python3 -c "import json,sys;p=sys.argv[1];m=json.load(open(p))
for s in m['keep_segments']: s['zoom']=1.0; s['push']=0.0
cuts=[s['timeline_start'] for s in m['keep_segments'][1:]]; cues=sorted(m.get('three_d_cues',[]),key=lambda c:c['timeline_start'])
for i,c in enumerate(cues):   # a cut must never show through a full-frame panel's fade: hold the panel 0.45 s past it
  if c.get('layout')!='broll': continue
  nxt=cues[i+1]['timeline_start']-0.05 if i+1<len(cues) else m['total_duration']
  for k in cuts:
    if c['timeline_end']-0.45<k<c['timeline_end']+0.05: c['timeline_end']=round(min(k+0.45,nxt),3)
    if c['timeline_start']-0.05<k<c['timeline_start']+0.4: c['timeline_start']=round(max(k-0.45,0),3)
json.dump(m,open(p,'w'),indent=1)" "$W/master_edl.json"
  # the builder reports which filtergraph-file flag this ffmpeg understands (-/filter_complex on 7.1+)
  FLAG=$(python3 "$SK/build_filtergraph.py" --dir "$W" | python3 -c "import sys,json;print(json.load(sys.stdin).get('flag','-filter_complex_script'))")
  ffmpeg -v error -y -i "$IN" $FLAG "$W/filter_complex.txt" -map "[outv]" -map "[outa]" \
    -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -ar 48000 -b:a 192k "$W/step1_raw_audio.mp4"
  if [[ -x "$HOME/.vidbase/dfvenv/bin/deepFilter" ]]; then   # neural denoise, then vocal chain + two-pass loudnorm
    mkdir -p "$W/df"; ffmpeg -v error -y -i "$W/step1_raw_audio.mp4" -vn -ac 1 -ar 48000 "$W/df/voice.wav"
    "$HOME/.vidbase/dfvenv/bin/deepFilter" "$W/df/voice.wav" -o "$W/df/out" >/dev/null 2>&1
    ffmpeg -v error -y -i "$W/step1_raw_audio.mp4" -i "$W/df/out/voice_DeepFilterNet3.wav" -map 0:v -map 1:a -c:v copy -c:a aac -ar 48000 -ac 2 -b:a 192k -shortest "$W/step1_visual_cut.mp4"
  else cp "$W/step1_raw_audio.mp4" "$W/step1_visual_cut.mp4"; fi
  # MUSIC=1: an ElevenLabs instrumental from the EDL's music_prompt, looped, lowered and ducked under the voice
  if [[ "${MUSIC:-0}" == 1 ]]; then
    if [[ -n "${ELEVENLABS_API_KEY:-}" ]]; then node "$SK/generate_audio.mjs" --dir "$W" | tail -2
    else echo "WARNING: MUSIC=1 but ELEVENLABS_API_KEY is not set (add it to ~/.vbase/env.sh); rendering without music"; fi
  fi
  python3 "$SK/master_audio.py" --dir "$W" ${BGM_VOLUME:+--bgm-volume "$BGM_VOLUME"} >/dev/null
  cp "$W/base_cut.mp4" "$W/base_cut_nofx.mp4"
  CL=(); [[ -n "${CLONE_AT:-}" && -n "${CLONE_WORD:-}" ]] && CL=(--clone-at "$CLONE_AT" --clone-word "$CLONE_WORD")
  "$VIDBASE_PY" "$P/fx_pass.py" --dir "$W" --source "$IN" --zoom-word "${ZOOM_WORD:-zoom}" ${CL[@]+"${CL[@]}"} 2>&1 | grep -E "^zoom|^frames|passed"
  cp "$W/base_cut_fx.mp4" "$W/base_cut.mp4"
  "$VIDBASE_PY" "$SK/track_hands.py" --dir "$W" >/dev/null 2>&1 || true
  REFRESH_SRC=1 bash "$SK/bootstrap_remotion.sh" "$W" | tail -1     # always pick up the plugin's current scenes
  [[ -d "$W/proof" ]] && { mkdir -p "$W/remotion_app/public/proof"; cp "$W"/proof/* "$W/remotion_app/public/proof/"; }   # images for proof_grid / before_after
  CW=(); [[ -n "${CLONE_WORD:-}" ]] && CW=(--clone-word "$CLONE_WORD")
  python3 "$P/make_fx.py" --dir "$W" ${CREATOR_ROLE:+--role "$CREATOR_ROLE"} ${CW[@]+"${CW[@]}"}
  # speaker cut-out (person.webm) so in-room elements sit behind them, and face-aware sides for those elements
  "$VIDBASE_PY" "$P/person_matte.py" --dir "$W" 2>&1 | grep -vE "^W0000|^I0000|inference_feedback|TensorFlow|XNNPACK" || true
  cp "$W/master_edl.json" "$W/remotion_app/src/master_edl.json"
  (cd "$W/remotion_app" && npx remotion render src/index.ts MainComposite "$W/final_render.mp4" \
     --gl=angle --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=192k --concurrency=4 --timeout=120000 2>&1 | grep -E "Encoded|rror" | tail -1)
  python3 "$SK/qc_report.py" --dir "$W" | python3 -c "import sys,json;d=json.load(sys.stdin);print('QC', 'PASS' if d.get('automated_pass') else 'CHECK', d.get('checks',{}).get('loudness'))" || true
  "$PY" "$P/export_otio.py" "$W" "$IN" 2>/dev/null | grep -v objc || true
  OUTV="$W/final_render.mp4"
  if [[ "${TAKEONE:-1}" == 1 ]]; then
    if bash "$P/takeone_finish.sh" "$W" "$IN"; then OUTV="$W/takeone/cuts/$NAME-vbase.mp4"
    else echo "WARNING: Take One open/end card FAILED (see the audit above); delivering the edit without them"; fi
  fi
  cp "$OUTV" "$(dirname "$IN")/$NAME-vbase.mp4"; cp "$W/timeline.otio" "$(dirname "$IN")/$NAME-vbase.otio" 2>/dev/null || true
  echo "DONE: $(dirname "$IN")/$NAME-vbase.mp4"
  [[ "${REVIEW:-1}" == 1 ]] && start_room      # REVIEW=0 to skip opening the website
  ;;
review)
  start_room
  ;;
*) echo "unknown stage: $STAGE"; exit 1;;
esac
