#!/usr/bin/env python3
"""Build $EDIT_DIR/filter_complex.txt from master_edl.json + metadata.json and
(optionally, with --run) render step1_visual_cut.mp4.

Per segment: trim/atrim -> framing (smart crop / cover / blurred pad) -> punch-in zoom
-> grade -> fps/sar/format, then concat. Handles sources without audio and rotated
phone footage.

Usage: build_filtergraph.py --dir $EDIT_DIR [--input SRC] [--run] [--preset fast]
"""
import argparse, json, os, re, subprocess, sys

GRADES = {
    "default":   "eq=contrast=1.08:brightness=0.02:saturation=1.18,unsharp=5:5:0.8:3:3:0.4",
    "cinematic": "eq=contrast=1.05:brightness=0.0:saturation=0.95:gamma=0.98,unsharp=5:5:0.4:3:3:0.2",
}


def source_geometry(meta):
    v = next((s for s in meta.get("streams", []) if s.get("codec_type") == "video"), None)
    if not v:
        sys.exit("no video stream in metadata.json")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = rot or int(float((v.get("tags") or {}).get("rotate", 0)))
    if abs(rot) % 180 == 90:  # ffmpeg auto-rotates when filtering, so dims swap
        w, h = h, w
    has_audio = any(s.get("codec_type") == "audio" for s in meta.get("streams", []))
    return w, h, has_audio


def framing(src_w, src_h, W, H, x_ratio):
    """Return a filter chain producing exactly W x H from the source frame."""
    src_ar, dst_ar = src_w / src_h, W / H
    if src_ar > dst_ar + 0.01 and not (dst_ar > 1 > src_ar):
        # source wider than the target (16:9 -> 9:16, 4:5, 1:1, 4:3...): speaker-centered crop
        cw = "ih*%d/%d" % (W, H)
        x = "clip(iw*%.4f-ih*%d/%d\\,0\\,iw-ih*%d/%d)" % (x_ratio, W, 2 * H, W, H)
        return "crop=w=%s:h=ih:x='%s':y=0,scale=%d:%d" % (cw, x, W, H)
    if dst_ar > 1 > src_ar:
        # portrait source into landscape target: blurred background + fitted foreground
        return None  # handled by framing_pad (needs split/overlay)
    return "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" % (W, H, W, H)


def rms_db(path, start=None, end=None):
    """Mean RMS level (dBFS) of the audio, optionally of [start, end]."""
    cmd = ["ffmpeg", "-v", "info", "-nostats"]
    if start is not None:
        cmd += ["-ss", "%.3f" % start, "-t", "%.3f" % (end - start)]
    cmd += ["-i", path, "-vn", "-af", "astats=measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    vals = [float(x) for x in re.findall(r"RMS level dB:\s*(-?[\d.]+|-inf)", err) if x != "-inf"]
    return vals[-1] if vals else -120.0


def pick_quiet_window(src, cands, enabled):
    """Use the quietest candidate, and only if it is >= 12 dB below the overall level (speech sits within ~10 dB of it) —
    otherwise it probably contains speech, and looping it would be far worse than no bed."""
    if not enabled or not cands or not src or not os.path.exists(src):
        return None
    overall = rms_db(src)
    scored = sorted(((rms_db(src, c["source_start"], c["source_end"]), c) for c in cands), key=lambda x: x[0])
    level, best = scored[0]
    if level > overall - 12:
        print("room tone: skipped (quietest window %.1f dB vs overall %.1f dB — too close to speech)" % (level, overall),
              file=sys.stderr)
        return None
    print("room tone: %.2f-%.2fs at %.1f dB (overall %.1f dB)" % (best["source_start"], best["source_end"], level, overall),
          file=sys.stderr)
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--input", default=os.environ.get("INPUT_VIDEO"))
    ap.add_argument("--run", action="store_true", help="also run ffmpeg to produce step1_visual_cut.mp4")
    ap.add_argument("--preset", default="fast")
    ap.add_argument("--fade", type=float, default=0.03, help="equal-power fade at each edit (s)")
    ap.add_argument("--room-tone-gain", type=float, default=0.5, help="level of the looped room-tone bed")
    ap.add_argument("--no-room-tone", action="store_true")
    a = ap.parse_args()

    edl = json.load(open(os.path.join(a.dir, "master_edl.json")))
    meta = json.load(open(os.path.join(a.dir, "metadata.json")))
    if not a.input:
        setup_path = os.path.join(a.dir, "setup.json")
        if os.path.exists(setup_path):
            a.input = json.load(open(setup_path)).get("input_video")
    src_w, src_h, has_audio = source_geometry(meta)
    W, H, fps = int(edl["width"]), int(edl["height"]), int(edl["fps"])
    xr = float(edl.get("speaker_center_x_ratio", 0.5))
    fy = float(edl.get("speaker_face_y_ratio", 0.35))
    grade = GRADES["cinematic" if edl.get("style") == "cinematic" else "default"]
    frame_chain = framing(src_w, src_h, W, H, xr)

    lines, cat = [], []
    segs = edl["keep_segments"]
    for k, s in enumerate(segs):
        s0, s1 = s["source_start"], s["source_end"]
        d = s1 - s0
        trim = "trim=start=%.6f:end=%.6f,setpts=PTS-STARTPTS" % (s0, s1)
        z = float(s.get("zoom", 1.0))
        zoom = ""
        if z > 1.001:
            zw, zh = int(round(W * z / 2) * 2), int(round(H * z / 2) * 2)
            # bias the crop toward the face height so the punch-in doesn't decapitate
            y = "(ih-%d)*%.3f" % (H, min(max(fy, 0.15), 0.6))
            zoom = ",scale=%d:%d,crop=%d:%d:(iw-%d)/2:%s" % (zw, zh, W, H, W, y)
        tail = "%s,%s,fps=%d,setsar=1,format=yuv420p" % (zoom, grade, fps)
        if frame_chain is not None:
            lines.append("[0:v]%s,%s%s[v%d];" % (trim, frame_chain, tail, k))
        else:
            lines.append(
                "[0:v]%s,split=2[bg%d][fg%d];"
                "[bg%d]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,boxblur=40:2,eq=brightness=-0.08[bgb%d];"
                "[fg%d]scale=%d:%d:force_original_aspect_ratio=decrease[fgs%d];"
                "[bgb%d][fgs%d]overlay=(W-w)/2:(H-h)/2%s[v%d];"
                % (trim, k, k, k, W, H, W, H, k, k, W, H, k, k, k, tail, k))
        # Equal-power (qsin) fades only at real edits, long enough to smooth the change in room
        # sound but short enough not to swallow consonants. They sit *inside* each segment, so
        # audio length still equals video length; the room-tone bed below fills the dip.
        prev_jump = k > 0 and abs(s0 - segs[k - 1]["source_end"]) > 1.0 / fps
        next_jump = k + 1 < len(segs) and abs(segs[k + 1]["source_start"] - s1) > 1.0 / fps
        fin = min(a.fade, d / 4) if (prev_jump or k == 0) else 0.0
        fout = min(a.fade, d / 4) if (next_jump or k == len(segs) - 1) else 0.0
        fades = ""
        if fin > 0:
            fades += ",afade=t=in:d=%.3f:curve=qsin" % fin
        if fout > 0:
            fades += ",afade=t=out:st=%.6f:d=%.3f:curve=qsin" % (max(d - fout, 0), fout)
        if has_audio:
            lines.append("[0:a]atrim=start=%.6f:end=%.6f,asetpts=PTS-STARTPTS,aresample=48000,"
                         "aformat=sample_rates=48000:channel_layouts=stereo%s[a%d];"
                         % (s0, s1, fades, k))
        else:
            lines.append("anullsrc=r=48000:cl=stereo,atrim=0:%.6f,asetpts=PTS-STARTPTS[a%d];" % (d, k))
        cat.append("[v%d][a%d]" % (k, k))
    rt = pick_quiet_window(a.input, edl.get("room_tone_candidates") or ([edl["room_tone"]] if edl.get("room_tone") else []),
                           has_audio and not a.no_room_tone)
    if rt:
        total = float(edl.get("total_duration") or sum(x["source_end"] - x["source_start"] for x in segs))
        lines.append("%sconcat=n=%d:v=1:a=1[outv][cata];" % ("".join(cat), len(segs)))
        n = int(round((rt["source_end"] - rt["source_start"]) * 48000))
        lines.append("[0:a]atrim=start=%.6f:end=%.6f,asetpts=PTS-STARTPTS,aresample=48000,"
                     "aformat=sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=%d,"
                     "atrim=0:%.6f,asetpts=PTS-STARTPTS,volume=%.2f[room];"
                     % (rt["source_start"], rt["source_end"], n, total, a.room_tone_gain))
        lines.append("[cata][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]")
    else:
        lines.append("%sconcat=n=%d:v=1:a=1[outv][outa]" % ("".join(cat), len(segs)))

    fg_path = os.path.join(a.dir, "filter_complex.txt")
    with open(fg_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    # ffmpeg >= 7.1 uses -/filter_complex <file>; older builds use -filter_complex_script
    probe = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "nullsrc=d=0.04", "-/filter_complex",
                            os.devnull, "-f", "null", "-"],
                           capture_output=True, text=True)
    flag = "-filter_complex_script" if "Unrecognized option" in probe.stderr else "-/filter_complex"

    out = os.path.join(a.dir, "step1_visual_cut.mp4")
    cmd = ["ffmpeg", "-y", "-v", "error", "-stats", "-i", a.input or "$INPUT_VIDEO", flag, fg_path,
           "-map", "[outv]", "-map", "[outa]",
           "-c:v", "libx264", "-preset", a.preset, "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps),
           "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart", out]
    print(json.dumps({"filtergraph": fg_path, "segments": len(segs), "source": [src_w, src_h],
                      "target": [W, H], "has_audio": has_audio, "flag": flag,
                      "command": " ".join("'%s'" % c if any(ch in c for ch in "[] $") else c for c in cmd)}, indent=1))
    if a.run:
        if not a.input:
            sys.exit("--run needs --input or $INPUT_VIDEO or setup.json input_video")
        r = subprocess.run(cmd)
        if r.returncode != 0:
            sys.exit("ffmpeg failed (rc=%d) — read the error above, fix filter_complex.txt or the EDL, re-run" % r.returncode)
        print("wrote", out)


if __name__ == "__main__":
    main()
