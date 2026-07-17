"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const Core = require("../js/inner-life-e-tidal-core.js");

function runtime() {
  let row = null, packet = null;
  const diagnostics = [];
  const Afterglow = require("../js/inner-life-e-afterglow-shadow.js");
  const window = {
    InnerLifeETidalCore: Core,
    InnerLifeEAfterglowShadow: {
      ...Afterglow,
      getTidalState: async () => row,
      putTidalState: async (_owner, next) => (row = { ...next }),
      addDiagnostic: async (_owner, item) => { diagnostics.push(item); return item; },
      getPacket: async () => packet,
      putPacket: async (_owner, next) => (packet = Afterglow.mergePacket(packet, next)),
      markPacketObserved: async () => ({ status:"missing",packet:null }),
      diagnosticReport: async () => ({ diagnostics:diagnostics.length,kinds:diagnostics.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),packets:packet?[packet]:[] })
    },
    Cloud: { getUser: async () => ({ id: "test-owner" }) }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../js/inner-life-e-tidal-shadow.js"), "utf8"), { window, Promise, Date, setTimeout, clearTimeout });
  return window.InnerLifeETidalShadow;
}

test("消息按队列落状态：睡眠信号保留睡眠，普通下一句才醒", async () => {
  const shadow = runtime();
  await shadow.onUserMessage("晚安，我睡了", 1000);
  assert.equal((await shadow.status()).state, "maybe_sleeping");
  await shadow.onSessionOpenNoMessage(1001);
  assert.equal((await shadow.status()).state, "maybe_sleeping");
  await shadow.onUserMessage("我回来啦", 1002);
  assert.equal((await shadow.status()).state, "awake");
});

test("快速连续消息串行处理，不让旧异步写覆盖新状态", async () => {
  const shadow = runtime();
  const sleeping = shadow.onUserMessage("晚安", 2000);
  const awake = shadow.onUserMessage("等等，我还要说一句", 2001);
  await Promise.all([sleeping, awake]);
  assert.equal((await shadow.status()).state, "awake");
});

test("回前台只推进超时，不会把 uncertain 判醒", async () => {
  const shadow = runtime();
  await shadow.onUserMessage("睡一会儿", 3000);
  await shadow.onForegroundNoMessage(3000 + Core.SLEEP_WINDOW_MS + 1);
  assert.equal((await shadow.status()).state, "uncertain");
  await shadow.onForegroundNoMessage(3000 + Core.SLEEP_WINDOW_MS + 2);
  assert.equal((await shadow.status()).state, "uncertain");
});

test("maybe_sleeping 只记录 wouldHold，不真正阻断调用方", async () => {
  const shadow = runtime();
  await shadow.onUserMessage("晚安", 4000);
  assert.equal(await shadow.noteWouldHold("jiwen", 4001), true);
  const report = await shadow.report();
  assert.equal(report.kinds.would_hold, 1);
});

test("后台 flush 生成余温包，重复同锚只记重复不重置", async () => {
  const shadow = runtime(), messages = [{id:"m1",role:"user",content:"明天接着说",ts:5000}];
  shadow.scheduleAfterglow("char-a", messages, {label:"柔软"}, 5000);
  await shadow.flushAfterglow(5001);
  shadow.scheduleAfterglow("char-a", messages, {label:"柔软"}, 5002);
  await shadow.flushAfterglow(5003);
  const report = await shadow.report();
  assert.equal(report.kinds.packet_created, 1);
  assert.equal(report.kinds.packet_duplicate, 1);
  assert.equal(report.packets.length, 1);
});
