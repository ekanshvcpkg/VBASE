---
description: Edit a raw video into a finished one (cuts, captions, 3D, camera moves, open + end card)
argument-hint: <path to video> [notes, e.g. "make it vertical", "my name is Ada"]
---
Edit this video with VBASE: $ARGUMENTS

Use the `vbase` skill and follow its "VBASE plugin pipeline" section end to end:
1. If `~/.vbase/env.sh` does not exist, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"` first and report anything missing.
2. Run the analyze stage, direct the edit (edit_plan.md + edl_draft.json), run the render stage.
3. Check the result yourself (contact sheet, QC report), fix what you would not ship, then give the user the output path,
   what was cut, the scenes shown, and offer the review room (`/vbase:review`).
