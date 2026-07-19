"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadStudy() {
  const sandbox = {
    window: {},
    loadJSON: function (_key, fallback) { return fallback; },
    saveJSON: function () {},
    extractJSON: function (raw) { return JSON.parse(raw); },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/study.js"), "utf8"), sandbox);
  return sandbox.window.Study;
}

const Study = loadStudy();
const units = [
  { id: "u1", grammar: [{ id: "a" }, { id: "b" }] },
  { id: "u2", grammar: [{ id: "c" }] }
];

test("本节独立答对后进度条会动，但不会冒充完成整节", () => {
  const ratio = Study.studyProgressRatio(units, { current_unit: "u1", completed: [], mastery: { a: 2, b: 0 } });
  assert.equal(ratio, 0.225);
  assert.ok(ratio < 0.5);
});

test("完成小节仍是进度的权威边界", () => {
  assert.equal(Study.studyProgressRatio(units, { current_unit: "u2", completed: ["u1"], mastery: {} }), 0.5);
  assert.equal(Study.studyProgressRatio(units, { current_unit: "u2", completed: ["u1", "u2"], mastery: { c: 3 } }), 1);
});

test("题卡兼容 point_id 和 pointId 两种模型字段", () => {
  const base = { type: "true_false", prompt: "天空是蓝色吗？", answer: true };
  assert.equal(Study.parseQuiz(JSON.stringify(Object.assign({ quiz: Object.assign({ point_id: "a" }, base) }))).pointId, "a");
  assert.equal(Study.parseQuiz(JSON.stringify(Object.assign({ quiz: Object.assign({ pointId: "b" }, base) }))).pointId, "b");
});
