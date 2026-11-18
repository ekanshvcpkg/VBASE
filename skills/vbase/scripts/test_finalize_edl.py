#!/usr/bin/env python3
"""Checks for the natural-cut engine in finalize_edl.py, on a synthetic transcript.

Run: python3 scripts/test_finalize_edl.py      (no video, ffmpeg or network needed)
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import finalize_edl as fe  # noqa: E402


def words_from(spec):
    """spec: list of (word, duration, gap_after)."""
    out, t = [], 0.5
    for i, (w, d, g) in enumerate(spec):
        out.append({"i": i, "word": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d + g
    return out, t


def run(words, dur, draft=None, silences=None):
    d = tempfile.mkdtemp()
    json.dump({"words": words, "duration": dur}, open(os.path.join(d, "transcript.json"), "w"))
    json.dump({"format": {"duration": dur}}, open(os.path.join(d, "metadata.json"), "w"))
    json.dump({"silences": silences or []}, open(os.path.join(d, "silences.json"), "w"))
    json.dump(dict({"style": "natural", "fps": 30}, **(draft or {})), open(os.path.join(d, "edl_draft.json"), "w"))
    r = subprocess.run([sys.executable, os.path.join(HERE, "finalize_edl.py"), "--dir", d],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    edl = json.load(open(os.path.join(d, "master_edl.json")))
    audit = json.load(open(os.path.join(d, "cut_audit.json")))
    return edl, audit, json.loads(r.stdout)


def kept_pause_between(edl, a_id, b_id):
    by = {w["src_id"]: w for w in edl["words"]}
    return by[b_id]["timeline_start"] - by[a_id]["timeline_end"]


def test_target_pause_contract():
    cfg = fe.STYLE["natural"]
    w = lambda s: {"word": s, "start": 0, "end": 0.3}
    for prev, gap in [("done.", 1.5), ("so,", 1.0), ("the", 0.9), ("done.", 0.2), ("the", 0.05)]:
        k = fe.target_pause(w(prev), w("next"), gap, cfg)
        assert 0.0 <= k <= gap + 1e-9, (prev, gap, k)
    long_sentence = fe.target_pause(w("done."), w("Next"), 2.0, cfg)
    long_phrase = fe.target_pause(w("the"), w("thing"), 2.0, cfg)
    assert long_sentence > long_phrase, "a sentence end should keep a longer pause than mid-phrase"
    assert long_sentence >= 0.25, "sentence ends need breathing room (>= 0.25 s)"


def test_small_pauses_are_not_cut():
    # every pause is 0.30 s: removing it would save < min_removed, so there must be zero cuts
    spec = [(w, 0.3, 0.30) for w in "this is a natural sentence with small pauses everywhere okay".split()]
    words, end = words_from(spec)
    edl, audit, rep = run(words, end + 0.5)
    assert rep["jump_cuts"] == 0, audit


def test_dead_air_is_compressed_not_deleted():
    spec = [("I", .2, .1), ("built", .3, .1), ("a", .1, .1), ("skill.", .4, 1.6),   # 1.6 s after a sentence
            ("Then", .3, .1), ("I", .1, .1), ("shipped", .4, .1), ("it", .2, .1), ("to", .1, .1),
            ("everyone", .5, .1), ("today.", .4, .5)]
    words, end = words_from(spec)
    edl, audit, rep = run(words, end)
    assert rep["jump_cuts"] == 1, audit
    kept = kept_pause_between(edl, 3, 4)
    assert 0.25 <= kept <= 0.8, "kept %.2fs after the sentence" % kept
    assert audit["cuts"][0]["class"] == "sentence"


def test_short_shots_merge_and_density_cap():
    # 40 short phrases each followed by a 0.7 s pause: a naive editor makes ~40 cuts in ~50 s
    spec = []
    for n in range(40):
        spec += [("word%d" % n, .3, .05), ("more%d" % n, .3, .7)]
    words, end = words_from(spec)
    edl, audit, rep = run(words, end)
    durs = [s["timeline_end"] - s["timeline_start"] for s in edl["keep_segments"]]
    assert min(durs) >= fe.STYLE["natural"]["min_shot"] - 0.05, durs
    minutes = edl["total_duration"] / 60
    assert rep["jump_cuts"] <= fe.STYLE["natural"]["max_cpm"] * minutes + 1, rep


def test_fillers_and_room_tone_and_framing():
    spec = [("So", .2, .1), ("um", .3, .1), ("this", .3, .1), ("works.", .4, 1.4), ("Really", .3, .1),
            ("well", .3, .1), ("for", .2, .1), ("us", .2, .1), ("all.", .3, .5)]
    words, end = words_from(spec)
    sil = [{"start": 2.05, "end": 3.35}]  # the real gap after "works."
    edl, audit, rep = run(words, end, silences=sil)
    assert all(w["word"] != "um" for w in edl["words"])
    rt = edl["room_tone_candidates"]
    assert rt and all(abs((c["source_end"] - c["source_start"]) - 0.5) < 1e-6 for c in rt)
    zooms = [s["zoom"] for s in edl["keep_segments"]]
    jumps = len(audit["cuts"])
    changes = sum(1 for a, b in zip(zooms, zooms[1:]) if a != b)
    assert changes <= jumps, "framing may only change at a jump cut"


def test_room_tone_never_contains_words():
    # regression: silencedetect called quiet speech ("amount of") silence, and that half
    # second got looped under the whole video. Candidates must stay clear of every word.
    words = [{"i": 0, "word": "enough", "start": 9.9, "end": 10.3}, {"i": 1, "word": "amount", "start": 10.34, "end": 10.6},
             {"i": 2, "word": "of", "start": 10.6, "end": 10.8}, {"i": 3, "word": "skills", "start": 10.8, "end": 11.0},
             {"i": 4, "word": "done.", "start": 14.0, "end": 14.4}]
    sil = [{"start": 10.08, "end": 11.05}, {"start": 11.4, "end": 13.6}]
    cands = fe.pick_room_tone(sil, words, 20.0)
    assert cands, "the clean 11.4-13.6 silence should give a candidate"
    for c in cands:
        for w in words:
            assert c["source_end"] <= w["start"] - 0.15 + 1e-6 or c["source_start"] >= w["end"] + 0.15 - 1e-6, (c, w)


def _sentence_spec():
    return [("We", .2, .1), ("tried", .3, .1), ("everything.", .5, 1.5),          # 1.5 s pause
            ("Nothing", .4, .1), ("worked.", .5, 1.4),                            # 1.4 s pause
            ("Then", .3, .1), ("one", .2, .1), ("thing", .3, .1), ("changed.", .5, .5)]


def test_emphasis_keeps_the_breath():
    words, end = words_from(_sentence_spec())
    plain, _, _ = run(words, end)
    emph, _, _ = run(words, end, draft={"emphasis_word_ids": [5]})
    assert kept_pause_between(emph, 4, 5) >= 0.65 - 0.04
    assert kept_pause_between(emph, 4, 5) > kept_pause_between(plain, 4, 5)


def test_question_pause_lingers():
    spec = [("Why", .3, .1), ("does", .2, .1), ("nobody", .4, .1), ("do", .2, .1), ("this?", .4, 1.6),
            ("Because", .4, .1), ("it", .1, .1), ("is", .1, .1), ("hard.", .4, .5)]
    words, end = words_from(spec)
    edl, _, _ = run(words, end)
    assert kept_pause_between(edl, 4, 5) >= 0.8 - 0.04


def test_hold_has_no_cuts_and_is_reported():
    words, end = words_from(_sentence_spec())
    edl, audit, rep = run(words, end, draft={"holds": [{"from_word_id": 2, "to_word_id": 6}]})
    a, b = edl["holds"][0]
    assert all(not (a < c["timeline"] < b) for c in audit["cuts"]), audit["cuts"]
    assert kept_pause_between(edl, 2, 3) > 1.3  # the 1.5 s pause inside the hold survives


def test_music_drop_and_cue_offset_and_warnings():
    words, end = words_from(_sentence_spec())
    draft = {"music_drops": [{"from_word_id": 5, "to_word_id": 8}], "highlight_word_ids": [5],
             "cues": [{"anchor_word_id": 3, "scene": "stat", "duration": 2.0, "props": {}}]}
    edl, _, rep = run(words, end, draft=draft)
    assert edl["music_drops"] and edl["music_drops"][0][1] > edl["music_drops"][0][0]
    by = {w["src_id"]: w for w in edl["words"]}
    assert abs(edl["three_d_cues"][0]["timeline_start"] - (by[3]["timeline_start"] + 2 / 30)) < 0.01
    words2, end2 = words_from([("the", .2, .1), ("thing", .3, .5)] * 3)
    _, _, rep2 = run(words2, end2, draft={"highlight_word_ids": [0]})
    assert any("filler" in w for w in rep2["warnings"]), rep2["warnings"]


if __name__ == "__main__":
    fails = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print("PASS", name)
            except NotImplementedError:
                fails += 1; print("TODO", name, "- target_pause() not implemented yet")
            except AssertionError as e:
                fails += 1; print("FAIL", name, "-", e)
    sys.exit(1 if fails else 0)
