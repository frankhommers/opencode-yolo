import { createOpencodeYoloHooks, IDLE_DELAY_MS, WATCHDOG_STALE_MS, HUMAN_TURN_TIMEOUT_MS, type RuntimeDeps } from "./opencodeCore"
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

test("auto-reply sent on session.idle", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — classifies and stores pending reply (does NOT send yet)
  await hooks.event!(assistantCompleted("a-1", "s-2"))
  expect(sent).toEqual([])

  // session.idle delivers immediately
  await hooks.event!(sessionIdle("s-2"))
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

  // First assistant message → classify + idle → sent
  await hooks.event!(assistantCompleted("a-1", "s-2"))
  await hooks.event!(sessionIdle("s-2"))
  expect(sent).toHaveLength(1)

  // Synthetic user message arrives (from our reply)
  await hooks.event!(userMessageUpdated("u-synth", "s-2"))

  // Second assistant message while waiting for human — should be classified but blocked
  await hooks.event!(assistantCompleted("a-2", "s-2"))
  await hooks.event!(sessionIdle("s-2"))
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

  expect(sent).toEqual([
    { sessionID: "s-2", text: DEFAULT_REPLY },
    { sessionID: "s-2", text: DEFAULT_REPLY },
  ])
})

test("sends proceed reply for proceed-style assistant statements", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "I'll proceed with that approach and execute the plan task-by-task with checkpoints.",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  await hooks.event!(assistantCompleted("a-okgo", "s-okgo"))
  await hooks.event!(sessionIdle("s-okgo"))

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

  expect(sent).toEqual([{ sessionID: "s-agg", text: "What can we do now to reach the final result in the best way possible?" }])
})

test("human typing before session.idle cancels pending reply", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — stores pending reply
  await hooks.event!(assistantCompleted("a-cancel", "s-cancel"))
  expect(sent).toEqual([])

  // Human types before session turns idle — cancels pending reply
  await hooks["chat.message"]!(
    { sessionID: "s-cancel" },
    {
      message: { id: "u-cancel", sessionID: "s-cancel", role: "user" },
      parts: [{ type: "text", text: "actually, let me handle this" }],
    },
  )

  // Idle now fires, but pending reply was cancelled by human
  await hooks.event!(sessionIdle("s-cancel"))

  expect(sent).toEqual([])
})

test("reply NOT sent without session.idle", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Only message.updated, no session.idle — reply should NOT be sent
  await hooks.event!(assistantCompleted("a-noidle", "s-noidle"))
  vi.advanceTimersByTime(IDLE_DELAY_MS * 10)

  expect(sent).toEqual([])
})

test("idle-before-message.updated: reply waits for next idle", async () => {
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

  // Reply is stored but not sent (idle already passed)
  expect(sent).toEqual([])

  // Next idle triggers delivery
  await hooks.event!(sessionIdle("s-self"))

  expect(sent).toEqual([{ sessionID: "s-self", text: DEFAULT_REPLY }])
})

test("session.status busy before idle cancels pending reply", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes, stores pending reply
  await hooks.event!(assistantCompleted("a-busy", "s-busy"))

  // Session goes busy before idle — cancels the pending reply
  await hooks.event!({
    event: {
      type: "session.status",
      properties: { sessionID: "s-busy", status: { type: "busy" } },
    },
  })

  // Idle fires, but reply was already cancelled by busy
  await hooks.event!(sessionIdle("s-busy"))
  expect(sent).toEqual([])
})

test("session.error suppresses idle delivery", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes, stores pending reply
  await hooks.event!(assistantCompleted("a-err", "s-err"))

  // Error occurs — cancels pending reply
  await hooks.event!({
    event: {
      type: "session.error",
      properties: { sessionID: "s-err" },
    },
  })

  // Idle fires, but error suppression blocks delivery
  await hooks.event!(sessionIdle("s-err"))

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

  // First cycle: classify + idle → sends reply
  await hooks.event!(assistantCompleted("a-first", "s-recover"))
  await hooks.event!(sessionIdle("s-recover"))
  expect(sent).toHaveLength(1)

  // No user message event arrives (promptAsync failed silently)
  // Second assistant message arrives — blocked by waitingForHumanTurn
  await hooks.event!(assistantCompleted("a-second", "s-recover"))
  await hooks.event!(sessionIdle("s-recover"))
  expect(sent).toHaveLength(1) // still blocked

  // After HUMAN_TURN_TIMEOUT_MS, guard auto-clears
  vi.advanceTimersByTime(HUMAN_TURN_TIMEOUT_MS)

  // Now a new assistant message should work again
  await hooks.event!(assistantCompleted("a-third", "s-recover"))

  // session.idle triggers delivery immediately
  await hooks.event!(sessionIdle("s-recover"))

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

test("/yolo start sends prompt after idle without changing mode", async () => {
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

  // Not sent yet — waiting for session.idle
  expect(sent).toEqual([])
  expect(output.parts[0].text).toBe("YOLO: kicking off work.")

  // session.idle triggers delivery immediately
  await hooks.event!(sessionIdle("s-start"))

  expect(sent).toEqual([{ sessionID: "s-start", text: AGGRESSIVE_FALLBACK }])
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

  vi.advanceTimersByTime(IDLE_DELAY_MS * 5)

  expect(sent).toEqual([])
  expect(output.parts[0].text).toContain("off")
})

test("watchdog delivers stale pending reply when timer fails to fire", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — stores pending reply
  await hooks.event!(assistantCompleted("a-wd", "s-wd"))
  expect(sent).toEqual([])

  // No session.idle fires. Simulate time passing.
  vi.advanceTimersByTime(WATCHDOG_STALE_MS + 100)

  // A random event arrives — watchdog should detect the stale reply and deliver
  await hooks.event!({
    event: {
      type: "session.updated",
      properties: { sessionID: "s-wd" },
    },
  })

  expect(sent).toEqual([{ sessionID: "s-wd", text: DEFAULT_REPLY }])
})

test("watchdog does not deliver if reply is not yet stale", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — stores pending reply
  await hooks.event!(assistantCompleted("a-wd2", "s-wd2"))

  // Only advance a little — not yet stale
  vi.advanceTimersByTime(WATCHDOG_STALE_MS - 500)

  // Random event — watchdog should NOT deliver yet
  await hooks.event!({
    event: {
      type: "session.updated",
      properties: { sessionID: "s-wd2" },
    },
  })

  expect(sent).toEqual([])
})

test("watchdog respects waitingForHumanTurn guard", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []

  const hooks = await createOpencodeYoloHooks(makeDeps({
    loadMessageText: async (_sid: string, mid: string) => {
      if (mid === "a-wd3a") return "Should I continue?"
      if (mid === "a-wd3b") return "What next?"
      return ""
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // First cycle: idle delivers immediately
  await hooks.event!(assistantCompleted("a-wd3a", "s-wd3"))
  await hooks.event!(sessionIdle("s-wd3"))
  expect(sent).toHaveLength(1)

  // Synthetic user message arrives (from our reply) — sets waitingForHumanTurn
  await hooks.event!(userMessageUpdated("u-synth-wd", "s-wd3"))

  // Second assistant message while waiting for human
  await hooks.event!(assistantCompleted("a-wd3b", "s-wd3"))

  // Wait for watchdog to consider it stale
  vi.advanceTimersByTime(WATCHDOG_STALE_MS + 100)

  // Random event — watchdog should NOT deliver because waitingForHumanTurn
  await hooks.event!({
    event: {
      type: "session.updated",
      properties: { sessionID: "s-wd3" },
    },
  })

  expect(sent).toHaveLength(1) // still only the first reply
})

test("delivery aborted when mode switched to off before idle fires", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []
  let currentMode: "off" | "on" | "aggressive" = "on"

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => currentMode,
    writeMode: async (m: "off" | "on" | "aggressive") => { currentMode = m },
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — stores pending reply
  await hooks.event!(assistantCompleted("a-off", "s-off"))
  expect(sent).toEqual([])

  // User turns yolo off before delivery
  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-off", arguments: "off" },
    { parts: [] },
  )

  // Now idle fires — should NOT deliver because mode is off
  await hooks.event!(sessionIdle("s-off"))

  expect(sent).toEqual([])
})

test("watchdog respects mode off", async () => {
  const sent: Array<{ sessionID: string; text: string }> = []
  let currentMode: "off" | "on" | "aggressive" = "on"

  const hooks = await createOpencodeYoloHooks(makeDeps({
    readMode: async () => currentMode,
    writeMode: async (m: "off" | "on" | "aggressive") => { currentMode = m },
    loadMessageText: async () => "Should I continue?",
    sendUserMessage: async (sessionID: string, text: string) => {
      sent.push({ sessionID, text })
    },
  }))

  // Assistant completes — stores pending reply
  await hooks.event!(assistantCompleted("a-wdoff", "s-wdoff"))

  // User turns yolo off
  await hooks["command.execute.before"]!(
    { command: "yolo", sessionID: "s-wdoff", arguments: "off" },
    { parts: [] },
  )

  // Wait for watchdog stale threshold
  vi.advanceTimersByTime(WATCHDOG_STALE_MS + 100)

  // Random event — watchdog should NOT deliver because mode is off
  await hooks.event!({
    event: {
      type: "session.updated",
      properties: { sessionID: "s-wdoff" },
    },
  })

  expect(sent).toEqual([])
})
