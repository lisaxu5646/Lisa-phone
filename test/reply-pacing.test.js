const test = require("node:test");
const assert = require("node:assert/strict");
const Pacing = require("../js/reply-pacing.js");

test("随口一句默认只需一到两泡", () => {
  assert.deepEqual(Pacing.band([{ role: "assistant", content: "在" }, { role: "user", content: "你在干嘛" }]), { min: 1, max: 2, kind: "short" });
});

test("连发和长内容逐级放宽，但不默认五六泡", () => {
  const two = [{ role: "user", content: "第一件事我想问你" }, { role: "user", content: "还有一件事" }];
  assert.equal(Pacing.band(two).max, 3);
  assert.deepEqual(Pacing.band([{ role: "user", content: "这是一段".repeat(40) }]), { min: 2, max: 4, kind: "substantial" });
});

test("自主续说保持一到两泡", () => {
  assert.deepEqual(Pacing.band([], { continueMode: true }), { min: 1, max: 2, kind: "self_continue" });
});
