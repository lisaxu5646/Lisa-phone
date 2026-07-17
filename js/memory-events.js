// ============================================================
// ⑥ 事件层 · 第 2 步：App 只读镜像 v1（v49.09）
// 只读 memory_events / memory_event_candidates 的本地 IndexedDB 缓存。
// 本步没有任何写云路径：没有 outbox，没有 insert/update/rpc。
// 表还没建 / 未登录 / 离线时 refresh() 安静失败，读缓存照常，整块 dormant。
// 独立库 lisa_memory_events_v1，故意不复用 lisa_memory_sync_v1（施工图 §0-2）。
// ============================================================
(function () {
  const DB_NAME = "lisa_memory_events_v1", DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
        if (!db.objectStoreNames.contains("candidates")) db.createObjectStore("candidates", { keyPath: "id" });
        if (!db.objectStoreNames.contains("links")) db.createObjectStore("links", { keyPath: "key" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("memory events IndexedDB open failed"));
    });
    return dbPromise;
  }
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("memory events IndexedDB request failed"));
  });
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("memory events IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("memory events IndexedDB transaction aborted"));
  });

  // 账号隔离：owner 变化（换号/登出后换人）时清空镜像，绝不串用户（施工图 §2 验收 5）
  async function ensureOwner(userId) {
    const db = await openDB();
    const tx = db.transaction(["events", "candidates", "links", "meta"], "readwrite");
    const meta = tx.objectStore("meta");
    const owner = await request(meta.get("owner"));
    if (!owner || owner.value !== userId) {
      tx.objectStore("events").clear();
      tx.objectStore("candidates").clear();
      tx.objectStore("links").clear();
      meta.clear();
      meta.put({ key: "owner", value: userId });
    }
    await done(tx);
  }

  // 全量刷新（v1 数据量小走全量；接口按 (updated_at,id) 排序，留了以后换增量的余地）
  async function refresh() {
    if (!(window.Cloud && window.Cloud.ready() && typeof window.Cloud.eventsList === "function")) {
      return { ok: false, reason: "cloud-not-ready" };
    }
    const user = await window.Cloud.getUser().catch(() => null);
    if (!user) return { ok: false, reason: "not-logged-in" };
    try {
      await ensureOwner(user.id);
      const [events, candidates] = await Promise.all([
        window.Cloud.eventsList(),
        window.Cloud.eventCandidatesList()
      ]);
      const db = await openDB();
      const tx = db.transaction(["events", "candidates", "meta"], "readwrite");
      tx.objectStore("events").clear();
      events.forEach(e => { if (e && e.id) tx.objectStore("events").put(e); });
      tx.objectStore("candidates").clear();
      candidates.forEach(c => { if (c && c.id) tx.objectStore("candidates").put(c); });
      tx.objectStore("meta").put({ key: "lastRefresh", value: Date.now() });
      await done(tx);
      return { ok: true, events: events.length, candidates: candidates.length };
    } catch (e) {
      // 表未建（部署第 1 步 SQL 前）/ 离线：读旧缓存，不打扰
      return { ok: false, reason: (e && e.message) || "refresh-failed" };
    }
  }

  async function listEvents() {
    const db = await openDB(), tx = db.transaction("events", "readonly");
    const rows = await request(tx.objectStore("events").getAll());
    await done(tx);
    return (rows || []).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }
  async function listCandidates() {
    const db = await openDB(), tx = db.transaction("candidates", "readonly");
    const rows = await request(tx.objectStore("candidates").getAll());
    await done(tx);
    return (rows || []).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }
  // 单事件详情：直连云取正文+links（正文不落缓存，narrative 只在打开时看）
  async function getEvent(id) {
    if (!(window.Cloud && window.Cloud.ready() && typeof window.Cloud.eventGet === "function")) return null;
    try { return await window.Cloud.eventGet(id); } catch (e) { return null; }
  }
  async function status() {
    const db = await openDB(), tx = db.transaction(["events", "candidates", "meta"], "readonly");
    const events = await request(tx.objectStore("events").count());
    const candidates = await request(tx.objectStore("candidates").count());
    const last = await request(tx.objectStore("meta").get("lastRefresh"));
    await done(tx);
    return { events, candidates, lastRefresh: last ? last.value : null, mode: "read-only" };
  }

  window.MemoryEvents = { refresh, listEvents, listCandidates, getEvent, status };
})();
