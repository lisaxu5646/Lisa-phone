// 内在生活系统 E · 余温/潮汐影子接线（v49.40）
// 只记录独立 IndexedDB 状态与无正文诊断：不注入、不 hold、不改变回复、不写记忆。
(function () {
  "use strict";
  const Core = window.InnerLifeETidalCore, Store = window.InnerLifeEAfterglowShadow;
  if (!Core || !Store) return;
  const AFTERGLOW_IDLE_MS = 30 * 60 * 1000;
  let ownerPromise = null, queue = Promise.resolve();
  const afterglowPending = new Map(), afterglowTimers = new Map();

  async function ownerId() {
    if (!ownerPromise) ownerPromise = Promise.resolve().then(async () => {
      const user = window.Cloud && window.Cloud.getUser ? await window.Cloud.getUser() : null;
      return user && user.id ? String(user.id) : "local-device";
    }).catch(() => "local-device");
    return ownerPromise;
  }

  function enqueue(event, at, rule) {
    queue = queue.then(async () => {
      const owner = await ownerId(), previous = await Store.getTidalState(owner);
      const result = Core.reduceTidal(previous, event, Number(at) || Date.now());
      await Store.putTidalState(owner, result.next);
      if (result.transition) await Store.addDiagnostic(owner, { t: result.transition.at, kind: "tidal_transition", fromState: result.transition.from, toState: result.transition.to, triggerRule: rule || event.toLowerCase() });
      return result;
    }).catch(() => null);
    return queue;
  }

  function onUserMessage(text, at) {
    try {
      const classified = Core.classifyTidalMessage(text);
      return classified.event ? enqueue(classified.event, at, classified.rule) : Promise.resolve(null);
    } catch (_) { return Promise.resolve(null); }
  }
  async function observePacket(charId, at) {
    try {
      if (!charId) return null;
      const owner = await ownerId(), result = await Store.markPacketObserved(owner, charId, at);
      if (result.status === "would_surface" || result.status === "expired") {
        const p = result.packet, age = Math.max(0, Number(at) - Number(p.createdTs || at));
        await Store.addDiagnostic(owner, { t: at, kind: result.status === "expired" ? "packet_expired" : "would_surface", charHash: p.charHash, packetAgeBucket: age < 3600000 ? "lt_1h" : age < 12*3600000 ? "1h_12h" : "12h_36h", threadCount: (p.unfinishedThreads || []).length, strengthBucket: Number(p.strength) >= .75 ? "high" : "low" });
      }
      return result;
    } catch (_) { return null; }
  }
  const onSessionOpenNoMessage = (at, charId) => { observePacket(charId, Number(at) || Date.now()); return enqueue(Core.EVENTS.SESSION_OPEN_NO_MESSAGE, at, "session_open"); };
  const onForegroundNoMessage = at => enqueue(Core.EVENTS.FOREGROUND_TICK_NO_MESSAGE, at, "foreground_tick");

  function recentThreads(messages) {
    const out = [], seen = new Set();
    for (const m of (Array.isArray(messages) ? messages : []).slice().reverse()) {
      if (!m || m.role !== "user" || !m.content || m.recalled || ["system","ooc","thought","thinking"].includes(m.kind)) continue;
      const text = String(m.content).trim().replace(/\s+/g, " ").slice(0, 120), key = text.toLocaleLowerCase();
      if (text && !seen.has(key)) { seen.add(key); out.push(text); }
      if (out.length === 3) break;
    }
    return out;
  }

  async function createAfterglow(snapshot, at) {
    try {
      const owner = await ownerId(), candidate = Store.deriveAfterglow({ ownerId: owner, charId: snapshot.charId, now: at, mood: snapshot.mood, messages: snapshot.messages, recentThreads: recentThreads(snapshot.messages), openEntries: [] });
      if (!candidate) return null;
      const before = await Store.getPacket(owner, snapshot.charId), saved = await Store.putPacket(owner, candidate);
      const duplicate = !!(before && before.lastAnchor === candidate.lastAnchor);
      await Store.addDiagnostic(owner, { t: at, kind: duplicate ? "packet_duplicate" : "packet_created", charHash: candidate.charHash, threadCount: candidate.unfinishedThreads.length, strengthBucket: "high" });
      return saved;
    } catch (_) { return null; }
  }

  function scheduleAfterglow(charId, messages, mood, nowValue) {
    try {
      if (!charId || !Array.isArray(messages) || !messages.length) return;
      const now = Number(nowValue) || Date.now(), snapshot = { charId, messages: messages.slice(-40), mood };
      afterglowPending.set(charId, snapshot); clearTimeout(afterglowTimers.get(charId));
      afterglowTimers.set(charId, setTimeout(() => { afterglowTimers.delete(charId); afterglowPending.delete(charId); createAfterglow(snapshot, Date.now()); }, AFTERGLOW_IDLE_MS));
    } catch (_) {}
  }

  function flushAfterglow(nowValue) {
    const at = Number(nowValue) || Date.now(), jobs = [];
    afterglowPending.forEach((snapshot, charId) => { clearTimeout(afterglowTimers.get(charId)); jobs.push(createAfterglow(snapshot, at)); });
    afterglowPending.clear(); afterglowTimers.clear(); return Promise.all(jobs).catch(() => []);
  }

  async function noteWouldHold(outlet, at) {
    try {
      const owner = await ownerId(), state = await Store.getTidalState(owner);
      if (!state || state.state !== "maybe_sleeping") return false;
      await Store.addDiagnostic(owner, { t: Number(at) || Date.now(), kind: "would_hold", outlet: outlet || "foreground_proactive", fromState: state.state, toState: state.state });
      return true;
    } catch (_) { return false; }
  }
  async function status() { try { return Store.getTidalState(await ownerId()); } catch (_) { return null; } }
  async function report() { try { return Store.diagnosticReport(await ownerId(), Date.now()); } catch (_) { return { error: "E 影子诊断读取失败" }; } }

  window.InnerLifeETidalShadow = { onUserMessage, onSessionOpenNoMessage, onForegroundNoMessage, scheduleAfterglow, flushAfterglow, noteWouldHold, status, report };
})();
