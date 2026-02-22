import { createOpencodeYoloHooks } from "./opencodeCore"

test("/yolo on command enables mode", async () => {
  const writes: boolean[] = []
  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => false,
    writeEnabled: async (enabled: boolean) => {
      writes.push(enabled)
    },
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
  })

  await hooks["chat.message"]!(
    { sessionID: "s-1" },
    {
      message: { id: "u-1", sessionID: "s-1", role: "user" },
      parts: [{ type: "text", text: "/yolo on" }],
    },
  )

  expect(writes).toEqual([true])
})

test("auto-reply waits for a human turn", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => true,
    writeEnabled: async () => {},
    loadMessageText: async (_sessionID: string, messageID: string) => {
      if (messageID === "a-1") return "Should I continue?"
      if (messageID === "a-2") return "Can you confirm?"
      if (messageID === "a-3") return "What should I do now?"
      return ""
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  })

  await hooks.event!({
    event: {
      type: "message.updated",
      properties: { info: { id: "a-1", sessionID: "s-2", role: "assistant", time: { completed: 1 } } },
    },
  })

  await hooks.event!({
    event: { type: "message.updated", properties: { info: { id: "u-synth", sessionID: "s-2", role: "user" } } },
  })

  await hooks.event!({
    event: {
      type: "message.updated",
      properties: { info: { id: "a-2", sessionID: "s-2", role: "assistant", time: { completed: 1 } } },
    },
  })

  await hooks["chat.message"]!(
    { sessionID: "s-2" },
    {
      message: { id: "u-2", sessionID: "s-2", role: "user" },
      parts: [{ type: "text", text: "thanks" }],
    },
  )

  await hooks.event!({
    event: {
      type: "message.updated",
      properties: { info: { id: "a-3", sessionID: "s-2", role: "assistant", time: { completed: 1 } } },
    },
  })

  expect(sent).toEqual([
    { sessionID: "s-2", text: "You choose what's best" },
    { sessionID: "s-2", text: "You choose what's best" },
  ])
})

test("sends OK Go for proceed-style assistant statements", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => true,
    writeEnabled: async () => {},
    loadMessageText: async () => "I'll proceed with that approach and execute the plan task-by-task with checkpoints.",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  })

  await hooks.event!({
    event: {
      type: "message.updated",
      properties: { info: { id: "a-okgo", sessionID: "s-okgo", role: "assistant", time: { completed: 1 } } },
    },
  })

  expect(sent).toEqual([{ sessionID: "s-okgo", text: "OK Go" }])
})

test("command hook handles /yolo arguments", async () => {
  let value = false
  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => value,
    writeEnabled: async (enabled: boolean) => {
      value = enabled
    },
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
  })

  const output = { parts: [] as Array<{ type: string; text?: string }> }
  await hooks["command.execute.before"]!({ command: "yolo", sessionID: "s-cmd", arguments: "on" }, output)

  expect(value).toBe(true)
  expect(output.parts).toEqual([
    { type: "text", text: "YOLO mode enabled." },
  ])
})

test("denies bash yolo invocations", async () => {
  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => false,
    writeEnabled: async () => {},
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
  })

  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-3", arguments: "status" },
    { parts: [] },
  )

  const permission = { status: "ask" as const }
  await hooks["permission.ask"]!(
    {
      type: "bash",
      pattern: "yolo status",
      sessionID: "s-3",
    },
    permission,
  )

  expect(permission.status).toBe("deny")

  await hooks.event!({
    event: {
      type: "command.executed",
      properties: { name: "yolo", sessionID: "s-3", arguments: "status", messageID: "m-done" },
    },
  })

  const after = { status: "ask" as const }
  await hooks["permission.ask"]!(
    {
      type: "bash",
      pattern: "yolo status",
      sessionID: "s-3",
    },
    after,
  )

  expect(after.status).toBe("deny")

  const yoloPatternOnly = { status: "ask" as const }
  await hooks["permission.ask"]!(
    {
      type: "bash",
      pattern: "yolo status",
      sessionID: "s-other",
    },
    yoloPatternOnly,
  )

  expect(yoloPatternOnly.status).toBe("deny")
})

test("denies task tool while /yolo command is active", async () => {
  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => false,
    writeEnabled: async () => {},
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
  })

  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-4", arguments: "status" },
    { parts: [] },
  )

  const permission = { status: "ask" as const }
  await hooks["permission.ask"]!(
    {
      type: "task",
      sessionID: "s-4",
    },
    permission,
  )

  expect(permission.status).toBe("deny")
})

test("rewrites bash execution to no-op while /yolo command is active", async () => {
  const hooks = await createOpencodeYoloHooks({
    readEnabled: async () => false,
    writeEnabled: async () => {},
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
  })

  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-5", arguments: "status" },
    { parts: [] },
  )

  const toolOutput = { args: { command: "status" } }
  await hooks["tool.execute.before"]!(
    {
      tool: "bash",
      sessionID: "s-5",
      callID: "call-1",
    },
    toolOutput,
  )

  expect(toolOutput.args).toMatchObject({
    command: ":",
    description: "No-op during yolo command",
  })
})
