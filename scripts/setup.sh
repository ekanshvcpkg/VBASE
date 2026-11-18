#!/usr/bin/env bash
# VBASE one-time setup. Safe to re-run: it only installs what is missing, then prints a status table.
# Installs into ~/.vbase (tools venv, Take One) and ~/.vidbase (the editing skill's venv, models).
#   bash scripts/setup.sh            install + check
#   bash scripts/setup.sh --check    check only, change nothing
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VB="${VBASE_HOME:-$HOME/.vbase}"; VH="$HOME/.vidbase"
CHECK=0; [[ "${1:-}" == "--check" ]] && CHECK=1
G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; D=$'\e[2m'; N=$'\e[0m'
ok(){ printf "  ${G}ok${N}       %-22s ${D}%s${N}\n" "$1" "${2:-}"; }
miss(){ printf "  ${R}missing${N}  %-22s %s\n" "$1" "${2:-}"; FAIL=1; }
step(){ printf "\n${Y}▸ %s${N}\n" "$1"; }
FAIL=0; mkdir -p "$VB" "$VH/models" "$HOME/.cache/vidbase"

step "System tools"
if [[ "$(uname)" == "Darwin" ]] && ! command -v brew >/dev/null; then miss brew "install from https://brew.sh, then re-run"; fi
for t in ffmpeg node git uv auto-editor; do
  if ! command -v "$t" >/dev/null && [[ $CHECK == 0 ]] && command -v brew >/dev/null; then echo "  installing $t…"; brew install -q "$t" >/dev/null 2>&1; fi
  command -v "$t" >/dev/null && ok "$t" "$($t --version 2>/dev/null | head -1 | cut -c1-40)" || miss "$t" "brew install $t"
done
command -v python3 >/dev/null && ok python3 "$(python3 --version)" || miss python3

step "Browser for rendering (Chrome, Brave, Edge or Chromium)"
CH=""
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "$(command -v google-chrome 2>/dev/null)" "$(command -v chromium 2>/dev/null)" "$(command -v brave-browser 2>/dev/null)"; do
  [[ -n "$c" && -x "$c" ]] && { CH="$c"; break; }
done
[[ -n "$CH" ]] && ok browser "$(basename "$CH")" || miss browser "install Google Chrome or Brave"

step "Editing tools (WhisperX, Silero VAD, PySceneDetect, OpenTimelineIO) → $VB/venv"
if [[ ! -x "$VB/venv/bin/python" && $CHECK == 0 ]]; then uv venv -q --python 3.11 "$VB/venv"; fi
if [[ -x "$VB/venv/bin/python" && $CHECK == 0 ]] && ! "$VB/venv/bin/python" -c "import whisperx, silero_vad, scenedetect, opentimelineio, soundfile" 2>/dev/null; then
  echo "  installing (a few minutes, ~3 GB)…"
  VIRTUAL_ENV="$VB/venv" uv pip install -q whisperx silero-vad "scenedetect[opencv]" opentimelineio soundfile "torch~=2.8.0" "torchaudio~=2.8.0" 2>&1 | tail -2
fi
for m in whisperx silero_vad scenedetect opentimelineio; do "$VB/venv/bin/python" -c "import $m" 2>/dev/null && ok "$m" || miss "$m"; done

step "Captions, hand tracking, segmentation, denoise → $VH"
[[ $CHECK == 0 ]] && bash "$ROOT/skills/vbase/scripts/setup_env.sh" >/dev/null 2>&1
"$VH/venv/bin/python" -c "import whisper, mediapipe" 2>/dev/null && ok "whisper + mediapipe" || miss "whisper + mediapipe" "bash skills/vbase/scripts/setup_env.sh"
SEG="$VH/models/selfie_multiclass.tflite"
[[ -s "$SEG" || $CHECK == 1 ]] || curl -fsSL -o "$SEG" https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
# Robust Video Matting (MIT): the clean speaker cut-out that lets screens and cards sit behind them
RVM="$VH/models/rvm_mobilenetv3_fp32.torchscript"
[[ -s "$RVM" || $CHECK == 1 ]] || curl -fsSL -o "$RVM" https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.torchscript
[[ -s "$SEG" ]] && ok "segmentation model" || miss "segmentation model"
if [[ ! -x "$VH/dfvenv/bin/deepFilter" && $CHECK == 0 ]]; then
  echo "  installing DeepFilterNet…"; python3 -m venv "$VH/dfvenv" && "$VH/dfvenv/bin/pip" install -q deepfilternet "torch==2.8.0" "torchaudio==2.8.0" >/dev/null 2>&1
fi
[[ -x "$VH/dfvenv/bin/deepFilter" ]] && ok "DeepFilterNet" || miss "DeepFilterNet" "(optional: audio falls back to ffmpeg denoise)"

step "Take One (open, end card, review, sound) → $VB/take-one"
if [[ ! -d "$VB/take-one/.git" && $CHECK == 0 ]]; then git clone -q --depth 1 https://github.com/talsiach/take-one "$VB/take-one"; fi
if [[ -d "$VB/take-one" && $CHECK == 0 ]]; then
  # let Take One render through any Chromium browser, not only Google Chrome (CHROME_PATH)
  for f in "$VB"/take-one/scripts/*.mjs; do
    grep -q "{ channel: 'chrome'," "$f" && sed -i.bak "s|{ channel: 'chrome',|{ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),|" "$f" && rm -f "$f.bak"
  done
  (cd "$VB/take-one" && npm i --silent >/dev/null 2>&1); ln -sfn "$VB/take-one/node_modules" "$VB/take-one/scripts/node_modules"
fi
[[ -d "$VB/take-one/scripts" ]] && ok "Take One" || miss "Take One"

step "Remotion (3D scenes + captions) — installed per video on first render"
ok "remotion template" "skills/vbase/assets/remotion_app"

# env for every stage
{ echo "# written by VBASE scripts/setup.sh"; echo "export VBASE_ROOT=\"$ROOT\""; echo "export VBASE_HOME=\"$VB\"";
  [[ -n "$CH" ]] && echo "export CHROME_PATH=\"$CH\""; echo "export VBASE_PY=\"$VB/venv/bin/python\""; } > "$VB/env.sh"

echo
if [[ $FAIL == 0 ]]; then printf "${G}VBASE is ready.${N} In Claude Code: /vbase:edit path/to/video.mov\n"; else printf "${R}Not ready:${N} fix the items marked missing, then run this again.\n"; exit 1; fi
