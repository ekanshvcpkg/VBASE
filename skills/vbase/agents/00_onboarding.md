# Stage 0: Onboarding (first run only)

Run this when `profile.py status` exits 3, meaning there is no profile yet, or when the user
asks to "set up vidbase", "change my vidbase settings" or "redo onboarding". This is the one
slow, careful conversation. Its job is to learn how this creator wants every video edited, so
that afterwards dropping in a video is enough.

Tell the user up front, in one line:
> First time setup: about 20 quick questions in 5 rounds, so every video after this edits
> itself in your style. You can change any answer later.

Then, **in parallel with the questions**, start the one-time environment install in the
background, so it's ready by the time onboarding ends:
```bash
bash "$SKILL_DIR/scripts/setup_env.sh" small      # run_in_background
```

## The interview

Ask in **5 rounds of up to 4 questions**. Use `AskUserQuestion` when it's available; otherwise
use a numbered list. Every question has sensible options, and "Other" is always there for free
text. Put the recommended option first. Wait for each round's answers before asking the next.
If they mentioned something earlier in the conversation ("I make YouTube tutorials about my
Android app"), pre-fill it and skip that question.

**Round 1: your channel**
1. **What do you mostly make?** Tutorials / product demos / talking-head education / vlogs /
   podcast clips / courses → `content_type`
2. **Where does it get posted?** (multi-select) YouTube / Shorts / Reels / TikTok / LinkedIn /
   X → `platforms`
3. **Default shape?**
   - 16:9 landscape
   - 9:16 vertical
   - 1:1 or 4:5
   - keep the original
   - ask me each video

   → `default_format`. When the platforms span both shapes, recommend "ask me each video".
4. **Typical length of a finished video?** Under 60 s / 1–5 min / 5+ min → `typical_length`

**Round 2: how it should be edited**
5. **Pacing?**
   - natural (recommended): only dead air goes, human pauses stay
   - fast
   - educational
   - cinematic

   → `style`
6. **Opening?**
   - Find my strongest line and cold-open on it (recommended)
   - keep my intro
   - ask me

   → `hook_policy`
7. **How much should be cut?**
   - fillers + retakes + throat-clearing (recommended)
   - fillers only
   - tight: also trim tangents

   → `cut_depth`
8. **Dramatic holds on the key line (no graphics, a slow push on your face)?**
   - yes, deliberate (recommended)
   - subtle
   - never

   → `holds`

**Round 3: the look**
9. **Overall graphic style?** Offer previews:
   - editorial: warm paper panels, serif headlines (recommended)
   - dark tech: charcoal, mono type
   - bold creator: high contrast, big type
   - minimal: almost no graphics

   → `visual_style` (sets `palette`)
10. **Brand colour?**
    - the default clay `#C96442`
    - my colour (hex, via Other)

    → `accent`
11. **Captions?**
    - refined subtitles (recommended for 16:9)
    - bold short-form captions (recommended for 9:16 shorts)
    - none

    → `captions`
12. **How should 3D objects look**, e.g. a ball in your hand?
    - matte and lit like your room (recommended)
    - glossy
    - no 3D

    → `object_3d`

**Round 4: graphics and elements**
13. **How much on-screen graphics?**
    - balanced: scenes on proof moments, face-only stretches between (recommended)
    - minimal
    - rich

    → `scene_density`
14. **Which elements do you want?** (multi-select)
    - product UI replicas (chat, apps, websites)
    - comparison panels
    - workflow diagrams
    - stats / count-ups
    - 3D objects in your hand
    - phone mockups
    - terminal / code

    → `elements`
15. **Which products do you show most?** Free text: "Claude, Figma, my Android app 'Habitly'…"
    → `products`. These get faithful replicas built and reused.
16. **Your handles / links?** e.g. GitHub `owner/repo`, website → `links`

**Round 5: sound and delivery**
17. **Background music?**
    - generate it with ElevenLabs, to fit each video
    - use my track (path)
    - none

    → `music`. If they pick generate, ask them to connect ElevenLabs now (see
    `agents/01_setup_intake.md`, "Connecting ElevenLabs").
18. **Music mood?**
    - light lo-fi, warm
    - upbeat minimal tech
    - cinematic ambient
    - Other

    → `music_mood`. Skip if music is none.
19. **When a video comes in:**
    - edit straight through and show me the result (autopilot, recommended)
    - show me the plan first

    → `autopilot`
20. **Also write titles, a caption and hashtags?** yes / no → `social_copy`

**Finally, one free-text message** (not a multiple-choice round):
- How should your name appear in captions?
- Which words does speech-to-text get wrong? Product names, your name.

This fills `creator_name` and `glossary`, e.g. `{"cloud": "Claude", "akansh": "Ekansh"}`.

## Save it

Write the answers to `$EDIT_DIR`-independent JSON, then save:
```bash
cat > /tmp/vidbase_answers.json <<'EOF'
{ "creator_name": "Ekansh", "content_type": "product_demo", "platforms": ["youtube", "shorts"],
  "default_format": "ask", "typical_length": "short", "style": "natural", "hook_policy": "find",
  "cut_depth": "fillers_and_retakes", "holds": "deliberate", "visual_style": "editorial",
  "accent": "#C96442", "captions": "refined", "object_3d": "matte_realistic",
  "scene_density": "balanced", "elements": ["product_ui", "compare", "flow", "held_object"],
  "products": ["Claude", "GitHub"], "links": {"github": "ekanshvcpkg/VID-BASE"},
  "glossary": {"cloud": "Claude"}, "music": "none", "music_mood": "light lo-fi, warm",
  "sfx": "subtle", "autopilot": true, "social_copy": true }
EOF
python3 "$SKILL_DIR/scripts/profile.py" save --answers /tmp/vidbase_answers.json
python3 "$SKILL_DIR/scripts/profile.py" show
```
Values outside the allowed set are reset to their defaults and reported under `fixed`. Re-ask
those questions.

Show the user the `profile.md` summary in a few lines and confirm:
> Saved. From now on, just give me a video, e.g. "edit ~/Movies/take3.mov", and I'll edit it in
> this style. Say "change my vidbase settings" any time.

If a video was already given with the request, continue straight into Stage 1 with it.

## Changing settings later

For a single change ("make captions bold", "switch to 9:16 by default"), don't re-run the
interview:
```bash
python3 "$SKILL_DIR/scripts/profile.py" set captions=bold
python3 "$SKILL_DIR/scripts/profile.py" set default_format=9:16
python3 "$SKILL_DIR/scripts/profile.py" set 'glossary={"cloud":"Claude","akansh":"Ekansh"}'
```
