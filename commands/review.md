---
description: Open the VBASE review room to pin notes on frames of an edited video
argument-hint: <path to the original video>
---
Start the VBASE review room for: $ARGUMENTS

Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" review "<video>"` (it starts the room detached and returns) and tell the user to open
http://localhost:4400, click on any frame to pin a note, then press "Send notes to Claude".
Then watch `<video dir>/.vbase/<name>/cuts/review-notes/sent.log` for a new `SENT` line (check every ~15 s, up to 30 min).
When it arrives, read every note in `notes.json` with its snapshot in `shots/`, and answer each one in a new take.
