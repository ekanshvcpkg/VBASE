#!/usr/bin/env bash
# One-time environment for vidbase, run during onboarding so every later edit starts instantly.
# Creates ~/.vidbase/venv (openai-whisper + mediapipe + opencv), pre-downloads the Whisper model
# and the hand-tracking model, and reports what's missing. Safe to re-run (idempotent).
# Usage: bash setup_env.sh [whisper_model]     (default: small)
set -uo pipefail
VH="${VIDBASE_HOME:-$HOME/.vidbase}"
MODEL="${1:-small}"
mkdir -p "$VH"
ok() { echo "  ✓ $1"; }; miss() { echo "  ✗ $1"; }

echo "vidbase environment → $VH"
for t in ffmpeg ffprobe node npm python3; do command -v "$t" >/dev/null && ok "$t" || miss "$t (macOS: brew install ${t/ffprobe/ffmpeg})"; done

PY=python3
for c in python3.12 python3.11 python3.10 python3; do command -v "$c" >/dev/null && { PY="$c"; break; }; done
if [ ! -x "$VH/venv/bin/python" ]; then
  "$PY" -m venv "$VH/venv" || { miss "could not create venv"; exit 1; }
fi
"$VH/venv/bin/pip" install -q --upgrade pip >/dev/null 2>&1
"$VH/venv/bin/pip" install -q openai-whisper mediapipe opencv-python-headless 2>&1 | grep -v "^\s*$" | tail -2
"$VH/venv/bin/python" -c "import whisper" 2>/dev/null && ok "whisper (venv)" || miss "whisper install failed"
"$VH/venv/bin/python" -c "import mediapipe" 2>/dev/null && ok "mediapipe (venv)" || miss "mediapipe install failed (hand-tracked 3D objects disabled)"

# models, so the first real edit doesn't stall on downloads
"$VH/venv/bin/python" -c "import whisper; whisper.load_model('$MODEL')" >/dev/null 2>&1 && ok "whisper model: $MODEL" || miss "whisper model download"
mkdir -p "$HOME/.cache/vidbase"
[ -s "$HOME/.cache/vidbase/hand_landmarker.task" ] || curl -fsSL -o "$HOME/.cache/vidbase/hand_landmarker.task" \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
[ -s "$HOME/.cache/vidbase/hand_landmarker.task" ] && ok "hand-tracking model" || miss "hand-tracking model"

[ -n "${ELEVENLABS_API_KEY:-}" ] && ok "ELEVENLABS_API_KEY" || echo "  • ELEVENLABS_API_KEY not set (only needed for generated music/SFX)"
cat > "$VH/env.sh" <<EOF
# sourced by vidbase stages
export VIDBASE_PY="$VH/venv/bin/python"
export VIDBASE_WHISPER="$VH/venv/bin/whisper"
export VIDBASE_WHISPER_MODEL="$MODEL"
EOF
ok "wrote $VH/env.sh"
