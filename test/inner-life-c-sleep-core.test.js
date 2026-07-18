"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const C = require("../js/inner-life-c-sleep-core.js");

const at = value => Date.parse(value);
const plan = (wake="08:00", sleep="23:30") => ({ seqs: [
  { time: wake, type: "coffee", title: "起床" },
  { time: "13:00", type: "work", title: "工作" },
  { time: sleep, type: "sleep", title: "睡觉" }
] });
const schedules = { "2026-07-16": plan(), "2026-07-17": plan(), "2026-07-18": plan() };

test("昨日 sleep 到今日首段之间是 asleep，跨午夜不丢窗口", () => {
  const d = C.deriveSchedule(at("2026-07-17T02:00:00Z"), 0, schedules);
  assert.equal(d.phase, "asleep");
  assert.equal(d.sleepStartTs, at("2026-07-16T23:30:00Z"));
  assert.equal(d.wakeAtTs, at("2026-07-17T08:00:00Z"));
});

test("醒后与睡前各 45 分钟只派生 waking/drowsy", () => {
  assert.equal(C.deriveSchedule(at("2026-07-17T08:30:00Z"), 0, schedules).phase, "waking");
  assert.equal(C.deriveSchedule(at("2026-07-17T22:44:59Z"), 0, schedules).phase, "awake");
  assert.equal(C.deriveSchedule(at("2026-07-17T22:45:00Z"), 0, schedules).phase, "drowsy");
});

test("角色时区用当地日程，不拿设备时钟硬套", () => {
  const plusEight = C.deriveSchedule(at("2026-07-16T18:00:00Z"), 480, schedules);
  assert.equal(plusEight.phase, "asleep"); // 角色当地 07-17 02:00
  assert.equal(plusEight.wakeAtTs, at("2026-07-17T00:00:00Z"));
});

test("DST 附近由调用方传当刻 offset，同一当地 02:00 均能正确派生", () => {
  const spring = { "2026-03-07": plan(), "2026-03-08": plan(), "2026-03-09": plan() };
  assert.equal(C.localDayKey(at("2026-03-08T09:00:00Z"), -420), "2026-03-08");
  assert.equal(C.deriveSchedule(at("2026-03-08T09:00:00Z"), -420, spring).phase, "asleep");
});

test("日程临时改动只认 type=sleep，不从标题猜睡觉", () => {
  const changed = { ...schedules, "2026-07-17": { seqs: [
    { time: "09:00", type: "coffee", title: "起床" },
    { time: "21:00", type: "rest", title: "睡觉（只是标题）" },
    { time: "01:00", type: "sleep", title: "真正睡下" }
  ] } };
  assert.equal(C.deriveSchedule(at("2026-07-17T20:30:00Z"), 0, changed).phase, "awake");
  assert.equal(C.deriveSchedule(at("2026-07-18T00:30:00Z"), 0, changed).phase, "drowsy");
});

test("可靠日程永远压过睡压，pressure 到顶也不乱睡", () => {
  const previous = { ...C.createSleepState(at("2026-07-17T12:00:00Z")), pressure: 1, updatedTs: at("2026-07-17T12:00:00Z") };
  const out = C.tickSleep(previous, { now: at("2026-07-17T13:00:00Z"), utcOffsetMinutes: 0, schedules });
  assert.equal(out.state.phase, "awake");
  assert.equal(out.state.source, "schedule");
});

test("缺日程 fail-open；只有睡压到顶才补最多 90 分钟", () => {
  let state = { ...C.createSleepState(at("2026-07-17T10:00:00Z")), pressure: .5 };
  let out = C.tickSleep(state, { now: at("2026-07-17T11:00:00Z"), schedules: {} });
  assert.equal(out.state.phase, "awake"); assert.equal(out.state.source, "unknown_schedule");
  state = { ...out.state, pressure: .99 };
  out = C.tickSleep(state, { now: at("2026-07-17T12:00:00Z"), schedules: {} });
  assert.equal(out.state.phase, "asleep"); assert.equal(out.state.source, "pressure_guard");
  assert.equal(out.state.wakeAtTs - out.state.sleepStartTs, C.PRESSURE_GUARD_MS);
});

test("后台长停后的睡压推进封顶六小时，不能一帧暴冲", () => {
  const state = { ...C.createSleepState(at("2026-07-01T00:00:00Z")), pressure: .2 };
  const out = C.tickSleep(state, { now: at("2026-07-17T00:00:00Z"), schedules: {} });
  assert.equal(out.audit.elapsedCapped, true);
  assert.ok(out.state.pressure < .36);
});

test("小克豁免：不创建 sleep，也不改已有 inner state", () => {
  const inner = { schemaVersion: 1, revision: 4, emotion: { current: {} } };
  const out = C.tickInnerState(inner, { now: at("2026-07-17T12:00:00Z"), engineerEyes: true, schedules });
  assert.equal(out.exempt, true); assert.equal(out.sleep, null); assert.strictEqual(out.state, inner);
});

test("普通角色把纯状态机结果挂到独立 state.sleep", () => {
  const inner = { schemaVersion: 1, revision: 4, emotion: { current: {} } };
  const out = C.tickInnerState(inner, { now: at("2026-07-17T02:00:00Z"), schedules });
  assert.equal(out.state.sleep.phase, "asleep"); assert.equal(out.state.revision, 5);
  assert.equal(inner.sleep, undefined);
});

test("shadow 睡中只记 would_queue，不改消息、不真入队", () => {
  const sleep = { ...C.createSleepState(at("2026-07-17T01:00:00Z")), phase: "asleep" };
  const message = { id: "m1", role: "user", content: "半夜的一句话", ts: at("2026-07-17T02:00:00Z") };
  const out = C.receiveMessage(sleep, message, { now: message.ts, mode: "shadow" });
  assert.equal(out.decision, "would_queue"); assert.strictEqual(out.message, message); assert.strictEqual(out.state, sleep);
  assert.deepEqual(out.state.queue, []); assert.equal(out.diagnostic.projectedDepth, 1);
  assert.equal(JSON.stringify(out.diagnostic).includes(message.content), false);
});

test("纯 live 能力按 id 幂等入队，队列绝不复制正文", () => {
  let sleep = { ...C.createSleepState(at("2026-07-17T01:00:00Z")), phase: "asleep" };
  const message = { id: "m1", role: "user", content: "正文只在聊天里", ts: at("2026-07-17T02:00:00Z") };
  let out = C.receiveMessage(sleep, message, { now: message.ts, mode: "live" }); sleep = out.state;
  assert.equal(out.decision, "queued"); assert.equal(out.message.perceived, false); assert.equal(sleep.queue.length, 1);
  assert.deepEqual(Object.keys(sleep.queue[0]).sort(), ["arrivedTs","messageId","order","perceived","perceivedTs"].sort());
  out = C.receiveMessage(sleep, message, { now: message.ts + 1000, mode: "live" });
  assert.equal(out.decision, "queued_duplicate"); assert.equal(out.state.queue.length, 1);
});

test("醒来按 arrival 顺序规划汇入，诊断只留 id hash", () => {
  let sleep = { ...C.createSleepState(at("2026-07-17T01:00:00Z")), phase: "asleep" };
  const messages = [
    { id: "m2", role: "user", content: "第二条" },
    { id: "m1", role: "user", content: "第一条" }
  ];
  sleep = C.receiveMessage(sleep, messages[1], { now: 1000, mode: "live" }).state;
  sleep = C.receiveMessage(sleep, messages[0], { now: 2000, mode: "live" }).state;
  const release = C.planRelease(sleep, messages, 3000);
  assert.deepEqual(release.releaseIds, ["m1", "m2"]); assert.equal(release.diagnostic.count, 2);
  assert.equal(JSON.stringify(release.diagnostic).includes("第一条"), false);
});

test("回复失败不清队列也不盖已感知，成功后才一次提交", () => {
  let sleep = { ...C.createSleepState(0), phase: "asleep" };
  const messages = [{ id: "m1", role: "user", content: "别丢我" }];
  sleep = C.receiveMessage(sleep, messages[0], { now: 1000, mode: "live" }).state;
  const plan = C.planRelease(sleep, messages, 2000);
  const failed = C.commitRelease(sleep, messages, plan, false);
  assert.strictEqual(failed.state, sleep); assert.strictEqual(failed.messages, messages); assert.equal(failed.state.queue.length, 1);
  const done = C.commitRelease(sleep, messages, plan, true);
  assert.equal(done.state.queue.length, 0); assert.equal(done.messages[0].perceived, true); assert.equal(done.messages[0].perceivedTs, 2000);
});

test("原聊天缺行时保留队列项，不能静默当成释放成功", () => {
  const sleep = { ...C.createSleepState(0), phase: "asleep", queue: [{ messageId: "lost", arrivedTs: 1000, order: 1, perceived: false, perceivedTs: null }], queueOrder: 1 };
  const plan = C.planRelease(sleep, [], 2000), done = C.commitRelease(sleep, [], plan, true);
  assert.deepEqual(plan.missing, ["lost"]); assert.equal(done.state.queue.length, 1);
});

test("清醒消息立即感知；小克在队列层也完整豁免", () => {
  const awake = C.createSleepState(0), message = { id: "m1", role: "user", content: "早" };
  const seen = C.receiveMessage(awake, message, { now: 1000, mode: "live" });
  assert.equal(seen.message.perceived, true); assert.equal(seen.message.sleepQueued, false);
  const exempt = C.receiveMessage({ ...awake, phase: "asleep" }, message, { now: 1000, mode: "live", engineerEyes: true });
  assert.equal(exempt.decision, "exempt"); assert.strictEqual(exempt.message, message);
});

function queuedPair() {
  let sleep = { ...C.createSleepState(0), phase: "asleep", pressure: .9 };
  const messages = [{ id: "m1", role: "user", content: "第一声" }, { id: "m2", role: "user", content: "第二声" }];
  sleep = C.receiveMessage(sleep, messages[0], { now: 1000, mode: "live" }).state;
  sleep = C.receiveMessage(sleep, messages[1], { now: 2000, mode: "live" }).state;
  return { sleep, messages };
}

test("敲门 shadow 只算不醒、不清队列，诊断没有正文", () => {
  const { sleep, messages } = queuedPair(), plan = C.planWakeRelease(sleep, messages, { now: 3000, reason: "knock" });
  assert.equal(C.FEATURE_PHASE, "shadow"); assert.equal(plan.decision, "would_wake_and_release");
  assert.strictEqual(plan.originalState, sleep); assert.equal(sleep.phase, "asleep"); assert.equal(sleep.queue.length, 2);
  assert.equal(JSON.stringify(plan.diagnostic).includes("第一声"), false);
  assert.equal(C.commitWakeRelease(plan, messages, true).committed, false);
});

test("敲门成功原子变 waking 并释放；保留高睡压和 startle", () => {
  const { sleep, messages } = queuedPair(), plan = C.planWakeRelease(sleep, messages, { now: 3000, reason: "knock", mode: "live" });
  const done = C.commitWakeRelease(plan, messages, true);
  assert.equal(done.committed, true); assert.equal(done.state.phase, "waking"); assert.equal(done.state.source, "knock");
  assert.equal(done.state.wakeReason, "knock"); assert.equal(done.state.startleTs, 3000); assert.equal(done.state.pressure, .9);
  assert.equal(done.state.queue.length, 0); assert.ok(done.messages.every(x => x.perceived === true));
});

test("敲门后的回复失败必须回滚为 asleep，队列一条不少", () => {
  const { sleep, messages } = queuedPair(), plan = C.planWakeRelease(sleep, messages, { now: 3000, reason: "knock", mode: "live" });
  const failed = C.commitWakeRelease(plan, messages, false);
  assert.strictEqual(failed.state, sleep); assert.strictEqual(failed.messages, messages);
  assert.equal(failed.state.phase, "asleep"); assert.equal(failed.state.queue.length, 2);
});

test("自然醒和敲门共用同一 release 规划，顺序完全一致", () => {
  const { sleep, messages } = queuedPair();
  const natural = C.planWakeRelease({ ...sleep, phase: "waking" }, messages, { now: 3000, reason: "natural", mode: "live" });
  const knock = C.planWakeRelease(sleep, messages, { now: 3000, reason: "knock", mode: "live" });
  assert.deepEqual(natural.release.releaseIds, ["m1", "m2"]); assert.deepEqual(knock.release.releaseIds, natural.release.releaseIds);
  assert.deepEqual(knock.release.diagnostic.orderHashes, natural.release.diagnostic.orderHashes);
});

test("敲醒本来就醒着的角色不会制造 startle 或重复释放", () => {
  const state = C.createSleepState(0), messages = [{ id: "m1", role: "user", content: "早" }];
  const plan = C.planWakeRelease(state, messages, { now: 3000, reason: "knock", mode: "live" });
  assert.equal(plan.decision, "already_awake");
  const done = C.commitWakeRelease(plan, messages, true); assert.equal(done.committed, false); assert.strictEqual(done.state, state);
});

test("小克在敲门层豁免，不生成睡眠或惊醒状态", () => {
  const plan = C.planWakeRelease(null, [], { now: 3000, reason: "knock", mode: "live", engineerEyes: true });
  assert.equal(plan.decision, "exempt"); assert.equal(plan.proposedState, null); assert.equal(plan.diagnostic, null);
});
