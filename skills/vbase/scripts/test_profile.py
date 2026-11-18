#!/usr/bin/env python3
"""Lifecycle test for profile.py (onboarding → fast path), in a throwaway $VIDBASE_HOME.
Run: python3 scripts/test_profile.py
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = tempfile.mkdtemp()
ENV = dict(os.environ, VIDBASE_HOME=HOME)
ENV.pop("ELEVENLABS_API_KEY", None)


def run(*args, ok=True):
    r = subprocess.run([sys.executable, os.path.join(HERE, "profile.py"), *args], capture_output=True, text=True, env=ENV)
    if ok:
        assert r.returncode == 0, r.stderr + r.stdout
    return r


def main():
    # 1. fresh install: no profile → onboarding
    assert run("status", ok=False).returncode == 3

    # 2. onboarding saves answers; bad values are reset and reported
    ans = os.path.join(HOME, "a.json")
    json.dump({"default_format": "ask", "style": "natural", "visual_style": "dark_tech", "captions": "refined",
               "music": "generate", "glossary": {"cloud": "Claude"}, "creator_name": "Ekansh", "holds": "sometimes"},
              open(ans, "w"))
    out = json.loads(run("save", "--answers", ans).stdout)
    assert any("holds" in f for f in out["fixed"]), out
    p = json.load(open(os.path.join(HOME, "profile.json")))
    assert p["palette"] == "ink", "dark_tech should imply the ink palette"
    assert p["holds"] == "deliberate"
    assert os.path.exists(os.path.join(HOME, "profile.md"))
    assert run("status").returncode == 0

    # 3. later single changes
    run("set", "captions=bold", "accent=#2255FF")
    assert json.load(open(os.path.join(HOME, "profile.json")))["captions"] == "bold"

    # 4. fast path: apply → setup.json; ask only what's open (format + missing key)
    d = tempfile.mkdtemp()
    vid = os.path.join(d, "in.mov"); open(vid, "w").close()
    out = json.loads(run("apply", "--dir", d, "--input", vid).stdout)
    assert set(out["ask"]) == {"target_aspect", "elevenlabs_key"}, out["ask"]
    out = json.loads(run("apply", "--dir", d, "--input", vid, "target_aspect=16:9", "music=none").stdout)
    assert out["ask"] == [], out["ask"]
    s = json.load(open(os.path.join(d, "setup.json")))
    assert s["target_aspect"] == "16:9" and s["brand"]["accent"] == "#2255FF" and s["brand"]["captions"] == "bold"
    assert s["editorial"]["glossary"] == {"cloud": "Claude"}

    # 5. the glossary reaches the captions through finalize_edl.py
    words = [{"i": 0, "word": "uploading", "start": 0.5, "end": 0.9}, {"i": 1, "word": "into", "start": 0.95, "end": 1.1},
             {"i": 2, "word": "cloud.", "start": 1.15, "end": 1.6}]
    json.dump({"words": words, "duration": 2.0}, open(os.path.join(d, "transcript.json"), "w"))
    json.dump({"format": {"duration": 2.0}}, open(os.path.join(d, "metadata.json"), "w"))
    json.dump({"fps": 30}, open(os.path.join(d, "edl_draft.json"), "w"))
    r = subprocess.run([sys.executable, os.path.join(HERE, "finalize_edl.py"), "--dir", d], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    edl = json.load(open(os.path.join(d, "master_edl.json")))
    assert edl["words"][-1]["word"] == "Claude.", edl["words"][-1]
    assert edl["brand"]["captions"] == "bold" and (edl["width"], edl["height"]) == (1920, 1080)
    print("PASS profile lifecycle (status → save → set → apply → glossary/brand in EDL)")


if __name__ == "__main__":
    main()
