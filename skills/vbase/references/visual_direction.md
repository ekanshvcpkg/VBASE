# Visual direction: look edited by a person, not generated

`editing_sense.md` decides *what* to show and *when*. This file decides *how it looks*. The bar
is a high-end product film or a top creator edit: someone who charges a fortune and whose work
never reads as "an AI made this". Read it before building or tuning any scene.

## The tells, and what to do instead

| AI tell | Professional practice |
|---|---|
| A generic dark "glass" window floating in space | A **faithful replica of the real product** in its own palette and type: Claude's warm ivory with serif replies, GitHub's dark Primer, the user's real app. Fidelity is what reads as real. |
| A tilted 3D card that never stops wobbling or drifting | **Flat UI, locked camera, decisive moves.** Hold still, then one smooth push (`EASE.inOut`, 0.7–0.9 s) onto exactly what's being talked about, then hold again. |
| Elements that animate themselves | **A cursor performs the action**: it travels on a slight arc, clicks, drags a file in. Software is shown being *used*. |
| Soft fade-and-scale entrances | **Hard cuts** for full-screen B-roll. **Mask wipes** for panels. Transitions are cuts, not dissolves. |
| The speaker slides aside, leaving an empty dark void | An **opaque editorial panel** that wipes in and covers exactly the vacated space (broadcast style). |
| Emoji icons, ✓/✕ bubbles, stickers, "built in 1 day" badges | **Type-led design**: a real typeface pairing, thin rules, numbered steps, a highlighter sweep, check marks that draw themselves. |
| Neon accents, glow halos, rings, particles | One restrained accent (clay `#C96442` by default, or the brand's colour). Light comes from the scene, not from glows. |
| A 3D object that looks pasted on | **Lit like the footage** (key light from the window side), with a contact shadow where it touches, motion stretch when it moves fast, and materials that aren't glossy plastic. |
| Bold yellow and green "shorts" captions on a 16:9 film | **Refined subtitles**: a real typeface, sentence case, words brighten as spoken, a thin underline on key words. Bold captions only for `fast` vertical shorts. |
| System fonts | **Loaded fonts** (`lib/fonts.ts`): Inter for UI, Source Serif 4 for editorial headlines and assistant replies, JetBrains Mono for code. |
| Pure black or pure white surfaces | Charcoal `#0D0E11` and paper `#F4F1EA`. Panels carry a faint film grain. |

## Building blocks (use these, don't re-invent them)

- **`scenes/Screen.tsx`**
  - `Screen` is a flat UI frame with a focus camera (`cam: [{t, x, y, s}]`), clamped so it
    never shows past the canvas. It has a real lens shadow.
  - `Cursor` takes path keys with `click`. `cursorAt()` is there so dragged items ride the
    cursor exactly.
- **Product replicas**
  - `ui/Chat.tsx`: a Claude-style assistant (file drop, prompt, send, streamed serif reply, result card).
  - `ui/Repo.tsx`: a GitHub repo page (star click). Copy their structure for any new product
    (Notion, Figma, an Android app, a dashboard).
  - Lay the UI out on a 1600×1000 canvas at real product sizes, and let the camera do the zooming.
- **Editorial panels:** `ui/Compare.tsx` (paper palette). Use `layout: "split"`.
- **Palettes:** `PAPER` and `INK` in `lib/theme.ts`. Replicas use the product's own colours.

## Camera grammar for screen scenes

1. **Open already framed.** Never open on an empty wide shot. Open at about 1.3× on the area
   where the action starts.
2. **One move per action.** Push in on the file drop, then the send button, then the reply,
   then the result. Each move is 0.7–0.9 s on `EASE.inOut`, and each lands *before* its spoken word.
3. **Hold between moves.** Holding is what makes the moves feel intentional.
4. **Keep it readable.** Take scale up to 1.4–1.8× on the region that matters, so UI text lands
   at about 24 px or more on a 1080p frame.

## Layout choices

- **Full-screen proof** (a product doing the thing): `broll`. The hard cut in and out is
  automatic, and the footage stays behind it as soft warm blur.
- **Argument / comparison / list:** `split`, an opaque paper panel; the speaker is reframed
  beside it.
- **In-hand object:** `tracked` (see `held_object` in the catalog).
- **Small payoff:** `overlay`, at the frame's edge, never on the face.

## Final check (use the stills contact sheet)

Hide the labels and ask: *would a viewer guess an AI made this frame?* If any element passes for
template output (a floating dark card, an emoji, a glow, a wobble, a default font), fix it
before rendering.
