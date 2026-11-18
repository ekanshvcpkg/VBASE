---
description: Install or check everything VBASE needs (one time, ~5-10 minutes)
argument-hint: [--check]
---
Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh" $ARGUMENTS` and show the user the status table.
If anything is marked missing, explain in one line each how to fix it (for example `brew install ffmpeg`, or installing
Google Chrome or Brave), then offer to run setup again.
