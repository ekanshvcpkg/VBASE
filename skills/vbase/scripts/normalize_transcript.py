#!/usr/bin/env python3
"""Normalize Whisper output (local openai-whisper CLI, faster-whisper-style, or the
OpenAI API verbose_json with word timestamps) into $EDIT_DIR/transcript.json:

{ "language": "en", "duration": 123.4,
  "words": [ {"i": 0, "word": "Stop", "start": 0.0, "end": 0.35}, ... ],
  "segments": [ {"start": 0.0, "end": 4.2, "text": "...", "first_word": 0, "last_word": 9}, ... ] }
"""
import argparse, glob, json, os, sys


def load_words(data):
    words, segments = [], []
    if isinstance(data.get("words"), list) and data["words"] and not data.get("segments", [{}])[0].get("words"):
        # OpenAI API verbose_json: top-level words + segments without nested words
        for w in data["words"]:
            words.append({"word": w.get("word", "").strip(), "start": float(w["start"]), "end": float(w["end"])})
        for s in data.get("segments", []):
            segments.append({"start": float(s["start"]), "end": float(s["end"]), "text": s.get("text", "").strip()})
    else:
        # local whisper CLI: segments[].words[]
        for s in data.get("segments", []):
            segments.append({"start": float(s["start"]), "end": float(s["end"]), "text": s.get("text", "").strip()})
            for w in s.get("words", []) or []:
                words.append({"word": w.get("word", "").strip(), "start": float(w["start"]), "end": float(w["end"])})
    return words, segments


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, help="edit directory")
    ap.add_argument("--input", help="whisper JSON (default: newest *.json in --dir that has segments)")
    a = ap.parse_args()

    path = a.input
    if not path:
        skip = {"metadata.json", "transcript.json", "silences.json", "setup.json", "edl_draft.json",
                "master_edl.json", "audio_manifest.json", "qc_state.json"}
        cands = [p for p in glob.glob(os.path.join(a.dir, "*.json")) if os.path.basename(p) not in skip]
        cands.sort(key=os.path.getmtime, reverse=True)
        path = cands[0] if cands else None
    if not path or not os.path.exists(path):
        sys.exit("No whisper JSON found; pass --input")

    with open(path) as f:
        data = json.load(f)
    words, segments = load_words(data)
    if not words:
        sys.exit("No word timestamps in %s — re-run whisper with --word_timestamps True "
                 "(or timestamp_granularities[]=word for the API)" % path)

    words = [w for w in words if w["word"]]
    words.sort(key=lambda w: w["start"])
    for i, w in enumerate(words):
        w["i"] = i
        if w["end"] < w["start"]:
            w["end"] = w["start"]
    # attach word index ranges to segments for easy skimming
    for s in segments:
        ids = [w["i"] for w in words if s["start"] - 0.05 <= w["start"] < s["end"] + 0.05]
        s["first_word"], s["last_word"] = (ids[0], ids[-1]) if ids else (None, None)

    out = {
        "language": data.get("language"),
        "duration": float(data.get("duration") or (words[-1]["end"] if words else 0)),
        "words": [{"i": w["i"], "word": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3)} for w in words],
        "segments": segments,
    }
    with open(os.path.join(a.dir, "transcript.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(json.dumps({"words": len(words), "segments": len(segments), "language": out["language"],
                      "source": os.path.basename(path)}))


if __name__ == "__main__":
    main()
