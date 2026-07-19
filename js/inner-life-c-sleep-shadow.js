// ============================================================
// 内在生活系统 C · 第 4 步：睡眠影子运行时 + 全局发声闸（SHADOW ONLY）
// 合同 inner_life_C_sleep_queue_design.md §5/§10-4：只记 would_hold/would_skip，
// 绝不拦截、绝不改消息、绝不改真实行为。engineerEyes 数字生命全程豁免。
// 存储：独立 IDB lisa_inner_life_c_shadow_v1（不进 saves）；诊断只存 hash/枚举/计数。
// 账号归属：getSessionUser（本地读）；取不到=沿用旧 owner 不清仓（工单#1 血泪模板）。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_inner_life_c_shadow_v1", DB_VERSION = 1;
  const DIAG_CAP = 500, DIAG_MAX_AGE = 14 * 86400000, STALE_MS = 30 * 60000;
  let dbPromise = null, owner = null, hydrated = false, hydratePromise = null;
  const states = new Map(); // charId -> sleepState（内存权威，IDB 持久）
  const presenceMeta = new Map(); // charId -> 最近一次云投影摘要（不持久，重启必刷新）
  const core = () => window.InnerLifeCSleepCore;
  const chash = id => { let h = 5381; const s = String(id || ""); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const q = indexedDB.open(DB_NAME, DB_VERSION);
      q.onupgradeneeded = () => {
        const db = q.result;
        if (!db.objectStoreNames.contains("states")) db.createObjectStore("states", { keyPath: "charId" });
        if (!db.objectStoreNames.contains("diag")) db.createObjectStore("diag", { keyPath: "_id", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
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
      const id = u && u.id ? u.id : null;
      if (!id) return; // 取不到（未登录/离线）＝unknown，沿用现状，绝不清仓
      const db = await openDB(), tx = db.transaction(["states", "diag", "meta"], "readwrite");
      const cur = await rq(tx.objectStore("meta").get("owner"));
      if (cur && cur.value && cur.value !== id) { tx.objectStore("states").clear(); tx.objectStore("diag").clear(); states.clear(); }
      tx.objectStore("meta").put({ key: "owner", value: id });
      await done(tx);
      owner = id;
    } catch (e) {}
  }
  async function hydrate() {
    if (hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => { try {
      await ensureOwner();
      const db = await openDB(), tx = db.transaction("states", "readonly");
      (await rq(tx.objectStore("states").getAll())).forEach(r => { if (r && r.charId) states.set(r.charId, r.state); });
      await done(tx);
    } catch (e) {} finally { hydrated = true; } })();
    return hydratePromise;
  }
  function persistState(charId) {
    openDB().then(db => { const tx = db.transaction("states", "readwrite"); tx.objectStore("states").put({ charId, state: states.get(charId) }); return done(tx); }).catch(() => {});
  }
  async function addDiag(row) {
    try {
      const clean = { t: Date.now(), c: chash(row.charId), kind: String(row.kind || ""), outlet: row.outlet ? String(row.outlet) : null,
        phase: row.phase || null, fromState: row.fromState || null, toState: row.toState || null, source: row.source || null,
        pressureBucket: typeof row.pressure === "number" ? Math.round(row.pressure * 10) / 10 : null, reliable: row.reliable === undefined ? null : !!row.reliable };
      const db = await openDB(), tx = db.transaction("diag", "readwrite"), s = tx.objectStore("diag");
      s.add(clean);
      const allReq = s.getAll(), keysReq = s.getAllKeys();
      const [all, keys] = await Promise.all([rq(allReq), rq(keysReq)]);
      const cutoff = Date.now() - DIAG_MAX_AGE;
      const expired = [];
      all.forEach((r, i) => { if (Number(r && r.t || 0) < cutoff) expired.push(keys[i]); });
      expired.forEach(k => s.delete(k));
      const survivors = keys.filter(k => !expired.includes(k));
      if (survivors.length > DIAG_CAP) survivors.slice(0, survivors.length - DIAG_CAP).forEach(k => s.delete(k));
      await done(tx);
    } catch (e) {}
  }

  // ---- tick：纯同步计算（core 纯函数 + loadJSON 同步），持久化异步 ----
  function tick(char, engineerEyes, opts) {
    const C = core();
    if (!C || !char || !char.id) return null;
    if (engineerEyes === true) return { exempt: true, phase: "exempt_digital" };
    const now = Date.now();
    const deviceOffsetMinutes = -new Date().getTimezoneOffset();
    const shift = typeof schedTzShiftMin === "function" ? (schedTzShiftMin(char) || 0) : 0;
    const schedules = (loadJSON("x_schedules", {}) || {})[char.id] || {};
    const hadPrev = states.has(char.id);
    const prev = states.get(char.id) || C.createSleepState(now);
    const r = C.tickSleep(prev, { now, utcOffsetMinutes: deviceOffsetMinutes + shift, deviceOffsetMinutes, schedules, engineerEyes: false });
    states.set(char.id, r.state);
    persistState(char.id);
    if (r.transition) {
      addDiag({ charId: char.id, kind: "tidal_transition", fromState: r.transition.from, toState: r.transition.to, source: r.state.source, pressure: r.state.pressure, reliable: r.audit.reliableSchedule });
    }
    const pm = presenceMeta.get(char.id);
    const presenceChanged = !pm || pm.phase !== r.state.phase || pm.fingerprint !== String(r.state.scheduleFingerprint || "");
    if (!hadPrev || r.transition || presenceChanged || (opts && opts.forcePresence) || !pm || now - pm.at >= STALE_MS) projectPresence(char, r.state);
    return { exempt: false, state: r.state };
  }

  // ---- 全局发声闸（合同 §5 判定顺序；shadow：只记账，永远 allow）----
  function gateCheck(char, outlet, engineerEyes) {
    try {
      if (engineerEyes === true) { addDiag({ charId: char && char.id, kind: "exempt", outlet }); return { allow: true, exempt: true, phase: "exempt_digital", reason: "engineer_eyes" }; }
      if (!hydrated) { hydrate(); addDiag({ charId: char && char.id, kind: "fail_open", outlet }); return { allow: true, exempt: false, phase: null, reason: "state_hydrating" }; }
      const cur = states.get(char && char.id);
      if (!cur || Date.now() - Number(cur.updatedTs || 0) > STALE_MS) tick(char, false); // 发声前按需刷新
      const st = states.get(char && char.id);
      if (!st) { addDiag({ charId: char && char.id, kind: "fail_open", outlet }); return { allow: true, exempt: false, phase: null, reason: "state_missing" }; }
      if (st.phase !== "asleep") return { allow: true, exempt: false, phase: st.phase, reason: "not_asleep", nextWakeTs: st.wakeAtTs || null };
      addDiag({ charId: char.id, kind: "would_hold", outlet, phase: st.phase, source: st.source, pressure: st.pressure });
      return { allow: true, exempt: false, phase: "asleep", reason: "shadow_would_hold", nextWakeTs: st.wakeAtTs || null }; // shadow 期永远放行
    } catch (e) { return { allow: true, exempt: false, phase: null, reason: "gate_error" }; }
  }

  // ---- 云端 presence 投影（表没建/未登录=安静失败）----
  function projectPresence(char, st) {
    try {
      if (!(window.Cloud && window.Cloud.sleepPresenceUpsert) || !st) return;
      const now = Date.now();
      const validBase = st.phase === "asleep" && Number(st.wakeAtTs) > now ? Number(st.wakeAtTs) + 3600000 : now + 2 * 3600000;
      const validUntil = new Date(validBase).toISOString();
      window.Cloud.sleepPresenceUpsert({
        char_id: char.id,
        sleep_start_at: st.sleepStartTs ? new Date(st.sleepStartTs).toISOString() : null,
        wake_at: st.wakeAtTs ? new Date(st.wakeAtTs).toISOString() : null,
        observed_phase: st.phase, next_transition_at: st.nextTransitionTs ? new Date(st.nextTransitionTs).toISOString() : null,
        schedule_fingerprint: String(st.scheduleFingerprint || ""), valid_until: validUntil
      }).then(() => presenceMeta.set(char.id, { phase: st.phase, fingerprint: String(st.scheduleFingerprint || ""), at: Date.now() })).catch(() => {});
    } catch (e) {}
  }

  // ---- 报表（第 5 步诊断台的数据源）----
  async function report(n) {
    try {
      await hydrate();
      const db = await openDB(), tx = db.transaction("diag", "readonly");
      const all = (await rq(tx.objectStore("diag").getAll())).slice(-(n || 300));
      await done(tx);
      const agg = { observations: all.length, wouldHold: {}, transitions: 0, failOpen: 0, exempt: 0 };
      agg.firstObservedAt=all.length?Number(all[0].t)||null:null;agg.lastObservedAt=all.length?Number(all[all.length-1].t)||null:null;agg.spanHours=agg.firstObservedAt&&agg.lastObservedAt?Math.round((agg.lastObservedAt-agg.firstObservedAt)/36000)/100:0;
      all.forEach(r => {
        if (r.kind === "would_hold") agg.wouldHold[r.outlet || "?"] = (agg.wouldHold[r.outlet || "?"] || 0) + 1;
        if (r.kind === "tidal_transition") agg.transitions++;
        if (r.kind === "fail_open") agg.failOpen++;
        if (r.kind === "exempt") agg.exempt++;
      });
      agg.phases = [...states.entries()].map(([id, s]) => ({ c: chash(id), phase: s.phase, source: s.source, pressure: Math.round(s.pressure * 100) / 100 }));
      return agg;
    } catch (e) { return { error: "report_failed" }; }
  }
  async function clearAll() {
    try { states.clear(); presenceMeta.clear(); const db = await openDB(), tx = db.transaction(["states", "diag", "meta"], "readwrite"); ["states", "diag", "meta"].forEach(s => tx.objectStore(s).clear()); await done(tx); } catch (e) {}
  }

  hydrate();
  window.SleepShadow = { tick, gateCheck, report, clearAll, projectPresence, ready: hydrate, hashId: chash };
})();
