#!/usr/bin/env python3
"""Master the audio of step1_visual_cut.mp4 into base_cut.mp4 (video stream-copied).

voice: highpass 80 Hz -> afftdn -> compressor
+ SFX/VO from audio_manifest.json, delayed to their timeline_start
+ BGM ($EDIT_DIR/bgm.*) looped, lowered, sidechain-ducked under the voice
-> amix (normalize=0) -> two-pass loudnorm to -14 LUFS / -1 dBTP / LRA 11

Usage: master_audio.py --dir $EDIT_DIR [--bgm-volume 0.22] [--no-denoise]
"""
import argparse, glob, json, os, re, subprocess, sys


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        sys.exit("ffmpeg failed (rc=%d)" % r.returncode)
    return r.stderr


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--bgm-volume", type=float, default=0.22)
    ap.add_argument("--no-denoise", action="store_true", help="skip afftdn (for already-clean studio audio)")
    ap.add_argument("--target", type=float, default=-14.0)
    a = ap.parse_args()
    d = a.dir
    src = os.path.join(d, "step1_visual_cut.mp4")
    out = os.path.join(d, "base_cut.mp4")
    if not os.path.exists(src):
        sys.exit("missing step1_visual_cut.mp4")

    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                "default=nw=1:nk=1", src], capture_output=True, text=True).stdout.strip())
    bgm = sorted(p for p in glob.glob(os.path.join(d, "bgm.*")))
    bgm = bgm[0] if bgm else None
    manifest_path = os.path.join(d, "audio_manifest.json")
    extras = json.load(open(manifest_path)) if os.path.exists(manifest_path) else []
    extras = [e for e in extras if os.path.exists(e["file"]) and e["timeline_start"] < dur]

    inputs = ["-i", src]
    idx = 1
    chain = ["[0:a]highpass=f=80,%sacompressor=threshold=-18dB:ratio=3:attack=5:release=50[voice]"
             % ("" if a.no_denoise else "afftdn=nf=-25,")]
    mix = []
    if bgm:
        inputs += ["-stream_loop", "-1", "-i", bgm]
        chain[0] = chain[0].replace("[voice]", ",asplit=2[voice_sc][voice]")
        # silence drops (master_edl.music_drops): music cuts to zero under the thesis line and
        # comes back on its last syllable — the contrast is what makes the line land
        drops = []
        edl_path = os.path.join(d, "master_edl.json")
        if os.path.exists(edl_path):
            drops = json.load(open(edl_path)).get("music_drops") or []
        drop_f = "".join(",volume=0:enable='between(t,%.3f,%.3f)'" % (x, y) for x, y in drops)
        chain.append("[%d:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,volume=%.3f,"
                     "atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=out:st=%.3f:d=1.5%s[bgm_raw]"
                     % (idx, a.bgm_volume, dur, max(dur - 1.5, 0), drop_f))
        chain.append("[bgm_raw][voice_sc]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=400[bgm_ducked]")
        idx += 1
    mix.append("[voice]")
    if bgm:
        mix.append("[bgm_ducked]")
    for k, e in enumerate(extras):
        inputs += ["-i", e["file"]]
        ms = int(round(e["timeline_start"] * 1000))
        chain.append("[%d:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,volume=%.2f,"
                     "adelay=%d:all=1[x%d]" % (idx, e.get("gain", 0.6), ms, k))
        mix.append("[x%d]" % k)
        idx += 1
    if len(mix) > 1:
        chain.append("%samix=inputs=%d:duration=first:dropout_transition=0:normalize=0[mix]" % ("".join(mix), len(mix)))
    else:
        chain.append("[voice]anull[mix]")
    base = ";".join(chain)

    # pass 1: measure
    ln = "loudnorm=I=%.1f:TP=-1.0:LRA=11" % a.target
    err = run(["ffmpeg", "-hide_banner", "-y"] + inputs +
              ["-filter_complex", base + ";[mix]" + ln + ":print_format=json[m]", "-map", "[m]", "-f", "null", "-"])
    m = json.loads(re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", err)[-1])
    # pass 2: apply linear correction using the measurement
    ln2 = ("%s:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true"
           % (ln, m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"], m["target_offset"]))
    run(["ffmpeg", "-hide_banner", "-y"] + inputs +
        ["-filter_complex", base + ";[mix]" + ln2 + ",aresample=48000[final_a]",
         "-map", "0:v", "-map", "[final_a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
         "-movflags", "+faststart", out])
    print(json.dumps({"output": out, "bgm": bool(bgm), "sfx_vo_layers": len(extras),
                      "measured_input_lufs": m["input_i"], "target_lufs": a.target}, indent=1))


if __name__ == "__main__":
    main()
