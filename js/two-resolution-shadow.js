// ============================================================
// Tidal · 两分辨率召回 shadow（v49.29）
// 新开场/闲聊先比较「事件印象 + 极少碎片」，明确追问仍用精确碎片。
// 只写本机诊断，不保存 query/事件正文，不改变真实召回与 prompt。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_two_resolution_shadow_v1", DB_VERSION = 1, CAP = 500, KEEP_MS = 14 * 86400000;
  const SESSION_GAP = 3 * 3600000;
  const lastByChar = new Map();
  let dbPromise = null;
  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  function lastLine(text) {
    const lines = String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : "";
  }
  function classifyIntent(queryText, gapMs) {
    const s = lastLine(queryText);
    if (/还记得|记不记得|上次|那次|当时|以前|之前|哪天|什么时候|具体|细节|发生了什么|我说过|你说过|remember|last time|when did/i.test(s)) return "precise";
    if (gapMs == null || gapMs >= SESSION_GAP) return "impression";
    if (s.length <= 20 && /^(早|早安|晚安|在吗|干嘛|想你|嗨|哈喽|你好|hello|hi|hey|最近怎么样)[呀啊嘛吗呢～~！!？?。.]*$/i.test(s)) return "impression";
    return "balanced";
  }
  function tokens(text) {
    const s = String(text || "").toLowerCase().replace(/\s+/g, "");
    const out = new Set((s.match(/[a-z0-9]{2,}/g) || []));
    const zh = s.replace(/[^\u4e00-\u9fff]/g, "");
    for (let i = 0; i < zh.length - 1; i++) out.add(zh.slice(i, i + 2));
    return out;
  }
  function chooseEvent(events, charId, queryText) {
    const allowed = (events || []).filter(e => e && e.status !== "soft_deleted" && (!Array.isArray(e.char_ids) || !e.char_ids.length || e.char_ids.includes(charId)));
    if (!allowed.length) return null;
    const q = tokens(lastLine(queryText));
    let best = null, bestScore = -1;
    allowed.forEach((e, i) => {
      const hay = tokens([e.title, e.synopsis, (e.themes || []).join(" ")].join(" "));
      let score = 0; q.forEach(t => { if (hay.has(t)) score++; });
      score += Math.max(0, 0.1 - i * 0.001); // 同分取镜像里较新的事件
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return best;
  }
  function propose(mode, pinned, relevant, event) {
    const pins = (pinned || []).map(e => e.id);
    const details = relevant || [];
    if (mode === "precise") return { memoryIds: pins.concat(details.map(e => e.id)), detailIds: details.map(e => e.id), eventIds: [] };
    const max = mode === "impression" ? 1 : 2;
    const chosen = [];
    const open = details.find(e => e.open);
    if (open) chosen.push(open);
    details.forEach(e => { if (chosen.length < max && !chosen.includes(e)) chosen.push(e); });
    return { memoryIds: pins.concat(chosen.map(e => e.id)), detailIds: chosen.map(e => e.id), eventIds: event ? [hash(event.id)] : [] };
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("audits")) req.result.createObjectStore("audits", { keyPath: "_id", autoIncrement: true }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("two resolution shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  async function observe(input) {
    try {
      const now = Date.now(), charId = input && input.charId, c = hash(charId), last = lastByChar.get(c);
      lastByChar.set(c, now);
      const mode = classifyIntent(input && input.queryText, last == null ? null : now - last);
      const events = window.MemoryEvents && window.MemoryEvents.listEvents ? await window.MemoryEvents.listEvents() : [];
      const event = chooseEvent(events, charId, input && input.queryText);
      const proposal = propose(mode, input && input.pinned, input && input.relevant, event);
      const baselineDetails = (input && input.relevant || []).map(e => e.id);
      const db = await openDB(), tx = db.transaction("audits", "readwrite"), store = tx.objectStore("audits");
      store.add({ t: now, c, mode, baselineDetailCount: baselineDetails.length, proposedDetailCount: proposal.detailIds.length,
        baselineIds: baselineDetails, proposedIds: proposal.detailIds, eventIds: proposal.eventIds, eventAvailable: !!event });
      await done(tx);
      if (Math.random() < 0.08) {
        const tx2 = db.transaction("audits", "readwrite"), s2 = tx2.objectStore("audits"), rows = await rq(s2.getAll());
        rows.filter(x => x.t < now - KEEP_MS).forEach(x => s2.delete(x._id));
        rows.slice(0, Math.max(0, rows.length - CAP)).forEach(x => s2.delete(x._id)); await done(tx2);
      }
    } catch (e) {/* 旁路绝不影响召回 */}
  }
  async function report(n) {
    try {
      const db = await openDB(), tx = db.transaction("audits", "readonly"), all = await rq(tx.objectStore("audits").getAll()); await done(tx);
      const rows = all.slice(-(n || 200)), modes = {};
      rows.forEach(x => { modes[x.mode] = (modes[x.mode] || 0) + 1; });
      const avg = key => rows.length ? Math.round(rows.reduce((sum, x) => sum + (x[key] || 0), 0) * 10 / rows.length) / 10 : 0;
      return { audits: rows.length, modes, avgBaselineDetails: avg("baselineDetailCount"), avgProposedDetails: avg("proposedDetailCount"),
        eventCoverage: rows.length ? Math.round(rows.filter(x => x.eventAvailable).length * 100 / rows.length) / 100 : 0, last: rows.slice(-5) };
    } catch (e) { return { error: "两分辨率召回审计读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("audits", "readwrite"); tx.objectStore("audits").clear(); await done(tx); } catch (e) {} }
  window.TwoResolutionShadow = { classifyIntent, chooseEvent, propose, observe, report, clearAll };
})();
