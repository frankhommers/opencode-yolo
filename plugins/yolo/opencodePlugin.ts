import { createOpencodeYoloHooks, textFromParts } from "./opencodeCore"
import { readEnabled, writeEnabled } from "./state"
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
  const statePath = resolveProjectStatePath(ctx.worktree || ctx.directory)

  return createOpencodeYoloHooks({
    readEnabled: () => readEnabled(false, statePath),
    writeEnabled: (enabled: boolean) => writeEnabled(enabled, statePath),
    loadMessageText: async (sessionID: string, messageID: string) => {
      const result = await ctx.client.session.message({ path: { id: sessionID, messageID } })
      const parts = result?.data?.parts as Array<{ type?: string; text?: string }> | undefined
      return textFromParts(parts)
    },
    sendUserMessage: async (sessionID: string, text: string) => {
      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: buildSyntheticUserPrompt(text),
      })
    },
  })
}
