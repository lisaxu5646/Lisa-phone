// ============================================================
// 记忆独立表·行级影子同步 v1（v48.99）
// IndexedDB 持久保存：云端影子行、离线 outbox、本地快照和增量游标。
// 当前阶段绝不把远端行写回 x_memLib；旧库仍是读取权威。
// ============================================================
(function () {
  const DB_NAME = "lisa_memory_sync_v1", DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "memoryId" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("memory sync IndexedDB open failed"));
    });
    return dbPromise;
  }
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("memory sync IndexedDB request failed"));
  });
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("memory sync IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("memory sync IndexedDB transaction aborted"));
  });
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : "ms_" + Date.now() + "_" + Math.random().toString(16).slice(2);

  function sharedRow(e) {
    return {
      id: e && e.id != null ? String(e.id) : "",
      text: String(e && e.text || ""),
      tags: Array.isArray(e && e.tags) ? e.tags.map(String) : [],
      charIds: Array.isArray(e && e.charIds) ? e.charIds.map(String) : [],
      v: typeof (e && e.v) === "number" ? Math.max(-5, Math.min(5, Math.round(e.v))) : 0,
      a: typeof (e && e.a) === "number" ? Math.max(0, Math.min(5, Math.round(e.a))) : 1,
      open: !!(e && e.open), pinned: !!(e && e.pinned),
      ts: Number(e && e.ts) || 0, archived: !!(e && e.archived),
      archivedBatch: e && e.archivedBatch != null ? String(e.archivedBatch) : null,
      archivedTs: e && e.archivedTs != null ? Number(e.archivedTs) : null,
      source: e && e.source != null ? String(e.source) : null
    };
  }
  const sig = e => JSON.stringify(sharedRow(e));
  const payloadFor = (e, deviceId) => {
    const x = sharedRow(e);
    return {
      text: x.text, tags: x.tags, char_ids: x.charIds,
      v: x.v, a: x.a, open: x.open, pinned: x.pinned, ts: x.ts,
      archived: x.archived, archived_batch: x.archivedBatch,
      archived_ts: x.archivedTs, source: x.source, device_id: deviceId
    };
  };

  async function ensureOwner(userId) {
    const db = await openDB();
    const tx = db.transaction(["rows", "outbox", "meta"], "readwrite");
    const meta = tx.objectStore("meta"), owner = await request(meta.get("owner"));
    if (owner && owner.value !== userId) {
      tx.objectStore("rows").clear();
      tx.objectStore("outbox").clear();
      meta.clear();
      meta.put({ key: "owner", value: userId });
      meta.put({ key: "device_id", value: uuid() });
    } else if (!owner) {
      // 首次启动时 saveMemLib 可能比登录态同步快几百毫秒：认领现有队列，不能把刚落盘的变化清掉。
      meta.put({ key: "owner", value: userId });
      const device = await request(meta.get("device_id"));
      if (!device) meta.put({ key: "device_id", value: uuid() });
    }
    await done(tx);
  }

  async function metaValue(key) {
    const db = await openDB(), tx = db.transaction("meta", "readonly");
    const row = await request(tx.objectStore("meta").get(key));
    await done(tx); return row ? row.value : null;
  }

  async function enqueueDiff(prev, next) {
    const before = new Map((prev || []).filter(x => x && x.id).map(x => [String(x.id), sharedRow(x)]));
    const after = new Map((next || []).filter(x => x && x.id).map(x => [String(x.id), sharedRow(x)]));
    const db = await openDB();
    const tx = db.transaction(["rows", "outbox", "meta"], "readwrite");
    const rowsStore = tx.objectStore("rows"), outbox = tx.objectStore("outbox"), meta = tx.objectStore("meta");
    let device = await request(meta.get("device_id"));
    if (!device) { device = { key: "device_id", value: uuid() }; meta.put(device); }

    for (const [id, row] of after) {
      if (!before.has(id) || sig(before.get(id)) !== sig(row)) {
        const oldOp = await request(outbox.get(id));
        const shadow = await request(rowsStore.get(id));
        outbox.put({
          memoryId: id, operation: "upsert", payload: payloadFor(row, device.value),
          baseRevision: oldOp ? oldOp.baseRevision : (shadow ? Number(shadow.revision) : 0),
          mutationId: uuid(), queuedAt: Date.now(), attempts: 0
        });
      }
    }
    for (const [id] of before) {
      if (!after.has(id)) {
        const oldOp = await request(outbox.get(id));
        const shadow = await request(rowsStore.get(id));
        outbox.put({
          memoryId: id, operation: "delete", payload: { device_id: device.value },
          baseRevision: oldOp ? oldOp.baseRevision : (shadow ? Number(shadow.revision) : 0),
          mutationId: uuid(), queuedAt: Date.now(), attempts: 0
        });
      }
    }
    meta.put({ key: "local_snapshot", value: [...after.values()] });
    await done(tx);
  }

  async function bootstrapLocalSnapshot(current) {
    const snapshot = await metaValue("local_snapshot");
    if (snapshot == null) {
      const db = await openDB(), tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key: "local_snapshot", value: (current || []).filter(x => x && x.id).map(sharedRow) });
      await done(tx);
      return { initialized: true, recoveredDiff: false };
    }
    await enqueueDiff(snapshot, current || []);
    return { initialized: false, recoveredDiff: true };
  }

  async function storePulledRows(rows) {
    if (!rows || !rows.length) return;
    const db = await openDB(), tx = db.transaction(["rows", "meta"], "readwrite");
    const store = tx.objectStore("rows");
    let maxTs = null;
    rows.forEach(row => {
      if (row && row.id) store.put(row);
      if (row && row.updated_at && (!maxTs || row.updated_at > maxTs)) maxTs = row.updated_at;
    });
    if (maxTs) tx.objectStore("meta").put({ key: "cursor", value: maxTs });
    await done(tx);
  }

  async function listOutbox() {
    const db = await openDB(), tx = db.transaction("outbox", "readonly");
    const rows = await request(tx.objectStore("outbox").getAll());
    await done(tx);
    return (rows || []).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  }

  async function markAttempt(op) {
    const db = await openDB(), tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put({ ...op, attempts: (op.attempts || 0) + 1, lastAttemptAt: Date.now() });
    await done(tx);
  }

  async function acknowledge(memoryId, mutationId, serverRow, advanceBase) {
    const db = await openDB(), tx = db.transaction(["rows", "outbox"], "readwrite");
    const outbox = tx.objectStore("outbox");
    const current = await request(outbox.get(String(memoryId)));
    if (current && current.mutationId === mutationId) {
      outbox.delete(String(memoryId));
    } else if (current && advanceBase && serverRow && serverRow.revision != null) {
      // 旧请求在路上时用户又改了同一条：保留较新的请求，并让它接在已成功版本后面。
      outbox.put({ ...current, baseRevision: Number(serverRow.revision) });
    }
    if (serverRow && serverRow.id) tx.objectStore("rows").put(serverRow);
    await done(tx);
  }

  async function status() {
    const db = await openDB(), tx = db.transaction(["rows", "outbox", "meta"], "readonly");
    const rowCount = await request(tx.objectStore("rows").count());
    const outboxCount = await request(tx.objectStore("outbox").count());
    const cursor = await request(tx.objectStore("meta").get("cursor"));
    await done(tx);
    return { shadowRows: rowCount, outbox: outboxCount, cursor: cursor ? cursor.value : null, mode: "shadow-only" };
  }

  window.MemorySync = {
    ensureOwner, bootstrapLocalSnapshot, enqueueDiff, storePulledRows,
    getCursor: () => metaValue("cursor"), listOutbox, markAttempt, acknowledge, status
  };
})();
