import { promises as fs } from "node:fs"
import path from "node:path"

function defaultStatePath() {
  return path.join(process.cwd(), ".yolo.json")
}

interface StateFile {
  enabled?: boolean
}

export async function readEnabled(defaultValue = false, filePath = defaultStatePath()): Promise<boolean> {
  try {
    const data = await fs.readFile(filePath, "utf8")
    const parsed = JSON.parse(data) as StateFile
    return typeof parsed.enabled === "boolean" ? parsed.enabled : defaultValue
  } catch {
    return defaultValue
  }
}

export async function writeEnabled(enabled: boolean, filePath = defaultStatePath()): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify({ enabled }, null, 2), "utf8")
}
