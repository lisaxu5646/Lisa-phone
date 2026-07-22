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

test("整体提示用通用交际目的与情绪重量原则，不堆具体案例", () => {
  const prompt = Pacing.guidance([{ role: "user", content: "随便一句话" }]);
  assert.match(prompt, /先理解这句话在做什么/);
  assert.match(prompt, /撒娇、玩笑、求确认、普通分享、吐槽、真实倾诉还是争执/);
  assert.match(prompt, /匹配对方实际给出的情绪重量/);
  assert.match(prompt, /证据不足时保持轻量/);
  assert.match(prompt, /角色差异优先于统一的高情商模板/);
  assert.doesNotMatch(prompt, /怎么会呢|我怎么会不想你|好几天没见你了|你是不是今天太累/);
});
