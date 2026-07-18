// ============================================================
// 记忆固化 · 聚类建议器（consolidation 步骤一）
// 纯前端确定性算法，零 API 费。只「建议」不「创建」：建议卡点开后
// 预填进 EventComposeSheet，仍走既有候选请求流程（核对→执笔→过目→确认），
// 同意权全程在 Lisa 手里——事件层 v1 合同「不做自动聚类」指的是不自动
// 建候选，本模块不触碰任何写入；superseded 留档条永不进入新建议。
// 算法：按主角色分组 → 时间链（间隔>gap 断开）→ 标签聚合评分。
// ============================================================
(function (root, factory) {
  const api = factory();
  if (typeof window !== "undefined") window.Consolidate = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(this, function () {
  "use strict";
  const GAP_MS = 48 * 3600000; // 两条碎片隔 48h 以上视作两件事
  const MIN_SIZE = 3, MAX_SIZE = 30, TOP_N = 5;

  function buildCluster(charId, items) {
    // 超过执笔上限时取最近 30 条，砍掉多少明说（不静默截断）
    const trimmed = items.length > MAX_SIZE ? items.slice(-MAX_SIZE) : items;
    const tagCount = {};
    trimmed.forEach(e => (Array.isArray(e.tags) ? e.tags : []).forEach(tg => { if (tg) tagCount[tg] = (tagCount[tg] || 0) + 1; }));
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 2).map(x => x[0]);
    const coherence = trimmed.length && topTags.length ? tagCount[topTags[0]] / trimmed.length : 0;
    return {
      key: String(charId) + ":" + String(trimmed[0].id),
      charId: charId === "_misc" ? null : charId,
      ids: trimmed.map(e => e.id),
      startTs: Number(trimmed[0].ts),
      endTs: Number(trimmed[trimmed.length - 1].ts),
      topTags,
      size: trimmed.length,
      truncatedFrom: items.length > MAX_SIZE ? items.length : null,
      score: Math.round((trimmed.length + coherence * 4) * 100) / 100
    };
  }

  // entries: [{id,text,ts,tags,charIds,...}]；opts.usedIds: 已进事件/候选的碎片 ID（Set 或数组）
  function suggestClusters(entries, opts) {
    opts = opts || {};
    const gapMs = Number(opts.gapMs) > 0 ? Number(opts.gapMs) : GAP_MS;
    const minSize = Number(opts.minSize) >= 2 ? Number(opts.minSize) : MIN_SIZE;
    const topN = Number(opts.topN) > 0 ? Number(opts.topN) : TOP_N;
    const used = opts.usedIds instanceof Set ? opts.usedIds : new Set(Array.isArray(opts.usedIds) ? opts.usedIds : []);
    const rows = (Array.isArray(entries) ? entries : []).filter(e =>
      e && e.id && e.text && Number.isFinite(Number(e.ts)) && !e.deleted && !e.archived && (e.surfaceState || e.surface_state || "active") === "active" && !used.has(e.id));
    const byChar = new Map();
    rows.forEach(e => {
      const c = Array.isArray(e.charIds) && e.charIds.length ? String(e.charIds[0]) : "_misc";
      if (!byChar.has(c)) byChar.set(c, []);
      byChar.get(c).push(e);
    });
    const clusters = [];
    byChar.forEach((list, charId) => {
      list.sort((a, b) => Number(a.ts) - Number(b.ts) || String(a.id).localeCompare(String(b.id)));
      let cur = [];
      const flush = () => { if (cur.length >= minSize) clusters.push(buildCluster(charId, cur)); cur = []; };
      list.forEach(e => {
        if (cur.length && Number(e.ts) - Number(cur[cur.length - 1].ts) > gapMs) flush();
        cur.push(e);
      });
      flush();
    });
    clusters.sort((a, b) => b.score - a.score || b.endTs - a.endTs || String(a.key).localeCompare(String(b.key)));
    return clusters.slice(0, topN);
  }

  return Object.freeze({ GAP_MS, MIN_SIZE, MAX_SIZE, suggestClusters });
});
