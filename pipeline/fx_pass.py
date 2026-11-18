"""In-footage FX pass (runs on base_cut.mp4, before Remotion graphics).

1. Zoom punch: real punch-in on "zoom in", punch-out on "zoom out", centred on the face.
2. Clone spawn: a segmented copy of the speaker materialises behind him ("spawn a man
   behind me"). The live speaker mask is composited on top every frame, so the clone
   sits *behind* him, not pasted over.

Times are read from master_edl.json words, so a re-finalize keeps the FX on the right words.
Both effects are opt-in and tied to what the speaker says:
  zoom  : runs when the transcript has the --zoom-word twice ("zoom in ... zoom out"); otherwise skipped.
  clone : runs only with --clone-at <source seconds of a calm, full-body frame> and --clone-word <trigger word>.
With neither, the cut is passed through unchanged (base_cut_fx.mp4 == base_cut).
Usage: python fx_pass.py --dir EDIT_DIR --source SRC.mov [--zoom-word zoom] [--clone-at 24.0 --clone-word spawn]
"""
import argparse, json, os, subprocess
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

MODEL = os.path.expanduser("~/.vidbase/models/selfie_multiclass.tflite")


def segmenter():
    opts = vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=MODEL),
                                        output_confidence_masks=True)
    return vision.ImageSegmenter.create_from_options(opts)


def person_mask(seg, bgr):
    """float32 0..1 mask of the person (everything but category 0 = background)."""
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    res = seg.segment(img)
    bg = np.squeeze(res.confidence_masks[0].numpy_view())
    m = np.clip(1.0 - bg, 0, 1).astype(np.float32)
    m = cv2.GaussianBlur(m, (0, 0), 1.5)
    return m


def face_center(seg, bgr):
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    face = np.squeeze(seg.segment(img).confidence_masks[3].numpy_view())
    ys, xs = np.where(face > 0.5)
    if len(xs) < 50:
        return bgr.shape[1] * 0.5, bgr.shape[0] * 0.35
    return float(np.median(xs)), float(np.median(ys))


def ease_out_expo(x):
    x = min(max(x, 0.0), 1.0)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def ease_in_out(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def find_word(words, text, after=0.0, required=False):
    for w in words:
        if w["word"].lower().strip(".,!?") == text and w["timeline_start"] >= after:
            return w
    if required:
        raise SystemExit("word %r not found after %.2f" % (text, after))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--clone-at", type=float, default=None, help="source time of the frame the clone is cut from")
    ap.add_argument("--clone-word", default=None, help="the clone spawns on this word")
    ap.add_argument("--zoom-word", default="zoom", help="zoom in on its first use, out on its second ('' disables)")
    ap.add_argument("--zoom", type=float, default=1.38)
    a = ap.parse_args()

    edl = json.load(open(os.path.join(a.dir, "master_edl.json")))
    words = edl["words"]
    W, H, fps = edl["width"], edl["height"], edl["fps"]

    # --- timing from the words -------------------------------------------------
    INF = float("inf")
    zoom_in_t = zoom_out_t = zoom_end_t = INF
    z_in = find_word(words, a.zoom_word.lower()) if a.zoom_word else None
    z_out = find_word(words, a.zoom_word.lower(), after=z_in["timeline_start"] + 0.1) if z_in else None
    if z_in and z_out:
        zoom_in_t, zoom_out_t = z_in["timeline_start"] + 0.06, z_out["timeline_start"] + 0.06
        zoom_end_t = zoom_out_t + 0.9
    clone_t0 = clone_t1 = INF
    sw = find_word(words, a.clone_word.lower()) if (a.clone_word and a.clone_at is not None) else None
    if sw:
        clone_t0 = sw["timeline_start"] + 0.05
        # the clone stays until the first jump cut at least 3 s after it appears
        clone_t1 = min((s_["timeline_end"] for s_ in edl["keep_segments"] if s_["timeline_end"] > clone_t0 + 3.0), default=edl["total_duration"])
    print("zoom %s | clone %s" % ("%.2f-%.2f" % (zoom_in_t, zoom_out_t) if z_out else "off", "%.2f-%.2f" % (clone_t0, clone_t1) if sw else "off"))
    if not (z_out or sw):
        import shutil
        src = os.path.join(a.dir, "base_cut_nofx.mp4")
        shutil.copy(src if os.path.exists(src) else os.path.join(a.dir, "base_cut.mp4"), os.path.join(a.dir, "base_cut_fx.mp4"))
        print("no in-footage FX for this video; passed through"); return

    seg = segmenter()

    # --- build the clone cutout from the source -------------------------------
    clone = cmask = noise = None; ch = cw = cx = cy = 0
    if sw:
      cap = cv2.VideoCapture(a.source)
      cap.set(cv2.CAP_PROP_POS_MSEC, a.clone_at * 1000)
      ok, src = cap.read()
      cap.release()
      assert ok, "could not read clone frame"
      cm = person_mask(seg, src)
      ys, xs = np.where(cm > 0.5)
      x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
      clone = src[y0:y1, x0:x1].astype(np.float32)
      cmask = cm[y0:y1, x0:x1]
      clone = cv2.flip(clone, 1); cmask = cv2.flip(cmask, 1)          # mirrored: faces back toward the speaker
      # sits deeper in the room: smaller, a touch darker, cooler, softer focus
      scale = (H * 0.80) / clone.shape[0]
      clone = cv2.resize(clone, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
      cmask = cv2.resize(cmask, (clone.shape[1], clone.shape[0]), interpolation=cv2.INTER_AREA)
      clone = cv2.GaussianBlur(clone, (0, 0), 0.9)
      clone *= np.array([1.02, 0.95, 0.9], np.float32) * 0.95       # BGR: a touch cooler, near the room's exposure
      gray = clone.mean(axis=2, keepdims=True)
      clone = gray + (clone - gray) * 0.8
      ch, cw = cmask.shape
      fade = np.ones(ch, np.float32); k = int(ch * 0.18)
      fade[-k:] = np.linspace(1, 0, k) ** 1.5                        # feather the cropped bottom edge
      cmask *= fade[:, None]
      cx = int(W * 0.79 - cw / 2)
      cy = H - ch + int(H * 0.04)                                     # anchored below frame bottom
      rng = np.random.default_rng(7)
      noise = cv2.resize(rng.random((ch // 8 + 1, cw // 8 + 1)).astype(np.float32), (cw, ch))

    # --- stream frames ---------------------------------------------------------
    # always start from the clean cut, so re-running never stacks FX on FX
    inp = os.path.join(a.dir, "base_cut_nofx.mp4")
    if not os.path.exists(inp):
        inp = os.path.join(a.dir, "base_cut.mp4")
    out = os.path.join(a.dir, "base_cut_fx.mp4")
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", inp, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                            "-s", "%dx%d" % (W, H), "-r", str(fps), "-i", "-", "-i", inp,
                            "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast", "-crf", "17",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out],
                           stdin=subprocess.PIPE)
    fsz = W * H * 3
    n = 0
    fc = None
    while True:
        buf = dec.stdout.read(fsz)
        if len(buf) < fsz:
            break
        t = n / fps
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()

        # 2) clone behind the speaker
        if clone_t0 <= t < clone_t1:
            p = (t - clone_t0) / 0.55                     # materialise over 0.55 s
            tt = t - clone_t0
            # idle life: breathing (chest rises, slight vertical stretch) and a slow weight-shift sway
            breath = 1 + 0.007 * np.sin(tt * 2.4)
            sway = np.sin(tt * 0.9) * 4.0
            cl_s = cv2.resize(clone, (cw, int(ch * breath)), interpolation=cv2.INTER_LINEAR)
            cm_s = cv2.resize(cmask, (cw, int(ch * breath)), interpolation=cv2.INTER_LINEAR)
            nz_s = cv2.resize(noise, (cw, int(ch * breath)), interpolation=cv2.INTER_LINEAR)
            dissolve = np.clip((ease_in_out(p) * 1.25 - nz_s) * 6, 0, 1)
            yy = int(cy - (cl_s.shape[0] - ch) + (1 - ease_out_expo(p)) * 40)
            xx = int(cx + sway)
            # full-frame clone layer + alpha (clipped to the frame)
            layer = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
            y0c, x0c = max(yy, 0), max(xx, 0)
            y1c, x1c = min(yy + cl_s.shape[0], H), min(xx + cw, W)
            sy, sx = y0c - yy, x0c - xx
            layer[y0c:y1c, x0c:x1c] = cl_s[sy:sy + (y1c - y0c), sx:sx + (x1c - x0c)]
            alpha[y0c:y1c, x0c:x1c] = (cm_s * dissolve)[sy:sy + (y1c - y0c), sx:sx + (x1c - x0c)]
            frame_f = frame.astype(np.float32)
            live = person_mask(seg, frame)
            # cast shadow on the wall: key light is the window on screen-left, so it falls right
            shadow = np.roll(np.roll(alpha, int(W * 0.035), axis=1), int(H * 0.015), axis=0)
            shadow = cv2.GaussianBlur(shadow, (0, 0), 28) * (1 - alpha) * 0.38
            frame_f *= (1 - shadow)[..., None]
            # light wrap: background light bleeds over the clone's edges, so it sits in the room
            bg_blur = cv2.GaussianBlur(frame_f, (0, 0), 18)
            edge = np.clip(alpha * (1 - alpha) * 4, 0, 1)[..., None]
            layer = layer * (1 - edge * 0.45) + bg_blur * edge * 0.45
            # materialising edge glow (only during spawn)
            if p < 1:
                glow = np.zeros((H, W), np.float32)
                g = np.clip(1 - np.abs(ease_in_out(p) * 1.25 - nz_s) * 10, 0, 1) * cm_s
                glow[y0c:y1c, x0c:x1c] = g[sy:sy + (y1c - y0c), sx:sx + (x1c - x0c)]
                layer += glow[..., None] * np.array([66, 100, 201], np.float32) * 0.9   # accent #C96442 in BGR
                alpha = np.maximum(alpha, glow * 0.8)
            al = alpha[..., None]
            comp = frame_f * (1 - al) + layer * al
            # put the live speaker back on top
            lm = live[..., None]
            frame = np.clip(comp * (1 - lm) + frame.astype(np.float32) * lm, 0, 255).astype(np.uint8)

        # 1) zoom punch (applied last so the clone zooms with the room)
        if zoom_in_t <= t < zoom_end_t:
            if fc is None:
                fc = face_center(seg, frame)
            def spring(x, k, c):
                """closed-form damped spring 0 -> 1 (mass 1): a camera operator's move, not a snap"""
                if x <= 0: return 0.0
                w0 = np.sqrt(k); z = c / (2 * w0)
                if z < 1:
                    wd = w0 * np.sqrt(1 - z * z)
                    return 1 - np.exp(-z * w0 * x) * (np.cos(wd * x) + z * w0 / wd * np.sin(wd * x))
                return 1 - np.exp(-w0 * x) * (1 + w0 * x)

            def zoom_at(tz):
                # push in on "zoom in" with a ~5 % settle, creep while held, then ease back out on "zoom out"
                zin = 1 + (a.zoom - 1) * spring(tz - zoom_in_t, 140, 16) + 0.015 * max(0, tz - zoom_in_t)
                if tz < zoom_out_t:
                    return zin
                zpk = 1 + (a.zoom - 1) * spring(zoom_out_t - zoom_in_t, 140, 16) + 0.015 * (zoom_out_t - zoom_in_t)
                return max(1.0, zpk + (1 - zpk) * spring(tz - zoom_out_t, 90, 19))   # critically damped: never below 1

            def warp(src, z):
                cw2, ch2 = W / z, H / z
                x0z = min(max(fc[0] - cw2 / 2, 0), W - cw2)
                y0z = min(max(fc[1] - ch2 * 0.42, 0), H - ch2)
                dx, dy = 3 * np.sin(t * 5.3) * (z - 1), 2 * np.sin(t * 7.1 + 1) * (z - 1)   # a hand on the camera
                M = np.float32([[z, 0, -x0z * z + dx], [0, z, -y0z * z + dy]])
                return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

            frame = warp(frame, zoom_at(t))   # a clean snap: averaging zoom levels ghosted the face

        enc.stdin.write(frame.tobytes())
        n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
    print("frames", n, "->", out)


if __name__ == "__main__":
    main()
