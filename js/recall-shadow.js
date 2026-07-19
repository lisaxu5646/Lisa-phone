// ============================================================
// ⑤后·记忆质量线 P0-1：召回质量旁路仪表 + P0-2 冷却旁路（v49.15）
// （施工图 supabase/memory_quality_construction_plan.md §1-§2；Tidal shadow 姿势）
// 铁律：只观测，永不改变 retrieveMemories 实际返回；诊断关闭=零写入；
//       诊断损坏不阻塞聊天（全链 try/catch）；只记 ID/分数桶/计数，绝不记正文与 query 原文。
// 存储：独立 IndexedDB lisa_recall_shadow_v1（diag 环形 ≤500 条/14 天 + ring/turn 状态），
//       不进 x_ 云存档。ring 按 charId 分、账号本地、清数据即清。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_recall_shadow_v1", DB_VERSION = 2; // v2：diag 主键改 _id（曾与观测字段 k 撞名导致静默丢行）
  const DIAG_CAP = 500, DIAG_MAX_AGE = 14 * 86400000;
  const COOL_TURNS = 4, RING_CAP = 48;
  const OFF_KEY = "recall_shadow_off"; // 非 x_ 前缀：诊断开关是本机事，不上云
  let dbPromise = null, persistTimer = null;

  // ---- 内存态（engine 同步读）----
  const rings = new Map(); // charId -> [{id, turn}]
  const turns = new Map(); // charId -> int
  let hydrated = false;

  const off = () => { try { return localStorage.getItem(OFF_KEY) === "1"; } catch (e) { return false; } };
  const charHash = id => { // 不可逆短 hash（djb2），诊断里不落真实 charId
    let h = 5381; const s = String(id || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (db.objectStoreNames.contains("diag")) db.deleteObjectStore("diag"); // v1 主键撞名，重建（纯诊断数据，可弃）
        db.createObjectStore("diag", { keyPath: "_id", autoIncrement: true });
        if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("recall shadow IDB open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  async function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      const db = await openDB(), tx = db.transaction("state", "readonly");
      const row = await rq(tx.objectStore("state").get("rings"));
      await done(tx);
      if (row && row.rings) Object.entries(row.rings).forEach(([k, v]) => rings.set(k, v));
      if (row && row.turns) Object.entries(row.turns).forEach(([k, v]) => turns.set(k, v));
    } catch (e) {/* 空手起步 */}
  }
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      try {
        const db = await openDB(), tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put({ key: "rings", rings: Object.fromEntries(rings), turns: Object.fromEntries(turns) });
        await done(tx);
      } catch (e) {}
    }, 1200);
  }

  // ---- 引擎侧：同步查询 ----
  function ringFor(charId) { return rings.get(charId) || []; }
  function turnOf(charId) { return turns.get(charId) || 0; }
  // 只有「实际注入聊天且 touch!==false」的召回才写 ring（engine 调用处保证）；旁路计算不污染 ring
  function noteSurfaced(charId, ids) {
    if (off() || !charId || !ids || !ids.length) return;
    try {
      const t = turnOf(charId);
      const ring = (rings.get(charId) || []).filter(x => x && ids.indexOf(x.id) < 0);
      ids.forEach(id => ring.push({ id, turn: t }));
      rings.set(charId, ring.slice(-RING_CAP));
      schedulePersist();
    } catch (e) {}
  }
  // 该角色完成一次正常回复后 +1（app.js 回复成功处调用）；后台/预览/touch:false 不计
  function turnDone(charId) {
    if (off() || !charId) return;
    try { turns.set(charId, turnOf(charId) + 1); schedulePersist(); } catch (e) {}
  }
  // 冷却判定（P0-2 旁路用）：4 个该角色 turn 内浮现过=冷却中；pinned/open/top-1 由调用方豁免
  function isCooling(charId, memId) {
    const t = turnOf(charId);
    return ringFor(charId).some(x => x && x.id === memId && t - x.turn < COOL_TURNS);
  }

  // ---- 诊断写入（fire-and-forget，环形清理）----
  async function observe(entry) {
    if (off()) return;
    try {
      await hydrate();
      const db = await openDB(), tx = db.transaction("diag", "readwrite");
      const store = tx.objectStore("diag");
      store.add({ ...entry, t: Date.now() });
      await done(tx);
      // 超量/超龄清理（偶发跑一次即可）：先删超过 14 天的，再从最旧删到 ≤500 条
      if (Math.random() < 0.08) {
        const db2 = await openDB(), tx2 = db2.transaction("diag", "readwrite"), s2 = tx2.objectStore("diag");
        const all = await rq(s2.getAll());
        const keys = await rq(s2.getAllKeys());
        const cutoff = Date.now() - DIAG_MAX_AGE;
        const dropSet = new Set();
        all.forEach((row, i) => { if (row.t < cutoff) dropSet.add(keys[i]); });
        for (let i = 0; i < all.length && all.length - dropSet.size > DIAG_CAP; i++) dropSet.add(keys[i]); // keys 升序=最旧在前
        dropSet.forEach(k => s2.delete(k));
        await done(tx2);
      }
    } catch (e) {/* 诊断死了不关聊天的事 */}
  }

  // ---- 报表（CtxDebug 只读区用）----
  async function report(n) {
    try {
      await hydrate();
      const db = await openDB(), tx = db.transaction("diag", "readonly");
      const all = await rq(tx.objectStore("diag").getAll());
      await done(tx);
      const recent = all.slice(-(n || 200)), invariantRows = recent.filter(x => Number(x.auditVersion || 1) >= 2);
      const agg = { observations: recent.length, empty: 0, repeatSum: 0, replaceSum: 0, cooledSum: 0, kSum: 0, wSum: 0, wNarrow: 0, wN: 0 };
      recent.forEach(r => {
        if (r.empty) agg.empty++;
        agg.repeatSum += r.repeats || 0;
        agg.replaceSum += r.replaced || 0;
        agg.cooledSum += (r.cooled || []).length;
        agg.kSum += r.k || 0;
        if (typeof r.wsize === "number") { agg.wN++; agg.wSum += r.wsize; if (r.wsize <= 1) agg.wNarrow++; }
      });
      const denom = Math.max(1, agg.kSum);
      const exemptionAudit = { samples: invariantRows.length, legacySamples: recent.length - invariantRows.length, pinnedCoolingCandidates:0,openCoolingCandidates:0,top1CoolingCandidates:0,pinnedCooledViolations:0,openCooledViolations:0,top1CooledViolations:0 };
      invariantRows.forEach(r=>Object.keys(exemptionAudit).filter(k=>!['samples','legacySamples'].includes(k)).forEach(k=>{exemptionAudit[k]+=Number(r.exemptions&&r.exemptions[k]||0);}));
      const firstObservedAt=recent.length?Number(recent[0].t)||null:null,lastObservedAt=recent.length?Number(recent[recent.length-1].t)||null:null;
      return {
        enabled: !off(),
        observations: recent.length,
        firstObservedAt,lastObservedAt,spanHours:firstObservedAt&&lastObservedAt?+((lastObservedAt-firstObservedAt)/3600000).toFixed(2):0,
        emptyRate: recent.length ? +(agg.empty / recent.length).toFixed(3) : 0,
        repeatRate: +(agg.repeatSum / denom).toFixed(3),      // 连续重复率：topK 里 4 轮内刚浮现过的占比
        proposedReplaceRate: +(agg.replaceSum / denom).toFixed(3), // 冷却版会换掉的比例（旁路预测）
        avgCooledPerCall: recent.length ? +(agg.cooledSum / recent.length).toFixed(2) : 0,
        // P0-3 决策数据：95% 同分窗口平均宽度 + 窗口≤1 的占比（占比高=随机没意义，保持确定排序）
        avgWindowSize: agg.wN ? +(agg.wSum / agg.wN).toFixed(2) : 0,
        narrowWindowRate: agg.wN ? +(agg.wNarrow / agg.wN).toFixed(3) : 0,
        exemptionAudit,
        rings: [...rings.entries()].map(([k, v]) => ({ char: charHash(k), ring: v.length, turn: turnOf(k) })),
        last: recent.slice(-5)
      };
    } catch (e) { return { error: "报表读取失败", enabled: !off() }; }
  }
  async function clearAll() {
    try {
      rings.clear(); turns.clear();
      const db = await openDB(), tx = db.transaction(["diag", "state"], "readwrite");
      tx.objectStore("diag").clear(); tx.objectStore("state").clear();
      await done(tx);
    } catch (e) {}
  }
  function setEnabled(on) { try { on ? localStorage.removeItem(OFF_KEY) : localStorage.setItem(OFF_KEY, "1"); } catch (e) {} }

  hydrate();
  window.RecallShadow = { ringFor, turnOf, noteSurfaced, turnDone, isCooling, observe, report, clearAll, setEnabled, charHash, enabled: () => !off() };
})();
