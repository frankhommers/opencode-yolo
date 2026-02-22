import { createOpencodeYoloHooks, textFromParts } from "./opencodeCore"
import { readMode, writeMode } from "./state"
import path from "node:path"

export function buildSyntheticUserPrompt(text: string) {
  return {
    noReply: false,
    parts: [{ type: "text", text }],
  }
}

export function resolveProjectStatePath(projectRoot: string) {
  return path.join(projectRoot, ".yolo.json")
}

export default async function YoloPlugin(ctx: any) {
  // ctx.worktree is "/" for non-git projects — always prefer ctx.directory
  const projectRoot = ctx.directory || ctx.worktree
  const statePath = resolveProjectStatePath(projectRoot)

  // serverUrl for direct API calls (SDK v1 lacks question methods)
  const serverUrl = ctx.serverUrl || "http://localhost:4096"

  return createOpencodeYoloHooks({
    readMode: () => readMode("off", statePath),
    writeMode: (mode) => writeMode(mode, statePath),
    loadMessageText: async (sessionID: string, messageID: string) => {
      const result = await ctx.client.session.message({ path: { id: sessionID, messageID } })
      const parts = result?.data?.parts as Array<{ type?: string; text?: string }> | undefined
      return textFromParts(parts)
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      await ctx.client.session.promptAsync({
        path: { id: sessionID },
        body: buildSyntheticUserPrompt(text),
      })
    },
    answerQuestion: async (requestID: string, answers: string[][]) => {
      const res = await fetch(`${serverUrl}/question/${requestID}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) {
        throw new Error(`question.reply failed: ${res.status} ${await res.text()}`)
      }
    },
  })
}
