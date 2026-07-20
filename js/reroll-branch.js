// 重 Roll 分支回滚的纯机械规则：证据归属 + 实时状态回退。
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RerollBranch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const arr = x => Array.isArray(x) ? x : [];
  const evidenceId = (m, i) => String((m && (m.id || m.mid)) || (m && m.ts ? "ts_" + m.ts : "idx_" + (i || 0)));
  const evidenceIds = item => arr(item && item.evidence_message_ids).map(String).filter(Boolean);

  function candidateStillLive(item, liveMessages) {
    const ids = evidenceIds(item);
    if (!ids.length) return false;
    const live = new Set(arr(liveMessages).map(evidenceId));
    return ids.every(id => live.has(id));
  }

  // 只有证据【全部】来自同一个角色回复 turn，才允许该 turn 的 reroll 撤销这条记忆。
  // 用户原话也参与证据的事实仍成立，不跟着角色旧说法一起消失。
  function journalAssignments(entries, sourceMessages) {
    const byEvidence = new Map(arr(sourceMessages).map((m, i) => [evidenceId(m, i), m]));
    const out = {};
    arr(entries).forEach(entry => {
      const ids = arr(entry && entry.evidenceMessageIds).map(String).filter(Boolean);
      const messages = ids.map(id => byEvidence.get(id)).filter(Boolean);
      if (!ids.length || messages.length !== ids.length || messages.some(m => m.role !== "assistant" || !m.turnId)) return;
      const turns = new Set(messages.map(m => String(m.turnId)));
      if (turns.size !== 1) return;
      const turn = Array.from(turns)[0];
      (out[turn] = out[turn] || []).push(String(entry.id));
    });
    return out;
  }

  function rollbackState(current, history, turnId) {
    const clean = arr(history).filter(row => String(row && row.turnId || "") !== String(turnId || ""));
    if (!current || String(current.turnId || "") !== String(turnId || "")) return { state: current || null, history: clean };
    const prev = clean[0];
    if (!prev) return { state: null, history: clean };
    return { state: { thought: prev.thought, mood: prev.mood, wearing: prev.wearing, action: prev.action, ts: prev.ts, turnId: prev.turnId || null, affinityBefore: prev.affinityBefore }, history: clean };
  }

  return { evidenceId, evidenceIds, candidateStillLive, journalAssignments, rollbackState };
});
