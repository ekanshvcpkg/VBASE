#!/usr/bin/env python3
"""The creator's editing profile: answered once at onboarding, applied to every video.

Lives in ~/.vidbase/ (override with $VIDBASE_HOME) so reinstalling or updating the skill never
wipes it.
  profile.json  machine-readable; every stage reads it through `apply`
  profile.md    human-readable summary, regenerated on every save

Commands
  profile.py status                 exit 0 + one-line summary if a profile exists, exit 3 if not
  profile.py save  --answers a.json merge answers into the profile (validates, fills defaults)
  profile.py show                   print profile.md
  profile.py set   key=value ...    change single settings later ("make captions bold")
  profile.py apply --dir $EDIT_DIR --input VIDEO [key=value ...]
                                    write $EDIT_DIR/setup.json for this video from the profile,
                                    with per-video overrides; prints what still has to be asked
"""
import argparse, json, os, sys, time

HOME = os.path.expanduser(os.environ.get("VIDBASE_HOME", "~/.vidbase"))
PJ, PM = os.path.join(HOME, "profile.json"), os.path.join(HOME, "profile.md")

# key: (default, allowed values or None for free text, short description)
SCHEMA = {
    # channel
    "creator_name":   ("", None, "Name as it should appear in captions"),
    "content_type":   ("tutorial", ["tutorial", "product_demo", "talking_head", "vlog", "podcast_clip", "course", "other"], "What you make"),
    "platforms":      (["youtube"], None, "Where it gets posted"),
    "default_format": ("ask", ["9:16", "16:9", "1:1", "4:5", "original", "ask"], "Output shape (ask = ask per video)"),
    "typical_length": ("short", ["short", "medium", "long"], "short <60 s, medium 1-5 min, long 5+ min"),
    # editing
    "style":          ("natural", ["natural", "fast", "educational", "cinematic"], "Pacing"),
    "hook_policy":    ("find", ["find", "keep_intro", "ask"], "Cold-open: find the strongest line / keep my intro / ask"),
    "cut_depth":      ("fillers_and_retakes", ["fillers_only", "fillers_and_retakes", "tight"], "How much to remove"),
    "holds":          ("deliberate", ["deliberate", "subtle", "none"], "Dramatic holds on key lines"),
    # look
    "visual_style":   ("editorial", ["editorial", "dark_tech", "bold_creator", "minimal"], "Overall look of graphics"),
    "accent":         ("#C96442", None, "Brand accent colour (hex)"),
    "palette":        ("paper", ["paper", "ink"], "Panels: warm paper or charcoal ink"),
    "captions":       ("refined", ["refined", "bold", "none"], "Caption look"),
    # graphics
    "scene_density":  ("balanced", ["minimal", "balanced", "rich"], "How many scenes"),
    "elements":       (["product_ui", "compare", "flow", "stat", "held_object", "phone", "terminal_code"], None, "Allowed scene types"),
    "object_3d":      ("matte_realistic", ["matte_realistic", "glossy", "none"], "Look of 3D objects"),
    "products":       ([], None, "Products you often show (Claude, Figma, your app...)"),
    "links":          ({}, None, "Handles/links, e.g. {\"github\": \"owner/repo\"}"),
    "glossary":       ({}, None, "Spellings Whisper gets wrong: {\"cloud\": \"Claude\"}"),
    # audio + delivery
    "music":          ("none", ["generate", "file", "none"], "Background music"),
    "music_mood":     ("light lo-fi, warm, unobtrusive", None, "Music brief"),
    "music_file":     ("", None, "Path to your own track"),
    "sfx":            ("subtle", ["subtle", "none"], "Tactile sound effects (ElevenLabs)"),
    "autopilot":      (True, [True, False], "Edit without a plan-approval stop"),
    "social_copy":    (True, [True, False], "Write titles/caption/hashtags"),
    "output_dir":     ("", None, "Where finished videos go (blank = next to the source)"),
}
STYLE_TO_PALETTE = {"editorial": "paper", "minimal": "paper", "dark_tech": "ink", "bold_creator": "ink"}
DENSITY = {"minimal": "1 scene per ~20 s, face carries the rest",
           "balanced": "clustered scenes on proof moments, face-only stretches between",
           "rich": "a scene on most proof moments, still with holds"}


def load():
    if not os.path.exists(PJ):
        return None
    return json.load(open(PJ))


def validate(p):
    out, errs = {}, []
    for k, (default, allowed, _) in SCHEMA.items():
        v = p.get(k, default)
        if allowed is not None and v not in allowed:
            errs.append("%s=%r (allowed: %s)" % (k, v, ", ".join(map(str, allowed))))
            v = default
        out[k] = v
    if not str(out["accent"]).startswith("#"):
        errs.append("accent must be a hex colour like #C96442")
        out["accent"] = SCHEMA["accent"][0]
    if "palette" not in p and "visual_style" in p:
        out["palette"] = STYLE_TO_PALETTE.get(out["visual_style"], "paper")
    if out["captions"] == "bold" and out["style"] != "fast":
        pass  # allowed, but the director doc warns it reads as short-form on 16:9
    return out, errs


def write_md(p):
    lines = ["# vidbase profile", "", "_Edit with `profile.py set key=value`, or tell Claude \"change my vidbase settings\"._", ""]
    groups = [("Channel", ["creator_name", "content_type", "platforms", "default_format", "typical_length"]),
              ("Editing", ["style", "hook_policy", "cut_depth", "holds"]),
              ("Look", ["visual_style", "accent", "palette", "captions"]),
              ("Graphics", ["scene_density", "elements", "object_3d", "products", "links", "glossary"]),
              ("Audio & delivery", ["music", "music_mood", "music_file", "sfx", "autopilot", "social_copy", "output_dir"])]
    for title, keys in groups:
        lines += ["## " + title, ""]
        for k in keys:
            lines.append("- **%s**: %s  _(%s)_" % (k, json.dumps(p[k], ensure_ascii=False), SCHEMA[k][2]))
        lines.append("")
    open(PM, "w").write("\n".join(lines))


def save(p):
    os.makedirs(HOME, exist_ok=True)
    p["updated"] = time.strftime("%Y-%m-%d")
    json.dump(p, open(PJ, "w"), indent=1, ensure_ascii=False)
    write_md(p)


def summary(p):
    return "%s · %s · %s look · %s captions · music: %s · %s" % (
        p["default_format"] if p["default_format"] != "ask" else "format asked per video",
        p["style"], p["visual_style"], p["captions"], p["music"], "autopilot" if p["autopilot"] else "plan first")


def parse_kv(pairs):
    out = {}
    for kv in pairs:
        k, _, v = kv.partition("=")
        try:
            out[k] = json.loads(v)
        except ValueError:
            out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["status", "save", "show", "set", "apply"])
    ap.add_argument("pairs", nargs="*")
    ap.add_argument("--answers")
    ap.add_argument("--dir")
    ap.add_argument("--input")
    a = ap.parse_intermixed_args()  # allows: apply --dir D --input V key=value ...
    cur = load()

    if a.cmd == "status":
        if not cur:
            print("no profile: run onboarding (agents/00_onboarding.md)")
            sys.exit(3)
        print("profile: " + summary(cur))
        return
    if a.cmd == "show":
        if not cur:
            sys.exit("no profile yet")
        print(open(PM).read())
        return
    if a.cmd in ("save", "set"):
        base = dict(cur or {})
        base.update(json.load(open(a.answers)) if a.answers else {})
        base.update(parse_kv(a.pairs))
        p, errs = validate(base)
        save(p)
        print(json.dumps({"saved": PJ, "summary": summary(p), "fixed": errs}, indent=1))
        return

    # apply: profile + per-video overrides -> setup.json
    if not cur:
        sys.exit("no profile: run onboarding first (agents/00_onboarding.md)")
    if not a.dir or not a.input:
        sys.exit("apply needs --dir and --input")
    p = dict(cur)
    over = parse_kv(a.pairs)
    if "target_aspect" in over:  # per-video name for the profile's default_format
        over["default_format"] = over.pop("target_aspect")
    p.update(over)
    p, errs = validate(p)
    ask = []
    if p["default_format"] == "ask":
        ask.append("target_aspect")
    if p["music"] == "generate" and not os.environ.get("ELEVENLABS_API_KEY"):
        ask.append("elevenlabs_key")
    if p["music"] == "file" and not (p["music_file"] and os.path.exists(os.path.expanduser(p["music_file"]))):
        ask.append("music_file")
    if p["hook_policy"] == "ask":
        ask.append("hook")
    setup = {
        "input_video": os.path.abspath(a.input),
        "target_aspect": None if p["default_format"] == "ask" else p["default_format"],
        "style": p["style"],
        "three_d": "scenes" if p["elements"] else "none",
        "elevenlabs": p["music"] == "generate" or p["sfx"] == "subtle",
        "music": p["music"], "music_mood": p["music_mood"],
        "bgm_path": os.path.expanduser(p["music_file"]) if p["music"] == "file" and p["music_file"] else None,
        "sfx": p["sfx"], "vo": False, "glb_path": None,
        "brand": {"accent": p["accent"], "palette": p["palette"], "captions": p["captions"], "visual_style": p["visual_style"],
                  "object_3d": p["object_3d"]},
        "editorial": {"hook_policy": p["hook_policy"], "cut_depth": p["cut_depth"], "holds": p["holds"],
                      "scene_density": p["scene_density"], "density_hint": DENSITY[p["scene_density"]],
                      "elements": p["elements"], "products": p["products"], "links": p["links"],
                      "creator_name": p["creator_name"], "glossary": p["glossary"]},
        "autopilot": p["autopilot"], "social_copy": p["social_copy"], "output_dir": p["output_dir"],
    }
    os.makedirs(a.dir, exist_ok=True)
    json.dump(setup, open(os.path.join(a.dir, "setup.json"), "w"), indent=1, ensure_ascii=False)
    if setup["bgm_path"] and os.path.exists(setup["bgm_path"]):
        ext = os.path.splitext(setup["bgm_path"])[1] or ".mp3"
        import shutil
        shutil.copy(setup["bgm_path"], os.path.join(a.dir, "bgm" + ext))
    print(json.dumps({"setup": os.path.join(a.dir, "setup.json"), "summary": summary(p), "ask": ask, "fixed": errs}, indent=1))


if __name__ == "__main__":
    main()
