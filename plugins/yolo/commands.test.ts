import { maybeHandleYoloCommand } from "./commands"

test("/yolo on enables mode and persists", async () => {
  let value = false
  const result = await maybeHandleYoloCommand("/yolo on", {
    readEnabled: async () => value,
    writeEnabled: async (enabled) => {
      value = enabled
    },
  })

  expect(result).toEqual({ handled: true, enabled: true })
  expect(value).toBe(true)
})

test("/yolo off disables mode and persists", async () => {
  let value = true
  const result = await maybeHandleYoloCommand("/yolo off", {
    readEnabled: async () => value,
    writeEnabled: async (enabled) => {
      value = enabled
    },
  })

  expect(result).toEqual({ handled: true, enabled: false })
  expect(value).toBe(false)
})

test("/yolo status returns current state", async () => {
  const result = await maybeHandleYoloCommand("/yolo status", {
    readEnabled: async () => true,
    writeEnabled: async () => {},
  })

  expect(result).toEqual({ handled: true, enabled: true })
})
