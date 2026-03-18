import { maybeHandleYoloCommand } from "./commands"

test("/yolo on enables mode and persists", async () => {
  let mode: "off" | "on" | "aggressive" = "off"
  const result = await maybeHandleYoloCommand("/yolo on", {
    readMode: async () => mode,
    writeMode: async (next) => {
      mode = next
    },
  })

  expect(result).toEqual({ handled: true, enabled: true, aggressive: false, mode: "on" })
  expect(mode).toBe("on")
})

test("/yolo off disables mode and persists", async () => {
  let mode: "off" | "on" | "aggressive" = "on"
  const result = await maybeHandleYoloCommand("/yolo off", {
    readMode: async () => mode,
    writeMode: async (next) => {
      mode = next
    },
  })

  expect(result).toEqual({ handled: true, enabled: false, aggressive: false, mode: "off" })
  expect(mode).toBe("off")
})

test("/yolo status returns current state", async () => {
  const result = await maybeHandleYoloCommand("/yolo status", {
    readMode: async () => "on",
    writeMode: async () => {},
  })

  expect(result).toEqual({ handled: true, enabled: true, aggressive: false, mode: "on" })
})

test("/yolo toggles mode", async () => {
  let mode: "off" | "on" | "aggressive" = "off"

  const first = await maybeHandleYoloCommand("/yolo", {
    readMode: async () => mode,
    writeMode: async (next) => {
      mode = next
    },
  })

  const second = await maybeHandleYoloCommand("/yolo", {
    readMode: async () => mode,
    writeMode: async (next) => {
      mode = next
    },
  })

  expect(first).toEqual({ handled: true, enabled: true, aggressive: false, mode: "on" })
  expect(second).toEqual({ handled: true, enabled: false, aggressive: false, mode: "off" })
})

test("/yolo aggressive enables aggressive mode", async () => {
  let mode: "off" | "on" | "aggressive" = "off"

  const result = await maybeHandleYoloCommand("/yolo aggressive", {
    readMode: async () => mode,
    writeMode: async (next) => {
      mode = next
    },
  })

  expect(result).toEqual({ handled: true, enabled: true, aggressive: true, mode: "aggressive" })
  expect(mode).toBe("aggressive")
})
