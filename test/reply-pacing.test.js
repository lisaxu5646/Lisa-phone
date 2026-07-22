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

test("整体提示阻止标准安慰客服链和同义自证", () => {
  const prompt = Pacing.guidance([{ role: "user", content: "你是不是不想我" }]);
  assert.match(prompt, /别写成安慰客服流程/);
  assert.match(prompt, /怎么会呢/);
  assert.match(prompt, /我怎么会不想你/);
  assert.match(prompt, /只挑最符合这个角色的一两个真实反应/);
});

test("整体提示先区分撒娇反话和真实难过", () => {
  const prompt = Pacing.guidance([{ role: "user", content: "你都不想我了呜呜" }]);
  assert.match(prompt, /先分清撒娇还是求救/);
  assert.match(prompt, /默认按轻松的亲密邀约接/);
  assert.match(prompt, /别突然严肃追问/);
  assert.match(prompt, /只有对方明确表示是真的难受/);
});
