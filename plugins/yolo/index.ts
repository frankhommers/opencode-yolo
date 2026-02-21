import type { ChatMessage, PluginApi } from "./types"
import { maybeHandleYoloCommand } from "./commands"

export function createYoloPlugin() {
  return {
    name: "YOLO",
    onMessage: async (api: PluginApi, message: ChatMessage) => {
      if (message.role !== "user") return
      const result = await maybeHandleYoloCommand(message.text)
      if (result.handled) {
        api.log(`YOLO ${result.enabled ? "enabled" : "disabled"}`)
      }
    },
  }
}
