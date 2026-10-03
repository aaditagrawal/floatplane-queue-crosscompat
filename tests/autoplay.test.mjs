import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("refreshing an ended video never schedules initial-page autoplay", async () => {
  let source = readFileSync(new URL("../entrypoints/content.ts", import.meta.url), "utf8");
  source = source
    .replace('import "../assets/content-styles.css";', "")
    .replace("export default", "globalThis.content =");
  source = source.replace(
    "    // Initialize",
    "    globalThis.api = { loadQueue };\n    // Initialize",
  );
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const timers = [];
  const context = {
    defineContentScript: (options) => options,
    document: { readyState: "loading", addEventListener() {}, getElementById: () => null },
    browser: {
      storage: { local: { get: async () => ({ fp_queue: [{ id: "a" }], fp_queue_index: 0 }) } },
    },
    window: { location: { pathname: "/post/a" } },
    setTimeout: (callback) => timers.push(callback),
  };
  runInNewContext(javascript, context);
  await context.content.main();
  await context.api.loadQueue(false);
  expect(timers).toHaveLength(0);
  await context.api.loadQueue();
  expect(timers).toHaveLength(1);
});
