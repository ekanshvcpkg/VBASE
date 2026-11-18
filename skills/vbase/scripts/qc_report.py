#!/usr/bin/env python3
"""Automated QC for final_render.mp4 (or --file). Prints a JSON report and extracts
frames for visual inspection:
  qc_contact.jpg   contact sheet of the whole video (<=48 tiles)
  qc_cue_<n>.jpg   middle of each three_d_cue
  qc_cap_<n>.jpg   a few caption moments

Usage: qc_report.py --dir $EDIT_DIR [--file final_render.mp4]
"""
import argparse, json, math, os, re, subprocess


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def grab(src, t, out, width=540):
    sh(["ffmpeg", "-v", "error", "-y", "-ss", "%.3f" % max(t, 0), "-i", src, "-frames:v", "1",
        "-vf", "scale=%d:-2" % width, "-q:v", "3", out])
    return out if os.path.exists(out) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--file", default="final_render.mp4")
    a = ap.parse_args()
    d = a.dir
    src = os.path.join(d, a.file)
    edl = json.load(open(os.path.join(d, "master_edl.json")))
    rep = {"file": src, "checks": {}}

    pr = json.loads(sh(["ffprobe", "-v", "error", "-show_entries",
                        "stream=codec_type,width,height,r_frame_rate:format=duration,size",
                        "-of", "json", src]).stdout or "{}")
    streams = pr.get("streams", [])
    v = next((s for s in streams if s["codec_type"] == "video"), {})
    dur = float(pr.get("format", {}).get("duration", 0))
    rep.update({"duration": round(dur, 3), "expected_duration": edl["total_duration"],
                "size_bytes": int(pr.get("format", {}).get("size", 0)),
                "resolution": [v.get("width"), v.get("height")]})
    rep["checks"]["streams"] = {"pass": bool(v) and any(s["codec_type"] == "audio" for s in streams),
                                "detail": [s["codec_type"] for s in streams]}
    rep["checks"]["resolution"] = {"pass": [v.get("width"), v.get("height")] == [edl["width"], edl["height"]]}
    rep["checks"]["duration"] = {"pass": abs(dur - edl["total_duration"]) <= 0.15,
                                 "delta": round(dur - edl["total_duration"], 3)}

    err = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-filter_complex", "ebur128=peak=true",
              "-f", "null", "-"]).stderr
    summary = err[err.rfind("Summary:"):] if "Summary:" in err else ""
    mi = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    mp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summary)
    lufs = float(mi.group(1)) if mi else None
    tp = float(mp.group(1)) if mp and mp.group(1) != "-inf" else None
    rep["checks"]["loudness"] = {"pass": lufs is not None and abs(lufs + 14) <= 1.5, "integrated_lufs": lufs}
    rep["checks"]["true_peak"] = {"pass": tp is not None and tp <= -0.5, "dbtp": tp}

    err = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-vf", "blackdetect=d=0.25:pix_th=0.10",
              "-an", "-f", "null", "-"]).stderr
    blacks = [{"start": float(s), "end": float(e)} for s, e in
              re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", err)]
    rep["checks"]["black_frames"] = {"pass": not blacks, "intervals": blacks}

    # frames for the multimodal judge
    frames = {"cues": [], "captions": []}
    for n, c in enumerate(edl.get("three_d_cues", [])):
        a0, b0 = c["timeline_start"], c["timeline_end"]
        # entry / peak / exit, tiled side by side: shows the animation, not just one pose
        shots = []
        for k, t in enumerate((a0 + 0.35, a0 + (b0 - a0) * 0.6, b0 - 0.15)):
            f = grab(src, t, os.path.join(d, "qc_cue_%d_%d.jpg" % (n, k)))
            if f:
                shots.append(f)
        strip = os.path.join(d, "qc_cue_%d.jpg" % n)
        if shots:
            ins = sum([["-i", f] for f in shots], [])
            sh(["ffmpeg", "-v", "error", "-y"] + ins + ["-filter_complex",
                "".join("[%d:v]scale=360:-2[s%d];" % (k, k) for k in range(len(shots))) +
                "".join("[s%d]" % k for k in range(len(shots))) + "hstack=inputs=%d" % len(shots), strip]
               if len(shots) > 1 else ["cp", shots[0], strip])
            frames["cues"].append({"file": strip, "t": [round(a0, 2), round(b0, 2)],
                                   "scene": c.get("scene") or c.get("type"), "layout": c.get("layout"),
                                   "label": c.get("label"), "props_preview": str(c.get("props", ""))[:160]})
    words = edl.get("words", [])
    for n, k in enumerate(sorted({int(len(words) * p) for p in (0.02, 0.35, 0.7, 0.95)} if words else [])):
        w = words[min(k, len(words) - 1)]
        t = (w["timeline_start"] + w["timeline_end"]) / 2
        f = grab(src, t, os.path.join(d, "qc_cap_%d.jpg" % n))
        if f:
            frames["captions"].append({"file": f, "t": round(t, 2), "word": w["word"]})
    tiles = 48
    rate = min(1.0, tiles / max(dur, 1))
    cols = 8 if edl["height"] > edl["width"] else 6
    rows = max(1, math.ceil(min(tiles, dur * rate) / cols))
    contact = os.path.join(d, "qc_contact.jpg")
    sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf",
        "fps=%.4f,scale=%d:-2,tile=%dx%d" % (rate, 200 if cols == 8 else 300, cols, rows),
        "-frames:v", "1", "-q:v", "3", contact])
    frames["contact_sheet"] = contact if os.path.exists(contact) else None
    frames["contact_sheet_seconds_per_tile"] = round(1 / rate, 2)
    rep["frames"] = frames
    audit_path = os.path.join(d, "cut_audit.json")
    if os.path.exists(audit_path):
        audit = json.load(open(audit_path))
        small = [c for c in audit["cuts"] if c["removed"] < 0.3]
        rep["cuts"] = {"cuts_per_min": audit["cuts_per_min"], "count": len(audit["cuts"]),
                       "tiny_jumps": small,  # < 0.3 s removed: most likely to look like a glitch
                       "note": "listen around each tiny jump; restore it unless a scene covers it"}
    rep["automated_pass"] = all(c["pass"] for c in rep["checks"].values())
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
