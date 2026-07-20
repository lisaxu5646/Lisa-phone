"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const MoodLabel = require("../js/mood-label.js");
test("英文内部 mood 标签固定显示为中文", () => {
  assert.equal(MoodLabel.localize("proud"), "骄傲");
  assert.equal(MoodLabel.localize("Proud"), "骄傲");
  assert.equal(MoodLabel.localize("proud and relieved"), "骄傲、如释重负");
});
test("已有中文不改写，未知英文不直接泄漏", () => {
  assert.equal(MoodLabel.localize("得意"), "得意");
  assert.equal(MoodLabel.localize("inventive"), "心绪复杂");
});
test("三个 mood 字段一起归一化", () => {
  assert.deepEqual(MoodLabel.normalizeMood({ label: "proud", baseline: "calm", softened: "satisfied", ts: 1 }), { label: "骄傲", baseline: "平静", softened: "满足", ts: 1 });
});
