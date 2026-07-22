const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync(require.resolve("../js/app.js"), "utf8");

test("私聊只为空正文静默补试一次，不吞隐藏思考", () => {
  assert.match(app, /if \(!\/模型返回为空\/\.test/);
  assert.match(app, /【空正文重试】/);
  assert.match(app, /不要输出分析过程/);
  assert.doesNotMatch(app, /reasoning_content/);
});

test("两次仍失败时显示系统行，不冒充角色气泡", () => {
  assert.match(app, /kind: "system",\n\s*content: "（发送失败："/);
});
