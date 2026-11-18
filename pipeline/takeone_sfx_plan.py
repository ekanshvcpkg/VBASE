"""VBASE sound design: master_edl.json + fx.json -> takeone/sfx_plan.json (procedural cues for Take One's sfx.mjs).

Rules (learned from owner notes: the first SFX pass "didn't fit"):
  - a sound only where something visibly POPS IN or lands; nothing on cuts, nothing on every word
  - each cue sits on the frame its visual becomes visible (timings mirror the scenes' own animation curves)
  - quiet: they accent, they never duck the voice (duckDb 0), tuned to the bed's key (F)
  - sparse: about one every 3 s at most; two cues never within 0.25 s
Times are on the FINAL film (the Take One open is drawn over the edit's first 4 s, so offset 0).
Usage: takeone_sfx_plan.py <EDIT_DIR> [offset=0]
"""
import json, sys
d = sys.argv[1]; OFF = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0; F = 30
m = json.load(open(f"{d}/master_edl.json"))
fx = json.load(open(f"{d}/remotion_app/src/fx.json"))
E = OFF + m["total_duration"]                       # end card starts here
cues = []


def add(kind, t, variant, gain, label, **kw):
    c = {"kind": kind, "frame": int(round((OFF + t) * F)), "variant": variant, "gainDb": gain, "duckDb": 0, "minDb": -20, "label": label}
    c.update(kw); cues.append(c)


def beats(c, action):
    return [c["timeline_start"] + b["t"] for b in c.get("beats", []) if b["action"] == action]


# the open: the VBASE name card lands (Spring 'heavy' from 2.55 s reads as landed ~0.12 s later)
add("chime", 2.67, "glint", -6, "VBASE name")
for c in m.get("three_d_cues", []):
    s, sc = c["timeline_start"], c.get("scene")
    if sc == "held_object":
        for t in beats(c, "hold")[:1]: add("pop", t, "cork", -7, "ball lands in palm")
        for t in beats(c, "throw")[:1]: add("press", t + 1.0, "soft", -8, "ball caught")
    elif sc == "proof_grid":
        tiles = beats(c, "tile")
        if tiles: add("swish", s + 0.04, "soft", -8, "looks grid in")
        if tiles: add("chime", tiles[-1] + 0.05, "glint", -6, "the chosen look")
    elif sc == "mascot3d":
        mode = c.get("props", {}).get("mode", "run")
        if mode == "peek": add("pop", s + 0.3, "tiny", -11, "mascot peeks up")       # lands at the top of its outBack rise
        elif mode == "run": add("swish", s + 0.25, "soft", -12, "mascot runs past")
        else: add("pop", s + 0.06, "pop", -5, "character card pops")
    elif sc == "glass_card":
        add("pop", s + 0.06, "tiny", -6, "glass card pops")
        if c.get("props", {}).get("logo"): add("chime", s + 0.5, "bell", -9, "VBASE word lands")
    elif sc in ("screen_video", "code", "terminal") and c.get("layout") == "split":
        add("swish", s + 0.2, "in", -9, f"{sc} window floats in")
    elif sc == "glass_chips":
        add("pop", s + 0.06, "tiny", -7, "chips header")
        for i, t in enumerate(beats(c, "chip")): add("tick", t + 0.04, "ui", -10, "chip resolves", seed=40 + i)   # the check mark shows a frame after the beat
    elif sc == "repo":
        for t in beats(c, "star")[:1]: add("press", t, "confirm", -6, "GitHub star")
# end card: the step back, then the button
add("swish", E + 0.05, "soft", -8, "end card")
add("press", E + 0.86, "confirm", -9, "end card button")

# never two cues within 0.25 s: keep the earlier one
cues.sort(key=lambda c: c["frame"]); kept = []
for c in cues:
    if not kept or c["frame"] - kept[-1]["frame"] >= 8: kept.append(c)
json.dump({"fps": F, "seed": 7, "key": "F", "bpm": 102, "cues": kept}, open(f"{d}/takeone/sfx_plan.json", "w"), indent=1)
print(len(kept), "cues:", ", ".join(f'{c["frame"]/F:.2f}s {c["label"]}' for c in kept))
