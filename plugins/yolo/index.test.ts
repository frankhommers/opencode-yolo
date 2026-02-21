import { createYoloPlugin } from "./index"

test("plugin exposes name and handlers", () => {
  const plugin = createYoloPlugin()
  expect(plugin.name).toBe("YOLO")
  expect(typeof plugin.onMessage).toBe("function")
})
