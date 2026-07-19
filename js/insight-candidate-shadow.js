// ============================================================
// InsightCapture · 独立洞察候选结构 shadow（v49.32）
// 复用现有记忆抽取的 insight 分类，旁路检查结论/推导/转折/原始金句；
// 不保存正文、不写正式记忆/洞察表、不增加 AI 请求。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_insight_candidate_shadow_v1", DB_VERSION = 1, CAP = 500, KEEP_MS = 14 * 86400000;
  let dbPromise = null;
  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const messageId = (m, i) => String((m && (m.id || m.mid)) || (m && m.ts ? "ts_" + m.ts : "idx_" + i));
  const turnCue = text => /原来|其实|不是.+而是|才发现|后来|从那以后|因此|所以|意识到|终于|这才|没想到/i.test(String(text || ""));
  const reasoningCue = text => /因为|所以|因此|意味着|说明|可见|之所以|源于|导致|让我明白|让.+意识到/i.test(String(text || ""));

  function structureCandidate(candidate, messages, acceptedTexts) {
    const msgs = Array.isArray(messages) ? messages : [], byId = new Map(msgs.map((m, i) => [messageId(m, i), m]));
    const ids = Array.isArray(candidate && candidate.evidence_message_ids) ? candidate.evidence_message_ids.map(String) : [];
    const quotes = Array.isArray(candidate && candidate.evidence_quotes) ? candidate.evidence_quotes.map(String) : [];
    const aligned = ids.length > 0 && ids.length === quotes.length;
    const quoteValid = aligned && ids.every((id, i) => byId.has(id) && quotes[i].trim().length > 0 && String(byId.get(id).content || "").includes(quotes[i]));
    const roles = new Set(ids.map(id => byId.get(id) && byId.get(id).role).filter(Boolean));
    const combined = [candidate && candidate.text].concat(quotes).join(" ");
    const conclusionPresent = String(candidate && candidate.text || "").trim().length >= 8;
    const derivationPresent = ids.length >= 2 || roles.size >= 2 || reasoningCue(combined);
    const turningPointPresent = turnCue(combined);
    const originalQuotePresent = quoteValid && quotes.length > 0;
    const ready = conclusionPresent && originalQuotePresent && (derivationPresent || turningPointPresent);
    const accepted = new Set((acceptedTexts || []).map(x => String(x || "").trim()));
    return { candidateHash: hash(candidate && candidate.text), conclusionPresent, derivationPresent, turningPointPresent,
      originalQuotePresent, quoteValid, evidenceCount: ids.length, roleCount: roles.size, ready,
      leakedIntoMemory: accepted.has(String(candidate && candidate.text || "").trim()), messageIdHashes: ids.map(hash) };
  }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("batches")) req.result.createObjectStore("batches", { keyPath: "_id", autoIncrement: true }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("insight candidate shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  async function observeBatch(input) {
    try {
      const candidates = (input && input.candidates || []).filter(x => x && x.kind === "insight" && x.text);
      if (!candidates.length) return;
      const rows = candidates.map(x => structureCandidate(x, input && input.messages, input && input.acceptedTexts));
      const now = Date.now(), db = await openDB(), tx = db.transaction("batches", "readwrite"), store = tx.objectStore("batches");
      store.add({ t: now, c: hash(input && input.charId), count: rows.length, rows }); await done(tx);
      if (Math.random() < 0.1) {
        const tx2 = db.transaction("batches", "readwrite"), s2 = tx2.objectStore("batches"), all = await rq(s2.getAll());
        all.filter(x => x.t < now - KEEP_MS).forEach(x => s2.delete(x._id));
        all.slice(0, Math.max(0, all.length - CAP)).forEach(x => s2.delete(x._id)); await done(tx2);
      }
    } catch (e) {/* 洞察旁路不能影响记忆抽取 */}
  }
  async function report(n) {
    try {
      const db = await openDB(), tx = db.transaction("batches", "readonly"), all = await rq(tx.objectStore("batches").getAll()); await done(tx);
      const batches = all.slice(-(n || 200)), rows = batches.flatMap(x => x.rows || []);
      const rate = key => rows.length ? Math.round(rows.filter(x => x[key]).length * 100 / rows.length) / 100 : 0;
      const firstObservedAt=batches.length?Number(batches[0].t)||null:null,lastObservedAt=batches.length?Number(batches[batches.length-1].t)||null:null;
      return { batches: batches.length,firstObservedAt,lastObservedAt,spanHours:firstObservedAt&&lastObservedAt?Math.round((lastObservedAt-firstObservedAt)/36000)/100:0, candidates: rows.length, readyRate: rate("ready"), validQuoteRate: rate("quoteValid"),
        derivationRate: rate("derivationPresent"), turningPointRate: rate("turningPointPresent"),
        ordinaryMemoryLeakRate: rate("leakedIntoMemory"), last: rows.slice(-10) };
    } catch (e) { return { error: "独立洞察候选审计读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("batches", "readwrite"); tx.objectStore("batches").clear(); await done(tx); } catch (e) {} }
  window.InsightCandidateShadow = { structureCandidate, observeBatch, report, clearAll };
})();
