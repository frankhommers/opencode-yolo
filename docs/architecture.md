# YOLO Plugin Architecture

## What it does

YOLO auto-replies to assistant messages so the user doesn't have to manually confirm, approve, or answer clarification questions. It runs as an OpenCode plugin loaded globally.

Three modes:

- **off** — Plugin is passive. No auto-replies.
- **on** — Replies to detected questions, proceed statements, and soft permission asks.
- **aggressive** — Everything `on` does, plus sends a continuation prompt for any assistant message that doesn't match a pattern.

## How it works

### Two-phase reply: classify, then send

The plugin uses two OpenCode events in sequence:

1. **`message.updated`** (assistant, completed) — Classifies the assistant's text and stores a pending reply. Does NOT send anything yet.
2. **`session.idle`** — After a 1-second delay, sends the pending reply via `promptAsync`.

This two-phase approach exists because sending immediately on `message.updated` was unreliable. The session loop wasn't always ready to accept new messages at that point.

### Reply classification (`isQuestion.ts`)

Given assistant text, `replyForAssistantText()` returns one of:

| Pattern | Reply | Examples |
|---------|-------|----------|
| Proceed/ready statements | `PROCEED_REPLY` | "I'll proceed with...", "Ik ga verder", "Als je go zegt" |
| Questions (? or question starters) | `DEFAULT_REPLY` | "Should I continue?", "What approach?" |
| Action requests | `DEFAULT_REPLY` | "Choose", "Confirm", "Kies", "Doe maar" |
| Soft permission asks | `DEFAULT_REPLY` | "If you want", "If you'd like", "Als dit akkoord is" |
| No match (aggressive mode only) | `What can we do now to reach the final result in the best way possible?` | Any plain statement |
| No match (on mode) | `undefined` (no reply) | — |

Reply constants (defined in `isQuestion.ts`):

- `PROCEED_REPLY` = "Please execute it, so that we reach the final result in the best way possible. Just execute don't ask."
- `DEFAULT_REPLY` = "You choose what's best and please execute it so that we reach the final result in the best way possible. Just execute, don't ask."

Patterns are bilingual: English and Dutch.

### Loop prevention and robustness

Multiple guards prevent infinite reply loops and handle edge cases:

- **`seenAssistantMessages`** — Set of message IDs already classified. Prevents re-processing the same assistant message if `message.updated` fires multiple times.
- **`waitingForHumanTurnBySession`** — Per-session Set. After sending a synthetic reply, the plugin won't send another until a real human message arrives.
- **`pendingSyntheticUserBySession`** — Per-session Set. Tracks that the next user message event is our own synthetic message, not a real human. Prevents the synthetic message from clearing the `waitingForHumanTurn` guard.
- **`pendingReplies`** + **`idleTimers`** — Pending reply can be cancelled if the human types before the 1-second delay expires.
- **`idleSequence`** — Per-session monotonic counter (notifier pattern). Bumped on busy, error, or new idle. Stale timers check their captured sequence number before firing — if it doesn't match, the timer is a no-op.
- **`errorSuppressionAt`** — Per-session timestamp. Set on `session.error`. The next `session.idle` is suppressed (no auto-reply after an error).
- **`lastBusyAt`** — Per-session timestamp. Set on `session.status` busy. Cancels pending replies and bumps sequence. If a busy event occurs after an error, the error suppression is cleared.
- **Memory cleanup** — Interval (every 5 minutes) removes stale entries from `idleSequence`, `errorSuppressionAt`, and `lastBusyAt` to prevent memory leaks in long-running sessions.
- **`humanTurnTimers`** — Per-session recovery timer (10 seconds). Started after sending a synthetic reply. If no user message event arrives within 10 seconds (because `promptAsync` silently failed), the `waitingForHumanTurn` and `pendingSyntheticUser` guards are force-cleared so the plugin resumes auto-replying.

### Human takeover

When a real user message arrives (via `chat.message` hook or `message.updated` with role=user), the plugin:

1. Cancels any pending reply and its timer
2. Clears the `waitingForHumanTurn` guard (so the plugin will resume auto-replying after the next assistant turn)

The distinction between synthetic and real user messages is tracked by `pendingSyntheticUserBySession`.

### Command handling

`/yolo` commands are handled in two places:

- **`command.execute.before`** hook — Intercepts the command, runs the state change, and sets the output text. This is the primary handler.
- **`chat.message`** hook — Fallback: if the user types `/yolo on` as a regular message, it's still handled.

During `/yolo` command execution, the plugin blocks all tool calls and permission requests to prevent OpenCode from trying to shell out to a `yolo` binary.

### State persistence (`state.ts`)

Mode is stored in `.yolo.json` at the project root (resolved via `ctx.worktree` or `ctx.directory`). The file contains:

```json
{ "enabled": true, "aggressive": false }
```

This two-field format supports backward compatibility: old files without `aggressive` are read as `on` or `off` based on `enabled`.

### Plugin entry point (`opencodePlugin.ts`)

Wires the runtime dependencies:

- `readMode` / `writeMode` → File I/O to `.yolo.json`
- `loadMessageText` → `ctx.client.session.message()` API call
- `sendUserMessage` → `ctx.client.session.promptAsync()` with `noReply: false`

## File map

```
plugins/yolo/
  opencodeCore.ts        — Hook logic (event, chat.message, command, permission, tool)
  opencodePlugin.ts      — Plugin entry point, wires runtime deps
  isQuestion.ts          — Text classification (EN + NL patterns), reply constants
  commands.ts            — /yolo command parser
  state.ts               — .yolo.json read/write
  index.ts               — Re-exports opencodePlugin as default

  opencodePlugin.test.ts — Hook behavior tests (idle delay, guards, busy/error suppression)
  isQuestion.test.ts     — Classifier tests (EN + NL)
  commands.test.ts       — Command parsing tests
  state.test.ts          — State persistence tests
  opencodePlugin.runtime.test.ts — Runtime helpers tests
```

## OpenCode hooks used

| Hook | Purpose |
|------|---------|
| `event` | Listens for `message.updated`, `session.idle`, `session.status`, `session.error`, `command.executed` |
| `chat.message` | Detects user messages (human takeover), handles `/yolo` as text |
| `command.execute.before` | Handles `/yolo` slash command, sets output text |
| `permission.ask` | Denies bash `yolo` calls and all tools during command execution |
| `tool.execute.before` | Rewrites bash to no-op during command execution |

## Known limitations and failed approaches

### promptAsync is unreliable

`session.promptAsync` (the non-blocking variant) doesn't always get picked up by OpenCode's session loop. This affects both `on` and `aggressive` mode. The session may go idle after the assistant finishes, and our injected message sits unprocessed.

The 1-second delay after `session.idle` helps but doesn't fully solve this. It's a best-effort approach.

**What we tried:**

1. **`session.prompt` (sync)** — Blocks the event hook and causes QUEUED/stall issues. OpenCode's event hooks are not designed for sync calls that start new model runs.
2. **`session.promptAsync` immediately on `message.updated`** — Race condition: the session loop isn't always ready to accept new messages when the assistant message completes.
3. **`session.promptAsync` on `session.idle`** — Better, but still not 100% reliable.
4. **`session.promptAsync` on `session.idle` + 1s delay** — Current approach. Most reliable so far, but still best-effort.

**Approach not yet tried:**

- **`experimental.chat.system.transform`** — Inject a system prompt instruction telling the model to continue autonomously. Avoids message injection entirely. Could be a clean fix for aggressive mode specifically, but doesn't help with `on` mode (which needs to send specific classified replies).

### Global waitingForHumanTurn was cross-session

Early versions used a single boolean `waitingForHumanTurn`. This broke when multiple sessions were active: one session's guard would block another. Fixed by switching to `waitingForHumanTurnBySession` (a Set of session IDs).

### noReply flag on synthetic prompts

The synthetic user message must have `noReply: false`. Setting it to `true` or omitting it causes the assistant to not generate a response to our injected message.

### command.execute.before cannot short-circuit

The `command.execute.before` hook can modify the output parts (what gets displayed), but it cannot prevent a model run from happening. OpenCode always runs the model after the command. This is why we need `permission.ask` and `tool.execute.before` to block tool calls during `/yolo` command execution — otherwise the model might try to shell out to a `yolo` binary.

## Relation to opencode-notifier

The [opencode-notifier](https://github.com/mohak34/opencode-notifier) plugin uses the same `session.idle` pattern. Our implementation adopts its robustness techniques:

- Sequence numbers to invalidate stale timers
- Busy/error state suppression
- Memory cleanup intervals for long-running sessions

The notifier uses a 350ms delay; we use 1000ms to give the user more time to intervene before the auto-reply is sent.
