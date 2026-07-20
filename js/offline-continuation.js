(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OfflineContinuation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function meaningfulMessages(msgs) {
    return (Array.isArray(msgs) ? msgs : []).filter(m => m && m.kind !== "ooc" && String(m.content || "").trim());
  }

  // “没在按钮里输入字”不等于自主续演：Lisa 可能先连发几条，再按「让 Ta 演绎」。
  // 只有最后一拍本来就是模型生成的，才算让角色继续自己过剧情。
  function isAutonomousContinuation(msgs) {
    const list = meaningfulMessages(msgs);
    const last = list[list.length - 1];
    if (!last) return false;
    if (last.role === "char") return true;
    return last.role === "narration" && (last.generated === true || /^gc_/.test(String(last.id || "")));
  }

  function cue(isGroup) {
    const subject = isGroup ? "最后一个角色或旁白 beat" : "角色刚刚写出的最后一段";
    const actor = isGroup ? "在场角色可以彼此接话、行动或引出新状况" : "角色和环境可以主动行动";
    return "\n\n【自主续演·不是重新回答】Lisa 这一轮没有追加新动作或台词。叙事锚点必须是会话中的" + subject + "，不是更早那条 Lisa 消息。承接最后一拍把剧情向前推进，至少造成一个看得见的新变化（动作完成、位置变化、新信息出现、话题转折、决定或意外之一）。不得复述、改写或再次完成上一拍已经发生的动作/对话；" + actor + "，但不要替 Lisa 发明新的台词、动作、选择或感受。";
  }

  return { meaningfulMessages, isAutonomousContinuation, cue };
});
