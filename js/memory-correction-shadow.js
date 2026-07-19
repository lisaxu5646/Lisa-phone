// ============================================================
// 记忆质量线 P1-3：pruneSubsumed 纠错候选旁路观察（v49.22）
// 只记录“新详细条包含旧条”的配对与旧规则结果，不改变真实删留。
// 独立本机 IndexedDB；不存新旧正文、不进云存档，坏了也不能阻塞入库。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_memory_correction_shadow_v1", DB_VERSION = 1;
  const CAP = 500, MAX_AGE = 30 * 86400000;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pairs")) db.createObjectStore("pairs", { keyPath: "pair" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("correction shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  const safeId = x => String(x == null ? "" : x).slice(0, 160);

  async function observePair(input) {
    try {
      const oldId = safeId(input && input.oldId), newId = safeId(input && input.newId);
      if (!oldId || !newId || oldId === newId) return;
      const pair = oldId + "|" + newId, now = Date.now();
      const db = await openDB(), tx = db.transaction("pairs", "readwrite"), store = tx.objectStore("pairs");
      const previous = await rq(store.get(pair));
      store.put({
        pair, oldId, newId,
        firstSeenAt: previous && previous.firstSeenAt || now,
        lastSeenAt: now,
        seenCount: Math.min(9999, Number(previous && previous.seenCount || 0) + 1),
        oldPinned: !!(input && input.oldPinned),
        oldOpen: !!(input && input.oldOpen),
        oldTooShort: !!(input && input.oldTooShort),
        currentWouldPrune: !!(input && input.currentWouldPrune),
        source: safeId(input && input.source || "unknown"),
        proposedAt: previous && previous.proposedAt || null,
        candidateId: previous && previous.candidateId || null
      });
      await done(tx);
      if (Math.random() < 0.08) await trim();
    } catch (e) {/* 旁路坏了不影响真实记忆入库 */}
  }

  async function trim() {
    try {
      const db = await openDB(), tx = db.transaction("pairs", "readwrite"), store = tx.objectStore("pairs");
      const all = await rq(store.getAll()), cutoff = Date.now() - MAX_AGE;
      all.sort((a, b) => Number(a.lastSeenAt || 0) - Number(b.lastSeenAt || 0));
      const expired = all.filter(x => Number(x.lastSeenAt || 0) < cutoff);
      expired.forEach(x => store.delete(x.pair));
      const survivors = all.filter(x => Number(x.lastSeenAt || 0) >= cutoff);
      survivors.slice(0, Math.max(0, survivors.length - CAP)).forEach(x => store.delete(x.pair));
      await done(tx);
    } catch (e) {}
  }

  async function report() {
    try {
      const db = await openDB(), tx = db.transaction("pairs", "readonly"), rows = await rq(tx.objectStore("pairs").getAll());
      await done(tx);
      rows.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
      const firstObservedAt=rows.length?Math.min(...rows.map(x=>Number(x.firstSeenAt)||Infinity)):null,lastObservedAt=rows.length?Math.max(...rows.map(x=>Number(x.lastSeenAt)||0)):null;
      return {
        pairs: rows.length,
        firstObservedAt:Number.isFinite(firstObservedAt)?firstObservedAt:null,lastObservedAt:lastObservedAt||null,spanHours:Number.isFinite(firstObservedAt)&&lastObservedAt?Math.round((lastObservedAt-firstObservedAt)/36000)/100:0,
        currentWouldPrune: rows.filter(x => x.currentWouldPrune).length,
        protectedPinned: rows.filter(x => x.oldPinned).length,
        protectedOpen: rows.filter(x => x.oldOpen).length,
        protectedTooShort: rows.filter(x => x.oldTooShort).length,
        last: rows.slice(0, 20)
      };
    } catch (e) { return { error: "纠错旁路报表读取失败" }; }
  }
  async function pendingPairs() {
    try {
      const db = await openDB(), tx = db.transaction("pairs", "readonly"), rows = await rq(tx.objectStore("pairs").getAll());
      await done(tx);
      return rows.filter(x => x && x.currentWouldPrune && !x.proposedAt).sort((a, b) => Number(a.firstSeenAt || 0) - Number(b.firstSeenAt || 0));
    } catch (e) { return []; }
  }
  async function markProposed(pair, candidateId) {
    try {
      const db = await openDB(), tx = db.transaction("pairs", "readwrite"), store = tx.objectStore("pairs");
      const row = await rq(store.get(String(pair || "")));
      if (row) store.put({ ...row, proposedAt: Date.now(), candidateId: safeId(candidateId) || null });
      await done(tx);
    } catch (e) {}
  }
  async function clearAll() {
    try { const db = await openDB(), tx = db.transaction("pairs", "readwrite"); tx.objectStore("pairs").clear(); await done(tx); } catch (e) {}
  }

  window.MemoryCorrectionShadow = { observePair, pendingPairs, markProposed, report, clearAll };
})();
