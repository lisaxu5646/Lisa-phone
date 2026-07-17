// ============================================================
// Tidal · 有效消息分支只读审计（v49.31）
// 观察编辑/撤回/重生成后是否还留着旧分支或悬空尾巴；不保存正文、不改消息。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_message_branch_shadow_v1", DB_VERSION = 1, CAP = 500, KEEP_MS = 14 * 86400000;
  let dbPromise = null;
  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  function inspectMutation(input) {
    const before = input.before || [], after = input.after || [], idx = Number(input.targetIndex), target = before[idx] || {};
    const tailCount = Math.max(0, before.length - idx - 1);
    let oldBranchGone = true, tailSurvived = false, valid = true;
    if (input.kind === "edit") {
      tailSurvived = tailCount > 0 && after.some(m => before.slice(idx + 1).includes(m));
      valid = before.length === after.length && !tailSurvived;
    }
    else if (input.kind === "recall") valid = !!(after[idx] && after[idx].recalled);
    else if (input.kind === "reroll") {
      if (input.turnId) oldBranchGone = !after.some(m => m && m.turnId === input.turnId);
      else oldBranchGone = after.length < before.length;
      // 重生成旧回复却保留它后面的对话，会形成“后文基于已删除回答”的悬空分支。
      tailSurvived = tailCount > 0 && after.some(m => before.slice(idx + 1).includes(m));
      valid = oldBranchGone && !tailSurvived;
    } else if (input.kind === "offline_reroll") {
      oldBranchGone = after.length === idx;
      tailSurvived = after.length > idx;
      valid = oldBranchGone;
    } else if (input.kind === "delete") valid = after.length === before.length - 1;
    return { kind: input.kind, beforeCount: before.length, afterCount: after.length, targetRole: target.role || null,
      hadTurnId: !!input.turnId, tailCount, oldBranchGone, tailSurvived, valid };
  }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("audits")) req.result.createObjectStore("audits", { keyPath: "_id", autoIncrement: true }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("message branch shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  async function observeMutation(input) {
    try {
      const row = inspectMutation(input || {}), now = Date.now();
      const db = await openDB(), tx = db.transaction("audits", "readwrite"), store = tx.objectStore("audits");
      store.add(Object.assign({ t: now, c: hash(input && input.charId) }, row));
      await done(tx);
      if (Math.random() < 0.08) {
        const tx2 = db.transaction("audits", "readwrite"), s2 = tx2.objectStore("audits"), rows = await rq(s2.getAll());
        rows.filter(x => x.t < now - KEEP_MS).forEach(x => s2.delete(x._id));
        rows.slice(0, Math.max(0, rows.length - CAP)).forEach(x => s2.delete(x._id)); await done(tx2);
      }
    } catch (e) {/* 审计不能影响消息操作 */}
  }
  async function report(n) {
    try {
      const db = await openDB(), tx = db.transaction("audits", "readonly"), all = await rq(tx.objectStore("audits").getAll()); await done(tx);
      const rows = all.slice(-(n || 200)), actions = {};
      rows.forEach(x => { actions[x.kind] = (actions[x.kind] || 0) + 1; });
      return { audits: rows.length, actions, invalid: rows.filter(x => !x.valid).length,
        danglingTail: rows.filter(x => x.tailSurvived).length, last: rows.slice(-10) };
    } catch (e) { return { error: "有效消息分支审计读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("audits", "readwrite"); tx.objectStore("audits").clear(); await done(tx); } catch (e) {} }
  window.MessageBranchShadow = { inspectMutation, observeMutation, report, clearAll };
})();
