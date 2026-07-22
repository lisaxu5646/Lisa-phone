const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../js/app.js"), "utf8");

test("心声要求直接内在声音，而不是第三人称角色分析报告", () => {
  assert.match(app, /心声是正在发生的意识，不是角色分析报告/);
  assert.match(app, /本人自然的第一人称内在语气/);
  assert.match(app, /导演笔记，不是心声/);
  assert.match(app, /制定接下来该怎样回复\/安抚的策略/);
});

test("没有真实意识片段允许 null，不强迫每轮编转念", () => {
  assert.match(app, /内里没有新的意识片段时就填 null/);
  assert.match(app, /不必为了显得有变化而硬编新的心理转折/);
  assert.doesNotMatch(app, /别懒——大多数有来有回的对话轮次/);
});

test("旧导演稿不再作为下一轮心声范文回喂", () => {
  assert.match(app, /lastThoughtRaw/);
  assert.match(app, /ThoughtVoiceGuard\.accept\(lastThoughtRaw\)/);
});
