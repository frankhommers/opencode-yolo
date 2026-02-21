import type { ChatMessage, PluginApi } from "./types"

export function createYoloPlugin() {
  return {
    name: "YOLO",
    onMessage: async (_api: PluginApi, _message: ChatMessage) => {},
  }
}
