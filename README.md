# opencode-yolo

OpenCode plugin that auto-replies to assistant messages so you don't have to manually confirm, approve, or answer clarification questions.

## Install

Add to your OpenCode config (`~/.config/opencode/opencode.json` for global, or `.opencode/opencode.json` for per-project):

```json
{
  "plugin": ["@frankhommers/opencode-yolo"]
}
```

OpenCode installs the plugin automatically on next startup. Updates are picked up automatically too.

To pin a specific version: `"@frankhommers/opencode-yolo@0.1.2"`

Add the command definition to `~/.config/opencode/commands/yolo.md` (or `.opencode/commands/yolo.md`):

```md
---
name: yolo
description: Toggle or inspect YOLO mode (on/off/aggressive/status)
subtask: false
arguments:
  - name: action
    description: "One of: on, off, aggressive, status, start"
    required: false
---
```

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
- `/yolo start` — Kick off work with current mode

## Config file

YOLO stores its mode per project in `.yolo.json`. Add it to your `.gitignore`.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
