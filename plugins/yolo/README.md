# YOLO Plugin

YOLO auto-replies when the assistant asks a question. When enabled, it injects one user message:

`You choose what's best`

It also sends `OK Go` for proceed/ready statements (for example: "I'll proceed...", "Ready for feedback.", or Dutch variants like "Ik ga verder..." / "Klaar voor feedback.").

For action prompts without a question mark (for example: "Kies 1 van die twee."), it replies with `You choose what's best`.

It only replies once per assistant message and ignores messages already sourced from the plugin.

## Commands

- Enable: `/yolo on`
- Aggressive: `/yolo aggressive`
- Disable: `/yolo off`
- Status: `/yolo status`

`aggressive` includes normal YOLO behavior and additionally posts `En nu?` for plain assistant updates.

## Config file

YOLO stores its enabled state per project in:

`./.yolo.json`

This keeps YOLO toggles isolated per repo/worktree.

Add `/.yolo.json` to each project's `.gitignore` if you don't want local toggle state committed.

## Global install (recommended)

1. Add plugin globally in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:///absolute/path/to/opencode-yolo/plugins/yolo"
  ]
}
```

2. Add global command file `~/.config/opencode/commands/yolo.md` with frontmatter:

```md
---
name: yolo
description: Toggle or inspect YOLO mode (on/off/status)
subtask: false
arguments:
  - name: action
    description: "One of: on, off, status"
    required: false
---
```

After this, `/yolo` is available in all projects, but enable/disable remains project-local via `./.yolo.json`.
