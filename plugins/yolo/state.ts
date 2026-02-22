import { promises as fs } from "node:fs"
import path from "node:path"

function defaultStatePath() {
  return path.join(process.cwd(), ".yolo.json")
}

interface StateFile {
  enabled?: boolean
  aggressive?: boolean
}

export type YoloMode = "off" | "on" | "aggressive"

function modeToState(mode: YoloMode): Required<StateFile> {
  return {
    enabled: mode !== "off",
    aggressive: mode === "aggressive",
  }
}

function stateToMode(state: StateFile, defaultValue: YoloMode): YoloMode {
  if (typeof state.aggressive === "boolean") {
    return state.aggressive ? "aggressive" : state.enabled ? "on" : "off"
  }
  if (typeof state.enabled === "boolean") {
    return state.enabled ? "on" : "off"
  }
  return defaultValue
}

export async function readMode(defaultValue: YoloMode = "off", filePath = defaultStatePath()): Promise<YoloMode> {
  try {
    const data = await fs.readFile(filePath, "utf8")
    const parsed = JSON.parse(data) as StateFile
    return stateToMode(parsed, defaultValue)
  } catch {
    return defaultValue
  }
}

export async function writeMode(mode: YoloMode, filePath = defaultStatePath()): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(modeToState(mode), null, 2), "utf8")
}

