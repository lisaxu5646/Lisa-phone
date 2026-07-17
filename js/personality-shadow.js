// ============================================================
// 人格成长证据层 P3-1：四卡旁路观察（v49.23）
// 只在本机 IndexedDB 保存经过逐字核验的候选；不改欲望盒子、不改人格档案、
// 不注入聊天。thinking/COT 不进入证据，至少一条证据必须是角色本人说过的话。
// ============================================================
(function () {
  "use strict";
  const DB_NAME = "lisa_personality_shadow_v1", DB_VERSION = 1;
  const CAP = 500, MAX_AGE = 90 * 86400000;
  const TYPES = ["印证", "对不上", "毕业候选", "萌芽"];
  const DIMS = ["价值", "边界", "偏好", "习惯", "能力", "关系方式", "欲望"];
  let dbPromise = null;

  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const messageId = (m, i) => clean((m && (m.id || m.mid)) || (m && m.ts ? "ts_" + m.ts + "_" + (m.role || "x") : "idx_" + i), 160);

  function evidenceMessages(messages) {
    return (Array.isArray(messages) ? messages : []).filter(m => m && m.content && (m.role === "assistant" || m.role === "user") && !m.recalled && !["ooc", "system", "offlinelog", "thought", "thinking"].includes(m.kind))
      .slice(-24).map((m, i) => ({ id: messageId(m, i), role: m.role === "assistant" ? "角色" : "Lisa", text: String(m.content) }));
  }

  function spec(char, box, messages) {
    const evidence = evidenceMessages(messages);
    const transcript = evidence.map(m => "- id:" + m.id + "｜" + m.role + "：" + m.text.slice(0, 320)).join("\n") || "（没有可用原话）";
    const desires = (box && Array.isArray(box.list) ? box.list : []).filter(x => x && (x.status === "active" || x.status === "ash"))
      .slice(0, 12).map(x => "- id:" + x.id + "｜" + x.text).join("\n") || "（空）";
    const persona = (box && Array.isArray(box.persona) ? box.persona : []).slice(-12).map(x => "- " + x.text).join("\n") || "（空）";
    return {
      instruction: "你是一名人格成长记录员，只提出候选，不扮演角色、不改人设。根据下列带 id 的原话，观察「" + char.name + "」自身长期可能形成的倾向。\n【现有人格档案】\n" + persona + "\n【现有念想】\n" + desires + "\n【可引用原话】\n" + transcript +
        "\n\n输出 0~4 张 cards。type 只能是：印证、对不上、毕业候选、萌芽。dimension 只能是：价值、边界、偏好、习惯、能力、关系方式、欲望。trait_key 是一个稳定、短小的倾向名（以后同一倾向继续用同一个名字）。note 只描述这次看见的具体行为，不能直接宣布人格已经改变。target 是对应念想 id，没有则 null。" +
        "\n每张必须有 evidence，含 1~3 个 {message_id,quote}。quote 必须逐字复制上面的原话，message_id 必须对应；至少一条必须来自角色本人。thinking、隐藏推理、系统描述不能当证据。一次情绪、一次撒娇或一次争吵通常不够形成卡片；没证据就给空数组，严禁脑补。",
      schemaHint: "{\"cards\":[{\"type\":\"印证|对不上|毕业候选|萌芽\",\"dimension\":\"价值|边界|偏好|习惯|能力|关系方式|欲望\",\"trait_key\":\"短倾向名\",\"target\":\"念想id或null\",\"note\":\"这次观察到的事实\",\"evidence\":[{\"message_id\":\"原话id\",\"quote\":\"逐字引用\"}]}]}",
      maxTokens: 4000
    };
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("cards")) req.result.createObjectStore("cards", { keyPath: "fingerprint" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("personality shadow open failed"));
    });
    return dbPromise;
  }
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  async function observe(input) {
    try {
      const messages = evidenceMessages(input && input.messages), byId = new Map(messages.map(m => [m.id, m]));
      const raw = Array.isArray(input && input.result && input.result.cards) ? input.result.cards : [];
      const valid = raw.slice(0, 4).map(card => {
        const type = clean(card && card.type, 12), dimension = clean(card && card.dimension, 12), traitKey = clean(card && card.trait_key, 24);
        if (!TYPES.includes(type) || !DIMS.includes(dimension) || !traitKey) return null;
        const evidence = (Array.isArray(card.evidence) ? card.evidence : []).slice(0, 3).map(e => {
          const id = clean(e && e.message_id, 160), quote = clean(e && e.quote, 180), source = byId.get(id);
          return source && quote && source.text.indexOf(quote) >= 0 ? { messageId: id, quote, role: source.role } : null;
        }).filter(Boolean);
        if (!evidence.length || !evidence.some(e => e.role === "角色")) return null;
        return { type, dimension, traitKey, target: clean(card.target, 160) || null, note: clean(card.note, 180), evidence };
      }).filter(Boolean);
      if (!valid.length) return { accepted: 0, rejected: raw.length };

      const db = await openDB(), now = Date.now(), charHash = hash(input && input.charId);
      for (const card of valid) {
        const fingerprint = charHash + "|" + card.dimension + "|" + card.traitKey;
        const tx = db.transaction("cards", "readwrite"), store = tx.objectStore("cards"), previous = await rq(store.get(fingerprint));
        const firstSeenAt = previous && previous.firstSeenAt || now;
        store.put({ ...card, fingerprint, charHash, firstSeenAt, lastSeenAt: now,
          seenCount: Math.min(999, Number(previous && previous.seenCount || 0) + 1),
          spanDays: Math.max(0, Math.floor((now - firstSeenAt) / 86400000)),
          eligibleAfterTenDays: card.type === "对不上" && !!previous && now - firstSeenAt >= 10 * 86400000
        });
        await done(tx);
      }
      if (Math.random() < 0.1) await trim();
      return { accepted: valid.length, rejected: Math.max(0, raw.length - valid.length) };
    } catch (e) { return { accepted: 0, error: "人格旁路观察失败" }; }
  }

  async function trim() {
    try {
      const db = await openDB(), tx = db.transaction("cards", "readwrite"), store = tx.objectStore("cards"), rows = await rq(store.getAll());
      rows.sort((a, b) => Number(a.lastSeenAt || 0) - Number(b.lastSeenAt || 0));
      const cutoff = Date.now() - MAX_AGE, survivors = rows.filter(x => Number(x.lastSeenAt || 0) >= cutoff);
      rows.filter(x => Number(x.lastSeenAt || 0) < cutoff).forEach(x => store.delete(x.fingerprint));
      survivors.slice(0, Math.max(0, survivors.length - CAP)).forEach(x => store.delete(x.fingerprint));
      await done(tx);
    } catch (e) {}
  }

  async function report() {
    try {
      const db = await openDB(), tx = db.transaction("cards", "readonly"), rows = await rq(tx.objectStore("cards").getAll()); await done(tx);
      const types = {}, dimensions = {}; rows.forEach(x => { types[x.type] = (types[x.type] || 0) + 1; dimensions[x.dimension] = (dimensions[x.dimension] || 0) + 1; });
      return { cards: rows.length, types, dimensions, tenDayMismatches: rows.filter(x => x.eligibleAfterTenDays).length,
        last: rows.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0)).slice(0, 20) };
    } catch (e) { return { error: "人格旁路报表读取失败" }; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("cards", "readwrite"); tx.objectStore("cards").clear(); await done(tx); } catch (e) {} }

  window.PersonalityShadow = { spec, observe, report, clearAll, evidenceMessages };
})();
