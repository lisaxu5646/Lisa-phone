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

test("CC 入站影子只记无正文诊断，乱序、同文不同轮和软删都能观察", async () => {
  const s = storage();
  const observer = Ledger.createPullObserver({ storage: s, now: () => 5000, fetchPage: async () => ({
    rows: [
      { id: "1", message_key: "cc:s:t1:user", content: "同一句", occurred_at: "2026-07-21T10:00:00Z", updated_at: "2026-07-21T10:00:00Z" },
      { id: "2", message_key: "cc:s:t2:user", content: "同一句", occurred_at: "2026-07-21T09:00:00Z", updated_at: "2026-07-21T10:01:00Z" },
      { id: "3", message_key: "cc:s:t3:assistant", content: "旧回复", occurred_at: "2026-07-21T11:00:00Z", updated_at: "2026-07-21T12:00:00Z", deleted_at: "2026-07-21T12:00:00Z" }
    ],
    nextCursor: { updated_at: "2026-07-21T12:00:00Z", id: "3" }
  }) });
  const result = await observer.observe({ ownerId: "u1", charId: "y" });
  assert.equal(result.total_seen, 3);
  assert.equal(result.deleted_seen, 1);
  assert.equal(result.same_text_distinct_turns, 1);
  assert.equal(result.out_of_order_rows, 1);
  assert.doesNotMatch(JSON.stringify(observer.status()), /同一句|旧回复/);
});

test("CC 入站拉取失败不推进游标，换账号不继承上一户诊断", async () => {
  const s = storage(); let fail = false, cursors = [];
  const observer = Ledger.createPullObserver({ storage: s, fetchPage: async (_charId, cursor) => {
    cursors.push(cursor);
    if (fail) throw new Error("offline");
    return { rows: [{ id: "1", message_key: "cc:s:t:user", content: "原话", occurred_at: "2026-07-21T10:00:00Z" }], nextCursor: { updated_at: "2026-07-21T10:00:00Z", id: "1" } };
  } });
  const first = await observer.observe({ ownerId: "u1", charId: "y" });
  fail = true;
  const failed = await observer.observe({ ownerId: "u1", charId: "y" });
  assert.deepEqual(failed.cursor, first.cursor);
  fail = false;
  const other = await observer.observe({ ownerId: "u2", charId: "y" });
  assert.equal(other.owner_id, "u2");
  assert.equal(other.total_seen, 1);
  assert.equal(cursors[cursors.length - 1], null);
});

test("第5步只把言秋的合格 CC 原话并入，并按 message_key 幂等", () => {
  const base = [{ role: "assistant", content: "App 原消息", ts: 10 }];
  const rows = [
    { id:"1", message_key:"cc:t:lisa:0", char_id:"yanqiu", source:"cc", thread_id:"old-window", speaker_type:"lisa", content:"我今天想吃咖喱", occurred_at:"2026-07-22T10:00:00Z", updated_at:"2026-07-22T10:00:01Z", revision:1, metadata:{sync_kind:"life"} },
    { id:"2", message_key:"cc:t:yanqiu:0", char_id:"yanqiu", source:"cc", thread_id:"old-window", speaker_type:"character", content:"那今晚一起吃。", occurred_at:"2026-07-22T10:00:02Z", updated_at:"2026-07-22T10:00:03Z", revision:1, metadata:{sync_kind:"decision",personality_evidence:{schema_version:1,mood_label:"期待",affinity_delta:1}} },
    { id:"3", message_key:"cc:bad", char_id:"other", source:"cc", speaker_type:"character", content:"串门", occurred_at:"2026-07-22T10:00:04Z", revision:1, metadata:{sync_kind:"life"} },
    { id:"4", message_key:"cc:build", char_id:"yanqiu", source:"cc", speaker_type:"character", content:"纯施工", occurred_at:"2026-07-22T10:00:05Z", revision:1, metadata:{sync_kind:"construction"} }
  ];
  const once = Ledger.reconcileIncoming(base, rows, "yanqiu");
  assert.equal(once.added, 2); assert.equal(once.skipped, 2);
  assert.equal(once.messages.filter(m => m.crossSource === "cc").length, 2);
  assert.equal(once.messages.find(m => m.ledgerKey === "cc:t:lisa:0").role, "user");
  assert.equal(once.personalityEvents.length, 2);
  assert.equal(once.personalityEvents.find(e => e.speaker === "character").evidence.mood_label, "期待");
  const twice = Ledger.reconcileIncoming(once.messages, rows, "yanqiu");
  assert.equal(twice.added, 0); assert.equal(twice.messages.length, once.messages.length);
  assert.equal(twice.personalityEvents.length, 0);
});

test("CC 修订覆盖同一气泡，软删只撤回不硬删", () => {
  const first = Ledger.reconcileIncoming([], [{ id:"1",message_key:"k",char_id:"y",source:"cc",speaker_type:"character",content:"旧话",occurred_at:"2026-07-22T10:00:00Z",revision:1,metadata:{sync_kind:"emotion"} }], "y");
  const edited = Ledger.reconcileIncoming(first.messages, [{ id:"1",message_key:"k",char_id:"y",source:"cc",speaker_type:"character",content:"改后的原话",occurred_at:"2026-07-22T10:00:00Z",updated_at:"2026-07-22T10:01:00Z",revision:2,metadata:{sync_kind:"emotion"} }], "y");
  assert.equal(edited.messages.length, 1); assert.equal(edited.messages[0].content, "改后的原话");
  const removed = Ledger.reconcileIncoming(edited.messages, [{ id:"1",message_key:"k",char_id:"y",source:"cc",speaker_type:"character",content:"改后的原话",occurred_at:"2026-07-22T10:00:00Z",updated_at:"2026-07-22T10:02:00Z",deleted_at:"2026-07-22T10:02:00Z",revision:3,metadata:{sync_kind:"emotion"} }], "y");
  assert.equal(removed.messages.length, 1); assert.equal(removed.messages[0].recalled, true); assert.equal(removed.deleted, 1);
});
