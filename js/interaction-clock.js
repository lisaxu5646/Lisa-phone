(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InteractionClock = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const tsOf = function (m) { const n = Number(m && m.ts); return Number.isFinite(n) ? n : 0; };
  const maxMsgs = function (msgs, ok) { return (Array.isArray(msgs) ? msgs : []).reduce(function (best, m) { return !ok || ok(m) ? Math.max(best, tsOf(m)) : best; }, 0); };
  const maxSessions = function (sessions, ok) { return (Array.isArray(sessions) ? sessions : []).reduce(function (best, s) { return Math.max(best, Number(s && s.startTs) || 0, Number(s && s.endTs) || 0, maxMsgs(s && s.msgs, ok)); }, 0); };
  function latestSharedTs(charId, data) {
    data = data || {};
    let best = maxSessions((data.offlines || {})[charId], function (m) { return m && (m.role === "user" || m.role === "narration" || m.role === "assistant"); });
    (Array.isArray(data.groups) ? data.groups : []).forEach(function (g) {
      if (!g || !(g.memberIds || []).includes(charId)) return;
      const relevant = function (m) { return m && m.kind !== "ooc" && (m.role === "user" || m.role === "narration" || m.senderId === charId); };
      best = Math.max(best, maxMsgs((data.groupChats || {})[g.id], relevant));
      best = Math.max(best, maxSessions((data.groupOfflines || {})[g.id], relevant));
    });
    return best;
  }
  function isTogetherNow(charId, data, now) {
    data = data || {}; now = Number(now) || Date.now();
    return (Array.isArray(data.groups) ? data.groups : []).some(function (g) {
      if (!g || !(g.memberIds || []).includes(charId)) return false;
      if (data.activeGroupId && data.activeGroupId === g.id) return true;
      return (Array.isArray((data.groupOfflines || {})[g.id]) ? data.groupOfflines[g.id] : []).some(function (s) {
        return s && !s.endTs && now - (Number(s.startTs) || 0) < 8 * 60 * 60 * 1000;
      });
    });
  }
  return { latestSharedTs: latestSharedTs, isTogetherNow: isTogetherNow };
});
