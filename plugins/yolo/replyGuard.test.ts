import { createReplyGuard } from "./replyGuard"

test("marks and detects seen assistant message by id", () => {
  const guard = createReplyGuard()
  const message = { id: "m-1", role: "assistant" as const, text: "How should we proceed?" }

  expect(guard.hasSeen(message)).toBe(false)
  guard.markSeen(message)
  expect(guard.hasSeen(message)).toBe(true)
})

test("uses message signature when id missing", () => {
  const guard = createReplyGuard()
  const message = { role: "assistant" as const, text: "Can you choose?", createdAt: 123 }

  expect(guard.hasSeen(message)).toBe(false)
  guard.markSeen(message)
  expect(guard.hasSeen(message)).toBe(true)
})
