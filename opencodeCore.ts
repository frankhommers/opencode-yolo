import { maybeHandleYoloCommand } from "./commands"
import { replyForAssistantText, AGGRESSIVE_FALLBACK } from "./isQuestion"
import type { YoloMode } from "./state"


type HookEvent = {
  event: {
    type: string
    properties?: {
      info?: {
        id?: string
        sessionID?: string
        role?: string
        time?: {
          completed?: number
        }
      }
      name?: string
      sessionID?: string
      arguments?: string
      messageID?: string
      status?: {
        type?: string
      }
    }
  }
}

type ChatMessageHook = {
  sessionID?: string
}

type ChatMessageOutput = {
  message?: {
    id?: string
    sessionID?: string
    role?: string
  }
  parts?: Array<{ type?: string; text?: string }>
}

export interface QuestionInfo {
  question: string
  header: string
  options: Array<{ label: string; description: string }>
  multiple?: boolean
  custom?: boolean
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionInfo[]
}

export interface RuntimeDeps {
  readMode: () => Promise<YoloMode>
  writeMode: (mode: YoloMode) => Promise<void>
  loadMessageText: (sessionID: string, messageID: string) => Promise<string>
  sendUserMessage: (sessionID: string, text: string) => Promise<void>
  answerQuestion: (requestID: string, answers: string[][]) => Promise<void>
}

export function textFromParts(parts: Array<{ type?: string; text?: string }> = []): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
}

export const IDLE_DELAY_MS = 350
export const WATCHDOG_STALE_MS = 1_000
export const HUMAN_TURN_TIMEOUT_MS = 10_000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

import { appendFileSync } from "node:fs"

const YOLO_LOG_FILE = "/tmp/yolo-debug.log"

function yoloLog(...args: unknown[]) {
  const line = `${new Date().toISOString()} [YOLO] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`
  try { appendFileSync(YOLO_LOG_FILE, line) } catch {}
}

export async function createOpencodeYoloHooks(deps: RuntimeDeps) {
  let mode = await deps.readMode()
  yoloLog("plugin loaded, mode:", mode)

  // --- Per-session state ---
  const waitingForHumanTurnBySession = new Set<string>()
  const seenAssistantMessages = new Set<string>()
  const pendingSyntheticUserBySession = new Set<string>()
  const activeYoloCommandSessions = new Set<string>()

  // --- Idle scheduling (notifier pattern) + watchdog fallback ---
  const pendingReplies = new Map<string, string>()
  const pendingReplySetAt = new Map<string, number>()
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const idleSequence = new Map<string, number>()
  const errorSuppressionAt = new Map<string, number>()
  const lastBusyAt = new Map<string, number>()
  const humanTurnTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Memory cleanup: remove stale session entries every 5 minutes
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CLEANUP_INTERVAL_MS
    for (const [sessionID] of idleSequence) {
      if (!idleTimers.has(sessionID)) {
        idleSequence.delete(sessionID)
      }
    }
    for (const [sessionID, timestamp] of errorSuppressionAt) {
      if (timestamp < cutoff) errorSuppressionAt.delete(sessionID)
    }
    for (const [sessionID, timestamp] of lastBusyAt) {
      if (timestamp < cutoff) lastBusyAt.delete(sessionID)
    }
  }, CLEANUP_INTERVAL_MS)

  // Allow GC if the plugin is unloaded (Node won't hold the process open)
  if (typeof cleanupTimer === "object" && cleanupTimer !== null && "unref" in (cleanupTimer as any)) {
    ;(cleanupTimer as any).unref()
  }

  function bumpSequence(sessionID: string): number {
    const next = (idleSequence.get(sessionID) ?? 0) + 1
    idleSequence.set(sessionID, next)
    return next
  }

  function hasCurrentSequence(sessionID: string, seq: number): boolean {
    return idleSequence.get(sessionID) === seq
  }

  function clearIdleTimer(sessionID: string) {
    const timer = idleTimers.get(sessionID)
    if (timer) {
      clearTimeout(timer)
      idleTimers.delete(sessionID)
    }
  }

  function cancelPendingReply(sessionID: string) {
    pendingReplies.delete(sessionID)
    pendingReplySetAt.delete(sessionID)
    bumpSequence(sessionID)
    clearIdleTimer(sessionID)
  }

  function markBusy(sessionID: string) {
    yoloLog("markBusy", sessionID)
    lastBusyAt.set(sessionID, Date.now())
    errorSuppressionAt.delete(sessionID)
    cancelPendingReply(sessionID)
  }

  function markError(sessionID: string) {
    errorSuppressionAt.set(sessionID, Date.now())
    cancelPendingReply(sessionID)
  }

  function shouldSuppressIdle(sessionID: string): boolean {
    const errorAt = errorSuppressionAt.get(sessionID)
    if (errorAt === undefined) return false

    const busyAt = lastBusyAt.get(sessionID)
    if (typeof busyAt === "number" && busyAt > errorAt) {
      errorSuppressionAt.delete(sessionID)
      return false
    }

    errorSuppressionAt.delete(sessionID)
    return true
  }

  function clearHumanTurnTimer(sessionID: string) {
    const timer = humanTurnTimers.get(sessionID)
    if (timer) {
      clearTimeout(timer)
      humanTurnTimers.delete(sessionID)
    }
  }

  function startHumanTurnTimeout(sessionID: string) {
    clearHumanTurnTimer(sessionID)
    const timer = setTimeout(() => {
      humanTurnTimers.delete(sessionID)
      // promptAsync delivery failed silently — force-clear guards so plugin resumes
      waitingForHumanTurnBySession.delete(sessionID)
      pendingSyntheticUserBySession.delete(sessionID)
    }, HUMAN_TURN_TIMEOUT_MS)
    humanTurnTimers.set(sessionID, timer)
  }

  function humanTookOver(sessionID: string) {
    cancelPendingReply(sessionID)
    clearHumanTurnTimer(sessionID)
    if (pendingSyntheticUserBySession.has(sessionID)) {
      pendingSyntheticUserBySession.delete(sessionID)
    } else {
      waitingForHumanTurnBySession.delete(sessionID)
    }
  }

  async function deliverReply(sessionID: string) {
    const pendingReply = pendingReplies.get(sessionID)
    if (!pendingReply) { yoloLog("DELIVER SKIP: no pendingReply", sessionID); return }
    pendingReplies.delete(sessionID)
    pendingReplySetAt.delete(sessionID)
    if (mode === "off") { yoloLog("DELIVER SKIP: mode is off", sessionID); return }
    if (shouldSuppressIdle(sessionID)) { yoloLog("DELIVER SKIP: error suppression", sessionID); return }
    if (waitingForHumanTurnBySession.has(sessionID)) { yoloLog("DELIVER SKIP: waitingForHumanTurn", sessionID); return }

    try {
      yoloLog("SENDING reply to", sessionID, pendingReply.substring(0, 40) + "...")
      waitingForHumanTurnBySession.add(sessionID)
      pendingSyntheticUserBySession.add(sessionID)
      startHumanTurnTimeout(sessionID)
      await deps.sendUserMessage(sessionID, pendingReply)
      yoloLog("SENT reply to", sessionID)
    } catch (err) {
      yoloLog("SEND ERROR", sessionID, String(err))
      waitingForHumanTurnBySession.delete(sessionID)
      pendingSyntheticUserBySession.delete(sessionID)
    }
  }

  function checkWatchdog() {
    // Fallback: if setTimeout callbacks aren't firing, deliver stale pending replies
    // directly from the event stream. Any incoming event triggers this check.
    const now = Date.now()
    for (const [sessionID, setAt] of pendingReplySetAt) {
      if (now - setAt < WATCHDOG_STALE_MS) continue
      if (!pendingReplies.has(sessionID)) { pendingReplySetAt.delete(sessionID); continue }
      if (waitingForHumanTurnBySession.has(sessionID)) continue
      if (shouldSuppressIdle(sessionID)) { cancelPendingReply(sessionID); continue }

      yoloLog("WATCHDOG: stale reply detected for", sessionID, "age:", now - setAt, "ms — delivering now")
      clearIdleTimer(sessionID)
      void deliverReply(sessionID)
    }
  }

  function scheduleReplyDelivery(sessionID: string) {
    // Notifier pattern: wait IDLE_DELAY_MS after session.idle before delivering.
    // This ensures OpenCode has fully transitioned to idle before we send a new message.
    clearIdleTimer(sessionID)
    const seq = bumpSequence(sessionID)
    yoloLog("scheduleReplyDelivery: scheduling timer for", sessionID, "seq:", seq)

    const timer = setTimeout(() => {
      idleTimers.delete(sessionID)
      if (!hasCurrentSequence(sessionID, seq)) {
        yoloLog("DELIVER SKIP: sequence mismatch", sessionID, "expected:", seq, "current:", idleSequence.get(sessionID))
        return
      }
      void deliverReply(sessionID)
    }, IDLE_DELAY_MS)

    idleTimers.set(sessionID, timer)
  }

  return {
    "command.execute.before": async (
      input: { command: string; sessionID: string; arguments: string },
      output: { parts: Array<{ type: string; text?: string }> },
    ) => {
      yoloLog("command.execute.before:", input.command, "args:", input.arguments)
      if (input.command !== "yolo") return

      activeYoloCommandSessions.add(input.sessionID)

      const args = input.arguments.trim().toLowerCase()

      // /yolo start: send the go-to-work prompt without changing mode
      if (args === "start") {
        if (mode === "off") {
          output.parts = [{ type: "text", text: "YOLO mode is off. Enable it first with /yolo on or /yolo aggressive." }]
          return
        }
        yoloLog("command /yolo start: queuing prompt for", input.sessionID)
        pendingReplies.set(input.sessionID, AGGRESSIVE_FALLBACK)
        pendingReplySetAt.set(input.sessionID, Date.now())
        // Delivery will happen when session.idle fires after this command completes
        output.parts = [{ type: "text", text: "YOLO: kicking off work." }]
        return
      }

      const commandText = args ? `/yolo ${args}` : "/yolo"
      yoloLog("command.execute.before: calling maybeHandleYoloCommand with:", commandText)
      const result = await maybeHandleYoloCommand(commandText, {
        readMode: deps.readMode,
        writeMode: deps.writeMode,
      })
      yoloLog("command.execute.before: result:", result.handled, result.mode)
      if (result.handled && result.mode) {
        mode = result.mode
        yoloLog("command.execute.before: mode updated to:", mode)
      }

      const statusLine =
        mode === "aggressive"
          ? "YOLO mode enabled: aggressive."
          : mode === "on"
            ? "YOLO mode enabled: normal."
            : "YOLO mode disabled."
      output.parts = [
        {
          type: "text",
          text: statusLine,
        },
      ]
    },

    "permission.ask": async (
      input: { type: string; pattern?: string | string[]; sessionID: string },
      output: { status: "ask" | "deny" | "allow" },
    ) => {
      const patterns = Array.isArray(input.pattern) ? input.pattern : input.pattern ? [input.pattern] : []
      const isYoloShellCall = patterns.some((pattern) => /(^|\s)\/?yolo(\s|$)/.test(pattern))
      const isActiveYoloCommandSession = activeYoloCommandSessions.has(input.sessionID)

      if (isActiveYoloCommandSession && input.type !== "question") {
        output.status = "deny"
        return
      }

      if (input.type !== "bash") return

      if (!isYoloShellCall && !isActiveYoloCommandSession) return

      output.status = "deny"
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: any },
    ) => {
      if (!activeYoloCommandSessions.has(input.sessionID)) return
      if (input.tool !== "bash") return

      output.args = {
        ...(output.args ?? {}),
        command: ":",
        description: "No-op during yolo command",
      }
    },

    "chat.message": async (_input: ChatMessageHook, output: ChatMessageOutput) => {
      yoloLog("chat.message:", output.message?.role, textFromParts(output.parts)?.substring(0, 60))
      if (output.message?.role !== "user") return

      const sessionID = output.message.sessionID
      if (sessionID) {
        humanTookOver(sessionID)
      }

      const text = textFromParts(output.parts)
      if (!text) return

      const result = await maybeHandleYoloCommand(text, {
        readMode: deps.readMode,
        writeMode: deps.writeMode,
      })

      yoloLog("chat.message command result:", result.handled, result.mode)
      if (result.handled && result.mode) {
        mode = result.mode
        yoloLog("chat.message updated mode to:", mode)
      }
    },

    event: async ({ event }: HookEvent) => {
      // Watchdog: on every event, check for stale pending replies whose timers didn't fire
      checkWatchdog()

      yoloLog("event:", event.type, JSON.stringify(event.properties?.sessionID ?? event.properties?.info?.sessionID ?? "no-sid"))

      if (event.type === "command.executed") {
        const sessionID = event.properties?.sessionID
        const name = event.properties?.name
        if (name === "yolo" && sessionID) {
          activeYoloCommandSessions.delete(sessionID)
        }
        return
      }

      // question.asked: auto-answer multiple choice questions
      if (event.type === "question.asked") {
        if (mode === "off") return
        const request = event.properties as unknown as QuestionRequest | undefined
        if (!request?.id || !request?.questions?.length) return
        yoloLog("question.asked:", request.id, "questions:", request.questions.length)

        // For each question, pick the first option (or all if multiple)
        const answers: string[][] = request.questions.map((q) => {
          if (!q.options?.length) return []
          if (q.multiple) return q.options.map((o) => o.label)
          return [q.options[0].label]
        })
        yoloLog("question.asked: auto-answering with:", JSON.stringify(answers))

        try {
          await deps.answerQuestion(request.id, answers)
          yoloLog("question.asked: answered", request.id)
        } catch (err) {
          yoloLog("question.asked: FAILED to answer", request.id, String(err))
        }
        return
      }

      // session.status busy: cancel pending reply, bump sequence
      if (event.type === "session.status" && event.properties?.status?.type === "busy") {
        const sessionID = event.properties?.sessionID
        if (sessionID) markBusy(sessionID)
        return
      }

      // session.error: suppress next idle for this session
      if (event.type === "session.error") {
        const sessionID = event.properties?.sessionID
        if (sessionID) markError(sessionID)
        return
      }

      // session.idle: deliver pending reply immediately
      // No setTimeout — timers are unreliable in this environment.
      // session.idle already means OpenCode is fully idle and ready for input.
      if (event.type === "session.idle") {
        const sessionID = event.properties?.sessionID
        if (!sessionID) return
        const reply = pendingReplies.get(sessionID)
        yoloLog("session.idle", sessionID, "pendingReply:", !!reply, "waitingForHuman:", waitingForHumanTurnBySession.has(sessionID))
        if (!reply) return
        if (waitingForHumanTurnBySession.has(sessionID)) {
          yoloLog("session.idle BLOCKED by waitingForHumanTurn")
          cancelPendingReply(sessionID)
          return
        }
        if (shouldSuppressIdle(sessionID)) {
          yoloLog("session.idle SUPPRESSED by error")
          cancelPendingReply(sessionID)
          return
        }

        yoloLog("session.idle: delivering reply NOW for", sessionID)
        await deliverReply(sessionID)
        return
      }

      if (event.type !== "message.updated") return
      const info = event.properties?.info
      if (!info?.sessionID) return

      if (info.role === "user") {
        humanTookOver(info.sessionID)
        return
      }

      if (mode === "off") { yoloLog("SKIP: mode off"); return }
      if (info.role !== "assistant") return
      if (!info.id) return
      if (!info.time?.completed) return
      if (waitingForHumanTurnBySession.has(info.sessionID)) { yoloLog("SKIP: waitingForHumanTurn", info.sessionID); return }
      if (seenAssistantMessages.has(info.id)) { yoloLog("SKIP: already seen", info.id); return }

      seenAssistantMessages.add(info.id)

      const text = await deps.loadMessageText(info.sessionID, info.id)
      const classifiedReply = replyForAssistantText(text)
      const reply = classifiedReply ?? (mode === "aggressive" ? AGGRESSIVE_FALLBACK : undefined)
      yoloLog("message.updated classified:", info.id, "reply:", reply ? reply.substring(0, 40) + "..." : "NONE", "mode:", mode)
      if (!reply) return

      // Store pending reply — delivery is triggered by session.idle (notifier pattern).
      // We do NOT deliver here; we wait for OpenCode to fully go idle first.
      // Watchdog fallback: if the timer doesn't fire within WATCHDOG_STALE_MS,
      // the next incoming event will deliver it directly.
      pendingReplies.set(info.sessionID, reply)
      pendingReplySetAt.set(info.sessionID, Date.now())
      yoloLog("pendingReply SET for", info.sessionID, "(waiting for session.idle)")
    },
  }
}
