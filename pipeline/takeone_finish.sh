#!/usr/bin/env bash
# Take One finish: an open drawn over the edit's first 4 s (raw -> edit wipe, two lines, the name), an end card,
# optional procedural SFX, and the final assembly. Voice runs from frame 0.
#
# Usage: takeone_finish.sh <EDIT_DIR> <source video>
# Env (all optional; the VBASE skill fills them from the video):
#   BRAND LINE1 LINE2 TAGLINE END1 END2 CTA FOOT   on-screen words      SFX=1   add procedural sound effects (off by default)
#   OUT_NAME                                      file name of the cut (default: <video>-vbase.mp4)
#   MUSIC_FILE=<mp3/wav> [MUSIC_LUFS=-37 MUSIC_START=0]   your own background track at one steady, low level
#   MUSIC=code                                    compose VBASE's own bed instead (free, fitted to the length)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(cd "$1" && pwd)"; SRC="$2"; T="$W/takeone"
VBASE_HOME="${VBASE_HOME:-$HOME/.vbase}"; TO="$VBASE_HOME/take-one/scripts"
[[ -f "$VBASE_HOME/env.sh" ]] && source "$VBASE_HOME/env.sh"          # CHROME_PATH etc. (written by setup.sh)
[[ -d "$TO" ]] || { echo "Take One not installed: run scripts/setup.sh"; exit 1; }
F="$W/final_render.mp4"; NAME="$(basename "${SRC%.*}")"; OUT="${OUT_NAME:-$NAME-vbase.mp4}"

# project scaffold (first run)
[[ -f "$T/export.mjs" ]] || bash "$TO/new-canvas-project.sh" "$T" >/dev/null
cp "$HERE/takeone_film.html" "$T/film.html"      # always the plugin's current page; per-video words live in cfg.json

# per-video settings for the page
python3 - "$W" "$T/cfg.json" <<'EOF'
import json, os, sys
w, out = sys.argv[1], sys.argv[2]
m = json.load(open(f"{w}/master_edl.json"))
try: s = json.load(open(f"{w}/setup.json"))
except Exception: s = {}
ed = s.get("editorial", {}); gh = (ed.get("links") or {}).get("github")
seg0 = m["keep_segments"][0]; held = any(c.get("scene") == "held_object" for c in m.get("three_d_cues", []))
env = lambda k, d: os.environ.get(k) or d
cfg = {"brand": env("BRAND", (ed.get("products") or ["VBASE"])[0] if ed.get("products") and ed["products"][0] != "Claude" else "VBASE"),
       "line1": env("LINE1", "One raw take."), "line2": env("LINE2", "Claude added\nthe ball." if held else "Claude did\nthe edit."),
       "tagline": env("TAGLINE", "Claude edits it."), "end1": env("END1", "Raw take in."), "end2": env("END2", "Edited video out."),
       "cta": env("CTA", "Star it on GitHub" if gh else "Follow for more"), "foot": env("FOOT", "Edited with VBASE"), "url": env("URL", f"github.com/{gh}" if gh else ""),
       "push": max(seg0.get("push", 0.03), 0.03), "shot1": seg0["timeline_end"] - seg0["timeline_start"],
       "faceY": m.get("speaker_face_y_ratio", 0.35), "rawAt": round(seg0["source_start"], 2), "nRaw": 120, "nEdit": 120, "nLoop": 116}
json.dump(cfg, open(out, "w"), indent=1); print("cfg:", cfg["brand"], "|", cfg["line2"].replace("\n", " "), "|", cfg["cta"])
EOF

# frames the page composites: the raw take under the wipe, the edit's first 4 s, its last frame, a 3.85 s replay
RAW_AT=$(python3 -c "import json;print(json.load(open('$W/master_edl.json'))['keep_segments'][0]['source_start'])")
cd "$T/assets"; rm -rf raw edit loop; mkdir -p raw edit loop; J="format=yuvj420p"
ffmpeg -v error -y -ss "$RAW_AT" -t 4.0 -i "$SRC" -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,$J" -q:v 3 raw/f%03d.jpg
ffmpeg -v error -y -t 4.0 -i "$F" -vf "fps=30,$J" -q:v 2 edit/f%03d.jpg
ffmpeg -v error -y -sseof -0.2 -i "$F" -vf "$J" -update 1 -q:v 2 last.jpg
ffmpeg -v error -y -ss 3.0 -t 3.85 -i "$F" -vf "fps=30,scale=960:-2,$J" -q:v 3 loop/f%03d.jpg
cd "$T"
node "$TO/text-audit.mjs" | tail -1; node "$TO/gate.mjs" film.html | grep GATE
START=0 END=4.0 SUB=4 node export.mjs 30 open.mp4
START=4.0 END=8.5 SUB=1 node export.mjs 30 endcard.mp4      # no subframe blur on the step-back: it echoed

D=$(python3 -c "import json;print(round(json.load(open('$W/master_edl.json'))['total_duration']+4.5,3))")
ffmpeg -v error -y -i "$F" -vn -ar 48000 -ac 2 body.wav
ffmpeg -v error -y -i body.wav -af "apad=whole_dur=$D,atrim=0:$D" -ar 48000 bed.wav
if [[ "${SFX:-0}" == 1 ]]; then
  python3 "$HERE/takeone_sfx_plan.py" "$W" 0
  node "$TO/sfx.mjs" mix sfx_plan.json bed.wav mix.wav | tail -1
else
  # voice only; the limiter keeps true peak under -1 dBTP
  ffmpeg -v error -y -i bed.wav -af "alimiter=limit=0.84:level=false:attack=2:release=60" -ar 48000 mix.wav
fi
# MUSIC=code: compose VBASE's own under-voice bed (pipeline/music/vbase-bed.mjs) at the film's exact length, free
if [[ "${MUSIC:-}" == code && -z "${MUSIC_FILE:-}" ]]; then
  ( cd "$VBASE_HOME/take-one" && TAKEONE_MUSIC_DIR="$PWD/scripts/music" node scripts/music.mjs render "$HERE/music/vbase-bed.mjs" --seconds "$D" --out "$T/vbase-bed.wav" | tail -1 )
  MUSIC_FILE="$T/vbase-bed.wav"
fi
# MUSIC_FILE: a background track under the whole film at ONE steady level (owner note: a level that rose and fell
# with the voice, i.e. ducking, read as the sound "increasing and decreasing"). The track is levelled to
# MUSIC_LUFS (default -37, ~22 dB under the voice; -31 read as too loud), with a 2 s fade-in and a fade-out at the end. No ducking.
if [[ -n "${MUSIC_FILE:-}" && -f "${MUSIC_FILE}" ]]; then
  ML="${MUSIC_LUFS:--37}"; MS="${MUSIC_START:-0}"; FO=$(python3 -c "print(round($D-2.2,3))")
  ffmpeg -v error -y -i mix.wav -i "$MUSIC_FILE" -filter_complex "\
[1:a]atrim=start=$MS:duration=$D,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,\
loudnorm=I=$ML:LRA=3:TP=-8,aresample=48000,afade=t=in:d=2.0,afade=t=out:st=$FO:d=2.2[m];\
[0:a]aformat=channel_layouts=stereo[v];\
[v][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false[out]" -map "[out]" -ar 48000 mix_music.wav \
  && mv mix_music.wav mix.wav && echo "music: $(basename "$MUSIC_FILE") under the film at a steady $ML LUFS"
fi
mkdir -p cuts
ffmpeg -v error -y -i open.mp4 -i "$F" -i endcard.mp4 -i mix.wav -filter_complex "[0:v]trim=start_frame=0:end_frame=120,setpts=PTS-STARTPTS,format=yuv420p,setsar=1[a];[1:v]trim=start_frame=120,setpts=PTS-STARTPTS,format=yuv420p,setsar=1[b];[2:v]setpts=PTS-STARTPTS,format=yuv420p,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0,fps=30[v]" \
  -map "[v]" -map 3:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "cuts/$OUT"
node "$TO/audio-check.mjs" "cuts/$OUT" | tail -1
echo "cut: $T/cuts/$OUT"
