import { isQuestion } from "./isQuestion"

test("detects question mark", () => {
  expect(isQuestion("Can you choose?")).toBe(true)
})

test("detects starters", () => {
  expect(isQuestion("How should we proceed")).toBe(true)
})

test("ignores plain statement", () => {
  expect(isQuestion("Proceeding with implementation")).toBe(false)
})
