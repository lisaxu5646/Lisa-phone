const test = require("node:test");
const assert = require("node:assert/strict");
const Clock = require("../js/schedule-clock.js");

test("角色当地日期不跟设备日期混用", () => {
  const now = Date.parse("2026-07-20T18:30:00Z");
  assert.equal(Clock.dayKey({ tz: 8 }, now, -300), "2026-07-21");
  assert.equal(Clock.dayKey({ tz: -5 }, now, -300), "2026-07-20");
  assert.equal(Clock.localMinute({ tz: 8 }, now, -300), 150); // 02:30
});

test("灰显按角色当地时间，不被换算后的跨日排序打乱", () => {
  const seqs = [{ time: "08:00" }, { time: "13:00" }, { time: "23:30" }];
  assert.equal(Clock.currentSeqIdx(seqs, 14 * 60), 1);
  assert.equal(Clock.currentSeqIdx(seqs, 7 * 60), -1);
});

test("午夜后的就寝段仍是前一条生活时间线的当前段", () => {
  const seqs = [{ time: "09:00" }, { time: "22:00" }, { time: "00:30" }];
  assert.equal(Clock.currentSeqIdx(seqs, 45), 2);
});
