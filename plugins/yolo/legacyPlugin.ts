import type { ChatMessage, PluginApi } from "./types"
import { maybeHandleYoloCommand } from "./commands"
import { isQuestion } from "./isQuestion"
import { createReplyGuard } from "./replyGuard"

interface CreateYoloPluginOptions {
  initialEnabled?: boolean
}

export function createYoloPlugin(options: CreateYoloPluginOptions = {}) {
  const guard = createReplyGuard()
  let enabled = options.initialEnabled ?? false
  let waitingForHumanTurn = false

  return {
    name: "YOLO",
    onMessage: async (api: PluginApi, message: ChatMessage) => {
      if (message.role === "user") {
        if (message.source !== "yolo-plugin") {
          waitingForHumanTurn = false
        }

        const result = await maybeHandleYoloCommand(message.text)
        if (!result.handled) return

        if (typeof result.enabled === "boolean") {
          enabled = result.enabled
        }
        api.log(`YOLO ${enabled ? "enabled" : "disabled"}`)
        return
      }

      if (!enabled) return
      if (message.role !== "assistant") return
      if (message.source === "yolo-plugin") return
      if (waitingForHumanTurn) return
      if (!isQuestion(message.text)) return
      if (guard.hasSeen(message)) return

      waitingForHumanTurn = true
      await api.sendUserMessage("You choose what's best", { source: "yolo-plugin" })
      guard.markSeen(message)
    },
  }
}
