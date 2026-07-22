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
    return "【这一轮的聊天节奏】按对方这次实际说了多少，通常回 " + b.min + "～" + b.max + " 个短气泡就停；说到点上即可，不要为了显得热情把同一个意思换说法凑满。角色本来话多可以落在区间上沿，寡言则落在下沿。只有真正需要逐项回应、争执/倾诉正在展开或情绪明显决堤时，才可自然超过这个范围——长回复应当是少数，不是每轮默认。";
  }
  return { trailingUserBurst, band, guidance };
});
