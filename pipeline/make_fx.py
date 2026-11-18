"""Editor FX timeline: master_edl.json -> remotion_app/src/fx.json

The "human editor" layer between the scenes, derived from the edit itself (nothing is tied to one video):
  - jump-zoom punches on the director's highlight words (skipped inside holds and side panels)
  - a camera shake when a held 3D object is caught (held_object 'throw' beat)
  - a whip pan out of the cold open (only when the edit has a hook)
  - a flash + light leak, a shake and a callout when the clone effect spawns (only with --clone-word)
  - a zoom-blur transition into the last spoken sentence
  - a name lower-third over the first sentence (only when a creator name is known)
  - a GitHub chip on the word "GitHub" (only when a repo link is set)

Usage: python make_fx.py --dir EDIT_DIR [--name "Ada" --role "Builds Claude plugins"] [--github owner/repo] [--clone-word spawn]
Name, role and repo default to setup.json (editorial.creator_name, editorial.links.github).
"""
import argparse, json, os

ap = argparse.ArgumentParser()
ap.add_argument("--dir", required=True)
ap.add_argument("--name", default=None)
ap.add_argument("--role", default="Creator")
ap.add_argument("--github", default=None)
ap.add_argument("--clone-word", default=None, help="the word the clone effect spawns on (as used with fx_pass.py)")
ap.add_argument("--max-punches", type=int, default=7)
a = ap.parse_args()

m = json.load(open(os.path.join(a.dir, "master_edl.json")))
setup = {}
try:
    setup = json.load(open(os.path.join(a.dir, "setup.json")))
except Exception:
    pass
ed = setup.get("editorial", {})
name = a.name if a.name is not None else (ed.get("creator_name") or "")
github = a.github or (ed.get("links") or {}).get("github")

words = m["words"]
segs = m["keep_segments"]
holds = m.get("holds") or []
cues = m.get("three_d_cues") or []
total = m["total_duration"]
norm = lambda w: w["word"].lower().strip(".,!?;:\"'")


def in_hold(x):
    return any(h0 - 0.2 <= x <= h1 + 0.2 for h0, h1 in holds)


def covered(x):
    """a panel or full-frame scene is on screen (the camera move would be hidden or fight it)"""
    return any(c.get("layout") in ("split", "broll", "backdrop") and c["timeline_start"] - 0.3 <= x <= c["timeline_end"] + 0.3 for c in cues)


def cut_after(x):
    return min((s["timeline_end"] for s in segs if s["timeline_end"] > x + 0.05), default=total)


def first_word(text, after=0.0):
    return next((w for w in words if norm(w) == text and w["timeline_start"] >= after), None)


fx = {"punches": [], "shakes": [], "whips": [], "flashes": [], "zoomblurs": [], "lower_thirds": [], "chips": [], "callouts": [],
      "grain": 0.05, "vignette": 0.28}

# 1) jump-zoom punches on highlight words, spaced out, alternating depth; each holds to the next cut
last = -9
zoom_words = [w["timeline_start"] for w in words if norm(w) == "zoom"]   # fx_pass.py already moves the camera there
for w in [w for w in words if w.get("highlight")]:
    x = w["timeline_start"] + 0.03
    if x - last < 2.5 or in_hold(x) or covered(x) or len(fx["punches"]) >= a.max_punches:
        continue
    if any(abs(x - z) < 2.5 for z in zoom_words) or cut_after(x) - x < 1.8:   # no stacked zooms; room to ease in and out
        continue
    amt = (0.05, 0.06, 0.04, 0.055)[len(fx["punches"]) % 4]   # gentle: a push, not a jump
    fx["punches"].append({"t": round(x, 3), "amt": amt, "until": cut_after(x)})
    last = x

# 2) catch shake: a held object thrown to the other hand lands ~0.9-1.2 s after the throw beat
for c in cues:
    if c.get("scene") == "held_object":
        for b in c.get("beats", []):
            if b.get("action") == "throw":
                fx["shakes"].append({"t": round(c["timeline_start"] + b["t"] + 1.0, 3), "dur": 0.35, "amp": 7})

# 3) whip pan out of a cold open (the first segment is the hook when its source starts later than the second's)
if len(segs) > 1 and segs[0]["source_start"] > segs[1]["source_start"]:
    fx["whips"].append({"t": segs[0]["timeline_end"], "dur": 0.22, "dir": 1})

# 4) clone spawn: flash, shake and a callout above the clone (fx_pass.py places it at x≈0.79 W)
if a.clone_word:
    sw = first_word(a.clone_word.lower())
    if sw:
        t0 = sw["timeline_start"]
        fx["flashes"].append({"t": round(t0 + 0.05, 3), "dur": 0.5})
        fx["shakes"].append({"t": round(t0 + 0.1, 3), "dur": 0.5, "amp": 10})
        fx["callouts"].append({"t0": round(t0 + 1.4, 3), "t1": round(cut_after(t0 + 1.4) - 0.05, 3), "x": 0.80, "y": 0.30,
                               "text": "A copy of me", "sub": "cut out + placed behind"})

# 5) zoom-blur into the last sentence (the cut before the final sentence's first word)
starts = [w for i, w in enumerate(words) if i == 0 or words[i - 1]["word"].endswith((".", "?", "!"))]
if len(starts) > 2:
    t_last = starts[-1]["timeline_start"]
    cut = max((s["timeline_start"] for s in segs if 0 < s["timeline_start"] <= t_last + 0.05), default=None)
    if cut and not covered(cut):
        fx["zoomblurs"].append({"t": cut, "dur": 0.24})

# 6) lower third over the first sentence that is not the hook
if name:
    body0 = segs[1]["timeline_start"] if fx["whips"] else 0.0
    sent = [w for w in words if w["timeline_start"] >= body0][:8]
    if sent:
        t0 = sent[min(2, len(sent) - 1)]["timeline_start"]
        fx["lower_thirds"].append({"t0": round(t0, 3), "t1": round(t0 + 2.8, 3), "name": name, "role": a.role})

# 7) GitHub chip on the word "GitHub"
if github:
    gw = first_word("github")
    if gw and not covered(gw["timeline_start"]):
        fx["chips"].append({"t0": round(gw["timeline_start"] - 0.9, 3), "t1": round(gw["timeline_end"] + 1.2, 3), "kind": "github",
                            "text": "Free on GitHub", "sub": github})

out = os.path.join(a.dir, "remotion_app", "src", "fx.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(fx, open(out, "w"), indent=1)
print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in fx.items()}))
