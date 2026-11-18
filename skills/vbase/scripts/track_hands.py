#!/usr/bin/env python3
"""Track the speaker's palms in base_cut.mp4 so a 3D object can sit in their hand
("I'm holding a ball", "this phone", "look at this") and be thrown from hand to hand.

Run AFTER the cut (positions are on the final timeline and include the crop/zoom), and
after finalize_edl.py (it writes into master_edl.json, which finalize regenerates).

For every scene cue with layout "tracked", it samples that cue's time span, detects hands
with MediaPipe HandLandmarker, labels them by screen side (image-left / image-right; this
avoids MediaPipe's mirrored handedness), fills short gaps, smooths, and stores
  cue.props.track = {"fps": f, "t0": 0, "left": [[x, y, size] | null, ...], "right": [...]}
with x, y normalised to the frame (palm centre) and size = wrist→middle-knuckle / height.

Usage: track_hands.py --dir $EDIT_DIR [--video base_cut.mp4] [--sample-fps 30]
Needs: pip install mediapipe opencv-python-headless  (model auto-downloaded to ~/.cache/vidbase)
"""
import argparse, json, os, sys, urllib.request

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/latest/hand_landmarker.task")
PALM = (0, 5, 9, 13, 17)  # wrist + knuckles: their mean is a stable palm centre


def model_path():
    p = os.path.expanduser("~/.cache/vidbase/hand_landmarker.task")
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, p)
    return p


def detect(video, t0, t1, sample_fps):
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    opts = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=model_path()),
                                        running_mode=vision.RunningMode.VIDEO, num_hands=2,
                                        min_hand_detection_confidence=0.4, min_tracking_confidence=0.4)
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(fps / sample_fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t0 * fps))
    frames, k = [], int(t0 * fps)
    with vision.HandLandmarker.create_from_options(opts) as lm:
        while k <= t1 * fps:
            ok, img = cap.read()
            if not ok:
                break
            if (k - int(t0 * fps)) % step == 0:
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(k * 1000 / fps))
                hands = []
                for pts in res.hand_landmarks or []:
                    cx = sum(pts[i].x for i in PALM) / len(PALM)
                    cy = sum(pts[i].y for i in PALM) / len(PALM)
                    h, w = img.shape[:2]
                    size = (((pts[0].x - pts[9].x) * w) ** 2 + ((pts[0].y - pts[9].y) * h) ** 2) ** 0.5 / h
                    hands.append((cx, cy, size))
                frames.append((k / fps - t0, hands))
            k += 1
    cap.release()
    return frames, fps / step


def by_side(frames):
    """Two hands → sort by x. One hand → whichever side it was nearest to last time."""
    left, right, last = [], [], {"left": (0.3, 0.5), "right": (0.7, 0.5)}
    for _, hands in frames:
        L = R = None
        if len(hands) >= 2:
            hs = sorted(hands, key=lambda h: h[0])
            L, R = hs[0], hs[-1]
        elif len(hands) == 1:
            h = hands[0]
            dl = (h[0] - last["left"][0]) ** 2 + (h[1] - last["left"][1]) ** 2
            dr = (h[0] - last["right"][0]) ** 2 + (h[1] - last["right"][1]) ** 2
            L, R = (h, None) if dl < dr else (None, h)
        if L:
            last["left"] = L[:2]
        if R:
            last["right"] = R[:2]
        left.append(L)
        right.append(R)
    return left, right


def fill_and_smooth(seq, max_gap, win=2):
    """Linear-fill gaps up to max_gap samples, then a centred moving average."""
    out = list(seq)
    idx = [i for i, v in enumerate(out) if v]
    for a, b in zip(idx, idx[1:]):
        if 1 < b - a <= max_gap + 1:
            for i in range(a + 1, b):
                f = (i - a) / (b - a)
                out[i] = tuple(out[a][j] + (out[b][j] - out[a][j]) * f for j in range(3))
    sm = []
    for i, v in enumerate(out):
        if not v:
            sm.append(None)
            continue
        near = [out[j] for j in range(max(0, i - win), min(len(out), i + win + 1)) if out[j]]
        sm.append([round(sum(p[j] for p in near) / len(near), 4) for j in range(3)])
    return sm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--video", default="base_cut.mp4")
    ap.add_argument("--sample-fps", type=float, default=30)
    a = ap.parse_args()
    edl_path = os.path.join(a.dir, "master_edl.json")
    edl = json.load(open(edl_path))
    video = os.path.join(a.dir, a.video)
    done = []
    for n, c in enumerate(edl.get("three_d_cues", [])):
        if c.get("layout") != "tracked" or c.get("scene") not in (None, "held_object"):   # cards/chips use full-frame layout but no hands
            continue
        frames, sfps = detect(video, c["timeline_start"], c["timeline_end"], a.sample_fps)
        left, right = by_side(frames)
        gap = int(sfps * 0.5)
        track = {"fps": round(sfps, 3), "left": fill_and_smooth(left, gap), "right": fill_and_smooth(right, gap)}
        c.setdefault("props", {})["track"] = track
        cov = {s: round(sum(1 for v in track[s] if v) / max(len(track[s]), 1), 2) for s in ("left", "right")}
        done.append({"cue": n, "samples": len(frames), "coverage": cov})
        if min(cov.values()) < 0.5:
            print("warning: cue %d hand coverage %s — check the hold/throw beats fall where a hand is visible" % (n, cov),
                  file=sys.stderr)
    json.dump(edl, open(edl_path, "w"), indent=1)
    print(json.dumps({"tracked": done}, indent=1))


if __name__ == "__main__":
    main()
