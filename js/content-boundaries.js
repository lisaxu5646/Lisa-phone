(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ContentBoundaries = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const TOBACCO = /抽烟|吸烟|香烟|烟草|烟蒂|烟灰|烟斗|烟卷|卷烟|雪茄|电子烟|点(?:了|着|起|上)?(?:一)?(?:根|支)?烟|递(?:了|来|过|给.{0,4})?(?:一)?(?:根|支)?烟|叼(?:着|了)?烟|掐灭.{0,3}烟|吞云吐雾|尼古丁|\bvap(?:e|ing)\b|\bcigarette(?:s)?\b|\bsmok(?:e|es|ed|ing)\b/i;
  const hasTobacco = value => TOBACCO.test(String(value == null ? "" : value));
  const prompt = "【生活方式硬边界·世界事实】所有角色默认都没有吸烟习惯，也不会抽烟、点烟、叼烟、递烟或用电子烟；不要拿烟草当作成熟、疲惫、冷淡、烦躁或性感的氛围道具，不要把相关内容写进日程、动作、心声、穿着、聊天或线下叙事。这不是角色在克制，也不要反复提『因为 Lisa 不喜欢所以不抽』——在这个世界里他们本来就不靠烟草表达自己。只有 Lisa 主动谈到戒烟、烟草危害等主题时，才可就话题正常回应，但角色本人仍不吸烟。";
  function sanitizeSchedule(plan) {
    const src = plan && typeof plan === "object" ? plan : {};
    const seqs = (Array.isArray(src.seqs) ? src.seqs : []).map(s => {
      const d = s && s.deviation;
      const bad = hasTobacco(s && s.title) || hasTobacco(s && s.location) || hasTobacco(d && d.plan) || hasTobacco(d && d.reason) || hasTobacco(d && d.actual);
      return bad ? { ...s, title: "短暂休息，整理思绪", location: hasTobacco(s && s.location) ? "室内" : (s.location || "室内"), type: "rest", deviation: null } : s;
    });
    const clean = key => (Array.isArray(src[key]) ? src[key] : []).filter(x => x && !hasTobacco(x.text));
    return { ...src, seqs, murmurs: clean("murmurs"), yesterdayMurmurs: clean("yesterdayMurmurs") };
  }
  function sanitizeScheduleBook(book) {
    const out = {};
    Object.entries(book && typeof book === "object" ? book : {}).forEach(([charId, days]) => {
      out[charId] = {};
      Object.entries(days && typeof days === "object" ? days : {}).forEach(([day, plan]) => { out[charId][day] = sanitizeSchedule(plan); });
    });
    return out;
  }
  return { hasTobacco, prompt, sanitizeSchedule, sanitizeScheduleBook };
});
