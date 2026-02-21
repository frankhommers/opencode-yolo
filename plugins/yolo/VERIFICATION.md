# Verification Notes (2026-02-21)

- Full test suite passes with 14 tests.
- Smoke flow verified in automated test (`smoke: on -> question -> off flow`):
  1. `/yolo on`
  2. assistant asks a question
  3. plugin injects one `You choose what's best`
  4. `/yolo off`
  5. later assistant question does not auto-reply
