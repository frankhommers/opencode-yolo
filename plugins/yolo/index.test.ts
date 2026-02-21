import { createYoloPlugin } from "./index"
import type { ChatMessage, PluginApi } from "./types"

test("plugin exposes name and handlers", () => {
  const plugin = createYoloPlugin()
  expect(plugin.name).toBe("YOLO")
  expect(typeof plugin.onMessage).toBe("function")
})

function createApi() {
  const sent: Array<{ text: string; meta?: Record<string, string> }> = []
  const api: PluginApi = {
    sendUserMessage: async (text, meta) => {
      sent.push({ text, meta })
    },
    log: () => {},
  }
  return { api, sent }
}

test("assistant question injects exactly one user reply", async () => {
  const plugin = createYoloPlugin({ initialEnabled: true })
  const { api, sent } = createApi()
  const message: ChatMessage = { id: "q-1", role: "assistant", text: "How should we proceed?" }

  await plugin.onMessage(api, message)

  expect(sent).toEqual([{ text: "You choose what's best", meta: { source: "yolo-plugin" } }])
})

test("same assistant message does not inject again", async () => {
  const plugin = createYoloPlugin({ initialEnabled: true })
  const { api, sent } = createApi()
  const message: ChatMessage = { id: "q-2", role: "assistant", text: "Can you decide?" }

  await plugin.onMessage(api, message)
  await plugin.onMessage(api, message)

  expect(sent).toHaveLength(1)
})

test("plugin-sourced messages are ignored", async () => {
  const plugin = createYoloPlugin({ initialEnabled: true })
  const { api, sent } = createApi()
  const message: ChatMessage = {
    id: "q-3",
    role: "assistant",
    text: "Should I continue?",
    source: "yolo-plugin",
  }

  await plugin.onMessage(api, message)

  expect(sent).toHaveLength(0)
})
