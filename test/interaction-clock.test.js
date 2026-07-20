"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Clock = require("../js/interaction-clock.js");
const groups = [{ id: "g1", memberIds: ["a", "b"] }];
test("用户在群聊和群线下出现，刷新所有在场角色的共同互动时间", () => {
  const data = { groups, groupChats: { g1: [{ role: "user", ts: 100 }] }, groupOfflines: { g1: [{ startTs: 110, msgs: [{ role: "user", ts: 120 }] }] } };
  assert.equal(Clock.latestSharedTs("a", data), 120);
  assert.equal(Clock.latestSharedTs("b", data), 120);
});
test("别的成员自己说话不冒充 Lisa 在理当前角色", () => {
  const data = { groups, groupChats: { g1: [{ role: "assistant", senderId: "b", ts: 200 }] } };
  assert.equal(Clock.latestSharedTs("a", data), 0);
  assert.equal(Clock.latestSharedTs("b", data), 200);
});
test("单人线下也计入，非成员群完全隔离", () => {
  const data = { groups, offlines: { a: [{ msgs: [{ role: "user", ts: 300 }] }] }, groupChats: { g1: [{ role: "user", ts: 400 }] } };
  assert.equal(Clock.latestSharedTs("a", data), 400);
  assert.equal(Clock.latestSharedTs("z", data), 0);
});
test("正在共同群聊或八小时内未结束的群线下，会硬拦主动私聊", () => {
  assert.equal(Clock.isTogetherNow("a", { groups, activeGroupId: "g1" }, 1000), true);
  assert.equal(Clock.isTogetherNow("a", { groups, groupOfflines: { g1: [{ startTs: 500, endTs: null }] } }, 1000), true);
  assert.equal(Clock.isTogetherNow("a", { groups, groupOfflines: { g1: [{ startTs: 1, endTs: null }] } }, 9 * 60 * 60 * 1000), false);
  assert.equal(Clock.isTogetherNow("z", { groups, activeGroupId: "g1" }, 1000), false);
});
