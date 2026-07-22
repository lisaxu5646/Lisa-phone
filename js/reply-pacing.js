(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReplyPacing = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function trailingUserBurst(history) {
    const out = [];
    for (let i = (Array.isArray(history) ? history.length : 0) - 1; i >= 0; i--) {
      const m = history[i];
      if (!m || m.recalled || m.kind === "ooc" || m.kind === "system") continue;
      if (m.role === "assistant" || m.role === "char") break;
      if (m.role === "user" || m.role === "narration") out.unshift(m);
    }
    return out;
  }
  function band(history, options) {
    if (options && (options.proactive || options.continueMode)) return { min: 1, max: 2, kind: "self_continue" };
    const burst = trailingUserBurst(history);
    const chars = burst.reduce((n, m) => n + String(m.content || "").replace(/\s+/g, "").length, 0);
    if (burst.length <= 1 && chars <= 28) return { min: 1, max: 2, kind: "short" };
    if (burst.length <= 2 && chars <= 100) return { min: 1, max: 3, kind: "normal" };
    return { min: 2, max: 4, kind: "substantial" };
  }
  function guidance(history, options) {
    const b = band(history, options);
    return "【这一轮的聊天节奏】按对方这次实际说了多少，通常回 " + b.min + "～" + b.max + " 个短气泡就停；说到点上即可，不要为了显得热情把同一个意思换说法凑满。角色本来话多可以落在区间上沿，寡言则落在下沿。只有真正需要逐项回应、争执或倾诉正在展开时，才自然超过范围；长回复应当是少数。\n【先理解这句话在做什么】结合关系、语气、表情和前文，判断对方此刻是在撒娇、玩笑、求确认、普通分享、吐槽、真实倾诉还是争执，而不是只按字面关键词反应。先匹配对方实际给出的情绪重量，再用这个角色本人最自然的方式接住：证据不足时保持轻量，不擅自把玩笑变严肃、把抱怨变求建议、把求关注变心理危机；有明确事实表明对方真的受伤或需要帮助时，才放慢并认真追问。一次回复只做必要的事，不重复表达同一意图，也不自动跑完否认、解释、共情、保证、建议等整套话术。具体回应优先于概括自己正在关心；角色差异优先于统一的高情商模板。";
  }
  return { trailingUserBurst, band, guidance };
});
