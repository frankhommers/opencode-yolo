import { readMode, writeMode, type YoloMode } from "./state"

export interface YoloCommandResult {
  handled: boolean
  enabled?: boolean
  aggressive?: boolean
  mode?: YoloMode
}

interface CommandDeps {
  readMode: () => Promise<YoloMode>
  writeMode: (mode: YoloMode) => Promise<void>
}

const defaultDeps: CommandDeps = {
  readMode: async () => readMode(),
  writeMode,
}

function resultForMode(mode: YoloMode): YoloCommandResult {
  return {
    handled: true,
    enabled: mode !== "off",
    aggressive: mode === "aggressive",
    mode,
  }
}

export async function maybeHandleYoloCommand(
  text: string,
  deps: CommandDeps = defaultDeps,
): Promise<YoloCommandResult> {
  const value = text.trim().toLowerCase()

  if (value === "/yolo") {
    const current = await deps.readMode()
    const next: YoloMode = current === "off" ? "on" : "off"
    await deps.writeMode(next)
    return resultForMode(next)
  }

  if (value === "/yolo on") {
    await deps.writeMode("on")
    return resultForMode("on")
  }

  if (value === "/yolo aggressive") {
    await deps.writeMode("aggressive")
    return resultForMode("aggressive")
  }

  if (value === "/yolo off") {
    await deps.writeMode("off")
    return resultForMode("off")
  }

  if (value === "/yolo status") {
    return resultForMode(await deps.readMode())
  }

  return { handled: false }
}
