import { isQuestion, replyForAssistantText, DEFAULT_REPLY, PROCEED_REPLY } from "./isQuestion"

test("detects question mark", () => {
  expect(isQuestion("Can you choose?")).toBe(true)
})

test("detects starters", () => {
  expect(isQuestion("How should we proceed")).toBe(true)
})

test("ignores plain statement", () => {
  expect(isQuestion("Proceeding with implementation")).toBe(false)
})

test("maps proceed statement to OK Go", () => {
  expect(replyForAssistantText("I'll proceed with that approach and execute the plan task-by-task with checkpoints."))
    .toBe(PROCEED_REPLY)
})

test("maps ready for feedback to proceed reply", () => {
  expect(replyForAssistantText("Ready for feedback.")).toBe(PROCEED_REPLY)
})

test("maps soft question to default yolo reply", () => {
  expect(replyForAssistantText("If you want, I can continue with implementation.")).toBe(DEFAULT_REPLY)
})

test("maps Dutch choice prompt to default yolo reply", () => {
  expect(replyForAssistantText("Kies 1 van die twee.")).toBe(DEFAULT_REPLY)
})

test("maps Dutch proceed statement to OK Go", () => {
  expect(replyForAssistantText("Ik ga nu verder met het plan en voer het stap voor stap uit.")).toBe(PROCEED_REPLY)
})

test("maps Dutch ready-for-feedback to OK Go", () => {
  expect(replyForAssistantText("Klaar voor feedback.")).toBe(PROCEED_REPLY)
})

test("maps Dutch next logical step plan to OK Go", () => {
  const text = `Volgende logische stap:
1. Echte run tegen jouw wiki starten met
   npm run sync:wiki -- sync --base "http://www.kippenencyclopedie.nl/php" --state "./output/wikiteam3/state.json"
2. Daarna eventueel meteen een reconcile run plannen/schedulen.`

  expect(replyForAssistantText(text)).toBe(PROCEED_REPLY)
})

test("maps Dutch 'als je go zegt' to OK Go", () => {
  expect(replyForAssistantText("Als je \"go\" zegt, pak ik stap 1 meteen.")).toBe(PROCEED_REPLY)
})

test("maps Dutch 'als dit akkoord is' to default yolo reply", () => {
  expect(replyForAssistantText("Als dit akkoord is, ga ik verder met stap 2.")).toBe(DEFAULT_REPLY)
})
