import path from "node:path"
import { buildSyntheticUserPrompt, resolveProjectStatePath } from "./opencodePlugin"

test("synthetic user prompt requests assistant continuation", () => {
  const body = buildSyntheticUserPrompt("You choose what's best")

  expect(body).toEqual({
    noReply: false,
    parts: [{ type: "text", text: "You choose what's best" }],
  })
})

test("project state path uses project root .yolo.json", () => {
  expect(resolveProjectStatePath("/tmp/my-project")).toBe(path.join("/tmp/my-project", ".yolo.json"))
})
