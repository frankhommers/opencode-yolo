const STARTERS = /^(what|why|how|can|could|should|would|which|when|where|who|do|does|did|is|are)\b/i

export function isQuestion(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return value.includes("?") || STARTERS.test(value)
}
