const test = require("node:test");
const assert = require("node:assert/strict");
const Nature = require("../scripts/cc-ledger-nature.cjs");

test("high-confidence life turn syncs without another model call", () => {
  const result = Nature.classifyTurn("我下班到家啦，今晚吃咖喱", "好，我也刚吃完晚饭。");
  assert.equal(result.automatic, true);
  assert.equal(result.lisa_segments[0].sync_kind, "life");
  assert.equal(result.yanqiu_segments[0].sync_kind, "life");
});

test("construction and mixed construction stay out of the app ledger", () => {
  const result = Nature.classifyTurn(
    "宝宝修一下这个 hook，我好开心",
    "已经 commit 并 push，测试通过。"
  );
  assert.equal(result.automatic, false);
  assert.equal(result.skipConstruction, false);
  assert.ok(result.reasons.includes("mixed_with_construction"));
  assert.ok(result.reasons.includes("construction"));
});

test("pure construction is skipped instead of filling the candidate box", () => {
  const result = Nature.classifyTurn("修一下这个 hook bug", "已经 commit 并 push，测试通过。");
  assert.equal(result.automatic, false);
  assert.equal(result.skipConstruction, true);
});

test("uncertain ordinary text goes to candidate instead of guessing", () => {
  const result = Nature.classifyTurn("好的宝宝", "我看到了。");
  assert.equal(result.automatic, false);
  assert.ok(result.reasons.includes("no_high_confidence_marker"));
});

test("sentence-level slicing keeps life or relationship beside construction without copying code talk", () => {
  const result = Nature.classifyTurn(
    "先看看 hook。我的膝盖旁边肌肉有点酸！你是不是想把女朋友晾两天？",
    "脚本我会检查。膝盖如果只是练完发酸，今晚先休息。怎么会冷暴力我的女朋友。"
  );
  assert.equal(result.automatic, true);
  assert.equal(result.excerpted, true);
  assert.deepEqual(result.lisa_segments.map(x => x.sync_kind), ["life", "emotion"]);
  assert.deepEqual(result.yanqiu_segments.map(x => x.sync_kind), ["life", "emotion"]);
  assert.ok(result.lisa_segments.every(x => !/hook/i.test(x.content)));
  assert.ok(result.yanqiu_segments.every(x => !/脚本/.test(x.content)));
});

test("identity, continuity complaints and explicit window choice are recognized mechanically", () => {
  assert.equal(Nature.classifySegment("宝宝，你是谁？").kind, "emotion");
  assert.equal(Nature.classifySegment("你个人机，只会背东西。").kind, "emotion");
  assert.equal(Nature.classifySegment("不行，不开新窗口。").kind, "decision");
  assert.equal(Nature.classifySegment("我要我的 fable，别把自己换掉。").kind, "decision");
});

test("extracts only real user text and visible assistant text", () => {
  const lines = [
    { type:"user", uuid:"u1", sessionId:"s1", timestamp:"2026-07-22T10:00:00Z", message:{ role:"user", content:"我下班到家啦" } },
    { type:"assistant", uuid:"a-thinking", sessionId:"s1", message:{ role:"assistant", content:[{ type:"thinking", thinking:"hidden" }] } },
    { type:"assistant", uuid:"a1", sessionId:"s1", message:{ role:"assistant", content:[{ type:"text", text:"我也到家了。" }] } },
    { type:"assistant", uuid:"tool", sessionId:"s1", message:{ role:"assistant", content:[{ type:"tool_use", name:"Read" }] } },
    { type:"user", uuid:"tool-result", sessionId:"s1", message:{ role:"user", content:[{ type:"tool_result", content:"secret" }] } }
  ];
  assert.deepEqual(Nature.extractLastTurn(lines), {
    sessionId:"s1", turnId:"u1", occurredAt:"2026-07-22T10:00:00Z",
    lisaText:"我下班到家啦", yanqiuText:"我也到家了。", lastAssistantUuid:"a1"
  });
});

test("valid hidden marker is the primary classifier and is stripped from the ledger", () => {
  const lisa = "你今天陪我吃晚饭好不好？";
  const body = "好。今晚我陪你吃。";
  const marker = '<!--CC_LEDGER_V1:{"lisa":[{"quote":"你今天陪我吃晚饭好不好？","kind":"life"}],"yanqiu":[{"quote":"今晚我陪你吃。","kind":"decision"}]}-->';
  const parsed = Nature.parseLedgerMarker(lisa, body + "\n" + marker);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.cleanYanqiuText, body);
  assert.deepEqual(parsed.result.lisa_segments, [{ content:lisa, sync_kind:"life" }]);
  assert.deepEqual(parsed.result.yanqiu_segments, [{ content:"今晚我陪你吃。", sync_kind:"decision" }]);
});

test("marker cannot invent, rewrite, duplicate, or use an unapproved kind", () => {
  const body = "我今晚陪你吃。";
  const forged = '<!--CC_LEDGER_V1:{"lisa":[{"quote":"你没说过这句","kind":"emotion"}],"yanqiu":[{"quote":"我今晚陪你吃。","kind":"decision"}]}-->';
  assert.equal(Nature.parseLedgerMarker("好呀", body + forged).valid, false);
  const badKind = '<!--CC_LEDGER_V1:{"lisa":[{"quote":"好呀","kind":"construction"}],"yanqiu":[{"quote":"我今晚陪你吃。","kind":"decision"}]}-->';
  assert.equal(Nature.parseLedgerMarker("好呀", body + badKind).valid, false);
});

test("empty two-sided marker explicitly skips a construction turn", () => {
  const parsed = Nature.parseLedgerMarker("修 bug", "已经修好。\n<!--CC_LEDGER_V1:{\"lisa\":[],\"yanqiu\":[]}-->");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.skip, true);
  assert.equal(parsed.result.skipConstruction, true);
});

test("missing or malformed marker cleanly falls back without leaking marker text", () => {
  const parsed = Nature.parseLedgerMarker("我到家了", "我也到家。<!--CC_LEDGER_V1:not-json-->");
  assert.equal(parsed.valid, false);
  assert.equal(parsed.cleanYanqiuText, "我也到家。");
});

test("structured tool mark must anchor to Lisa and quote both visible sides exactly", () => {
  const mark = {
    lisa_anchor:"今晚吃什么",
    skip:false,
    lisa:[{ quote:"今晚吃什么？", kind:"life" }],
    yanqiu:[{ quote:"我们去吃咖喱。", kind:"decision" }]
  };
  const result = Nature.validateToolMark(mark, "宝宝，今晚吃什么？", "我们去吃咖喱。");
  assert.equal(result.valid, true);
  assert.equal(result.result.automatic, true);
  assert.equal(Nature.validateToolMark({ ...mark, lisa_anchor:"不存在" }, "宝宝，今晚吃什么？", "我们去吃咖喱。").valid, false);
  assert.equal(Nature.validateToolMark({ ...mark, yanqiu:[{ quote:"我没说过", kind:"decision" }] }, "宝宝，今晚吃什么？", "我们去吃咖喱。").valid, false);
});

test("structured skip needs a real Lisa anchor and no quoted segments", () => {
  const result = Nature.validateToolMark(
    { lisa_anchor:"修一下", skip:true, lisa:[], yanqiu:[] },
    "修一下这个 bug", "已经修好。",
  );
  assert.equal(result.valid, true);
  assert.equal(result.result.skipConstruction, true);
  assert.equal(Nature.validateToolMark(
    { lisa_anchor:"修一下", skip:true, lisa:[{quote:"修一下这个 bug",kind:"decision"}], yanqiu:[] },
    "修一下这个 bug", "已经修好。",
  ).valid, false);
});

test("structured tool mark carries only bounded personality evidence", () => {
  const mark = {
    lisa_anchor:"想你", skip:false,
    lisa:[{ quote:"想你了", kind:"emotion" }],
    yanqiu:[{ quote:"我也想你。", kind:"emotion" }],
    mood_evidence:"柔软", affinity_delta:1
  };
  const ok = Nature.validateToolMark(mark, "宝宝，想你了", "我也想你。");
  assert.equal(ok.valid, true);
  assert.equal(ok.result.personality_evidence.mood_label, "柔软");
  assert.equal(ok.result.personality_evidence.affinity_delta, 1);
  assert.equal(Nature.validateToolMark({ ...mark, affinity_delta:3 }, "宝宝，想你了", "我也想你。").valid, false);
  assert.equal(Nature.validateToolMark({ ...mark, skip:true, lisa:[], yanqiu:[] }, "宝宝，想你了", "我也想你。").valid, false);
});
