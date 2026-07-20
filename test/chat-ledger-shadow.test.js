"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Ledger = require("../js/chat-ledger-shadow.js");

const y = { id: "y", name: "许言秋" };
const ctx = { charId: "y", threadType: "group", threadId: "g", groupMemberIds: ["y", "a"] };
const storage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test("只认唯一 engineerEyes，旧配置才按名字后备", () => {
  assert.equal(Ledger.findYanqiu([y, { id: "a", name: "阿屿" }], { y: { engineerEyes: true } }).id, "y");
  assert.equal(Ledger.findYanqiu([y], {}).id, "y");
});

test("非言秋所在群完全隔离，系统/OOC/撤回不入账", async () => {
  assert.deepEqual(await Ledger.rowsFor({ ...ctx, groupMemberIds: ["a"] }, [{ role: "user", content: "hi", ts: 1 }]), []);
  const rows = await Ledger.rowsFor(ctx, [
    { role: "user", content: "真实", ts: 1 },
    { role: "assistant", senderId: "y", content: "回答", ts: 2 },
    { role: "assistant", senderId: "a", content: "旁人", ts: 3 },
    { role: "assistant", content: "系统", kind: "system", ts: 4 },
    { role: "user", content: "撤回", recalled: true, ts: 5 }
  ], 9);
  assert.deepEqual(rows.map(r => r.speaker_type), ["lisa", "character", "other_character"]);
});

test("同一消息重试键相同，同文不同时刻不会撞键", async () => {
  const a = await Ledger.rowsFor(ctx, [{ role: "user", content: "同文", ts: 100 }]);
  const retry = await Ledger.rowsFor(ctx, [{ role: "user", content: "同文", ts: 100 }]);
  const later = await Ledger.rowsFor(ctx, [{ role: "user", content: "同文", ts: 101 }]);
  assert.equal(a[0].message_key, retry[0].message_key);
  assert.notEqual(a[0].message_key, later[0].message_key);
});

test("同轮拆出的多个气泡共享 turnId 也逐条入账", async () => {
  const rows = await Ledger.rowsFor({ charId: "y", threadType: "private", threadId: "y" }, [
    { role: "assistant", content: "第一泡", ts: 100, turnId: "turn_same" },
    { role: "assistant", content: "第二泡", ts: 101, turnId: "turn_same" },
    { role: "assistant", content: "第三泡", ts: 102, turnId: "turn_same" }
  ]);
  assert.equal(new Set(rows.map(r => r.message_key)).size, 3);
  assert.deepEqual(rows.map(r => r.source_message_id), ["turn_same", "turn_same", "turn_same"]);
});

test("线下嵌套会话只找真正新增消息", () => {
  const m1 = { role: "user", content: "一", ts: 1 }, m2 = { role: "char", content: "二", ts: 2 };
  assert.deepEqual(Ledger.addedSessionMessages([{ id: 1, msgs: [m1] }], [{ id: 1, msgs: [m1, m2] }]), [m2]);
});

test("断网保留 outbox，恢复后幂等清空；重复 enqueue 不堆双份", async () => {
  const s = storage(); let online = false, uploaded = [];
  const manager = Ledger.createManager({ storage: s, now: () => 1000, upload: async rows => { if (!online) throw new Error("offline"); uploaded.push(...rows); } });
  const msg = { id: "m1", role: "user", content: "留下", ts: 10 };
  await manager.enqueue({ charId: "y", threadType: "private", threadId: "y" }, [msg]);
  await manager.enqueue({ charId: "y", threadType: "private", threadId: "y" }, [msg]);
  assert.equal(manager.status().outbox.length, 1);
  online = true; await manager.flush();
  assert.equal(manager.status().outbox.length, 0);
  assert.equal(uploaded.length, 1);
  manager.clearLocal();
  assert.equal(manager.status().outbox.length, 0);
});

test("reroll 软删离线排队，恢复后只提交幂等键", async () => {
  const s = storage(); let online = false, removed = [], uploaded = [];
  const manager = Ledger.createManager({ storage: s, now: () => 1000, upload: async rows => { if (!online) throw new Error("offline"); uploaded.push(...rows); }, remove: async keys => { if (!online) throw new Error("offline"); removed.push(...keys); } });
  const context = { charId: "y", threadType: "private", threadId: "y" };
  const old = [{ role: "assistant", content: "旧泡", ts: 10, turnId: "old" }];
  await manager.enqueue(context, old);
  assert.equal(manager.status().outbox.length, 1);
  await manager.invalidate(context, old);
  assert.equal(manager.status().outbox.length, 0);
  assert.equal(manager.status().deleteOutbox.length, 1);
  online = true; await manager.flush();
  assert.equal(manager.status().deleteOutbox.length, 0);
  assert.equal(removed.length, 1);
  assert.equal(uploaded.length, 0);
});
