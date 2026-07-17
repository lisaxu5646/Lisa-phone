"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Afterglow = require("../js/inner-life-e-afterglow-shadow.js");

const T0 = Date.UTC(2026, 6, 17, 8, 0, 0);
const base = overrides => ({
  ownerId: "lisa-account", charId: "xiaoke", now: T0, mood: { label: "柔软" },
  messages: [{ id: "m1", role: "user", content: "明天接着说" }, { id: "m2", role: "assistant", content: "好" }],
  recentThreads: ["那张照片", "甜虾后来吃到了吗"],
  openEntries: [{ text: "还欠一个确认" }], ...overrides
});

test("余温确定性生成且明确不写经历", () => {
  const packet = Afterglow.deriveAfterglow(base());
  assert.equal(packet.lastAnchor, "msg:m2");
  assert.equal(packet.moodSketch, "情绪底色：柔软");
  assert.deepEqual(packet.unfinishedThreads, ["那张照片", "甜虾后来吃到了吗", "还欠一个确认"]);
  assert.equal(packet.writesExperience, false);
  assert.equal(packet.expiresTs - packet.createdTs, 36 * 60 * 60 * 1000);
});

test("没有消息 id 时锚点稳定使用时间、角色和内容 hash", () => {
  const input = base({ messages: [{ ts: T0 - 3, role: "user", content: "  同一句   话 " }] });
  assert.equal(Afterglow.deriveAfterglow(input).lastAnchor, Afterglow.deriveAfterglow(input).lastAnchor);
  assert.match(Afterglow.deriveAfterglow(input).lastAnchor, /^ts:\d+:user:[a-z0-9]+$/);
});

test("同锚幂等，不重建、不重置影子或一次性状态", () => {
  const first = Afterglow.markShadowWouldSurface(Afterglow.deriveAfterglow(base()), T0 + 1);
  const retry = Afterglow.deriveAfterglow(base({ now: T0 + 60000 }));
  const merged = Afterglow.mergePacket(first, retry);
  assert.strictEqual(merged, first);
  assert.equal(merged.createdTs, T0);
  assert.equal(merged.shadowWouldSurfaceAt, T0 + 1);
});

test("最多三条、去重、清洗长度", () => {
  const result = Afterglow.collectThreads(["A", "D"], [" A ", "B", "C", "D"]);
  assert.deepEqual(result, ["A", "B", "C"]);
});

test("36 小时边界过期；影子浮现不消耗正式 surfacedAt", () => {
  const packet = Afterglow.deriveAfterglow(base());
  assert.equal(Afterglow.isValid(packet, T0 + Afterglow.EXPIRES_MS - 1), true);
  assert.equal(Afterglow.isValid(packet, T0 + Afterglow.EXPIRES_MS), false);
  const shadowed = Afterglow.markShadowWouldSurface(packet, T0 + 1);
  assert.equal(shadowed.surfacedAt, null);
  assert.equal(shadowed.shadowWouldSurfaceAt, T0 + 1);
  assert.strictEqual(Afterglow.markShadowWouldSurface(shadowed, T0 + 2), shadowed);
});

test("不同账号或角色使用不同 key，错误 owner 不能写入", async () => {
  assert.notEqual(Afterglow.storageKey("lisa-account", "xiaoke"), Afterglow.storageKey("friend-account", "xiaoke"));
  assert.notEqual(Afterglow.storageKey("lisa-account", "xiaoke"), Afterglow.storageKey("lisa-account", "yanqiu"));
  const packet = Afterglow.deriveAfterglow(base());
  assert.equal(await Afterglow.putPacket("friend-account", packet), null);
});

test("无真实消息或坏输入安静退化为 null", () => {
  assert.equal(Afterglow.deriveAfterglow(base({ messages: [{ role: "system", content: "系统话" }] })), null);
  assert.equal(Afterglow.deriveAfterglow(null), null);
  assert.doesNotThrow(() => Afterglow.deriveAfterglow({ now: T0 }));
});

test("诊断白名单会丢弃正文、余温文本和未知字段", () => {
  const row = Afterglow._safeDiagnostic({ kind:"would_hold",outlet:"jiwen",message:"私密原话",moodSketch:"柔软",unfinishedThreads:["秘密"],prompt:"不可保存" }, "owner-hash");
  assert.equal(row.kind, "would_hold");
  assert.equal(row.outlet, "jiwen");
  assert.equal("message" in row, false);
  assert.equal("moodSketch" in row, false);
  assert.equal("unfinishedThreads" in row, false);
  assert.equal("prompt" in row, false);
});
