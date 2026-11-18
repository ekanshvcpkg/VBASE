"""Take One sound design: master_edl.json + fx.json -> takeone/sfx_plan.json (procedural cues for sfx.mjs).
Every cue sits on the frame of its visual event in the FINAL film (open of OPEN_LEN s, then the edit, then the end card)."""
import json, sys
d = sys.argv[1]; OFF = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0; F = 30
m = json.load(open(f"{d}/master_edl.json")); fx = json.load(open(f"{d}/remotion_app/src/fx.json"))
cue = {c["scene"]: c for c in m["three_d_cues"]}
beats = lambda s, a: [cue[s]["timeline_start"] + b["t"] for b in cue[s].get("beats", []) if b["action"] == a] if s in cue else []
cues = []
def add(kind, t, variant=None, **kw):
    c = {"kind": kind, "frame": int(round(t * F))}
    if variant: c["variant"] = variant
    if kind in ("tick", "swish"): kw.setdefault("gainDb", 0); kw.setdefault("minDb", -15)   # texture under the voice
    if kind == "chime": kw.setdefault("gainDb", 2)
    c.update(kw); cues.append(c)
# open (drawn over the edit's first 4 s): the raw->edit wipe passes mid-frame ~0.75 s, the name lands at 2.45 s
add("whoosh", 0.78, "soft", label="raw to edit wipe"); add("impact", 2.45, "soft", label="name lands")
for t in beats("held_object", "hold")[:1]: add("pop", OFF + t, "cork", gainDb=-2, label="ball lands")
for s in fx["shakes"][:1]: add("press", OFF + s["t"] + 0.05, "soft", gainDb=-2, label="catch")
for t in beats("held_object", "label"): add("tick", OFF + t, "ui", label="label")
for w in fx["whips"]: add("whoosh", OFF + w["t"], "fast", label="whip")
for lt in fx["lower_thirds"]: add("swish", OFF + lt["t0"], "in", label="lower third")
for ch in fx["chips"]: add("pop", OFF + ch["t0"] + 0.1, "tiny", label="chip")
if "compare" in cue: add("paper", OFF + cue["compare"]["timeline_start"] + 0.2, "slide", label="panel")
for i, t in enumerate(beats("compare", "row")): add("tick", OFF + t, "ui", seed=10 + i, label="row")
for i, t in enumerate(beats("proof_grid", "tile")): add("pop", t, "tiny" if i < 3 else "cork", seed=40 + i, label="proof tile")
if "before_after" in cue:
    add("swish", cue["before_after"]["timeline_start"] + 0.05, "in", label="raw vs edit")
    for t in beats("before_after", "after"): add("press", t, "soft", label="edited half lands")
if "terminal" in cue: add("swish", OFF + cue["terminal"]["timeline_start"] + 0.1, "in", label="terminal")
for i, t in enumerate(beats("terminal", "line")): add("tick", OFF + t, "key", seed=20 + i, label="line")
z = [w for w in m["words"] if w["word"].lower().strip(".,") == "zoom"]
if len(z) >= 2: add("whoosh", OFF + z[0]["timeline_start"] + 0.06, "fast", gainDb=-2, label="zoom in"); add("whoosh", OFF + z[1]["timeline_start"] + 0.06, "soft", gainDb=-3, label="zoom out")
if "flow" in cue: add("swish", OFF + cue["flow"]["timeline_start"] + 0.1, "in", label="flow")
for i, t in enumerate(beats("flow", "step")): add("tick", OFF + t, "ui", seed=30 + i, label="step")
for f in fx["flashes"]: add("chime", OFF + f["t"], "sparkle", label="clone spawns")
for zb in fx["zoomblurs"]: add("whoosh", OFF + zb["t"], "soft", gainDb=-2, label="zoom blur")
for t in beats("icon3d", "land"): add("chime", OFF + t, "bell", label="star lands")
E = OFF + m["total_duration"]
add("swish", E + 0.05, "soft", label="step back"); add("press", E + 0.66, "confirm", gainDb=-2, label="CTA")
json.dump({"fps": F, "seed": 7, "key": "C", "bpm": 100, "cues": cues}, open(f"{d}/takeone/sfx_plan.json", "w"), indent=1)
print(len(cues), "cues")
