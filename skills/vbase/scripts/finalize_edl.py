#!/usr/bin/env python3
"""Turn the Content Director's edl_draft.json (expressed in SOURCE time) into
master_edl.json (expressed on the TRIMMED timeline of base_cut.mp4).

What it does, so the LLM doesn't have to do arithmetic:
  * tightens Whisper word boundaries that bleed into detected silences
  * drops filler tokens, remove_ranges, remove_word_ids; moves the hook to the front
    (and removes it from its original position)
  * builds keep segments by splitting at word gaps > style threshold, with small pads
    that never swallow a removed word
  * splits long shots at natural word gaps and alternates punch-in zoom levels
  * snaps every cut to the frame grid so audio and video segment lengths match exactly
  * computes cumulative timeline_start/end, remaps words and cue anchors onto the timeline
  * validates: static stretches, cue overlaps, anchors on removed words, odd durations

Usage: finalize_edl.py --dir $EDIT_DIR [--draft edl_draft.json]
"""
import argparse, json, math, os, re, sys

FILLERS = {"um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "eh", "hmm", "hm", "mm", "mhm", "mmm"}
# Pauses are *compressed*, not deleted: each gap between kept words is shortened to a target
# that depends on what kind of pause it is (sentence end > clause > mid-phrase). A gap is only
# cut when that saves at least min_removed seconds — tiny jump cuts read as glitches.
#   pause_*      target pause kept after a sentence / clause / phrase   (seconds)
#   min_removed  don't cut unless the cut removes at least this much
#   min_shot     shots shorter than this are merged back into a neighbour (pause restored)
#   max_cpm      cap on jump cuts per minute; the smallest cuts are restored first
#   tail_keep    audio always kept after a phrase's last word (breath / decaying consonant)
#   head_keep    audio always kept before a phrase's first word
#   shot         split continuous shots longer than this (punch-in); 999 = never
#   zoom         alternate framing used to hide jump cuts;  push = slow push-in per shot
STYLE = {
    "natural":     dict(pause_sentence=0.40, pause_clause=0.22, pause_phrase=0.12, min_removed=0.25,
                        min_shot=1.2, max_cpm=10, tail_keep=0.15, head_keep=0.06,
                        shot=999, zoom=1.06, push=0.035, static=9.0),
    "fast":        dict(pause_sentence=0.22, pause_clause=0.12, pause_phrase=0.07, min_removed=0.15,
                        min_shot=0.7, max_cpm=24, tail_keep=0.10, head_keep=0.04,
                        shot=4.0, zoom=1.12, push=0.02, static=4.5),
    "educational": dict(pause_sentence=0.32, pause_clause=0.18, pause_phrase=0.10, min_removed=0.22,
                        min_shot=1.0, max_cpm=14, tail_keep=0.13, head_keep=0.05,
                        shot=7.0, zoom=1.08, push=0.03, static=6.5),
    "cinematic":   dict(pause_sentence=0.55, pause_clause=0.30, pause_phrase=0.18, min_removed=0.35,
                        min_shot=1.8, max_cpm=8, tail_keep=0.20, head_keep=0.10,
                        shot=999, zoom=1.04, push=0.04, static=10.0),
}
DEFAULT_STYLE = "natural"
DIMS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350), "4:3": (1440, 1080)}


def source_dims(meta, long_side=1920):
    """'original' aspect: the source frame (rotation-aware), scaled so the long side is <= 1920, even sizes."""
    v = next((x for x in meta.get("streams", []) if x.get("codec_type") == "video"), None)
    if not v:
        return DIMS["16:9"]
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = rot or int(float((v.get("tags") or {}).get("rotate", 0)))
    if abs(rot) % 180 == 90:
        w, h = h, w
    k = min(1.0, long_side / max(w, h))
    return int(round(w * k / 2) * 2), int(round(h * k / 2) * 2)

warnings = []


def warn(msg):
    warnings.append(msg)


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


def norm(word):
    return re.sub(r"[^\w']", "", word.lower())


def tighten_with_silences(words, silences, tail_keep=0.15):
    """Whisper often stretches a phrase's last word across the following pause (or starts
    a word early). Clip word edges that overlap a detected silence — but leave tail_keep of
    the 'silence' after the word: a -30 dB detector calls breaths and fading consonants
    silence, and clipping them is what makes cuts sound chopped."""
    for w in words:
        for s in silences:
            a, b = s["start"], s["end"]
            if b - a < 0.3 or b <= w["start"] or a >= w["end"]:
                continue
            if a > w["start"] + 0.05 and b >= w["end"] - 0.05:   # silence eats the tail
                w["end"] = max(w["start"] + 0.08, min(w["end"], a + tail_keep))
            elif b < w["end"] - 0.05 and a <= w["start"] + 0.05:  # silence eats the head
                w["start"] = min(w["end"] - 0.08, b - 0.05)


SENTENCE_END = re.compile(r"[.!?…]['\")\]]*$")
CLAUSE_END = re.compile(r"[,;:—–-]['\")\]]*$")


def gap_class(prev):
    """What kind of pause follows this word: 'sentence', 'clause' or 'phrase'."""
    t = prev["word"].strip()
    if SENTENCE_END.search(t):
        return "sentence"
    if CLAUSE_END.search(t):
        return "clause"
    return "phrase"


def target_pause(prev, nxt, gap, cfg):
    """How long the pause between `prev` and `nxt` should be after editing (seconds).

    prev / nxt: transcript words {"word", "start", "end"}; gap = nxt.start - prev.end.
    Return a value in [0, gap]. Returning gap means "leave this pause alone".
    The caller only cuts when gap - result >= cfg["min_removed"].
    """
    # editorial overrides first (see references/editing_sense.md)
    if prev.get("i") in cfg.get("_hold_ids", ()) and nxt.get("i") in cfg.get("_hold_ids", ()):
        return gap  # a hold breathes: no cuts inside it
    cls = gap_class(prev)
    target = cfg["pause_" + cls]
    question = cls == "sentence" and prev["word"].rstrip("'\")]").endswith("?")
    if question:
        target = max(target * 1.25, 0.8)  # let the viewer's brain answer the question
    elif cls == "sentence" and norm(nxt["word"]) in ("and", "but", "so", "because", "which"):
        target *= 0.8   # same thought continues
    # long pauses usually mark a bigger shift: keep a little of the extra, capped
    target += min(0.10 * max(gap - target, 0.0), 0.25)
    if nxt.get("i") in cfg.get("_emphasis", ()):
        target = max(target, 0.65)  # hold the inhale before a big line: it makes the speaker sound alive
    return min(gap, target)


def runs_to_segments(words, kept_ids, cfg, src_dur):
    """Group consecutive kept words into segments.

    A segment ends at a removed word (filler / remove_ranges) or at a pause that is worth
    compressing. Each segment remembers how it meets the next one, so short shots and
    excess cuts can later be merged back (which restores the original pause exactly).
    """
    segs, cur = [], []
    by_i = {w["i"]: w for w in words}
    order = [w["i"] for w in words]
    pos = {i: k for k, i in enumerate(order)}
    pending = {"pad_in": cfg["head_keep"]}  # how the *next* segment should start

    def close(run, pad_out, joint=None):
        if not run:
            return
        first, last = by_i[run[0]], by_i[run[-1]]
        k0, k1 = pos[run[0]], pos[run[-1]]
        prev_end = by_i[order[k0 - 1]]["end"] if k0 > 0 else 0.0
        next_start = by_i[order[k1 + 1]]["start"] if k1 + 1 < len(order) else src_dur
        start = max(first["start"] - pending["pad_in"], prev_end, 0.0)
        end = min(last["end"] + pad_out, next_start, src_dur)
        segs.append({"source_start": start, "source_end": end, "word_ids": list(run),
                     "joint": joint})  # joint: None (removed words follow) or pause info

    prev = None
    for i in order:
        if i not in kept_ids:
            if cur:
                close(cur, cfg["tail_keep"])
                pending["pad_in"] = cfg["head_keep"]
            cur, prev = [], None
            continue
        w = by_i[i]
        if prev is not None:
            p = by_i[prev]
            gap = max(0.0, w["start"] - p["end"])
            keep = min(max(target_pause(p, w, gap, cfg), 0.0), gap)
            if gap - keep >= cfg["min_removed"]:
                # split the kept pause: most of it after the phrase (breath), a little before
                pad_out = min(keep, max(cfg["tail_keep"], keep * 0.65))
                pad_in = max(min(cfg["head_keep"], keep), keep - pad_out)
                close(cur, pad_out, {"cls": gap_class(p), "gap": round(gap, 3), "kept": round(keep, 3),
                                     "after": p["word"], "before": w["word"]})
                pending["pad_in"] = pad_in
                cur = []
        cur.append(i)
        prev = i
    close(cur, cfg["tail_keep"])
    return segs


def merge_back(segs, cfg, total_hint):
    """Undo cuts that hurt more than they help, restoring the original pause:
    1) any shot shorter than min_shot is merged into a neighbour it was split from
    2) while jump cuts per minute exceed max_cpm, restore the cut that removed least.
    Only pause cuts (seg["joint"] set) are restorable; cuts around removed words are not."""
    def merge(k):  # merge segs[k] with segs[k+1]
        a, b = segs[k], segs[k + 1]
        a.update(source_end=b["source_end"], word_ids=a["word_ids"] + b["word_ids"], joint=b["joint"])
        del segs[k + 1]

    def removed(k):
        return segs[k + 1]["source_start"] - segs[k]["source_end"]

    changed = True
    while changed:
        changed = False
        for k, s in enumerate(segs):
            if s["source_end"] - s["source_start"] >= cfg["min_shot"]:
                continue
            left = k - 1 if k > 0 and segs[k - 1]["joint"] else None
            right = k if k + 1 < len(segs) and s["joint"] else None
            opts = [j for j in (left, right) if j is not None]
            if opts:
                merge(min(opts, key=removed))
                changed = True
                break

    minutes = max(total_hint / 60.0, 0.25)
    while len(segs) - 1 > cfg["max_cpm"] * minutes:
        cands = [k for k in range(len(segs) - 1) if segs[k]["joint"]]
        if not cands:
            break
        merge(min(cands, key=removed))
    return segs


def split_long(seg, by_i, cfg):
    """Split a shot longer than cfg.shot at the biggest word gap in a sensible window."""
    max_len, min_len = cfg["shot"], cfg["shot"] * 0.45
    ids = seg["word_ids"]
    cands = []  # (time, gap_size, index_in_ids)
    for k in range(len(ids) - 1):
        a, b = by_i[ids[k]], by_i[ids[k + 1]]
        cands.append(((a["end"] + b["start"]) / 2, b["start"] - a["end"], k))
    out, last_t, last_k = [], seg["source_start"], 0
    while seg["source_end"] - last_t > max_len:
        window = [c for c in cands if last_t + min_len < c[0] <= last_t + max_len
                  and seg["source_end"] - c[0] >= min_len]
        if not window:
            break
        t, _, k = max(window, key=lambda c: (round(c[1], 2), -abs(c[0] - last_t - max_len * 0.75)))
        out.append({"source_start": last_t, "source_end": t, "word_ids": ids[last_k:k + 1]})
        last_t, last_k = t, k + 1
    out.append({"source_start": last_t, "source_end": seg["source_end"], "word_ids": ids[last_k:],
                "joint": seg.get("joint")})
    return out


def is_jump(p, s, fps):
    return abs(s["source_start"] - p["source_end"]) > 1.0 / fps


def assign_framing(keep, cues, cfg, fps):
    """Motivated framing instead of a 1.0/1.15 ping-pong on every segment.
    * framing only changes at a real jump cut (or a deliberate punch-in split)
    * a jump cut hidden under a full-screen scene (layout broll) keeps its framing
    * every shot long enough gets a slow push-in, rendered sub-pixel smooth in Remotion"""
    broll = [(c["timeline_start"], c["timeline_end"]) for c in cues if c.get("layout") == "broll"]
    z = 1.0
    for k, s in enumerate(keep):
        if k > 0:
            p = keep[k - 1]
            hidden = any(a <= s["timeline_start"] <= b for a, b in broll)
            if not hidden and (is_jump(p, s, fps) or cfg["shot"] < 999):
                z = cfg["zoom"] if z == 1.0 else 1.0
        s["zoom"] = z
        d = s["timeline_end"] - s["timeline_start"]
        s["push"] = round(cfg["push"] * min(1.0, d / 4.0), 4) if d >= 1.5 else 0.0


def cut_audit(keep, fps, words_by_i):
    """One row per jump cut so the director (and QC) can sanity-check every edit."""
    rows = []
    for k in range(1, len(keep)):
        p, s = keep[k - 1], keep[k]
        if not is_jump(p, s, fps):
            continue
        j = p.get("_joint") or {}
        if not j and p.get("_word_ids") and s.get("_word_ids"):
            j = {"after": words_by_i[p["_word_ids"][-1]]["word"], "before": words_by_i[s["_word_ids"][0]]["word"]}
        rows.append({"timeline": s["timeline_start"], "removed": round(s["source_start"] - p["source_end"], 3),
                     "kind": "pause" if j.get("cls") else "removed_words", "class": j.get("cls"),
                     "gap": j.get("gap"), "kept": j.get("kept"),
                     "context": "%s | %s" % (j.get("after", ""), j.get("before", ""))})
    return rows


def pick_room_tone(silences, words, src_dur, n=4):
    """Candidate 0.5 s windows of pure room sound, looped under the whole cut so the noise
    floor never drops out at an edit. silencedetect at -30 dB happily calls quiet speech
    "silence", and a looped half-second of a word is a disaster ("amount of amount of…"),
    so windows must keep 0.15 s clear of every transcript word. build_filtergraph.py then
    measures each candidate and only uses one that is far quieter than the speech."""
    spans = sorted((w["start"] - 0.15, w["end"] + 0.15) for w in words)
    cands = []
    for s in silences:
        a, b = max(s["start"], 0.0), min(s["end"], src_dur)
        # carve the silence into word-free pieces
        free, cur = [], a
        for w0, w1 in spans:
            if w1 <= cur or w0 >= b:
                continue
            if w0 > cur:
                free.append((cur, w0))
            cur = max(cur, w1)
        if cur < b:
            free.append((cur, b))
        for f0, f1 in free:
            if f1 - f0 >= 0.6:
                m = (f0 + f1) / 2
                cands.append((f1 - f0, {"source_start": round(m - 0.25, 3), "source_end": round(m + 0.25, 3)}))
    cands.sort(key=lambda c: -c[0])
    return [c[1] for c in cands[:n]]


def snap(t, fps):
    return round(round(t * fps) / fps, 6)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--draft", default="edl_draft.json")
    a = ap.parse_args()
    d = a.dir

    draft = load(os.path.join(d, a.draft))
    if draft is None:
        sys.exit("missing %s" % a.draft)
    tr = load(os.path.join(d, "transcript.json"))
    if tr is None:
        sys.exit("missing transcript.json (run normalize_transcript.py)")
    setup = load(os.path.join(d, "setup.json"), {})
    meta = load(os.path.join(d, "metadata.json"), {})
    sil = load(os.path.join(d, "silences.json"), {"silences": []})

    style = draft.get("style") or setup.get("style") or DEFAULT_STYLE
    if style not in STYLE:
        warn("unknown style %r; using %s" % (style, DEFAULT_STYLE))
        style = DEFAULT_STYLE
    cfg = dict(STYLE[style])
    cfg.update(draft.get("tuning", {}))  # optional per-video overrides
    fps = int(draft.get("fps") or 30)
    aspect = draft.get("target_aspect") or setup.get("target_aspect") or "original"
    if aspect == "original":
        width, height = source_dims(meta)
    elif aspect in DIMS:
        width, height = DIMS[aspect]
    else:
        warn("unknown target_aspect %r; keeping the source shape" % aspect)
        width, height = source_dims(meta)
    src_dur = float((meta.get("format") or {}).get("duration") or tr.get("duration") or 0) or 1e9

    words = [dict(w) for w in tr["words"]]
    # profile glossary (setup.json, from onboarding): fixes the same mishearings on every video,
    # e.g. {"cloud": "Claude"}; the director's per-word word_fixes still win
    gloss = {norm(k): v for k, v in ((setup.get("editorial") or {}).get("glossary") or {}).items()}
    if gloss:
        for w in words:
            fixed = gloss.get(norm(w["word"]))
            if fixed:
                tail = re.search(r"[^\w']*$", w["word"]).group(0)
                w["word"] = fixed + tail
    # word_fixes: {"22": "Claude"} — spelling corrections for captions (Whisper hears
    # product names wrong: "cloud" for Claude). Timing is untouched; punctuation is kept.
    for wid, fixed in (draft.get("word_fixes") or {}).items():
        for w in words:
            if w["i"] == int(wid):
                tail = re.search(r"[^\w']*$", w["word"]).group(0)
                w["word"] = fixed if re.search(r"[^\w']$", fixed) else fixed + tail
    tighten_with_silences(words, sil.get("silences", []), cfg["tail_keep"])
    by_i = {w["i"]: w for w in words}

    def mid(w):
        return (w["start"] + w["end"]) / 2

    removed = set(draft.get("remove_word_ids") or [])
    fillers = {w["i"] for w in words if norm(w["word"]) in FILLERS}
    removed |= fillers
    # editorial levers: holds (no cuts, slow creep), emphasis (keep the breath before a line)
    def id_span(r):
        a_, b_ = int(r.get("from_word_id", r.get("anchor_word_id", -1))), int(r.get("to_word_id", r.get("anchor_word_id", -1)))
        return set(range(a_, b_ + 1))
    hold_ids = set()
    for hd in draft.get("holds") or []:
        hold_ids |= id_span(hd)
    cfg["_hold_ids"] = hold_ids
    cfg["_emphasis"] = set(draft.get("emphasis_word_ids") or [])
    for r0, r1 in draft.get("remove_ranges") or []:
        removed |= {w["i"] for w in words if r0 <= mid(w) <= r1}

    hook = draft.get("hook")
    hook_ids = set()
    if hook:
        hook_ids = {w["i"] for w in words if hook["source_start"] <= mid(w) <= hook["source_end"]} - removed
        if not hook_ids:
            warn("hook range %.2f-%.2f contains no kept words; ignored" % (hook["source_start"], hook["source_end"]))

    # ---- build segments -------------------------------------------------------------
    explicit = draft.get("keep_segments")
    if explicit:
        segs = [{"source_start": float(s["source_start"]), "source_end": float(s["source_end"]),
                 "zoom": float(s.get("zoom", 1.0)), "word_ids": None} for s in explicit]
    else:
        body_ids = {w["i"] for w in words} - removed - hook_ids
        hook_segs = runs_to_segments(words, hook_ids, cfg, src_dur) if hook_ids else []
        body_segs = runs_to_segments(words, body_ids, cfg, src_dur)
        est = sum(x["source_end"] - x["source_start"] for x in hook_segs + body_segs)
        merge_back(hook_segs, cfg, est)
        merge_back(body_segs, cfg, est)
        segs = []
        for s in hook_segs + body_segs:
            segs.extend(split_long(s, by_i, cfg))
        for s in segs:
            s["zoom"] = 1.0  # final framing is decided after cues are placed (see assign_framing)

    # ---- snap, de-overlap, timeline ----------------------------------------------------
    for s in segs:
        s["source_start"], s["source_end"] = snap(s["source_start"], fps), snap(min(s["source_end"], src_dur), fps)
    # Snapping each edge independently can make neighbours (e.g. hook vs. the sentence
    # before it) overlap by a frame, which would replay a sliver of audio. Clip them.
    by_src = sorted(segs, key=lambda s: s["source_start"])
    for p, s in zip(by_src, by_src[1:]):
        if s["source_start"] < p["source_end"]:
            s["source_start"] = p["source_end"]
    keep, t = [], 0.0
    for s in segs:
        s0, s1 = s["source_start"], s["source_end"]
        if s1 - s0 < 1.5 / fps:
            continue
        dur = round(s1 - s0, 6)
        keep.append({"id": len(keep), "source_start": s0, "source_end": s1,
                     "timeline_start": round(t, 6), "timeline_end": round(t + dur, 6),
                     "zoom": s["zoom"], "_word_ids": s.get("word_ids"), "_joint": s.get("joint")})
        t += dur
    total = round(t, 6)
    if not keep:
        sys.exit("EDL is empty after cuts — check remove_ranges / transcript")

    # ---- words onto timeline ---------------------------------------------------------
    highlight = set(draft.get("highlight_word_ids") or [])
    src_to_tl = {}  # word id -> timeline start
    tl_words = []
    for seg in keep:
        for w in words:
            if w["i"] in removed:
                continue
            m = mid(w)
            if not (seg["source_start"] <= m <= seg["source_end"]):
                continue
            off = seg["timeline_start"] - seg["source_start"]
            ws = max(w["start"], seg["source_start"]) + off
            we = min(w["end"], seg["source_end"]) + off
            if w["i"] in src_to_tl:  # word straddling a split boundary: keep first occurrence
                continue
            src_to_tl[w["i"]] = ws
            tl_words.append({"word": w["word"], "timeline_start": round(ws, 3), "timeline_end": round(we, 3),
                             "highlight": w["i"] in highlight, "src_id": w["i"]})
    tl_words.sort(key=lambda x: x["timeline_start"])

    def anchor_time(c, label):
        if "anchor_word_id" in c:
            wid = c["anchor_word_id"]
            if wid in src_to_tl:
                return src_to_tl[wid]
            # fall forward to the next kept word within 2s of source time
            w = by_i.get(wid)
            if w:
                nxt = [x for x in words if x["i"] in src_to_tl and 0 <= x["start"] - w["start"] <= 2.0]
                if nxt:
                    warn("%s anchor word %s (%r) was cut; moved to next kept word %r" %
                         (label, wid, w["word"], nxt[0]["word"]))
                    return src_to_tl[nxt[0]["i"]]
            warn("%s anchor word %s is not in the final cut; cue dropped" % (label, wid))
            return None
        if "source_time" in c:
            st = float(c["source_time"])
            for seg in keep:
                if seg["source_start"] <= st <= seg["source_end"]:
                    return st - seg["source_start"] + seg["timeline_start"]
            warn("%s source_time %.2f falls in a removed section; cue dropped" % (label, st))
            return None
        if "timeline_start" in c:
            return float(c["timeline_start"])
        warn("%s has no anchor_word_id/source_time; dropped" % label)
        return None

    # ---- cues ------------------------------------------------------------------------
    cues = []
    for n, c in enumerate(draft.get("cues") or draft.get("three_d_cues") or []):
        ts = anchor_time(c, "cue %d" % n)
        if ts is None:
            continue
        # land graphics ~2 frames into the anchor word (the consonant's energy peak), unless
        # the director sets an explicit offset (negative = visual leads the word, an L-cut)
        ts = max(0.0, ts + float(c.get("offset", 2.0 / fps)))
        is_scene = "scene" in c
        dur = float(c.get("duration") or (c.get("timeline_end", ts + (4.0 if is_scene else 2.0)) - ts))
        dur = min(max(dur, 2.0), 8.0) if is_scene else min(max(dur, 0.8), 4.0)
        cue = {k: v for k, v in c.items() if k not in ("anchor_word_id", "source_time", "duration", "beats")}
        cue.update({"timeline_start": round(ts, 3), "timeline_end": round(min(ts + dur, total), 3)})
        if is_scene:
            cue.setdefault("layout", "overlay")
            cue.setdefault("props", {})
            # beats: in-scene actions locked to spoken words -> seconds relative to the cue start
            beats = []
            for b in c.get("beats") or []:
                bt = anchor_time(b, "cue %d beat %r" % (n, b.get("action")))
                if bt is not None:
                    beats.append({"action": b.get("action", ""), "t": round(max(0.0, bt - ts), 3),
                                  **{k: v for k, v in b.items() if k not in ("action", "anchor_word_id", "source_time")}})
            cue["beats"] = beats
        else:  # legacy primitive / badge cue
            cue.setdefault("type", "badge_2d")
            cue.setdefault("position", "top_right")
            cue.setdefault("label", "")
        cues.append(cue)
    cues.sort(key=lambda c: c["timeline_start"])
    for k in range(1, len(cues)):
        if cues[k]["timeline_start"] < cues[k - 1]["timeline_end"]:
            warn("cues at %.2fs and %.2fs overlap; trimmed the first" %
                 (cues[k - 1]["timeline_start"], cues[k]["timeline_start"]))
            cues[k - 1]["timeline_end"] = round(max(cues[k - 1]["timeline_start"] + 0.5,
                                                    cues[k]["timeline_start"] - 0.05), 3)

    vo = []
    for n, c in enumerate(draft.get("vo_cues") or []):
        ts = anchor_time(c, "vo_cue %d" % n)
        if ts is not None:
            vo.append({"timeline_start": round(ts, 3), "text": c.get("text", ""), "voice_id": c.get("voice_id")})

    def word_span_tl(r, label):
        a_ = src_to_tl.get(int(r.get("from_word_id", -1)))
        bw = int(r.get("to_word_id", -1))
        b_ = None
        for x in tl_words:
            if x["src_id"] == bw:
                b_ = x["timeline_end"]
        if a_ is None or b_ is None or b_ <= a_:
            warn("%s %r has words that were cut; ignored" % (label, r))
            return None
        return [round(a_, 3), round(b_, 3)]

    holds_tl = [h for h in (word_span_tl(r, "hold") for r in draft.get("holds") or []) if h]
    drops_tl = [h for h in (word_span_tl(r, "music_drop") for r in draft.get("music_drops") or []) if h]
    for a_, b_ in holds_tl:
        if b_ - a_ < 2.5:
            warn("hold %.2f-%.2fs is only %.1fs; a hold needs ~3-6s to land" % (a_, b_, b_ - a_))
        for c in cues:
            if c.get("layout") != "tracked" and c["timeline_start"] < b_ and c["timeline_end"] > a_:  # tracked = part of the footage
                warn("cue %r overlaps the hold at %.2fs; holds are graphics-free" % (c.get("scene") or c.get("type"), a_))
    assign_framing(keep, cues, cfg, fps)
    audit = cut_audit(keep, fps, by_i)

    # rhythm: a metronome (every change ~equally spaced) reads as machine-made, even when fast
    events = sorted({0.0} | {c["timeline"] for c in audit} | {c["timeline_start"] for c in cues} |
                    {c["timeline_end"] for c in cues} | {h[0] for h in holds_tl})
    gaps = [y - x for x, y in zip(events, events[1:]) if y - x > 0.3]
    if len(gaps) >= 6:
        mean = sum(gaps) / len(gaps)
        cv = (sum((g - mean) ** 2 for g in gaps) / len(gaps)) ** 0.5 / mean
        if cv < 0.35:
            warn("rhythm is metronomic (visual changes every ~%.1fs, variation %.2f): cluster fast changes, "
                 "then hold — fast-fast-fast-HOLD" % (mean, cv))
    stop = {"and", "the", "a", "an", "of", "to", "is", "it", "that", "this", "so", "because", "but", "or",
            "for", "in", "on", "with", "i", "you", "my", "me"}
    weak = [w["word"] for w in tl_words if w["highlight"] and norm(w["word"]) in stop]
    if weak:
        warn("highlighted filler words %s — highlight anchor nouns, numbers and contrast verbs only" % weak)

    # ---- static-stretch check ----------------------------------------------------------
    changes = {0.0, total}
    for k in range(1, len(keep)):
        p, s = keep[k - 1], keep[k]
        if s["zoom"] != p["zoom"] or abs(s["source_start"] - p["source_end"]) > 1.0 / fps:
            changes.add(s["timeline_start"])
    for c in cues:
        changes.add(c["timeline_start"])
        changes.add(c["timeline_end"])
    for a_, b_ in holds_tl:  # a hold is a deliberate stop, not a forgotten static stretch
        changes |= {a_, b_}
    pts = sorted(changes)
    for x, y in zip(pts, pts[1:]):
        if y - x > cfg["static"]:
            warn("static stretch %.2f-%.2fs (%.1fs) with no cut/zoom/cue — add a cue or remove_word to cut" %
                 (x, y, y - x))

    used_src = sum(s["source_end"] - s["source_start"] for s in keep)
    raw = src_dur if src_dur < 1e9 else tr.get("duration", used_src)
    if raw and total / raw < 0.4:
        warn("final duration is only %.0f%% of raw — double-check remove_ranges / silence threshold" %
             (100 * total / raw))
    minutes = max(total / 60.0, 1e-6)
    cpm = len(audit) / minutes
    if total >= 20 and cpm > cfg["max_cpm"] * 1.25:
        warn("%.1f jump cuts/min (style cap %d) — the edit will feel choppy; raise min_removed or drop remove_ranges"
             % (cpm, cfg["max_cpm"]))
    for s in keep:
        del s["_word_ids"]
        del s["_joint"]
    with open(os.path.join(d, "cut_audit.json"), "w") as f:
        json.dump({"style": style, "cuts_per_min": round(cpm, 2), "cuts": audit}, f, indent=1)

    edl = {
        "target_aspect": aspect, "width": width, "height": height, "fps": fps,
        "total_duration": total,
        "speaker_center_x_ratio": float(draft.get("speaker_center_x_ratio", 0.5)),
        "speaker_face_y_ratio": float(draft.get("speaker_face_y_ratio", 0.35)),
        "style": style,
        "room_tone_candidates": pick_room_tone(sil.get("silences", []), words, src_dur),  # tightened edges
        "music_prompt": draft.get("music_prompt"),
        "brand": draft.get("brand") or setup.get("brand") or {},
        "holds": holds_tl,
        "music_drops": drops_tl,
        "keep_segments": keep,
        "words": tl_words,
        "three_d_cues": cues,
        "vo_cues": vo,
    }
    with open(os.path.join(d, "master_edl.json"), "w") as f:
        json.dump(edl, f, indent=1)

    report = {
        "raw_duration": round(raw, 2), "final_duration": round(total, 2),
        "removed_seconds": round(raw - total, 2), "shots": len(keep),
        "jump_cuts": len(audit), "cuts_per_min": round(cpm, 2),
        "zoomed_shots": sum(1 for s in keep if s["zoom"] > 1.0),
        "fillers_removed": len(fillers), "words_on_screen": len(tl_words), "cues": len(cues),
        "vo_cues": len(vo), "hook_used": bool(hook_ids), "warnings": warnings,
    }
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
