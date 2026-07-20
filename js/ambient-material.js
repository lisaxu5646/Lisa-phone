(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AmbientMaterial = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const textOf = m => String((m && m.content) || "").replace(/\s+/g, " ").trim();
  const valid = m => !!(m && !m.recalled && m.kind !== "ooc" && m.kind !== "system" && m.role !== "system" && textOf(m));
  const who = (m, userName, charName) => {
    if (m.role === "user" || m.role === "narration") return m.role === "narration" ? "场景" : userName;
    return m.senderName || charName || "角色";
  };
  const pushMessages = (out, messages, source, userName, charName, sinceTs, fromTs, untilTs) => {
    (messages || []).forEach(m => {
      const ts = Number(m && m.ts || 0);
      if (!valid(m) || (Number.isFinite(fromTs) ? ts < fromTs : ts <= sinceTs) || (Number.isFinite(untilTs) && ts >= untilTs)) return;
      out.push({ ts, source, speaker: who(m, userName, charName), text: textOf(m) });
    });
  };
  const collect = (charId, data, opts) => {
    data = data || {}; opts = opts || {};
    const out = [], sinceTs = Number(opts.sinceTs) || 0;
    const fromTs = opts.fromTs == null ? NaN : Number(opts.fromTs), untilTs = opts.untilTs == null ? NaN : Number(opts.untilTs);
    const userName = opts.userName || "用户", charName = opts.charName || "角色";
    pushMessages(out, (data.chats || {})[charId], "私聊", userName, charName, sinceTs, fromTs, untilTs);
    ((data.offlines || {})[charId] || []).forEach(s => pushMessages(out, s && s.msgs, "单人线下", userName, charName, sinceTs, fromTs, untilTs));
    (data.groups || []).filter(g => (g.memberIds || []).includes(charId)).forEach(g => {
      const groupName = g.name ? "群聊·" + g.name : "群聊";
      pushMessages(out, (data.groupChats || {})[g.id], groupName, userName, charName, sinceTs, fromTs, untilTs);
      ((data.groupOfflines || {})[g.id] || []).forEach(s => pushMessages(out, s && s.msgs, "群线下·" + (g.name || "群聊"), userName, charName, sinceTs, fromTs, untilTs));
    });
    out.sort((a, b) => a.ts - b.ts);
    const limit = opts.limit === 0 ? 0 : Math.max(1, Number(opts.limit) || 20);
    return limit ? out.slice(-limit) : out;
  };
  const format = rows => (rows || []).map(x => "【" + x.source + "】" + x.speaker + "：" + x.text).join("\n");
  return { collect, format };
});
