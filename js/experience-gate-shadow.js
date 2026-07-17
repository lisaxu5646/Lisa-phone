// ============================================================
// 珊瑚岛 · Experience Gate 来源审计 shadow（v49.28）
// 只统计上下文块的来源类型、长度和“推演却被描述成真实”的风险；
// 不保存正文、不改变 buildBundle 输出、不写记忆/人格/云表。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_experience_gate_shadow_v1", DB_VERSION = 1, CAP = 500;
  let dbPromise = null;
  const lastByChar = new Map();
  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const has = (s, x) => String(s || "").indexOf(x) >= 0;

  function classify(text) {
    const s = String(text || ""), first = (s.split("\n")[0] || "").slice(0, 100);
    let key = "other", source = "configuration";
    if (has(first, "最近对话")) { key = "recent_chat"; source = "human_or_shared_session"; }
    else if (has(first, "群里最近发生")) { key = "group_chat"; source = "shared_session"; }
    else if (has(first, "没散的线下") || has(first, "线下")) { key = "offline_session"; source = "shared_session"; }
    else if (has(first, "礼物往来")) { key = "gift_log"; source = "shared_session"; }
    else if (has(first, "一起听")) { key = "listen_log"; source = "shared_session"; }
    else if (has(first, "今天的行程") || has(first, "此刻在做什么")) { key = "schedule_now"; source = "simulation"; }
    else if (has(first, "朋友圈动态")) { key = "moments"; source = "mixed_generated"; }
    else if (has(first, "论坛")) { key = "forum"; source = "mixed_generated"; }
    else if (has(first, "手机上的近况")) { key = "phone_state"; source = "mixed_generated"; }
    else if (has(first, "当前真实时间") || has(first, "当前时间")) { key = "clock"; source = "device_return"; }
    else if (has(first, "当前位置")) { key = "location"; source = "device_return"; }
    else if (has(first, "记账动态")) { key = "finance"; source = "human_record"; }
    else if (has(first, "备忘录")) { key = "memo"; source = "human_record"; }
    else if (has(first, "生理期")) { key = "period"; source = "human_record"; }
    else if (has(first, "特别日子")) { key = "calendar"; source = "mixed_record"; }
    else if (has(first, "你长出来的自我")) { key = "grown_persona"; source = "self_author"; }
    else if (has(first, "记忆库") || has(first, "长期记忆摘要")) { key = "accepted_memory"; source = "accepted_memory"; }
    else if (has(first, "心情") || has(first, "好感度")) { key = "derived_state"; source = "derived_state"; }
    else if (has(first, "角色人设") || has(first, "设定") || has(first, "关系网") || has(first, "世界书") || has(first, "情侣")) { key = "configuration"; source = "configuration"; }
    else if (has(first, "你是谁") || has(first, "准则") || has(first, "要求")) { key = "instruction"; source = "instruction"; }
    const claimsExperience = /真实发生|亲历|此刻在做|你都看到了|自己清楚|你记得/.test(s.slice(0, 500));
    const truthClaimRisk = (source === "simulation" || source === "mixed_generated") && claimsExperience;
    return { key, source, chars: s.length, claimsExperience, truthClaimRisk };
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("audits")) req.result.createObjectStore("audits", { keyPath: "_id", autoIncrement: true }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("experience gate shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  async function observeBundle(input) {
    try {
      const charHash = hash(input && input.charId), now = Date.now(), last = lastByChar.get(charHash) || 0;
      if (now - last < 60000) return; // 同角色每分钟最多一份，debug/重复 build 不灌爆账本
      lastByChar.set(charHash, now);
      const blocks = (Array.isArray(input && input.parts) ? input.parts : []).map(classify);
      const db = await openDB(), tx = db.transaction("audits", "readwrite"), store = tx.objectStore("audits");
      store.add({ t: now, charHash, blocks, riskCount: blocks.filter(x => x.truthClaimRisk).length, totalChars: blocks.reduce((n, x) => n + x.chars, 0) });
      await done(tx);
      if (Math.random() < 0.08) {
        const tx2 = db.transaction("audits", "readwrite"), s2 = tx2.objectStore("audits"), keys = await rq(s2.getAllKeys());
        keys.slice(0, Math.max(0, keys.length - CAP)).forEach(k => s2.delete(k)); await done(tx2);
      }
    } catch (e) {/* 审计不能阻断聊天 */}
  }
  async function report(n) {
    try {
      const db = await openDB(), tx = db.transaction("audits", "readonly"), all = await rq(tx.objectStore("audits").getAll()); await done(tx);
      const rows = all.slice(-(n || 200)), sources = {}, keys = {}, risky = {};
      rows.flatMap(x => x.blocks || []).forEach(b => {
        sources[b.source] = (sources[b.source] || 0) + 1; keys[b.key] = (keys[b.key] || 0) + 1;
        if (b.truthClaimRisk) risky[b.key] = (risky[b.key] || 0) + 1;
      });
      return { audits: rows.length, sources, blocks: keys, riskyBlocks: risky,
        callsWithRisk: rows.filter(x => x.riskCount > 0).length, last: rows.slice(-5) };
    } catch (e) { return { error: "Experience Gate 审计读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("audits", "readwrite"); tx.objectStore("audits").clear(); await done(tx); } catch (e) {} }
  window.ExperienceGateShadow = { classify, observeBundle, report, clearAll };
})();
