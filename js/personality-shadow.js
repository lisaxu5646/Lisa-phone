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
  const DIMS = ["价值", "边界", "偏好", "习惯", "能力", "关系方式", "欲望", "决策方式", "情绪应对", "冲突修复", "表达方式"];
  let dbPromise = null;

  const hash = value => { let h = 5381; const s = String(value == null ? "" : value); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const messageId = (m, i) => clean((m && (m.id || m.mid)) || (m && m.ts ? "ts_" + m.ts + "_" + (m.role || "x") : "idx_" + i), 160);

  function evidenceMessages(messages) {
    return (Array.isArray(messages) ? messages : []).filter(m => m && m.content && (m.role === "assistant" || m.role === "user") && !m.recalled && !["ooc", "system", "offlinelog", "thought", "thinking"].includes(m.kind))
      .slice(-24).map((m, i) => ({ id: messageId(m, i), role: m.role === "assistant" ? "角色" : "对方", text: String(m.content) }));
  }

  function spec(char, box, messages) {
    const evidence = evidenceMessages(messages);
    const transcript = evidence.map(m => "- id:" + m.id + "｜" + m.role + "：" + m.text.slice(0, 320)).join("\n") || "（没有可用原话）";
    const desires = (box && Array.isArray(box.list) ? box.list : []).filter(x => x && (x.status === "active" || x.status === "ash"))
      .slice(0, 12).map(x => "- id:" + x.id + "｜" + x.text).join("\n") || "（空）";
    const persona = (box && Array.isArray(box.persona) ? box.persona : []).slice(-12).map(x => "- " + x.text).join("\n") || "（空）";
    return {
      instruction: "你是一名人格成长记录员，只提出候选，不扮演角色、不改人设。根据下列带 id 的原话，观察「" + char.name + "」自身长期可能形成的倾向。\n【现有人格档案】\n" + persona + "\n【现有念想】\n" + desires + "\n【可引用原话】\n" + transcript +
        "\n\n输出 0~4 张 cards。type 只能是：印证、对不上、毕业候选、萌芽。dimension 只能是：价值、边界、偏好、习惯、能力、关系方式、欲望、决策方式、情绪应对、冲突修复、表达方式。决策方式看 TA 如何取舍；情绪应对看 TA 如何容纳或处理自己的情绪；冲突修复只看发生分歧后 TA 实际怎么面对和修复；表达方式只记跨场景反复出现的表达习惯，不把一句口头禅直接写成人格。trait_key 是一个稳定、短小的倾向名（以后同一倾向继续用同一个名字）。note 只描述这次看见的具体行为，不能直接宣布人格已经改变。target 是对应念想 id，没有则 null。" +
        "\n每张必须有 evidence，含 1~3 个 {message_id,quote}。quote 必须逐字复制上面的原话，message_id 必须对应；至少一条必须来自角色本人。thinking、隐藏推理、系统描述不能当证据。一次情绪、一次撒娇或一次争吵通常不够形成卡片；没证据就给空数组，严禁脑补。",
      schemaHint: "{\"cards\":[{\"type\":\"印证|对不上|毕业候选|萌芽\",\"dimension\":\"价值|边界|偏好|习惯|能力|关系方式|欲望|决策方式|情绪应对|冲突修复|表达方式\",\"trait_key\":\"短倾向名\",\"target\":\"念想id或null\",\"note\":\"这次观察到的事实\",\"evidence\":[{\"message_id\":\"原话id\",\"quote\":\"逐字引用\"}]}]}",
      maxTokens: 6000
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

  function mergeObservation(previous, card, charHash, fingerprint, now) {
    const firstSeenAt = previous && previous.firstSeenAt || now;
    const typeCounts = previous && previous.typeCounts ? { ...previous.typeCounts } : {};
    if (previous && !previous.typeCounts && previous.type) typeCounts[previous.type] = Math.max(1, Number(previous.seenCount || 1));
    const seenEvidence = new Set((previous && Array.isArray(previous.observations) ? previous.observations : []).flatMap(o => o.evidence || []).map(e => e.messageId));
    const novelEvidence = card.evidence.filter(e => !seenEvidence.has(e.messageId));
    const duplicateObservation = novelEvidence.length === 0;
    const observations = duplicateObservation ? (previous && previous.observations || []) : [...(previous && Array.isArray(previous.observations) ? previous.observations : []), {
      at: now, type: card.type, note: card.note, target: card.target, evidence: card.evidence
    }].slice(-8);
    const typeFirstAt = { ...(previous && previous.typeFirstAt || {}) }, typeLastAt = { ...(previous && previous.typeLastAt || {}) };
    if (!duplicateObservation) { if (!typeFirstAt[card.type]) typeFirstAt[card.type] = now; typeLastAt[card.type] = now; }
    if (!duplicateObservation) typeCounts[card.type] = Math.min(999, Number(typeCounts[card.type] || 0) + 1);
    else typeCounts[card.type] = Number(typeCounts[card.type] || 0);
    const mismatchSpanDays = typeFirstAt["对不上"] && typeLastAt["对不上"] ? Math.max(0, Math.floor((typeLastAt["对不上"] - typeFirstAt["对不上"]) / 86400000)) : 0;
    const hasConflict = !!typeCounts["印证"] && !!typeCounts["对不上"];
    return { ...card, fingerprint, charHash, firstSeenAt, lastSeenAt: now,
      seenCount: Math.min(999, Number(previous && previous.seenCount || 0) + (duplicateObservation ? 0 : 1)),
      spanDays: mismatchSpanDays, mismatchSpanDays, typeFirstAt, typeLastAt, typeCounts, observations, hasConflict,
      eligibleAfterTenDays: Number(typeCounts["对不上"] || 0) >= 2 && mismatchSpanDays >= 10 && !hasConflict
    };
  }

  async function observe(input) {
    try {
      const messages = evidenceMessages(input && input.messages), byId = new Map(messages.map(m => [m.id, m]));
      const raw = Array.isArray(input && input.result && input.result.cards) ? input.result.cards : [];
      const valid = raw.slice(0, 4).map(card => {
        const type = clean(card && card.type, 12), dimension = clean(card && card.dimension, 12), traitKey = clean(card && card.trait_key, 24).normalize("NFKC").toLocaleLowerCase().replace(/[\s_\-—]+/g, "");
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
        store.put(mergeObservation(previous, card, charHash, fingerprint, now));
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
      const types = {}, dimensions = {}; rows.forEach(x => {
        const counts = x.typeCounts || { [x.type]: 1 };
        Object.entries(counts).forEach(([k, v]) => { types[k] = (types[k] || 0) + Number(v || 0); });
        dimensions[x.dimension] = (dimensions[x.dimension] || 0) + 1;
      });
      const firstObservedAt=rows.length?Math.min(...rows.map(x=>Number(x.firstSeenAt)||Infinity)):null,lastObservedAt=rows.length?Math.max(...rows.map(x=>Number(x.lastSeenAt)||0)):null;
      return { cards: rows.length,firstObservedAt:Number.isFinite(firstObservedAt)?firstObservedAt:null,lastObservedAt:lastObservedAt||null,spanHours:Number.isFinite(firstObservedAt)&&lastObservedAt?Math.round((lastObservedAt-firstObservedAt)/36000)/100:0, types, dimensions, tenDayMismatches: rows.filter(x => x.eligibleAfterTenDays).length,
        conflictingTraits: rows.filter(x => x.hasConflict).length,
        last: rows.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0)).slice(0, 20) };
    } catch (e) { return { error: "人格旁路报表读取失败" }; }
  }
  async function listForChar(charId) {
    try {
      const db = await openDB(), tx = db.transaction("cards", "readonly"), rows = await rq(tx.objectStore("cards").getAll()); await done(tx);
      const wanted = hash(charId);
      return rows.filter(x => x.charHash === wanted).sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
    } catch (e) { return []; }
  }
  async function clearAll() { try { const db = await openDB(), tx = db.transaction("cards", "readwrite"); tx.objectStore("cards").clear(); await done(tx); } catch (e) {} }

  window.PersonalityShadow = { spec, observe, report, listForChar, clearAll, evidenceMessages, _mergeObservation: mergeObservation };
})();
