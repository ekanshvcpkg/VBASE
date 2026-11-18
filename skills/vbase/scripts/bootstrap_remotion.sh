#!/usr/bin/env bash
# Create (first run) or refresh (later runs) the Remotion app in $EDIT_DIR/remotion_app.
# Usage: bash bootstrap_remotion.sh "$EDIT_DIR"
set -euo pipefail
EDIT_DIR="${1:?usage: bootstrap_remotion.sh EDIT_DIR}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$EDIT_DIR/remotion_app"

if [ ! -d "$APP/node_modules/@remotion/three" ]; then
  mkdir -p "$APP"
  cp -R "$SKILL_DIR/assets/remotion_app/." "$APP/"
  cd "$APP"
  # package-lock.json pins the whole tree (React 18 + R3F 8 + drei 9 + Remotion 4), so a
  # yanked transitive version upstream can't break installs; fall back to install without it.
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error
  else
    npm install --no-audit --no-fund --loglevel=error
  fi
  [ -d node_modules/@remotion/three ] || { echo "npm install failed — see the error above" >&2; exit 1; }
  npx remotion versions >/dev/null 2>&1 || true
  # local Draco decoder so compressed .glb models load without hitting gstatic.com
  mkdir -p public/draco && cp -R node_modules/three/examples/jsm/libs/draco/gltf/. public/draco/ 2>/dev/null || true
fi
# On later runs only the media/EDL are refreshed, so per-video edits to src/*.tsx survive QC retries.
# REFRESH_SRC=1 re-copies the template's src/ (scene library updates) without reinstalling.
if [ "${REFRESH_SRC:-0}" = "1" ]; then cp -R "$SKILL_DIR/assets/remotion_app/src/." "$APP/src/"; cp -R "$SKILL_DIR/assets/remotion_app/scripts/." "$APP/scripts/"; fi

mkdir -p "$APP/public" "$APP/src"
cp "$EDIT_DIR/base_cut.mp4" "$APP/public/base_cut.mp4"
cp "$EDIT_DIR/master_edl.json" "$APP/src/master_edl.json"
for m in "$EDIT_DIR"/opt*.glb; do [ -e "$m" ] && cp "$m" "$APP/public/"; done
echo "remotion_app ready at $APP"
