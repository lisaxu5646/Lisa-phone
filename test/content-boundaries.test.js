const test = require("node:test");
const assert = require("node:assert/strict");
const Boundaries = require("../js/content-boundaries.js");

test("吸烟氛围词会被识别，普通油烟和烟花不误伤", () => {
  assert.equal(Boundaries.hasTobacco("靠在窗边点烟"), true);
  assert.equal(Boundaries.hasTobacco("抽了一口电子烟"), true);
  assert.equal(Boundaries.hasTobacco("厨房里有一点油烟"), false);
  assert.equal(Boundaries.hasTobacco("晚上去看烟花"), false);
});

test("日程兜底保留时间线位置，只把吸烟段换成普通休息", () => {
  const out = Boundaries.sanitizeSchedule({ seqs: [
    { time: "09:00", title: "开会", location: "办公室", type: "work", deviation: null },
    { time: "15:00", title: "去天台抽烟", location: "天台", type: "other", deviation: null }
  ], murmurs: [{ time: "15:00", text: "点根烟冷静一下" }, { time: "18:00", text: "终于下班" }] });
  assert.equal(out.seqs.length, 2);
  assert.equal(out.seqs[1].time, "15:00");
  assert.equal(out.seqs[1].type, "rest");
  assert.equal(Boundaries.hasTobacco(JSON.stringify(out)), false);
  assert.deepEqual(out.murmurs.map(x => x.text), ["终于下班"]);
});
