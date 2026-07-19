// ============================================================
// 记忆质量线 P1-1：抽取候选分类 + 证据机械核验 shadow（v49.19）
// 只诊断，不改变真实入库。只落类别/计数/布尔值/不可逆短 hash；
// 不保存候选正文、聊天正文、quote、真实 message id 或 char id。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_memory_quality_shadow_v1", DB_VERSION = 1;
  const CAP = 500, MAX_AGE = 14 * 86400000;
  let dbPromise = null;
  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const msgId = (m, i) => String((m && (m.id || m.mid)) || (m && m.ts ? "ts_" + m.ts : "idx_" + i));
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("diag")) db.createObjectStore("diag", { keyPath: "_id", autoIncrement: true }); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error("quality shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  const milestone = s => /(我爱你|爱上你|做我的|在一起|结婚|订婚|分手|复合|成为恋人|正式交往|答应你|约好|约定|承诺|边界)/i.test(String(s || ""));
  async function observeBatch(input) {
    try {
      const msgs = Array.isArray(input && input.messages) ? input.messages : [];
      const candidates = Array.isArray(input && input.candidates) ? input.candidates : [];
      const accepted = new Set((input && input.acceptedTexts || []).map(x => String(x || "").trim()));
      const byId = new Map(msgs.map((m, i) => [msgId(m, i), String(m && m.content || "")]));
      const rows = candidates.filter(x => x && x.text && !x.resolveOpen).map(x => {
        const ids = Array.isArray(x.evidence_message_ids) ? x.evidence_message_ids.map(String) : [];
        const quotes = Array.isArray(x.evidence_quotes) ? x.evidence_quotes.map(String) : [];
        const aligned = ids.length > 0 && ids.length === quotes.length;
        let evidenceInvalidReason = null;
        if (!ids.length) evidenceInvalidReason = "missing_ids";
        else if (ids.length !== quotes.length) evidenceInvalidReason = "misaligned_arrays";
        else if (quotes.some(q => !q.trim())) evidenceInvalidReason = "empty_quote";
        else if (ids.some(id => !byId.has(id))) evidenceInvalidReason = "missing_message";
        else if (ids.some((id,i) => byId.get(id).indexOf(quotes[i]) < 0)) evidenceInvalidReason = "quote_mismatch";
        const evidenceValid = aligned && evidenceInvalidReason === null;
        const kind = ["fact","promise","relationship","insight","temperature"].includes(x.kind) ? x.kind : "unknown";
        const proposed = ["accept","candidate","reject"].includes(x.proposed_action) ? x.proposed_action : "unknown";
        const milestoneViolation = kind === "temperature" && (milestone(x.text) || quotes.some(milestone));
        return {
          kind, proposed, confidenceBucket: typeof x.confidence === "number" ? Math.round(Math.max(0, Math.min(1, x.confidence)) * 10) / 10 : null,
          auditVersion:2,evidenceCount: ids.length, evidenceValid,evidenceInvalidReason, milestoneViolation,
          actualAccepted: accepted.has(String(x.text).trim()), messageIdHashes: ids.map(hash)
        };
      });
      const db = await openDB(), tx = db.transaction("diag", "readwrite"), store = tx.objectStore("diag");
      store.add({ auditVersion:2,t: Date.now(), char: hash(input && input.charId), candidateCount: rows.length, rows });
      await done(tx);
      if (Math.random() < 0.1) {
        const tx2 = db.transaction("diag", "readwrite"), s = tx2.objectStore("diag");
        const all = await rq(s.getAll()), keys = await rq(s.getAllKeys()), drop = new Set(), cutoff = Date.now() - MAX_AGE;
        all.forEach((r, i) => { if ((r.t || 0) < cutoff) drop.add(keys[i]); });
        for (let i = 0; i < all.length && all.length - drop.size > CAP; i++) drop.add(keys[i]);
        drop.forEach(k => s.delete(k)); await done(tx2);
      }
    } catch (e) {/* shadow 坏了不影响入库 */}
  }
  async function report(n) {
    try {
      const db = await openDB(), tx = db.transaction("diag", "readonly"), all = await rq(tx.objectStore("diag").getAll()); await done(tx);
      const batches = all.slice(-(n || 200)), rows = batches.flatMap(b => b.rows || []), kinds = {}, proposed = {},invalidEvidenceReasons={};
      rows.forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; proposed[r.proposed] = (proposed[r.proposed] || 0) + 1; });
      rows.filter(r=>!r.evidenceValid).forEach(r=>{const reason=r.evidenceInvalidReason||"legacy_unknown";invalidEvidenceReasons[reason]=(invalidEvidenceReasons[reason]||0)+1;});
      const firstObservedAt=batches.length?Number(batches[0].t)||null:null,lastObservedAt=batches.length?Number(batches[batches.length-1].t)||null:null;
      return { batches: batches.length, candidates: rows.length, kinds, proposed,
        firstObservedAt,lastObservedAt,spanHours:firstObservedAt&&lastObservedAt?Math.round((lastObservedAt-firstObservedAt)/36000)/100:0,
        evidenceValidRate: rows.length ? rows.filter(r => r.evidenceValid).length / rows.length : 0,
        invalidEvidenceCount:rows.filter(r=>!r.evidenceValid).length,invalidEvidenceReasons,
        milestoneViolations: rows.filter(r => r.milestoneViolation).length,
        proposedRejectButAccepted: rows.filter(r => r.actualAccepted && r.proposed === "reject").length,
        temperatureAccepted: rows.filter(r => r.actualAccepted && r.kind === "temperature").length };
    } catch (e) { return { error: "抽取质量报表读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("diag", "readwrite"); tx.objectStore("diag").clear(); await done(tx); } catch (e) {} }
  window.MemoryQualityShadow = { observeBatch, report, clearAll, messageId: msgId };
})();
