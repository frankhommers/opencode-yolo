# YOLO Plugin

YOLO auto-replies to assistant messages so you don't have to manually confirm, approve, or answer clarification questions. It runs as an OpenCode plugin loaded globally.

## Modes

- **off** — Plugin is passive. No auto-replies.
- **on** — Replies to detected questions, proceed statements, and soft permission asks.
- **aggressive** — Everything `on` does, plus sends a continuation prompt for any assistant message that doesn't match a pattern.

## Replies

| Trigger | Reply |
|---------|-------|
| Proceed/ready statements ("I'll proceed", "Ik ga verder", "Ready for feedback") | "Please execute it, so that we reach the final result in the best way possible. Just execute don't ask." |
| Questions, action requests, soft permission asks ("Should I?", "Kies", "If you want") | "You choose what's best and please execute it so that we reach the final result in the best way possible. Just execute, don't ask." |
| No match (aggressive only) | "What can we do now to reach the final result in the best way possible?" |

Pattern matching is bilingual: English and Dutch.

## Commands

- `/yolo` — Toggle on/off
- `/yolo on` — Enable normal mode
- `/yolo aggressive` — Enable aggressive mode
- `/yolo off` — Disable
- `/yolo status` — Show current mode

## Config file

YOLO stores its mode per project in `./.yolo.json`. This keeps YOLO toggles isolated per repo/worktree.

Add `.yolo.json` to your project's `.gitignore`.

## Global install (recommended)

1. Add plugin globally in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "file:///absolute/path/to/opencode-yolo/plugins/yolo"
  ]
}
```

2. Add global command file `~/.config/opencode/commands/yolo.md`:

```md
---
name: yolo
description: Toggle or inspect YOLO mode (on/off/aggressive/status)
subtask: false
arguments:
  - name: action
    description: "One of: on, off, aggressive, status"
    required: false
---
```

After this, `/yolo` is available in all projects, but mode state remains project-local via `./.yolo.json`.

## Architecture

See [docs/architecture.md](../../docs/architecture.md) for full details on hooks, guards, known limitations, and design decisions.
