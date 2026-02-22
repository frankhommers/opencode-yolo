const STARTERS = /^(what|why|how|can|could|should|would|which|when|where|who|do|does|did|is|are)\b/i
const OK_GO_PATTERNS = [
  /\bi(?:\s+will|'ll)\s+proceed\b/i,
  /^next\s+logical\s+step\b/i,
  /\bready\s+for\s+feedback\b/i,
  /\bik\s+ga\s+(nu\s+)?verder\b/i,
  /\bik\s+zal\s+doorgaan\b/i,
  /^volgende\s+logische\s+stap\b/i,
  /\bklaar\s+voor\s+feedback\b/i,
  /\bals\s+je\s+["'“”]?go["'“”]?\s+zegt\b/i,
]
const SOFT_PERMISSION_PATTERNS = [
  /\bif\s+you\s+want\b/i,
  /\bif\s+you'?d\s+like\b/i,
  /\bals\s+dit\s+akkoord\s+is\b/i,
]
const ACTION_REQUEST_PATTERNS = [
  /^(choose|pick|select|confirm|approve)\b/i,
  /^(kies|selecteer|bevestig|ga\s+verder|doe\s+maar)\b/i,
]

export function isQuestion(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return value.includes("?") || STARTERS.test(value)
}

export const PROCEED_REPLY = "Please execute it, so that we reach the final result in the best way possible. Just execute don't ask."
export const DEFAULT_REPLY = "You choose what's best and please execute it so that we reach the final result in the best way possible. Just execute, don't ask."

export function replyForAssistantText(text: string): string | undefined {
  const value = text.trim()
  if (!value) return
  if (OK_GO_PATTERNS.some((pattern) => pattern.test(value))) return PROCEED_REPLY
  if (isQuestion(value)) return DEFAULT_REPLY
  if (ACTION_REQUEST_PATTERNS.some((pattern) => pattern.test(value))) return DEFAULT_REPLY
  if (SOFT_PERMISSION_PATTERNS.some((pattern) => pattern.test(value))) return DEFAULT_REPLY
  return
}
