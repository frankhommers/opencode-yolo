import { isQuestion, replyForAssistantText } from "./isQuestion"

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
    .toBe("OK Go")
})

test("maps ready for feedback to OK Go", () => {
  expect(replyForAssistantText("Ready for feedback.")).toBe("OK Go")
})

test("maps soft question to default yolo reply", () => {
  expect(replyForAssistantText("If you want, I can continue with implementation.")).toBe("You choose what's best")
})

test("maps Dutch choice prompt to default yolo reply", () => {
  expect(replyForAssistantText("Kies 1 van die twee.")).toBe("You choose what's best")
})

test("maps Dutch proceed statement to OK Go", () => {
  expect(replyForAssistantText("Ik ga nu verder met het plan en voer het stap voor stap uit.")).toBe("OK Go")
})

test("maps Dutch ready-for-feedback to OK Go", () => {
  expect(replyForAssistantText("Klaar voor feedback.")).toBe("OK Go")
})

test("maps Dutch next logical step plan to OK Go", () => {
  const text = `Volgende logische stap:
1. Echte run tegen jouw wiki starten met
   npm run sync:wiki -- sync --base "http://www.kippenencyclopedie.nl/php" --state "./output/wikiteam3/state.json"
2. Daarna eventueel meteen een reconcile run plannen/schedulen.`

  expect(replyForAssistantText(text)).toBe("OK Go")
})

test("maps Dutch 'als je go zegt' to OK Go", () => {
  expect(replyForAssistantText("Als je \"go\" zegt, pak ik stap 1 meteen.")).toBe("OK Go")
})
