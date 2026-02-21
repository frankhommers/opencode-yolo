export type ChatRole = "user" | "assistant" | "system" | "tool"

export interface ChatMessage {
  id?: string
  role: ChatRole
  text: string
  createdAt?: number
  source?: string
}

export interface PluginApi {
  sendUserMessage: (text: string, meta?: Record<string, string>) => Promise<void>
  log: (message: string) => void
}
