const test = require("node:test");
const assert = require("node:assert/strict");
const ChatContextWindow = require("../js/chat-context-window.js");

test("keeps the newest messages inside a bounded prompt window", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: String(i).repeat(900),
    ts: i
  }));
  const selected = ChatContextWindow.select(history, { maxChars: 4000, maxMessages: 80 });
  assert.ok(selected.length < history.length);
  assert.equal(selected.at(-1), history.at(-1));
  assert.deepEqual(selected, history.slice(-selected.length));
});

test("never mutates or deletes the stored chat", () => {
  const history = [{ role: "user", content: "app" }, { role: "assistant", content: "cc" }];
  const snapshot = JSON.stringify(history);
  const selected = ChatContextWindow.select(history, { maxChars: 1000, maxMessages: 1 });
  assert.equal(JSON.stringify(history), snapshot);
  assert.notEqual(selected, history);
  assert.equal(selected[0], history[1]);
});

test("keeps one latest oversized message so the current user turn cannot disappear", () => {
  const latest = { role: "user", content: "x".repeat(20000) };
  const selected = ChatContextWindow.select([{ role: "assistant", content: "old" }, latest], { maxChars: 1000 });
  assert.deepEqual(selected, [latest]);
});
