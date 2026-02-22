import { readEnabled, writeEnabled } from "./state"

export interface YoloCommandResult {
  handled: boolean
  enabled?: boolean
}

interface CommandDeps {
  readEnabled: () => Promise<boolean>
  writeEnabled: (enabled: boolean) => Promise<void>
}

const defaultDeps: CommandDeps = {
  readEnabled: async () => readEnabled(),
  writeEnabled,
}

export async function maybeHandleYoloCommand(
  text: string,
  deps: CommandDeps = defaultDeps,
): Promise<YoloCommandResult> {
  const value = text.trim().toLowerCase()

  if (value === "/yolo") {
    const current = await deps.readEnabled()
    const next = !current
    await deps.writeEnabled(next)
    return { handled: true, enabled: next }
  }

  if (value === "/yolo on") {
    await deps.writeEnabled(true)
    return { handled: true, enabled: true }
  }

  if (value === "/yolo off") {
    await deps.writeEnabled(false)
    return { handled: true, enabled: false }
  }

  if (value === "/yolo status") {
    return { handled: true, enabled: await deps.readEnabled() }
  }

  return { handled: false }
}
