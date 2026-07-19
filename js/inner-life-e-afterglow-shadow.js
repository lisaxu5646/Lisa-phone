// 内在生活系统 E · 余温本机影子层（DORMANT）
// 第 2 步只提供确定性派生与独立 IndexedDB 存取；未接 App、未注入 prompt。
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InnerLifeEAfterglowShadow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_NAME = "lisa_inner_life_e_shadow_v1";
  const DB_VERSION = 1;
  const EXPIRES_MS = 36 * 60 * 60 * 1000;
  const MAX_THREADS = 3;
  const DIAGNOSTIC_CAP = 500;
  const DIAGNOSTIC_MAX_AGE = 14 * 86400000;
  let dbPromise = null;

  function hash(value) {
    let h = 5381, s = String(value == null ? "" : value);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  const clean = (value, max) => String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
  const storageKey = (ownerId, charId) => hash(ownerId) + "|" + hash(charId);

  function isRealMessage(message) {
    return !!(message && (message.role === "user" || message.role === "assistant") && clean(message.content, 1)
      && !message.recalled && !["system", "ooc", "thought", "thinking", "offlinelog"].includes(message.kind));
  }

  function anchorFor(messages) {
    const list = (Array.isArray(messages) ? messages : []).filter(isRealMessage);
    const message = list[list.length - 1];
    if (!message) return null;
    const explicit = clean(message.id || message.mid, 160);
    if (explicit) return "msg:" + explicit;
    const ts = Number.isFinite(Number(message.ts)) ? Number(message.ts) : 0;
    return "ts:" + ts + ":" + message.role + ":" + hash(clean(message.content, 500));
  }

  function moodSketch(label) {
    const mood = clean(label && label.label != null ? label.label : label, 32);
    return mood ? "情绪底色：" + mood : "";
  }

  function threadText(item) {
    if (typeof item === "string") return clean(item, 120);
    return clean(item && (item.text || item.title || item.topic), 120);
  }

  function collectThreads(openEntries, recentThreads) {
    const result = [], seen = new Set();
    // 调用方只可传已经选好的只读副本；本模块不知道、也不会访问记忆库。
    for (const source of [recentThreads, openEntries]) {
      for (const item of Array.isArray(source) ? source : []) {
        const text = threadText(item), key = text.toLocaleLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key); result.push(text);
        if (result.length === MAX_THREADS) return result;
      }
    }
    return result;
  }

  function deriveAfterglow(input) {
    try {
      const now = Number(input && input.now), ownerId = input && input.ownerId, charId = input && input.charId;
      if (!Number.isFinite(now) || !clean(ownerId, 1) || !clean(charId, 1)) return null;
      const lastAnchor = anchorFor(input.messages);
      if (!lastAnchor) return null;
      const threads = collectThreads(input.openEntries, input.recentThreads);
      return {
        key: storageKey(ownerId, charId), ownerHash: hash(ownerId), charHash: hash(charId),
        lastAnchor, moodSketch: moodSketch(input.mood), unfinishedThreads: threads,
        strength: 1, createdTs: now, expiresTs: now + EXPIRES_MS,
        surfaceOnce: true, surfacedAt: null, shadowWouldSurfaceAt: null,
        writesExperience: false, schemaVersion: 1
      };
    } catch (_) { return null; }
  }

  function mergePacket(previous, candidate) {
    if (!candidate || candidate.writesExperience !== false) return previous || null;
    if (previous && previous.key === candidate.key && previous.lastAnchor === candidate.lastAnchor) return previous;
    return candidate;
  }

  function isValid(packet, nowValue) {
    const now = Number(nowValue);
    return !!(packet && packet.writesExperience === false && Number.isFinite(now)
      && Number(packet.expiresTs) > now && packet.surfaceOnce === true && packet.surfacedAt == null);
  }

  function markShadowWouldSurface(packet, nowValue) {
    if (!isValid(packet, nowValue) || packet.shadowWouldSurfaceAt != null) return packet || null;
    return { ...packet, shadowWouldSurfaceAt: Number(nowValue) };
  }

  function openDB(indexedDBImpl) {
    if (dbPromise) return dbPromise;
    const idb = indexedDBImpl || (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (!idb) return Promise.reject(new Error("IndexedDB unavailable"));
    dbPromise = new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("afterglow_packets")) db.createObjectStore("afterglow_packets", { keyPath: "key" });
        if (!db.objectStoreNames.contains("tidal_state")) db.createObjectStore("tidal_state", { keyPath: "ownerHash" });
        if (!db.objectStoreNames.contains("diagnostics")) db.createObjectStore("diagnostics", { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("inner life E shadow DB open failed"));
    });
    return dbPromise;
  }
  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
  const transactionDone = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });

  async function ensureOwner(db, ownerId) {
    const ownerHash = hash(ownerId), readTx = db.transaction("meta", "readonly");
    const readDone = transactionDone(readTx);
    const previous = await requestResult(readTx.objectStore("meta").get("owner"));
    await readDone;
    if (previous && previous.ownerHash !== ownerHash) {
      const clearTx = db.transaction(["afterglow_packets", "tidal_state", "diagnostics", "meta"], "readwrite");
      clearTx.objectStore("afterglow_packets").clear(); clearTx.objectStore("tidal_state").clear();
      clearTx.objectStore("diagnostics").clear(); clearTx.objectStore("meta").clear();
      clearTx.objectStore("meta").put({ key: "owner", ownerHash });
      await transactionDone(clearTx);
    } else if (!previous) {
      const writeTx = db.transaction("meta", "readwrite");
      writeTx.objectStore("meta").put({ key: "owner", ownerHash }); await transactionDone(writeTx);
    }
    return ownerHash;
  }

  async function putPacket(ownerId, candidate, indexedDBImpl) {
    try {
      if (!candidate || candidate.ownerHash !== hash(ownerId) || candidate.writesExperience !== false) return null;
      const db = await openDB(indexedDBImpl); await ensureOwner(db, ownerId);
      const tx = db.transaction("afterglow_packets", "readwrite"), store = tx.objectStore("afterglow_packets");
      const txDone = transactionDone(tx);
      const previous = await requestResult(store.get(candidate.key)), next = mergePacket(previous, candidate);
      if (next) store.put(next); await txDone; return next;
    } catch (_) { return null; }
  }

  async function getPacket(ownerId, charId, indexedDBImpl) {
    try {
      const db = await openDB(indexedDBImpl); await ensureOwner(db, ownerId);
      const tx = db.transaction("afterglow_packets", "readonly");
      const txDone = transactionDone(tx);
      const packet = await requestResult(tx.objectStore("afterglow_packets").get(storageKey(ownerId, charId)));
      await txDone; return packet || null;
    } catch (_) { return null; }
  }

  async function putTidalState(ownerId, state, indexedDBImpl) {
    try {
      if (!state || !["awake", "maybe_sleeping", "uncertain"].includes(state.state)) return null;
      const db = await openDB(indexedDBImpl), ownerHash = await ensureOwner(db, ownerId);
      const row = { ...state, ownerHash, schemaVersion: 1 };
      const tx = db.transaction("tidal_state", "readwrite"), txDone = transactionDone(tx);
      tx.objectStore("tidal_state").put(row); await txDone; return row;
    } catch (_) { return null; }
  }

  async function getTidalState(ownerId, indexedDBImpl) {
    try {
      const db = await openDB(indexedDBImpl), ownerHash = await ensureOwner(db, ownerId);
      const tx = db.transaction("tidal_state", "readonly"), txDone = transactionDone(tx);
      const row = await requestResult(tx.objectStore("tidal_state").get(ownerHash));
      await txDone; return row || null;
    } catch (_) { return null; }
  }

  function safeDiagnostic(input, ownerHash) {
    const allowedKinds = ["packet_created", "packet_duplicate", "packet_expired", "would_surface", "tidal_transition", "would_hold"];
    const allowedStates = ["awake", "maybe_sleeping", "uncertain", null];
    const allowedOutlets = ["foreground_proactive", "jiwen", "birthday", "reminder", "eyes_alert", "weather", "greeting", "night_watch", null];
    const kind = allowedKinds.includes(input && input.kind) ? input.kind : null;
    if (!kind) return null;
    return {
      ownerHash, t: Number(input.t) || Date.now(), kind,
      charHash: clean(input.charHash, 32) || null,
      fromState: allowedStates.includes(input.fromState) ? input.fromState : null,
      toState: allowedStates.includes(input.toState) ? input.toState : null,
      triggerRule: clean(input.triggerRule, 48) || null,
      packetAgeBucket: clean(input.packetAgeBucket, 24) || null,
      threadCount: Math.max(0, Math.min(3, Number(input.threadCount) || 0)),
      strengthBucket: clean(input.strengthBucket, 16) || null,
      outlet: allowedOutlets.includes(input.outlet) ? input.outlet : null
    };
  }

  async function addDiagnostic(ownerId, input, indexedDBImpl) {
    try {
      const db = await openDB(indexedDBImpl), ownerHash = await ensureOwner(db, ownerId), row = safeDiagnostic(input, ownerHash);
      if (!row) return null;
      const tx = db.transaction("diagnostics", "readwrite"), txDone = transactionDone(tx);
      tx.objectStore("diagnostics").add(row); await txDone;
      await trimDiagnostics(ownerId, indexedDBImpl, Number(input && input.t) || Date.now());
      return row;
    } catch (_) { return null; }
  }

  async function trimDiagnostics(ownerId, indexedDBImpl, nowValue) {
    try {
      const db = await openDB(indexedDBImpl), ownerHash = await ensureOwner(db, ownerId);
      const tx = db.transaction("diagnostics", "readwrite"), txDone = transactionDone(tx), store = tx.objectStore("diagnostics");
      const rows = await requestResult(store.getAll()), cutoff = (Number(nowValue) || Date.now()) - DIAGNOSTIC_MAX_AGE;
      rows.sort((a, b) => Number(a.t || 0) - Number(b.t || 0));
      const survivors = rows.filter(r => r.ownerHash === ownerHash && Number(r.t || 0) >= cutoff);
      rows.filter(r => r.ownerHash !== ownerHash || Number(r.t || 0) < cutoff).forEach(r => store.delete(r.id));
      survivors.slice(0, Math.max(0, survivors.length - DIAGNOSTIC_CAP)).forEach(r => store.delete(r.id));
      await txDone;
    } catch (_) {}
  }

  async function diagnosticReport(ownerId, nowValue, indexedDBImpl) {
    try {
      const db = await openDB(indexedDBImpl), ownerHash = await ensureOwner(db, ownerId), now = Number(nowValue) || Date.now();
      const tx = db.transaction(["diagnostics", "afterglow_packets", "tidal_state"], "readonly"), txDone = transactionDone(tx);
      const diagnostics = (await requestResult(tx.objectStore("diagnostics").getAll())).filter(r => r.ownerHash === ownerHash);
      const packets = (await requestResult(tx.objectStore("afterglow_packets").getAll())).filter(r => r.ownerHash === ownerHash);
      const tidal = await requestResult(tx.objectStore("tidal_state").get(ownerHash)); await txDone;
      const kinds = {}, outlets = {}; diagnostics.forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; if (r.outlet) outlets[r.outlet] = (outlets[r.outlet] || 0) + 1; });
      return {
        generatedAt: now, tidal: tidal ? { state: tidal.state, signalKind: tidal.signalKind, updatedTs: tidal.updatedTs } : null,
        diagnostics: diagnostics.length, firstObservedAt:diagnostics.length?Number(diagnostics[0].t)||null:null,lastObservedAt:diagnostics.length?Number(diagnostics[diagnostics.length-1].t)||null:null,spanHours:diagnostics.length>1?Math.round((Number(diagnostics[diagnostics.length-1].t)-Number(diagnostics[0].t))/36000)/100:0,kinds, outlets,
        packets: packets.map(p => ({ charHash: p.charHash, valid: isValid(p, now), createdTs: p.createdTs, expiresTs: p.expiresTs, threadCount: (p.unfinishedThreads || []).length, shadowWouldSurfaceAt: p.shadowWouldSurfaceAt || null })),
        invariants: { sessionOpenWoke: diagnostics.filter(r => r.kind === "tidal_transition" && r.triggerRule === "session_open" && r.toState === "awake").length, writesExperience: packets.filter(p => p.writesExperience !== false).length },
        nightWatchCoverage: "waiting_for_cloud_tidal_row"
      };
    } catch (_) { return { error: "E 影子诊断读取失败" }; }
  }

  async function markPacketObserved(ownerId, charId, nowValue, indexedDBImpl) {
    try {
      const db = await openDB(indexedDBImpl); await ensureOwner(db, ownerId);
      const tx = db.transaction("afterglow_packets", "readwrite"), txDone = transactionDone(tx), store = tx.objectStore("afterglow_packets");
      const packet = await requestResult(store.get(storageKey(ownerId, charId)));
      if (!packet) { await txDone; return { status: "missing", packet: null }; }
      const now = Number(nowValue) || Date.now(); let status = "already_observed", next = packet;
      if (isValid(packet, now) && packet.shadowWouldSurfaceAt == null) { next = { ...packet, shadowWouldSurfaceAt: now }; status = "would_surface"; store.put(next); }
      else if (Number(packet.expiresTs) <= now && packet.shadowExpiredAt == null) { next = { ...packet, shadowExpiredAt: now }; status = "expired"; store.put(next); }
      await txDone; return { status, packet: next };
    } catch (_) { return { status: "error", packet: null }; }
  }

  return Object.freeze({
    DB_NAME, DB_VERSION, EXPIRES_MS, MAX_THREADS, DIAGNOSTIC_CAP, DIAGNOSTIC_MAX_AGE,
    hash, storageKey, anchorFor, moodSketch, collectThreads, deriveAfterglow,
    mergePacket, isValid, markShadowWouldSurface, putPacket, getPacket, putTidalState, getTidalState,
    addDiagnostic, trimDiagnostics, diagnosticReport, markPacketObserved,
    _safeDiagnostic: safeDiagnostic,
    _resetDBForTests: () => { dbPromise = null; }
  });
});
