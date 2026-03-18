import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readMode, writeMode } from "./state"

test("default state path is project-local .yolo.json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-cwd-"))
  const previousCwd = process.cwd()

  try {
    process.chdir(dir)
    await writeMode("on")
    await expect(readMode("off")).resolves.toBe("on")
    await expect(readMode("off", path.join(dir, ".yolo.json"))).resolves.toBe("on")
  } finally {
    process.chdir(previousCwd)
    await rm(dir, { recursive: true, force: true })
  }
})

test("writeMode persists on", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-"))
  const filePath = path.join(dir, "yolo.json")

  try {
    await writeMode("on", filePath)
    await expect(readMode("off", filePath)).resolves.toBe("on")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("writeMode persists aggressive", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-"))
  const filePath = path.join(dir, "yolo.json")

  try {
    await writeMode("aggressive", filePath)
    await expect(readMode("off", filePath)).resolves.toBe("aggressive")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("readMode returns default when file missing", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-"))
  const filePath = path.join(dir, "missing.json")

  try {
    await expect(readMode("off", filePath)).resolves.toBe("off")
    await expect(readMode("on", filePath)).resolves.toBe("on")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
