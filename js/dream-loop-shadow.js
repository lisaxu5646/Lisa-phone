// ============================================================
// 内在生活系统 D · 步骤 1：梦回路队列运行时（SHADOW/QUEUE ONLY）
// 只入队不生成不展示：REM 窗到点 → 采材料（引用+hash）→ 1B 阈值判定 → 入队或记无梦。
// 存储独立 IDB lisa_dreams_v1（不进 saves）；梦≠记忆：本模块永不触碰 memories。
// 账号归属：getSessionUser 血泪模板——取不到沿用旧 owner 绝不清仓。
// 对 A/B/C/E 四线只读（C 的 sleepState 由 app.js 胶水层把 tick 返回值递进来）。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_dreams_v1", DB_VERSION = 1, DIAG_CAP = 400;
  let dbPromise = null;
  const core = () => window.DreamLoopCore;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const q = indexedDB.open(DB_NAME, DB_VERSION);
      q.onupgradeneeded = () => {
        const db = q.result;
        if (!db.objectStoreNames.contains("dreams")) db.createObjectStore("dreams", { keyPath: "key" });
        if (!db.objectStoreNames.contains("diag")) db.createObjectStore("diag", { keyPath: "_id", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
      };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  async function ensureOwner() {
    try {
      const u = window.Cloud && window.Cloud.getSessionUser ? await window.Cloud.getSessionUser() : null;
      if (!(u && u.id)) return; // unknown＝沿用现状，绝不清仓
      const db = await openDB(), tx = db.transaction(["dreams", "diag", "meta"], "readwrite");
      const cur = await rq(tx.objectStore("meta").get("owner"));
      if (cur && cur.v && cur.v !== u.id) { tx.objectStore("dreams").clear(); tx.objectStore("diag").clear(); }
      tx.objectStore("meta").put({ k: "owner", v: u.id });
      await done(tx);
    } catch (e) {}
  }

  async function addDiag(row) {
    try {
      const C = core();
      const clean = { t: Date.now(), c: C ? C.hash(row.charId) : "?", kind: String(row.kind || ""), reason: row.reason || null, night: row.night || null, intensityBucket: typeof row.intensity === "number" ? Math.round(row.intensity * 10) / 10 : null };
      const db = await openDB(), tx = db.transaction("diag", "readwrite"), s = tx.objectStore("diag");
      s.add(clean);
      const n = await rq(s.count());
      if (n > DIAG_CAP) (await rq(s.getAllKeys())).slice(0, n - DIAG_CAP).forEach(k => s.delete(k));
      await done(tx);
    } catch (e) {}
  }

  // 材料采集（全部 best-effort 只读；正文只就地哈希不出函数）
  async function gatherSources(char) {
    const src = { chatItems: [], emotionCurrent: null, relationActiveAxes: [], afterglowLevel: 0, calendarEvents: [] };
    try {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const msgs = (typeof loadJSON === "function" ? loadJSON("x_chat:" + char.id, []) : []) || [];
      src.chatItems = msgs.filter(m => m && !m.recalled && Number(m.ts || 0) >= dayStart.getTime())
        .map((m, i) => ({ id: m.id || m.turnId || (String(m.ts || 0) + ":" + i), content: m.content }));
    } catch (e) {}
    try {
      const u = window.Cloud && window.Cloud.getSessionUser ? await window.Cloud.getSessionUser() : null;
      const ownerId = u && u.id ? u.id : "local-device";
      const st = window.InnerLifeAShadow ? await window.InnerLifeAShadow.get(ownerId, char.id) : null;
      if (st && st.emotion && st.emotion.current) src.emotionCurrent = st.emotion.current;
      if (st && st.relationAxes && st.relationAxes.axes) src.relationActiveAxes = Object.entries(st.relationAxes.axes).filter(([, a]) => a && a.active).map(([k]) => k);
    } catch (e) {}
    return src;
  }

  // 胶水入口：app.js 的 C 线 tick 后调用（sleepState=tick 返回值，只读）
  async function observe(char, sleepState) {
    try {
      const C = core();
      if (!C || !char || !char.id || !sleepState) return null;
      if (!C.remDue(sleepState, Date.now())) return null;
      const night = C.nightKeyOf(sleepState.sleepStartTs, 0);
      const key = C.dreamKey(char.id, night);
      await ensureOwner();
      const db = await openDB();
      const existed = await rq(db.transaction("dreams", "readonly").objectStore("dreams").get(key));
      if (existed) return null; // 一夜一梦幂等（含已记录的无梦夜）
      const material = C.buildMaterial(await gatherSources(char));
      const verdict = C.shouldDream(material, {});
      const row = { key, charId: char.id, nightKey: night, status: verdict.dream ? "queued" : "no_dream",
        materialRefs: material.refs, peaks: material.peaks, relationActiveAxes: material.relationActiveAxes,
        intensity: material.intensity, source: "dream", createdAt: Date.now() };
      const tx = db.transaction("dreams", "readwrite"); tx.objectStore("dreams").put(row); await done(tx);
      addDiag({ charId: char.id, kind: verdict.dream ? "enqueued" : "skipped_no_dream", reason: verdict.reason, night, intensity: material.intensity });
      return row.status;
    } catch (e) { return null; }
  }

  async function report(n) {
    try {
      await ensureOwner();
      const db = await openDB();
      const all = (await rq(db.transaction("diag", "readonly").objectStore("diag").getAll())).slice(-(n || 200));
      const agg = { observations: all.length, enqueued: 0, noDream: {}, nights: new Set() };
      all.forEach(r => {
        if (r.kind === "enqueued") agg.enqueued++;
        if (r.kind === "skipped_no_dream") agg.noDream[r.reason || "?"] = (agg.noDream[r.reason || "?"] || 0) + 1;
        if (r.night) agg.nights.add(r.night);
      });
      const queued = (await rq(db.transaction("dreams", "readonly").objectStore("dreams").getAll())).filter(d => d.status === "queued").length;
      return { observations: agg.observations, enqueued: agg.enqueued, noDream: agg.noDream, nightsSeen: agg.nights.size, queuedNow: queued };
    } catch (e) { return { error: "dream_report_failed" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction(["dreams", "diag", "meta"], "readwrite"); ["dreams", "diag", "meta"].forEach(s => tx.objectStore(s).clear()); await done(tx); } catch (e) {} }

  // ---- 步骤 2：给解梦馆的读写口（懒生成由 UI 触发，这里只存取）----
  async function listDreams(limit) {
    try {
      await ensureOwner();
      const db = await openDB();
      const all = await rq(db.transaction("dreams", "readonly").objectStore("dreams").getAll());
      return all.sort((a, b) => String(b.nightKey).localeCompare(String(a.nightKey)) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit || 60);
    } catch (e) { return []; }
  }
  async function saveGenerated(key, gen) {
    try {
      const db = await openDB();
      const row = await rq(db.transaction("dreams", "readonly").objectStore("dreams").get(key));
      if (!row || row.status !== "queued") return null;
      const next = { ...row, status: "generated",
        narrative: String(gen.narrative || "").slice(0, 2000), motifs: (Array.isArray(gen.motifs) ? gen.motifs : []).slice(0, 4).map(x => String(x).slice(0, 12)),
        tone: String(gen.tone || "").slice(0, 8), wakeLine: String(gen.wakeLine || "").slice(0, 120), generatedAt: Date.now() };
      const tx = db.transaction("dreams", "readwrite"); tx.objectStore("dreams").put(next); await done(tx);
      addDiag({ charId: row.charId, kind: "generated", night: row.nightKey, intensity: row.intensity });
      return next;
    } catch (e) { return null; }
  }

  window.DreamLoop = { observe, report, clearAll, listDreams, saveGenerated };
})();
