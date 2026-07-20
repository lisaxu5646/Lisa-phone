(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MoodLabel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const EN_ZH = Object.freeze({
    proud: "骄傲", pride: "骄傲", accomplished: "有成就感", satisfied: "满足", content: "满足",
    happy: "开心", joyful: "喜悦", excited: "兴奋", cheerful: "愉快", delighted: "欣喜",
    warm: "温柔", tender: "柔软", affectionate: "亲昵", loving: "爱意满满", grateful: "感激",
    calm: "平静", peaceful: "安宁", relaxed: "放松", neutral: "平静", thoughtful: "若有所思",
    curious: "好奇", focused: "专注", determined: "坚定", hopeful: "期待", confident: "自信",
    tired: "疲惫", sleepy: "困倦", bored: "无聊", lonely: "孤独", sad: "难过",
    hurt: "受伤", disappointed: "失望", frustrated: "挫败", annoyed: "烦躁", angry: "生气",
    anxious: "焦虑", worried: "担心", nervous: "紧张", afraid: "害怕", jealous: "吃醋",
    embarrassed: "害羞", shy: "害羞", guilty: "愧疚", confused: "困惑", surprised: "惊讶",
    relieved: "如释重负"
  });
  function localize(label) {
    const raw = String(label == null ? "" : label).trim();
    if (!raw) return raw;
    const key = raw.toLowerCase().replace(/[\s_-]+/g, " ");
    if (EN_ZH[key]) return EN_ZH[key];
    if (/^[a-z][a-z\s_&+/-]*$/i.test(raw)) {
      const parts = key.split(/\s*(?:and|&|\+|\/)\s*/).filter(Boolean);
      const mapped = parts.map(function (p) { return EN_ZH[p]; }).filter(Boolean);
      return mapped.length ? Array.from(new Set(mapped)).join("、") : "心绪复杂";
    }
    return raw;
  }
  function normalizeMood(mood) {
    if (!mood || typeof mood !== "object") return mood;
    return Object.assign({}, mood, { label: localize(mood.label), baseline: localize(mood.baseline), softened: localize(mood.softened) });
  }
  return { localize: localize, normalizeMood: normalizeMood, EN_ZH: EN_ZH };
});
