const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const components = fs.readFileSync(path.join(__dirname, "../js/components.js"), "utf8");

test("线上旁白以 narration 身份保存，不冒充 Lisa 发言", () => {
  const blocks = [...components.matchAll(/chatMode === "narr"[\s\S]{0,220}?kind:\s*"narration"/g)].map(m => m[0]);
  assert.ok(blocks.length >= 2, "发送与回复按钮都应有旁白路径");
  blocks.forEach(block => assert.match(block, /role:\s*"narration"/));
  assert.match(app, /m\.role === "narration" \|\| m\.kind === "narration"/);
  assert.match(app, /无说话人的场景旁白/);
  assert.match(app, /不得声称.*说过这段话/);
});

test("新旧格式旁白都提供独立删除入口", () => {
  assert.match(components, /m\.kind === "narration" \|\| m\.role === "narration"/);
  assert.match(components, /m\.role === "narration" \|\| m\.kind === "narration"/);
  const deletePrompts = components.match(/删除这条旁白记录/g) || [];
  assert.ok(deletePrompts.length >= 2, "单聊与群聊旁白都应可删");
});

test("旧版误存为 user 的旁白不再进入 Lisa 潮汐证据", () => {
  assert.match(app, /m\.role === "user" && m\.kind !== "narration" && m\.content/);
});
