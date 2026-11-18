#!/usr/bin/env bash
# VBASE pipeline runner. Claude (the vbase skill) drives it in two stages, writing the creative decisions in between.
#
#   bash scripts/run.sh analyze <video>    probe, silences, Silero VAD, auto-editor pass, WhisperX words, scene cuts
#   ...Claude writes <work>/edit_plan.md + edl_draft.json (skill Stage 2)...
#   bash scripts/run.sh render  <video>    cut + grade + audio master -> in-footage FX -> 3D/captions -> Take One open/end card -> QC
#   bash scripts/run.sh review  <video>    open the VBASE review room on the cuts (render does this automatically)
#
# Optional env for render:  ZOOM_WORD=zoom   CLONE_AT=<source s> CLONE_WORD=<word>   SFX=1
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
  cp "$(dirname "$IN")/$NAME-vbase.mp4" "$cuts/" 2>/dev/null || true
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
  # the builder reports which filtergraph-file flag this ffmpeg understands (-/filter_complex on 7.1+)
  FLAG=$(python3 "$SK/build_filtergraph.py" --dir "$W" | python3 -c "import sys,json;print(json.load(sys.stdin).get('flag','-filter_complex_script'))")
  ffmpeg -v error -y -i "$IN" $FLAG "$W/filter_complex.txt" -map "[outv]" -map "[outa]" \
    -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -ar 48000 -b:a 192k "$W/step1_raw_audio.mp4"
  if [[ -x "$HOME/.vidbase/dfvenv/bin/deepFilter" ]]; then   # neural denoise, then vocal chain + two-pass loudnorm
    mkdir -p "$W/df"; ffmpeg -v error -y -i "$W/step1_raw_audio.mp4" -vn -ac 1 -ar 48000 "$W/df/voice.wav"
    "$HOME/.vidbase/dfvenv/bin/deepFilter" "$W/df/voice.wav" -o "$W/df/out" >/dev/null 2>&1
    ffmpeg -v error -y -i "$W/step1_raw_audio.mp4" -i "$W/df/out/voice_DeepFilterNet3.wav" -map 0:v -map 1:a -c:v copy -c:a aac -ar 48000 -ac 2 -b:a 192k -shortest "$W/step1_visual_cut.mp4"
  else cp "$W/step1_raw_audio.mp4" "$W/step1_visual_cut.mp4"; fi
  python3 "$SK/master_audio.py" --dir "$W" >/dev/null
  cp "$W/base_cut.mp4" "$W/base_cut_nofx.mp4"
  CL=(); [[ -n "${CLONE_AT:-}" && -n "${CLONE_WORD:-}" ]] && CL=(--clone-at "$CLONE_AT" --clone-word "$CLONE_WORD")
  "$VIDBASE_PY" "$P/fx_pass.py" --dir "$W" --source "$IN" --zoom-word "${ZOOM_WORD:-zoom}" ${CL[@]+"${CL[@]}"} 2>&1 | grep -E "^zoom|^frames|passed"
  cp "$W/base_cut_fx.mp4" "$W/base_cut.mp4"
  "$VIDBASE_PY" "$SK/track_hands.py" --dir "$W" >/dev/null 2>&1 || true
  bash "$SK/bootstrap_remotion.sh" "$W" | tail -1
  [[ -d "$W/proof" ]] && { mkdir -p "$W/remotion_app/public/proof"; cp "$W"/proof/* "$W/remotion_app/public/proof/"; }   # images for proof_grid / before_after
  CW=(); [[ -n "${CLONE_WORD:-}" ]] && CW=(--clone-word "$CLONE_WORD")
  python3 "$P/make_fx.py" --dir "$W" ${CREATOR_ROLE:+--role "$CREATOR_ROLE"} ${CW[@]+"${CW[@]}"}
  (cd "$W/remotion_app" && npx remotion render src/index.ts MainComposite "$W/final_render.mp4" \
     --gl=angle --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=192k --concurrency=4 --timeout=120000 2>&1 | grep -E "Encoded|rror" | tail -1)
  python3 "$SK/qc_report.py" --dir "$W" | python3 -c "import sys,json;d=json.load(sys.stdin);print('QC', 'PASS' if d.get('automated_pass') else 'CHECK', d.get('checks',{}).get('loudness'))" || true
  "$PY" "$P/export_otio.py" "$W" "$IN" 2>/dev/null | grep -v objc || true
  OUTV="$W/final_render.mp4"
  if [[ "${TAKEONE:-1}" == 1 ]]; then bash "$P/takeone_finish.sh" "$W" "$IN" && OUTV="$W/takeone/cuts/$NAME-vbase.mp4"; fi
  cp "$OUTV" "$(dirname "$IN")/$NAME-vbase.mp4"; cp "$W/timeline.otio" "$(dirname "$IN")/$NAME-vbase.otio" 2>/dev/null || true
  echo "DONE: $(dirname "$IN")/$NAME-vbase.mp4"
  [[ "${REVIEW:-1}" == 1 ]] && start_room      # REVIEW=0 to skip opening the website
  ;;
review)
  start_room
  ;;
*) echo "unknown stage: $STAGE"; exit 1;;
esac
