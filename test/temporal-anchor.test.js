const assert = require("assert");
const T = require("../js/temporal-anchor.js");

const source = new Date(2026, 6, 19, 20, 0).getTime();
const now = new Date(2026, 6, 20, 10, 0).getTime();
const note = T.anchor("明天做 X，后天做 Y", source, now);
assert(note.includes("“明天”=2026-07-20（相对现在是今天）"));
assert(note.includes("“后天”=2026-07-21（相对现在是明天）"));
assert(note.includes("不能随着今天变化重新解释"));

assert.strictEqual(T.anchor("以后有空做 X", source, now), "", "没有相对日期词就不增加 prompt");
assert.strictEqual(T.anchor("明天做 X", null, now), "", "没有原消息时间就不猜日期");

const later = new Date(2026, 6, 22, 10, 0).getTime();
const laterNote = T.anchor("明天做 X", source, later);
assert(laterNote.includes("“明天”=2026-07-20（相对现在是2天前）"), "绝对目标日不能跟着当前日期漂移");

console.log("temporal anchor tests passed");
