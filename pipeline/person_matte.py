"""Person matte + face-aware placement, so pop-up elements live BEHIND the speaker and never on their face.

  1. For the time windows of "behind" cues (glass_card, glass_chips, mascot3d by default), segment the
     speaker in every frame of base_cut.mp4 and write remotion_app/public/person.webm: the speaker cut out
     with alpha (VP9), fully transparent elsewhere. MainComposite draws: footage -> behind cues -> person.
  2. Track the face over each cue's window and move the element to the side with more free room
     (props.pos), unless the director pinned it (props.pos_locked).

Usage: python person_matte.py --dir EDIT_DIR          (run after the in-footage FX pass, before Remotion)
"""
import argparse, json, os, subprocess
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

MODEL = os.path.expanduser("~/.vidbase/models/selfie_multiclass.tflite")
RVM = os.path.expanduser("~/.vidbase/models/rvm_mobilenetv3_fp32.torchscript")   # Robust Video Matting: fine edges, fingers, hair
BEHIND = {"glass_card", "glass_chips", "mascot3d"}


def guided(I, p, r=10, eps=2e-3):
    """He et al. guided filter: snaps the coarse model mask (256 px) to the real edges of the frame (fingers, hair)."""
    k = (2 * r + 1, 2 * r + 1); f = lambda x: cv2.boxFilter(x, -1, k)
    mI, mp_ = f(I), f(p); a = (f(I * p) - mI * mp_) / (f(I * I) - mI * mI + eps); b = mp_ - a * mI
    return f(a) * I + f(b)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dir", required=True); a = ap.parse_args()
    mp_path = os.path.join(a.dir, "master_edl.json"); m = json.load(open(mp_path))
    cues = [c for c in m.get("three_d_cues", []) if (c.get("scene") in BEHIND or c.get("layout") == "backdrop") and c.get("props", {}).get("behind", True)]
    m["person_matte"] = bool(cues)
    if not cues:
        json.dump(m, open(mp_path, "w"), indent=1); print("no behind cues"); return
    W, H, fps = m["width"], m["height"], m["fps"]
    pad = 0.25
    wins = [(c["timeline_start"] - pad, c["timeline_end"] + pad) for c in cues]
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=MODEL), output_confidence_masks=True))
    src = os.path.join(a.dir, "base_cut.mp4")
    out = os.path.join(a.dir, "remotion_app", "public", "person.webm"); os.makedirs(os.path.dirname(out), exist_ok=True)
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "12M", "-deadline", "realtime", "-cpu-used", "8",
                            "-row-mt", "1", "-auto-alt-ref", "0", out], stdin=subprocess.PIPE)
    faces = {i: [] for i in range(len(cues))}
    occ = {i: [] for i in range(len(cues))}          # per frame: which columns of the head band the person fills
    B0, B1 = int(H * 0.06), int(H * 0.44)          # the band the elements live in: head height, above the shoulders
    blank = np.zeros((H, W, 4), np.uint8); n = 0; sz = W * H * 3
    rvm = None; prev_in = False
    if os.path.exists(RVM):
        import torch
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        rvm = torch.jit.load(RVM, map_location=dev).eval(); rec = [None] * 4; prev_in = False
        print("matting: Robust Video Matting on", dev)
    while True:
        buf = dec.stdout.read(sz)
        if len(buf) < sz: break
        t = n / fps; n += 1
        if not any(a0 <= t <= a1 for a0, a1 in wins):
            enc.stdin.write(blank.tobytes()); prev_in = False; continue
        rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        res = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        cm = [np.squeeze(m_.numpy_view()) for m_ in res.confidence_masks]
        if rvm is not None:
            if not prev_in: rec = [None] * 4                                  # a new window: fresh recurrent state
            with torch.no_grad():
                x = torch.from_numpy(rgb.copy()).to(dev).permute(2, 0, 1).unsqueeze(0).float() / 255
                fgr, pha, *rec = rvm(x, *rec, downsample_ratio=0.25)
            person = pha[0, 0].cpu().numpy()
            person = np.clip((person - 0.08) / 0.84, 0, 1)                      # solid inside, clean outside, soft hair kept
        else:
            person = np.clip(np.maximum(1.0 - cm[0], np.max(np.stack(cm[1:]), axis=0)), 0, 1)   # not-background OR any person class
            gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
            small = cv2.resize(gray, (W // 2, H // 2)); ps = cv2.resize(person.astype(np.float32), (W // 2, H // 2))
            person = cv2.resize(np.clip(guided(small, ps), 0, 1), (W, H))
            person = np.clip((person - 0.2) / 0.35, 0, 1)
            hard = (person > 0.5).astype(np.uint8)
            cs, _ = cv2.findContours(hard, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            solid = np.zeros_like(hard); cv2.drawContours(solid, [c_ for c_ in cs if cv2.contourArea(c_) > 2000], -1, 1, cv2.FILLED)
            person = cv2.GaussianBlur(np.maximum(person, solid.astype(np.float32)), (0, 0), 1.0)
        prev_in = True
        frame = np.dstack([rgb, (person * 255).astype(np.uint8)])
        enc.stdin.write(frame.tobytes())
        band = person[B0:B1].max(axis=0) > 0.5
        for i, c in enumerate(cues):
            if c["timeline_start"] <= t <= c["timeline_end"]: occ[i].append(band[::4])
        face = np.squeeze(res.confidence_masks[3].numpy_view())
        ys, xs = np.where(face > 0.5)
        if len(xs) > 200:
            for i, c in enumerate(cues):
                if c["timeline_start"] <= t <= c["timeline_end"]:
                    faces[i].append((xs.min() / W, xs.max() / W, ys.min() / H, ys.max() / H))
    enc.stdin.close(); enc.wait(); dec.wait()
    # fit each element into the free wall beside the speaker's head: a column counts as taken if the person
    # fills it in more than 10% of the cue's frames; the element takes the wider free side, at head height
    for i, c in enumerate(cues):
        p = c.setdefault("props", {})
        if p.get("pos_locked") or c.get("layout") == "backdrop" or not occ[i]: continue
        taken = (np.array(occ[i]).mean(axis=0) > 0.10)
        cols = np.where(taken)[0]
        if not len(cols): continue
        left_free = cols.min() * 4 / W; right_free = 1 - (cols.max() * 4 + 4) / W
        side = "left" if left_free >= right_free else "right"
        free = max(left_free, right_free); margin = 0.025
        width = max(0.2, free - 2 * margin)
        p["pos"] = side
        p["place"] = {"x": round((margin if side == "left" else 1 - margin - width) * W), "y": round(H * 0.09), "w": round(width * W)}
        if faces[i]: p["face"] = [round(float(v), 3) for v in np.median(np.array(faces[i]), axis=0)]
        print("%-11s %.2f-%.2fs free L %.2f R %.2f -> %s, %dpx wide" % (c["scene"], c["timeline_start"], c["timeline_end"], left_free, right_free, side, p["place"]["w"]))
    json.dump(m, open(mp_path, "w"), indent=1)
    print("person matte:", out)


if __name__ == "__main__":
    main()
