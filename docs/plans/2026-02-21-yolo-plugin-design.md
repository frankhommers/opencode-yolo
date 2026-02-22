# YOLO Plugin Design

## Goal

Create an OpenCode plugin named `YOLO` that automatically answers assistant clarification questions with a fixed reply: `You choose what's best`.

## Scope

- Detect assistant questions from generated assistant messages.
- Inject a synthetic user reply with the fixed text.
- Prevent duplicate replies and loop behavior.
- Keep behavior minimal and deterministic.

## Non-Goals

- Rewriting assistant messages.
- Handling arbitrary conversational intent.
- Advanced NLP classification.

## Chosen Approach

Use an assistant-message hook and apply lightweight question detection:

1. Listen for newly created assistant messages.
2. Evaluate message text with `isQuestion(text)`.
3. If true and not previously handled, inject one synthetic user message:
   - `You choose what's best`
4. Record message identity in a de-dup set.

This approach is preferred over always-responding because it preserves normal flows and reduces noise.

## Question Detection

`isQuestion(text)` returns true when either condition matches:

- Message contains `?`
- Message starts with common question starters (case-insensitive), for example:
  - `what`, `why`, `how`, `can`, `could`, `should`, `would`, `which`, `when`, `where`, `who`, `do`, `does`, `did`, `is`, `are`

## Loop and Noise Prevention

- Ignore messages that are not authored by `assistant`.
- Ignore plugin-generated messages tagged as YOLO source.
- Track handled assistant message IDs to avoid duplicate injection.
- If an ID is unavailable, use a fallback key from text+timestamp.
- Optional short cooldown (for example 2 seconds) between injections.

## Failure Handling

- Empty assistant text: skip.
- Injection failure: log once per event and do not retry in a loop.
- Unexpected payload shape: skip safely.

## Testing Strategy

### Unit

- `isQuestion()` positive and negative cases.
- De-dup guard: same assistant message handled once.

### Integration

- Assistant question -> one injected YOLO reply.
- Assistant non-question -> no reply.
- YOLO-injected reply does not self-trigger.

## Success Criteria

- Assistant clarification questions receive exactly one auto-answer.
- No infinite recursion.
- Minimal false positives on non-question assistant text.
