const assert = require("assert");
const flow = require("../js/offline-continuation.js");

assert.strictEqual(flow.isAutonomousContinuation([
  { id: "u1", role: "user", content: "我先说第一句" },
  { id: "u2", role: "user", content: "我再补一句" }
]), false, "Lisa 连发后按演绎，仍应回应她的新消息");

assert.strictEqual(flow.isAutonomousContinuation([
  { id: "u1", role: "user", content: "我把门推开" },
  { id: "c1", role: "char", content: "他接住门，走进屋里。" }
]), true, "最后一拍由角色生成时才进入自主续演");

assert.strictEqual(flow.isAutonomousContinuation([
  { id: "gc_1", role: "narration", generated: true, content: "走廊尽头响起脚步声。" }
]), true, "群线下的生成旁白也可成为下一拍锚点");

assert.strictEqual(flow.isAutonomousContinuation([
  { id: "n_1", role: "narration", content: "今晚大家在厨房。" }
]), false, "Lisa 写的开场旁白仍需先得到回应");

const single = flow.cue(false);
assert(single.includes("不是重新回答"));
assert(single.includes("至少造成一个看得见的新变化"));
assert(single.includes("不要替 Lisa 发明新的台词、动作、选择或感受"));

const group = flow.cue(true);
assert(group.includes("最后一个角色或旁白 beat"));
assert(group.includes("彼此接话"));

console.log("offline continuation tests passed");
