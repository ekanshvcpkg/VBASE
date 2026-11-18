#!/usr/bin/env python3
"""Parse ffmpeg silencedetect output ($EDIT_DIR/silence.log) into silences.json."""
import argparse, json, os, re


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", required=True)
    a = ap.parse_args()

    text = open(os.path.join(a.dir, "silence.log"), errors="ignore").read()
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", text)]
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", text)
    duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None

    sil = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else duration  # trailing silence runs to EOF
        if e is not None:
            sil.append({"start": round(max(0.0, s), 3), "end": round(e, 3)})
    total = round(sum(x["end"] - x["start"] for x in sil), 2)
    out = {"duration": duration, "count": len(sil), "total_silence": total,
           "silence_ratio": round(total / duration, 3) if duration else None, "silences": sil}
    with open(os.path.join(a.dir, "silences.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({k: out[k] for k in ("duration", "count", "total_silence", "silence_ratio")}))


if __name__ == "__main__":
    main()
