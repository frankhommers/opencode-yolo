import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readEnabled, writeEnabled } from "./state"

test("default state path is project-local .yolo.json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-cwd-"))
  const previousCwd = process.cwd()

  try {
    process.chdir(dir)
    await writeEnabled(true)
    await expect(readEnabled(false)).resolves.toBe(true)
    await expect(readEnabled(false, path.join(dir, ".yolo.json"))).resolves.toBe(true)
  } finally {
    process.chdir(previousCwd)
    await rm(dir, { recursive: true, force: true })
  }
})

test("writeEnabled persists true", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-"))
  const filePath = path.join(dir, "yolo.json")

  try {
    await writeEnabled(true, filePath)
    await expect(readEnabled(false, filePath)).resolves.toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("readEnabled returns default when file missing", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yolo-state-"))
  const filePath = path.join(dir, "missing.json")

  try {
    await expect(readEnabled(false, filePath)).resolves.toBe(false)
    await expect(readEnabled(true, filePath)).resolves.toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
