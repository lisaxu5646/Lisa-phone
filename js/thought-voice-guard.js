// Keep task-analysis / reply-planning prose out of the character's inner-voice history.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ThoughtVoiceGuard = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const clean = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

  function inspect(value) {
    const text = clean(value);
    if (!text || text.toLowerCase() === "null") return { ok: false, reason: "empty" };

    // These are not forbidden words by themselves. They form a structural pattern:
    // recap/classify the other person, then plan how to manage the reply.
    const other = "(?:Lisa|用户|对方|她|他|TA|ta)";
    const recap = new RegExp(other + ".{0,18}(?:说|问|发|等|主动|故意|刚|现在|这会儿|在)");
    const classify = /(?:是在|像是在|看起来|显然|说明|意味着|其实是|应该是).{0,22}(?:撒娇|示弱|试探|求关注|难过|生气|委屈|心情|想让我|引导)/;
    const replyPlan = /(?:我得|我要|我应该|得赶紧|需要|最好|先).{0,24}(?:回复|回应|接住|安抚|哄|顺着|解释|满足|追问|问问|告诉(?:她|他|TA)|说(?:清楚|一下|我))/;
    const interactionPlan = /(?:我|嘴上).{0,18}(?:会|要|得|应该|肯定会).{0,18}(?:满足|别扭|嘴硬|装作|回应|回复|哄|安抚|接住|顺着|解释|追问)/;
    const topicPlan = /(?:关心|逗|试探|追问|回应|回复).{0,18}(?:一下|她|他|TA).{0,24}(?:把|将).{0,12}(?:话题|对话).{0,12}(?:引向|转到|带到)/;
    const directorTerms = /(?:回复策略|回应方式|情绪需求|用户意图|对话走向|这一轮(?:应该|需要)|接下来(?:应该|要|得)|(?:这些|这都).{0,8}(?:可以|能).{0,8}(?:作为|是我的).{0,8}(?:背景|铺垫)|把话题引向)/;
    const hasRecap = recap.test(text);
    const hasClassify = classify.test(text);
    const hasReplyPlan = replyPlan.test(text) || interactionPlan.test(text) || topicPlan.test(text);

    if (directorTerms.test(text)) return { ok: false, reason: "director-language" };
    if (hasReplyPlan && (hasRecap || hasClassify)) return { ok: false, reason: "recap-and-reply-plan" };
    if (hasRecap && hasClassify) return { ok: false, reason: "user-analysis" };
    return { ok: true, reason: "inner-voice" };
  }

  function accept(value) {
    const text = clean(value);
    return inspect(text).ok ? text : null;
  }

  return { inspect, accept };
});
