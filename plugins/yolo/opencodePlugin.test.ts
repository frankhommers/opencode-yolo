import { createOpencodeYoloHooks, IDLE_DELAY_MS, HUMAN_TURN_TIMEOUT_MS, type RuntimeDeps } from "./opencodeCore"
import { DEFAULT_REPLY, PROCEED_REPLY, AGGRESSIVE_FALLBACK } from "./isQuestion"

function makeDeps(overrides: Partial<RuntimeDeps> = {}): RuntimeDeps {
  return {
    readMode: async () => "on",
    writeMode: async () => {},
    loadMessageText: async () => "",
    sendUserMessage: async () => {},
    answerQuestion: async () => {},
    ...overrides,
  }
}

function assistantCompleted(id: string, sessionID: string) {
  return {
    event: {
      type: "message.updated" as const,
      properties: { info: { id, sessionID, role: "assistant", time: { completed: 1 } } },
    },
  }
}

function sessionIdle(sessionID: string) {
  return {
    event: {
      type: "session.idle" as const,
      properties: { sessionID },
    },
  }
}

function userMessageUpdated(id: string, sessionID: string) {
  return {
    event: {
      type: "message.updated" as const,
      properties: { info: { id, sessionID, role: "user" } },
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test("/yolo on command enables mode", async () => {
  const writes: Array<"off" | "on" | "aggressive"> = []
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
    writeMode: async (mode: "off" | "on" | "aggressive") => {
      writes.push(mode)
    },
  }))

  await hooks["chat.message"]!(
    { sessionID: "s-1" },
    {
      message: { id: "u-1", sessionID: "s-1", role: "user" },
      parts: [{ type: "text", text: "/yolo on" }],
    },
  )

  expect(writes).toEqual(["on"])
})

test("auto-reply sent after session.idle + delay", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — classifies reply but does NOT send yet
  await hooks.event!(assistantCompleted("a-1", "s-2"))
  expect(sent).toEqual([])

  // Session goes idle — starts 1s timer
  await hooks.event!(sessionIdle("s-2"))
  expect(sent).toEqual([])

  // Advance past delay
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([{ sessionID: "s-2", text: DEFAULT_REPLY }])
})

test("auto-reply waits for a human turn before sending again", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async (_sessionID: string, messageID: string) => {
      if (messageID === "a-1") return "Should I continue?"
      if (messageID === "a-2") return "Can you confirm?"
      if (messageID === "a-3") return "What should I do now?"
      return ""
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // First assistant message → classify + idle + delay → sent
  await hooks.event!(assistantCompleted("a-1", "s-2"))
  await hooks.event!(sessionIdle("s-2"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)
  expect(sent).toHaveLength(1)

  // Synthetic user message arrives (from our reply)
  await hooks.event!(userMessageUpdated("u-synth", "s-2"))

  // Second assistant message while waiting for human — should be classified but blocked
  await hooks.event!(assistantCompleted("a-2", "s-2"))
  await hooks.event!(sessionIdle("s-2"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)
  expect(sent).toHaveLength(1) // still 1, blocked by waitingForHumanTurn

  // Real human takes over
  await hooks["chat.message"]!(
    { sessionID: "s-2" },
    {
      message: { id: "u-2", sessionID: "s-2", role: "user" },
      parts: [{ type: "text", text: "thanks" }],
    },
  )

  // Third assistant message after human took over — should work
  await hooks.event!(assistantCompleted("a-3", "s-2"))
  await hooks.event!(sessionIdle("s-2"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([
    { sessionID: "s-2", text: DEFAULT_REPLY },
    { sessionID: "s-2", text: DEFAULT_REPLY },
  ])
})

test("sends OK Go for proceed-style assistant statements", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "I'll proceed with that approach and execute the plan task-by-task with checkpoints.",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  await hooks.event!(assistantCompleted("a-okgo", "s-okgo"))
  await hooks.event!(sessionIdle("s-okgo"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([{ sessionID: "s-okgo", text: PROCEED_REPLY }])
})

test("command hook handles /yolo arguments", async () => {
  let mode: "off" | "on" | "aggressive" = "off"
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => mode,
    writeMode: async (next: "off" | "on" | "aggressive") => {
      mode = next
    },
  }))

  const output = { parts: [] as Array<{ type: string; text?: string }> }
  await hooks["command.execute.before"]!({ command: "yolo", sessionID: "s-cmd", arguments: "on" }, output)

  expect(mode).toBe("on")
  expect(output.parts).toEqual([{ type: "text", text: "YOLO mode enabled: normal." }])
})

test("command hook handles /yolo aggressive", async () => {
  let mode: "off" | "on" | "aggressive" = "off"
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => mode,
    writeMode: async (next: "off" | "on" | "aggressive") => {
      mode = next
    },
  }))

  const output = { parts: [] as Array<{ type: string; text?: string }> }
  await hooks["command.execute.before"]!({ command: "yolo", sessionID: "s-cmd-2", arguments: "aggressive" }, output)

  expect(mode).toBe("aggressive")
  expect(output.parts).toEqual([{ type: "text", text: "YOLO mode enabled: aggressive." }])
})

test("denies bash yolo invocations", async () => {
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
  }))

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
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
  }))

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
  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
  }))

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

test("aggressive mode asks continuation prompt for plain assistant updates", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "aggressive",
    loadMessageText: async () => "Ik heb de wijziging toegepast.",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  await hooks.event!(assistantCompleted("a-plain", "s-agg"))
  await hooks.event!(sessionIdle("s-agg"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([{ sessionID: "s-agg", text: "What can we do now to reach the final result in the best way possible?" }])
})

test("human typing during delay cancels pending reply", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes + session idle starts timer
  await hooks.event!(assistantCompleted("a-cancel", "s-cancel"))
  await hooks.event!(sessionIdle("s-cancel"))

  // Human types before delay expires
  await hooks["chat.message"]!(
    { sessionID: "s-cancel" },
    {
      message: { id: "u-cancel", sessionID: "s-cancel", role: "user" },
      parts: [{ type: "text", text: "actually, let me handle this" }],
    },
  )

  // Timer fires but reply should be cancelled
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([])
})

test("no reply sent without session.idle event", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Only message.updated, no session.idle
  await hooks.event!(assistantCompleted("a-noidle", "s-noidle"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS * 5)

  expect(sent).toEqual([])
})

test("self-schedules reply when session.idle fires before message.updated", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Reproduce the real OpenCode event ordering: idle fires BEFORE message.updated
  await hooks.event!(sessionIdle("s-self"))
  await hooks.event!(assistantCompleted("a-self", "s-self"))

  // Self-timer should fire after IDLE_DELAY_MS
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([{ sessionID: "s-self", text: DEFAULT_REPLY }])
})

test("session.status busy cancels pending reply", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  await hooks.event!(assistantCompleted("a-busy", "s-busy"))

  // Session goes busy again before idle fires
  await hooks.event!({
    event: {
      type: "session.status",
      properties: { sessionID: "s-busy", status: { type: "busy" } },
    },
  })

  // Now idle fires, but sequence was bumped by busy
  await hooks.event!(sessionIdle("s-busy"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([])
})

test("session.error suppresses next idle reply", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  await hooks.event!(assistantCompleted("a-err", "s-err"))

  // Error occurs
  await hooks.event!({
    event: {
      type: "session.error",
      properties: { sessionID: "s-err" },
    },
  })

  // Idle fires but should be suppressed due to error
  await hooks.event!(sessionIdle("s-err"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([])
})

test("guard recovers after promptAsync delivery fails silently", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async (_sid: string, mid: string) => {
      if (mid === "a-first") return "Should I continue?"
      if (mid === "a-second") return "What next?"
      if (mid === "a-third") return "Can you confirm?"
      return ""
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
      // Simulate promptAsync silently failing: no user message event arrives
    },
  }))

  // First cycle: classify + idle + delay → sends reply
  await hooks.event!(assistantCompleted("a-first", "s-recover"))
  await hooks.event!(sessionIdle("s-recover"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)
  expect(sent).toHaveLength(1)

  // No user message event arrives (promptAsync failed silently)
  // Second assistant message arrives — blocked by waitingForHumanTurn
  await hooks.event!(assistantCompleted("a-second", "s-recover"))
  await hooks.event!(sessionIdle("s-recover"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)
  expect(sent).toHaveLength(1) // still blocked

  // After HUMAN_TURN_TIMEOUT_MS, guard auto-clears
  await vi.advanceTimersByTimeAsync(HUMAN_TURN_TIMEOUT_MS)

  // Now a new assistant message should work again
  await hooks.event!(assistantCompleted("a-third", "s-recover"))

  // session.idle triggers send after delay
  await hooks.event!(sessionIdle("s-recover"))
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS + 100)

  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual({ sessionID: "s-recover", text: DEFAULT_REPLY })
})

test("question.asked auto-answers with first option", async () => {
  const answered: Array<{ requestID: string; answers: string[][] }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "on",
    answerQuestion: async (requestID: string, answers: string[][]) => {
      answered.push({ requestID, answers })
    },
  }))

  await hooks.event!({
    event: {
      type: "question.asked",
      properties: {
        id: "q-1",
        sessionID: "s-q1",
        questions: [
          {
            question: "Which option?",
            header: "Choose",
            options: [
              { label: "Option A", description: "First" },
              { label: "Option B", description: "Second" },
            ],
          },
        ],
      } as any,
    },
  })

  expect(answered).toEqual([{ requestID: "q-1", answers: [["Option A"]] }])
})

test("question.asked ignored when mode is off", async () => {
  const answered: Array<{ requestID: string; answers: string[][] }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
    answerQuestion: async (requestID: string, answers: string[][]) => {
      answered.push({ requestID, answers })
    },
  }))

  await hooks.event!({
    event: {
      type: "question.asked",
      properties: {
        id: "q-2",
        sessionID: "s-q2",
        questions: [
          {
            question: "Which option?",
            header: "Choose",
            options: [{ label: "Option A", description: "First" }],
          },
        ],
      } as any,
    },
  })

  expect(answered).toEqual([])
})

test("/yolo start sends prompt without changing mode", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "aggressive",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  const output = { parts: [] as any[] }
  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-start", arguments: "start" },
    output,
  )

  // Timer fires after IDLE_DELAY_MS
  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS)

  expect(sent).toEqual([{ sessionID: "s-start", text: AGGRESSIVE_FALLBACK }])
  expect(output.parts[0].text).toBe("YOLO: kicking off work.")
})

test("/yolo start does nothing when mode is off", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => "off",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  const output = { parts: [] as any[] }
  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-start-off", arguments: "start" },
    output,
  )

  await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS * 5)

  expect(sent).toEqual([])
  expect(output.parts[0].text).toContain("off")
})
