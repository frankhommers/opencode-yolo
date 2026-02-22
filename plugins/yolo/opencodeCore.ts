import { maybeHandleYoloCommand } from "./commands"
import { replyForAssistantText } from "./isQuestion"
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

export interface RuntimeDeps {
  readMode: () => Promise<YoloMode>
  writeMode: (mode: YoloMode) => Promise<void>
  loadMessageText: (sessionID: string, messageID: string) => Promise<string>
  sendUserMessage: (sessionID: string, text: string) => Promise<void>
}

export function textFromParts(parts: Array<{ type?: string; text?: string }> = []): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
}

export const IDLE_DELAY_MS = 1000

export async function createOpencodeYoloHooks(deps: RuntimeDeps) {
  let mode = await deps.readMode()
  const waitingForHumanTurnBySession = new Set<string>()
  const seenAssistantMessages = new Set<string>()
  const pendingSyntheticUserBySession = new Set<string>()
  const activeYoloCommandSessions = new Set<string>()
  const pendingReplies = new Map<string, string>()
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function cancelPendingReply(sessionID: string) {
    pendingReplies.delete(sessionID)
    const timer = idleTimers.get(sessionID)
    if (timer) {
      clearTimeout(timer)
      idleTimers.delete(sessionID)
    }
  }

  function humanTookOver(sessionID: string) {
    cancelPendingReply(sessionID)
    if (pendingSyntheticUserBySession.has(sessionID)) {
      pendingSyntheticUserBySession.delete(sessionID)
    } else {
      waitingForHumanTurnBySession.delete(sessionID)
    }
  }

  return {
    "command.execute.before": async (
      input: { command: string; sessionID: string; arguments: string },
      output: { parts: Array<{ type: string; text?: string }> },
    ) => {
      if (input.command !== "yolo") return

      activeYoloCommandSessions.add(input.sessionID)

      const args = input.arguments.trim()
      const commandText = args ? `/yolo ${args}` : "/yolo"
      const result = await maybeHandleYoloCommand(commandText, {
        readMode: deps.readMode,
        writeMode: deps.writeMode,
      })
      if (result.handled && result.mode) {
        mode = result.mode
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

      if (result.handled && result.mode) {
        mode = result.mode
      }
    },

    event: async ({ event }: HookEvent) => {
      if (event.type === "command.executed") {
        const sessionID = event.properties?.sessionID
        const name = event.properties?.name
        if (name === "yolo" && sessionID) {
          activeYoloCommandSessions.delete(sessionID)
        }
        return
      }

      // session.idle: send pending reply after delay
      if (event.type === "session.idle") {
        const sessionID = event.properties?.sessionID
        if (!sessionID) return
        const reply = pendingReplies.get(sessionID)
        if (!reply) return
        if (waitingForHumanTurnBySession.has(sessionID)) {
          cancelPendingReply(sessionID)
          return
        }

        // Cancel any existing timer for this session (dedup)
        const existingTimer = idleTimers.get(sessionID)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(async () => {
          idleTimers.delete(sessionID)
          const pendingReply = pendingReplies.get(sessionID)
          if (!pendingReply) return
          pendingReplies.delete(sessionID)

          // Re-check: human might have typed during the delay
          if (waitingForHumanTurnBySession.has(sessionID)) return

          waitingForHumanTurnBySession.add(sessionID)
          pendingSyntheticUserBySession.add(sessionID)
          await deps.sendUserMessage(sessionID, pendingReply)
        }, IDLE_DELAY_MS)

        idleTimers.set(sessionID, timer)
        return
      }

      if (event.type !== "message.updated") return
      const info = event.properties?.info
      if (!info?.sessionID) return

      if (info.role === "user") {
        humanTookOver(info.sessionID)
        return
      }

      if (mode === "off") return
      if (info.role !== "assistant") return
      if (!info.id) return
      if (!info.time?.completed) return
      if (waitingForHumanTurnBySession.has(info.sessionID)) return
      if (seenAssistantMessages.has(info.id)) return

      seenAssistantMessages.add(info.id)

      const text = await deps.loadMessageText(info.sessionID, info.id)
      const classifiedReply = replyForAssistantText(text)
      const reply = classifiedReply ?? (mode === "aggressive" ? "What can we do now to reach the final result in the best way possible?" : undefined)
      if (!reply) return

      // Store pending reply — will be sent on session.idle after delay
      pendingReplies.set(info.sessionID, reply)
    },
  }
}
