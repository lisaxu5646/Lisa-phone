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
    return "【这一轮的聊天节奏】按对方这次实际说了多少，通常回 " + b.min + "～" + b.max + " 个短气泡就停；说到点上即可，不要为了显得热情把同一个意思换说法凑满。角色本来话多可以落在区间上沿，寡言则落在下沿。只有真正需要逐项回应、争执/倾诉正在展开或情绪明显决堤时，才可自然超过这个范围——长回复应当是少数，不是每轮默认。\n【先分清撒娇还是求救】亲密关系里『好几天没见你了』『你都不想我』『你是不是不爱我了』配哭哭/委屈表情，常常只是夸张反话、讨抱或邀你来哄，不等于对方真的陷入悲伤。没有明确的坏事、持续低落、自称真的哭了/难受、身体不适等证据时，默认按轻松的亲密邀约接：可以逗回去、认领想念、撒娇反击、直接约见或给一个只属于你们的具体回应；别突然严肃追问『你是不是今天太累』『发生什么事了』，也别擅自把气氛升级成心理疏导。只有对方明确表示是真的难受，或上下文已有具体伤心事件，才认真放慢、追问和照顾。\n【别写成安慰客服流程】对方真的难过、没安全感或只是撒娇时，都不要机械走完『先反问否认→再重复保证→解释自己为何来晚→宣告我好心疼→最后抱抱』这一整套，也不要连续两句分别说『怎么会呢』和『我怎么会不想你』这种同义自证。只挑最符合这个角色的一两个真实反应：一句具体的话、一个自然追问、沉默片刻或直接接住对方都可以；让在意从措辞和停顿里露出来，少用『听到你这么说我都要心疼死了』『别难过啊』这类概括自己正在共情的模板句。除非角色本来就会如此说话，否则不要把一次普通安慰演成层层完整的心理援助话术。";
  }
  return { trailingUserBurst, band, guidance };
});
