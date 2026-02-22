# YOLO Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `YOLO` OpenCode plugin that auto-answers assistant questions with `You choose what's best`, and can be easily toggled on/off.

**Architecture:** Implement a small plugin module with three responsibilities: detect assistant questions, inject one synthetic user reply, and enforce loop/de-dup guards. Add a tiny command router (`/yolo on|off|status`) and persist enabled state in a local JSON config file.

**Tech Stack:** TypeScript (Node runtime), OpenCode plugin hooks/events API, JSON file persistence.

---

### Task 1: Create plugin scaffold

**Files:**
- Create: `plugins/yolo/index.ts`
- Create: `plugins/yolo/types.ts`

**Step 1: Write the failing test**

Create `plugins/yolo/index.test.ts` with a minimal plugin-load assertion:

```ts
import { createYoloPlugin } from "./index"

test("plugin exposes name and handlers", () => {
  const plugin = createYoloPlugin()
  expect(plugin.name).toBe("YOLO")
  expect(typeof plugin.onMessage).toBe("function")
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- plugins/yolo/index.test.ts`
Expected: FAIL because files/functions do not exist yet.

**Step 3: Write minimal implementation**

Create `plugins/yolo/types.ts`:

```ts
export type ChatRole = "user" | "assistant" | "system" | "tool"

export interface ChatMessage {
  id?: string
  role: ChatRole
  text: string
  createdAt?: number
  source?: string
}

export interface PluginApi {
  sendUserMessage: (text: string, meta?: Record<string, string>) => Promise<void>
  log: (message: string) => void
}
```

Create `plugins/yolo/index.ts`:

```ts
import type { ChatMessage, PluginApi } from "./types"

export function createYoloPlugin() {
  return {
    name: "YOLO",
    onMessage: async (_api: PluginApi, _message: ChatMessage) => {}
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- plugins/yolo/index.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add plugins/yolo/index.ts plugins/yolo/types.ts plugins/yolo/index.test.ts
git commit -m "feat: scaffold YOLO plugin module"
```

### Task 2: Add question detection utility

**Files:**
- Create: `plugins/yolo/isQuestion.ts`
- Create: `plugins/yolo/isQuestion.test.ts`
- Modify: `plugins/yolo/index.ts`

**Step 1: Write the failing test**

Create tests for positive and negative cases:

```ts
import { isQuestion } from "./isQuestion"

test("detects question mark", () => {
  expect(isQuestion("Can you choose?"))
})

test("detects starters", () => {
  expect(isQuestion("How should we proceed"))
})

test("ignores plain statement", () => {
  expect(isQuestion("Proceeding with implementation")).toBe(false)
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- plugins/yolo/isQuestion.test.ts`
Expected: FAIL (`isQuestion` missing).

**Step 3: Write minimal implementation**

Create `plugins/yolo/isQuestion.ts`:

```ts
const STARTERS = /^(what|why|how|can|could|should|would|which|when|where|who|do|does|did|is|are)\b/i

export function isQuestion(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return value.includes("?") || STARTERS.test(value)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- plugins/yolo/isQuestion.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add plugins/yolo/isQuestion.ts plugins/yolo/isQuestion.test.ts
git commit -m "feat: detect assistant questions for YOLO"
```

### Task 3: Implement on/off/status commands with persistence

**Files:**
- Create: `plugins/yolo/state.ts`
- Create: `plugins/yolo/commands.ts`
- Create: `plugins/yolo/state.test.ts`
- Create: `plugins/yolo/commands.test.ts`
- Modify: `plugins/yolo/index.ts`

**Step 1: Write the failing tests**

Add tests:
- `/yolo on` enables mode and persists
- `/yolo off` disables mode and persists
- `/yolo status` returns current state

Example assertion:

```ts
expect(await runCommand("/yolo on")).toEqual({ handled: true, enabled: true })
```

**Step 2: Run test to verify it fails**

Run: `npm test -- plugins/yolo/commands.test.ts`
Expected: FAIL (state/command handlers not implemented).

**Step 3: Write minimal implementation**

Create `plugins/yolo/state.ts` with config path:

```ts
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

const configPath = path.join(os.homedir(), ".config", "opencode", "plugins", "yolo.json")

export async function readEnabled(defaultValue = false): Promise<boolean> { /* ... */ }
export async function writeEnabled(enabled: boolean): Promise<void> { /* ... */ }
```

Create `plugins/yolo/commands.ts`:

```ts
export async function maybeHandleYoloCommand(text: string) {
  // parse /yolo on|off|status and return command result
}
```

Wire into `index.ts` so command messages are handled before question detection.

**Step 4: Run tests to verify they pass**

Run: `npm test -- plugins/yolo/state.test.ts plugins/yolo/commands.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add plugins/yolo/state.ts plugins/yolo/commands.ts plugins/yolo/state.test.ts plugins/yolo/commands.test.ts plugins/yolo/index.ts
git commit -m "feat: add YOLO mode toggle commands with persisted state"
```

### Task 4: Add loop protection and auto-reply behavior

**Files:**
- Create: `plugins/yolo/replyGuard.ts`
- Create: `plugins/yolo/replyGuard.test.ts`
- Modify: `plugins/yolo/index.ts`

**Step 1: Write the failing test**

Add integration-style tests:
- Assistant question injects exactly one user reply
- Same assistant message does not inject again
- Plugin-sourced messages are ignored

**Step 2: Run test to verify it fails**

Run: `npm test -- plugins/yolo/replyGuard.test.ts plugins/yolo/index.test.ts`
Expected: FAIL before behavior is wired.

**Step 3: Write minimal implementation**

Implement in `index.ts`:

```ts
if (!state.enabled) return
if (message.role !== "assistant") return
if (message.source === "yolo-plugin") return
if (!isQuestion(message.text)) return
if (guard.hasSeen(message)) return

await api.sendUserMessage("You choose what's best", { source: "yolo-plugin" })
guard.markSeen(message)
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- plugins/yolo/*.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add plugins/yolo/replyGuard.ts plugins/yolo/replyGuard.test.ts plugins/yolo/index.ts
git commit -m "feat: auto-answer assistant questions with dedup safeguards"
```

### Task 5: Document activation/deactivation usage

**Files:**
- Create: `plugins/yolo/README.md`

**Step 1: Write the failing docs check (optional if docs lint exists)**

If docs lint exists, add a minimal check reference in CI docs task.

**Step 2: Run check to verify it fails (only if docs lint exists)**

Run: `npm run lint:docs`
Expected: FAIL only if required rule expects plugin docs.

**Step 3: Write minimal documentation**

Document:
- What YOLO does
- How to enable: `/yolo on`
- How to disable: `/yolo off`
- How to check: `/yolo status`
- Where config is stored: `~/.config/opencode/plugins/yolo.json`

**Step 4: Run docs check**

Run: `npm run lint:docs` (if available)
Expected: PASS.

**Step 5: Commit**

```bash
git add plugins/yolo/README.md
git commit -m "docs: explain YOLO mode activation and behavior"
```

### Task 6: Final verification

**Files:**
- Verify only

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS.

**Step 2: Smoke test manually**

Run app and verify:
1. `/yolo on`
2. assistant asks a question
3. injected response appears once
4. `/yolo off`
5. assistant questions no longer auto-replied

**Step 3: Record verification notes**

Add brief notes in PR description or commit body.

**Step 4: Commit any final adjustments**

```bash
git add .
git commit -m "test: verify YOLO toggle and auto-answer flow"
```
