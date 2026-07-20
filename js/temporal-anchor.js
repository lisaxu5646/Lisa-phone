(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TemporalAnchor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TERMS = [{ word: "前天", delta: -2 }, { word: "昨天", delta: -1 }, { word: "今天", delta: 0 }, { word: "明天", delta: 1 }, { word: "后天", delta: 2 }];
  const pad = n => String(n).padStart(2, "0");
  const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const atDay = (base, delta) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta, 12, 0, 0, 0);
  const dayDiff = (a, b) => Math.round((atDay(a, 0) - atDay(b, 0)) / 86400000);
  const fromNow = diff => diff === 0 ? "今天" : diff === 1 ? "明天" : diff === -1 ? "昨天" : diff > 1 ? diff + "天后" : Math.abs(diff) + "天前";

  function anchor(text, sourceTs, nowTs) {
    const body = String(text || ""), ts = Number(sourceTs);
    if (!body || !Number.isFinite(ts) || ts <= 0) return "";
    const found = TERMS.filter(x => body.includes(x.word));
    if (!found.length) return "";
    const source = new Date(ts), now = new Date(Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now());
    if (!Number.isFinite(source.getTime()) || !Number.isFinite(now.getTime())) return "";
    const mappings = found.map(x => {
      const target = atDay(source, x.delta);
      return "“" + x.word + "”=" + key(target) + "（相对现在是" + fromNow(dayDiff(target, now)) + "）";
    });
    return "〔日期锚：这句话写于 " + key(source) + "；" + mappings.join("，") + "。按绝对日期理解，不能随着今天变化重新解释。〕";
  }

  return { anchor, key };
});
