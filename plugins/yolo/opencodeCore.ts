import { maybeHandleYoloCommand } from "./commands"
import { replyForAssistantText } from "./isQuestion"

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
  readEnabled: () => Promise<boolean>
  writeEnabled: (enabled: boolean) => Promise<void>
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

export async function createOpencodeYoloHooks(deps: RuntimeDeps) {
  let enabled = await deps.readEnabled()
  let waitingForHumanTurn = false
  const seenAssistantMessages = new Set<string>()
  const pendingSyntheticUserBySession = new Set<string>()
  const activeYoloCommandSessions = new Set<string>()

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
        readEnabled: deps.readEnabled,
        writeEnabled: deps.writeEnabled,
      })
      if (result.handled && typeof result.enabled === "boolean") {
        enabled = result.enabled
      }

      const statusLine = enabled ? "YOLO mode enabled." : "YOLO mode disabled."
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
        if (pendingSyntheticUserBySession.has(sessionID)) {
          pendingSyntheticUserBySession.delete(sessionID)
        } else {
          waitingForHumanTurn = false
        }
      } else {
        waitingForHumanTurn = false
      }

      const text = textFromParts(output.parts)
      if (!text) return

      const result = await maybeHandleYoloCommand(text, {
        readEnabled: deps.readEnabled,
        writeEnabled: deps.writeEnabled,
      })

      if (result.handled && typeof result.enabled === "boolean") {
        enabled = result.enabled
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

      if (event.type !== "message.updated") return
      const info = event.properties?.info
      if (!info?.sessionID) return

      if (info.role === "user") {
        if (pendingSyntheticUserBySession.has(info.sessionID)) {
          pendingSyntheticUserBySession.delete(info.sessionID)
        } else {
          waitingForHumanTurn = false
        }
        return
      }

      if (!enabled) return
      if (info.role !== "assistant") return
      if (!info.id) return
      if (!info.time?.completed) return
      if (waitingForHumanTurn) return
      if (seenAssistantMessages.has(info.id)) return

      seenAssistantMessages.add(info.id)

      const text = await deps.loadMessageText(info.sessionID, info.id)
      const reply = replyForAssistantText(text)
      if (!reply) return

      waitingForHumanTurn = true
      pendingSyntheticUserBySession.add(info.sessionID)
      await deps.sendUserMessage(info.sessionID, reply)
    },
  }
}
