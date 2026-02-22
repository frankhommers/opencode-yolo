import { createYoloPlugin } from "./legacyPlugin"
import { DEFAULT_REPLY } from "./isQuestion"
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

  expect(sent).toEqual([{ text: DEFAULT_REPLY, meta: { source: "yolo-plugin" } }])
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

test("smoke: on -> question -> off flow", async () => {
  const plugin = createYoloPlugin()
  const { api, sent } = createApi()

  await plugin.onMessage(api, { role: "user", text: "/yolo on" })
  await plugin.onMessage(api, { id: "s-1", role: "assistant", text: "Can you decide?" })
  await plugin.onMessage(api, { role: "user", text: "/yolo off" })
  await plugin.onMessage(api, { id: "s-2", role: "assistant", text: "Should I continue?" })

  expect(sent).toHaveLength(1)
  expect(sent[0]).toEqual({ text: DEFAULT_REPLY, meta: { source: "yolo-plugin" } })
})

test("does not auto-reply repeatedly without a human turn", async () => {
  const plugin = createYoloPlugin({ initialEnabled: true })
  const { api, sent } = createApi()

  await plugin.onMessage(api, { id: "loop-1", role: "assistant", text: "What should I do?" })
  await plugin.onMessage(api, { id: "loop-2", role: "assistant", text: "Can you clarify?" })

  expect(sent).toEqual([{ text: DEFAULT_REPLY, meta: { source: "yolo-plugin" } }])
})
