# Motion rules

These rules are condensed from how polished product films are built, in particular the
kept-video launch film workflow. Apply them when you write or tune a scene. The tokens they
refer to live in `assets/remotion_app/src/lib/motion.ts`.

1. **One hero element at a time.** Everything else sits at 40% opacity or less, or is blurred.
   Two moving things compete, and the viewer sees neither.
2. **The interface eases out; the camera eases in and out.**
   - UI enters with `EASE.enter` or `EASE.out` over 0.3–0.5 s.
   - The camera and device pose move with `EASE.inOut` across the whole cue.
3. **Every shot moves.** Use at least `drift()` and a 2–5% push. A frozen screenshot is the
   single biggest "AI template" signal.
4. **Stagger, don't dump.** Lists arrive at 40 + 65·i ms. Use `stagger()`.
5. **Show the action through its control.**
   - "I uploaded it" means the progress bar fills.
   - "Star it" means the Star button gets tapped.
   - "I asked Claude" means the prompt types out and is sent.
6. **A change of state is the transition.** Screens push (0.36 s) and cards lift out.
   Avoid cross-dissolves between unrelated pictures.
7. **Lock actions to words.** Use `beats` so the tap, tick or step lands on the spoken word.
8. **Holds.** Every punch holds for at least 0.5 s. A scene shorter than 2 s is noise, so drop it.
9. **Keep it sharp.** Size a scene with CSS `zoom`, which re-lays it out; never use a big
   `transform: scale` on text. Blur only for depth (behind B-roll) or very fast moves.
10. **Type.** At most 3 lines, about 28 characters per line, one accent word. Weight 700–850,
    tracking −0.02 to −0.04 em. Never wide-tracked uppercase.
11. **Vary consecutive scenes.** Two scenes in a row never share both a scale and an angle.
    `index` flips the side the camera tilts from.

12. **Earned motion.** About 80% of edits are invisible hard cuts, or no cut at all. Stylised
    moves (B-roll, split, big pushes) mark chapter shifts and payoffs, not every sentence.
13. **Serious beats don't bounce.** Use `EASE.out` (`0.16, 1, 0.3, 1`) for anything emotional or
    weighty. `EASE.outBack` overshoot is for small, playful payoffs only.
14. **Holds are sacred.** Inside a `hold` nothing moves except the slow creep on the face.

## Avoid
- generic shapes that carry no meaning (spinning cubes, orbs) with a keyword label
- neon glow, lens flares, particle storms
- slow fades
- lazy zooms on static screenshots
- UI the speaker never mentioned
- placeholder text ("Lorem", "App Name") when the transcript has the real words
- graphics for every sentence: let the face breathe between scenes
