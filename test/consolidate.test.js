"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const C = require("../js/consolidate.js");

const T0 = Date.UTC(2026, 6, 15, 12, 0, 0);
const H = 3600000;
const mk = (id, ts, charId, tags) => ({ id, text: "碎片" + id, ts, charIds: charId ? [charId] : [], tags: tags || [] });

test("同角色近时间碎片聚成一摞，隔 48h 以上断开", () => {
  const entries = [
    mk("a1", T0, "c1", ["行程"]), mk("a2", T0 + 2 * H, "c1", ["行程"]), mk("a3", T0 + 20 * H, "c1", ["美食"]),
    mk("b1", T0 + 100 * H, "c1", ["工作"]), mk("b2", T0 + 101 * H, "c1", ["工作"]), mk("b3", T0 + 102 * H, "c1", ["工作"])
  ];
  const out = C.suggestClusters(entries, {});
  assert.equal(out.length, 2);
  const ids = out.map(c => c.ids.join(","));
  assert.ok(ids.includes("a1,a2,a3"));
  assert.ok(ids.includes("b1,b2,b3"));
});

test("不足 minSize 的链不出建议；不同角色不混摞", () => {
  const entries = [
    mk("x1", T0, "c1"), mk("x2", T0 + H, "c1"),                       // 只有 2 条
    mk("y1", T0, "c2", ["约定"]), mk("y2", T0 + H, "c2", ["约定"]), mk("y3", T0 + 2 * H, "c2", ["约定"])
  ];
  const out = C.suggestClusters(entries, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].charId, "c2");
  assert.deepEqual(out[0].ids, ["y1", "y2", "y3"]);
});

test("usedIds 排除已进事件/候选的碎片，deleted 排除", () => {
  const entries = [
    mk("u1", T0, "c1"), mk("u2", T0 + H, "c1"), mk("u3", T0 + 2 * H, "c1"), mk("u4", T0 + 3 * H, "c1"),
    Object.assign(mk("u5", T0 + 4 * H, "c1"), { deleted: true })
  ];
  const out = C.suggestClusters(entries, { usedIds: ["u1", "u2"] });
  assert.equal(out.length, 0); // 剩 u3/u4 两条，不够 minSize
  const out2 = C.suggestClusters(entries, { usedIds: new Set(["u1"]) });
  assert.equal(out2.length, 1);
  assert.deepEqual(out2[0].ids, ["u2", "u3", "u4"]);
});

test("超 30 条取最近 30 并明说 truncatedFrom", () => {
  const entries = [];
  for (let i = 0; i < 35; i++) entries.push(mk("m" + String(i).padStart(2, "0"), T0 + i * H, "c1", ["长征"]));
  const out = C.suggestClusters(entries, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].size, 30);
  assert.equal(out[0].truncatedFrom, 35);
  assert.equal(out[0].ids[0], "m05"); // 最早 5 条被砍
  assert.equal(out[0].ids[29], "m34");
});

test("标签聚合：topTags 取频次最高，score 奖励标签一致性，排序确定", () => {
  const tight = [mk("t1", T0, "c1", ["温哥华"]), mk("t2", T0 + H, "c1", ["温哥华"]), mk("t3", T0 + 2 * H, "c1", ["温哥华"])];
  const loose = [mk("l1", T0, "c2", ["甲"]), mk("l2", T0 + H, "c2", ["乙"]), mk("l3", T0 + 2 * H, "c2", ["丙"])];
  const out = C.suggestClusters(tight.concat(loose), {});
  assert.equal(out.length, 2);
  assert.equal(out[0].charId, "c1"); // 同尺寸，标签更齐的排前
  assert.deepEqual(out[0].topTags, ["温哥华"]);
  assert.ok(out[0].score > out[1].score);
  // 同输入两次调用结果逐字节一致（确定性）
  assert.deepEqual(out, C.suggestClusters(tight.concat(loose), {}));
});

test("无 charIds 的碎片归 _misc 摞，charId 输出为 null", () => {
  const entries = [mk("n1", T0, null), mk("n2", T0 + H, null), mk("n3", T0 + 2 * H, null)];
  const out = C.suggestClusters(entries, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].charId, null);
});
