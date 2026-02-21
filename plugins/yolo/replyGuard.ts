import type { ChatMessage } from "./types"

function keyFor(message: ChatMessage): string {
  if (message.id) return `id:${message.id}`
  return `sig:${message.role}:${message.createdAt ?? "none"}:${message.text}`
}

export function createReplyGuard() {
  const seen = new Set<string>()

  return {
    hasSeen(message: ChatMessage): boolean {
      return seen.has(keyFor(message))
    },
    markSeen(message: ChatMessage): void {
      seen.add(keyFor(message))
    },
  }
}
