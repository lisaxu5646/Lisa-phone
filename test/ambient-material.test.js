const test = require("node:test");
const assert = require("node:assert/strict");
const Material = require("../js/ambient-material.js");

test("动态素材按时间混合私聊、单人线下、所在群聊和群线下", () => {
  const rows = Material.collect("a", {
    chats: { a: [{ role: "user", content: "私聊", ts: 1 }] },
    offlines: { a: [{ msgs: [{ role: "char", content: "线下", ts: 2 }] }] },
    groups: [{ id: "g1", name: "朋友们", memberIds: ["a", "b"] }],
    groupChats: { g1: [{ role: "user", content: "群里说", ts: 3 }] },
    groupOfflines: { g1: [{ msgs: [{ role: "assistant", senderName: "阿屿", content: "一起吃饭", ts: 4 }] }] }
  }, { userName: "Lisa", charName: "阿屿" });
  assert.deepEqual(rows.map(x => x.text), ["私聊", "线下", "群里说", "一起吃饭"]);
  assert.match(Material.format(rows), /【群线下·朋友们】阿屿：一起吃饭/);
});

test("不在场的群、OOC、系统消息和截止时间之前的内容不进素材", () => {
  const rows = Material.collect("a", {
    chats: { a: [{ role: "user", content: "太旧", ts: 1 }, { role: "user", kind: "ooc", content: "场外", ts: 5 }] },
    groups: [{ id: "g2", memberIds: ["b"] }],
    groupChats: { g2: [{ role: "user", content: "不在场", ts: 6 }] },
    offlines: { a: [{ msgs: [{ role: "system", content: "系统", ts: 7 }, { role: "user", content: "可用", ts: 8 }] }] }
  }, { sinceTs: 4 });
  assert.deepEqual(rows.map(x => x.text), ["可用"]);
});

test("日记范围严格包含起点、排除终点，四路都不多截少截", () => {
  const rows = Material.collect("a", {
    chats: { a: [{ role: "user", content: "前一天", ts: 99 }, { role: "user", content: "零点", ts: 100 }, { role: "assistant", content: "当天私聊", ts: 120 }, { role: "user", content: "次日零点", ts: 200 }] },
    offlines: { a: [{ msgs: [{ role: "char", content: "当天线下", ts: 130 }] }] },
    groups: [{ id: "g1", name: "朋友们", memberIds: ["a"] }],
    groupChats: { g1: [{ role: "user", content: "当天群聊", ts: 140 }] },
    groupOfflines: { g1: [{ msgs: [{ role: "assistant", content: "当天群线下", ts: 150 }] }] }
  }, { fromTs: 100, untilTs: 200, limit: 0 });
  assert.deepEqual(rows.map(x => x.text), ["零点", "当天私聊", "当天线下", "当天群聊", "当天群线下"]);
});
