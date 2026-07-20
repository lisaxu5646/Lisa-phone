// App → CC 共享聊天账本（第 3 步 shadow）
// 只在本地消息已经落盘后异步追加云端；本模块不提供任何回读入口。
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChatLedgerShadow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const OUTBOX_KEY = "chat_ledger_outbox_v1"; // 无 x_ 前缀：不混进整份 saves
  const DELETE_OUTBOX_KEY = "chat_ledger_delete_outbox_v1";
  const DIAG_KEY = "chat_ledger_shadow_diag_v1";
  const THREAD_TYPES = new Set(["private", "offline", "group", "group_offline"]);
  const BLOCKED_KINDS = new Set(["system", "ooc", "thought", "thinking", "cot", "silence", "offlinelog"]);

  const text = value => String(value == null ? "" : value).trim();
  const asArray = value => Array.isArray(value) ? value : [];
  const parse = (storage, key, fallback) => {
    try { const value = JSON.parse(storage.getItem(key)); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  };
  const write = (storage, key, value) => storage.setItem(key, JSON.stringify(value));
  const iso = (value, fallback) => {
    const n = typeof value === "number" ? value : Date.parse(value);
    const d = new Date(Number.isFinite(n) ? n : fallback);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(fallback).toISOString();
  };

  function findYanqiu(characters, settings) {
    const chars = asArray(characters);
    const marked = chars.filter(c => settings && settings[c.id] && settings[c.id].engineerEyes === true);
    if (marked.length === 1) return marked[0];
    return chars.find(c => /(?:许)?言秋|小克/.test(text(c && c.name))) || null;
  }

  function eligibleContext(context) {
    if (!context || !context.charId || !THREAD_TYPES.has(context.threadType) || !context.threadId) return false;
    if (context.threadType === "private" || context.threadType === "offline") return String(context.threadId) === String(context.charId);
    return asArray(context.groupMemberIds).map(String).includes(String(context.charId));
  }

  function isRealMessage(message) {
    if (!message || message.recalled || !text(message.content)) return false;
    if (BLOCKED_KINDS.has(text(message.kind).toLowerCase())) return false;
    return ["user", "assistant", "char", "narration"].includes(text(message.role).toLowerCase());
  }

  function speakerFor(message, context) {
    const role = text(message.role).toLowerCase();
    if (role === "user") return { type: "lisa", id: null };
    if (role === "narration") return { type: "narration", id: null };
    const senderId = message.senderId || message.charId || null;
    if (!senderId || String(senderId) === String(context.charId) || context.threadType === "private" || context.threadType === "offline") {
      return { type: "character", id: String(context.charId) };
    }
    return { type: "other_character", id: String(senderId) };
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    if (root.crypto && root.crypto.subtle) {
      const digest = await root.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, "0")).join("");
    }
    // 极老 WebView 的确定性后备；只是幂等键，不承担安全用途。
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function strongSourceId(message) {
    return message.id || message.mid || message.messageId || message.cid || null;
  }

  function sourceId(message) {
    return strongSourceId(message) || message.turnId || null;
  }

  async function rowsFor(context, messages, nowValue) {
    if (!eligibleContext(context)) return [];
    const now = Number(nowValue) || Date.now();
    const rows = [];
    for (const message of asArray(messages)) {
      if (!isRealMessage(message)) continue;
      const speaker = speakerFor(message, context);
      const occurredAt = iso(message.ts || message.created_at, now);
      const sid = sourceId(message), strongId = strongSourceId(message);
      // turnId 是“一轮”的 ID，多泡会共用，不能拿它单独当“一条消息”的幂等键。
      // 只有真正逐消息 ID 才可直用；否则把 turnId 作为材料，再叠时间/说话者/正文指纹。
      const material = ["app", context.threadType, context.threadId, sid || "", speaker.type, speaker.id || "", occurredAt, text(message.content)].join("|");
      const key = strongId
        ? ["app", context.threadType, context.threadId, String(strongId)].join(":")
        : "app:" + context.threadType + ":" + context.threadId + ":sha256:" + await sha256(material);
      rows.push({
        message_key: key,
        source: "app",
        source_message_id: sid == null ? null : String(sid),
        thread_type: context.threadType,
        thread_id: String(context.threadId),
        char_id: String(context.charId),
        speaker_type: speaker.type,
        speaker_id: speaker.id,
        content: text(message.content),
        occurred_at: occurredAt,
        metadata: {
          shadow_version: 1,
          message_kind: text(message.kind) || null,
          group_name: context.groupName ? text(context.groupName) : null
        }
      });
    }
    return rows;
  }

  function identity(message) {
    const sid = sourceId(message);
    if (sid != null) return "id:" + sid;
    return [message && message.role, message && message.senderId, message && message.ts, message && message.kind, text(message && message.content)].join("|");
  }

  function addedSessionMessages(previous, next) {
    const counts = new Map();
    asArray(previous).forEach(s => asArray(s && s.msgs).forEach(m => counts.set(identity(m), (counts.get(identity(m)) || 0) + 1)));
    const added = [];
    asArray(next).forEach(s => asArray(s && s.msgs).forEach(m => {
      const k = identity(m), left = counts.get(k) || 0;
      if (left) counts.set(k, left - 1); else added.push(m);
    }));
    return added;
  }

  function createManager(options) {
    options = options || {};
    const storage = options.storage || root.localStorage;
    const clock = options.now || (() => Date.now());
    const uploader = options.upload || (async rows => {
      if (!root.Cloud || typeof root.Cloud.chatMessagesUpsert !== "function") throw new Error("chat ledger cloud unavailable");
      return root.Cloud.chatMessagesUpsert(rows);
    });
    const deleter = options.remove || (async keys => {
      if (!root.Cloud || typeof root.Cloud.chatMessagesSoftDelete !== "function") throw new Error("chat ledger delete unavailable");
      return root.Cloud.chatMessagesSoftDelete(keys);
    });
    let chain = Promise.resolve();

    const diagnostic = patch => {
      const old = parse(storage, DIAG_KEY, {});
      write(storage, DIAG_KEY, { ...old, ...patch, updated_at: new Date(clock()).toISOString() });
    };
    const internalFlush = async () => {
      const deletes = parse(storage, DELETE_OUTBOX_KEY, []);
      if (deletes.length) {
        const batchKeys = deletes.slice(0, 50);
        try {
          await deleter(batchKeys);
          const done = new Set(batchKeys), currentDeletes = parse(storage, DELETE_OUTBOX_KEY, []);
          write(storage, DELETE_OUTBOX_KEY, currentDeletes.filter(k => !done.has(k)));
        } catch (error) {
          diagnostic({ last_error: String(error && error.message || error), pending_deletes: deletes.length });
          return { sent: 0, pending: parse(storage, OUTBOX_KEY, []).length, pendingDeletes: deletes.length, error };
        }
      }
      const outbox = parse(storage, OUTBOX_KEY, []);
      if (!outbox.length) return { sent: 0, pending: 0, pendingDeletes: parse(storage, DELETE_OUTBOX_KEY, []).length };
      const batch = outbox.slice(0, 50);
      try {
        await uploader(batch);
        const sent = new Set(batch.map(r => r.message_key));
        const current = parse(storage, OUTBOX_KEY, []);
        const remaining = current.filter(r => !sent.has(r.message_key));
        write(storage, OUTBOX_KEY, remaining);
        diagnostic({ last_success_at: new Date(clock()).toISOString(), last_error: null, pending: remaining.length });
        return { sent: batch.length, pending: remaining.length };
      } catch (error) {
        diagnostic({ last_error: String(error && error.message || error), pending: outbox.length });
        return { sent: 0, pending: outbox.length, error };
      }
    };
    const enqueue = (context, messages) => {
      chain = chain.catch(() => {}).then(async () => {
        const rows = await rowsFor(context, messages, clock());
        if (!rows.length) return { queued: 0, pending: parse(storage, OUTBOX_KEY, []).length };
        const current = parse(storage, OUTBOX_KEY, []);
        const byKey = new Map(current.map(r => [r.message_key, r]));
        let newCount = 0;
        rows.forEach(r => { if (!byKey.has(r.message_key)) { byKey.set(r.message_key, r); newCount++; } });
        const merged = Array.from(byKey.values());
        write(storage, OUTBOX_KEY, merged);
        diagnostic({ total_queued: Number(parse(storage, DIAG_KEY, {}).total_queued || 0) + newCount, pending: merged.length });
        const result = await internalFlush();
        return { queued: rows.length, ...result };
      });
      return chain;
    };
    const invalidate = (context, messages) => {
      chain = chain.catch(() => {}).then(async () => {
        const rows = await rowsFor(context, messages, clock());
        const keys = new Set(rows.map(r => r.message_key));
        // 若旧泡还在“待新增”队列，先撤销新增；否则恢复联网时会先删空气、再把旧泡重新插回。
        const pendingRows = parse(storage, OUTBOX_KEY, []);
        write(storage, OUTBOX_KEY, pendingRows.filter(r => !keys.has(r.message_key)));
        const current = parse(storage, DELETE_OUTBOX_KEY, []);
        write(storage, DELETE_OUTBOX_KEY, [...new Set([...current, ...keys])]);
        return internalFlush();
      });
      return chain;
    };
    const flush = () => { chain = chain.catch(() => {}).then(internalFlush); return chain; };
    const status = () => ({ outbox: parse(storage, OUTBOX_KEY, []), deleteOutbox: parse(storage, DELETE_OUTBOX_KEY, []), diagnostic: parse(storage, DIAG_KEY, {}) });
    const clearLocal = () => { storage.removeItem(OUTBOX_KEY); storage.removeItem(DELETE_OUTBOX_KEY); storage.removeItem(DIAG_KEY); };
    return { enqueue, invalidate, flush, status, clearLocal };
  }

  const manager = root.localStorage ? createManager() : null;
  return {
    OUTBOX_KEY, DELETE_OUTBOX_KEY, DIAG_KEY, findYanqiu, eligibleContext, isRealMessage, speakerFor,
    rowsFor, addedSessionMessages, createManager,
    enqueue: manager ? manager.enqueue : async () => ({ queued: 0, pending: 0 }),
    invalidate: manager ? manager.invalidate : async () => ({ sent: 0, pending: 0 }),
    flush: manager ? manager.flush : async () => ({ sent: 0, pending: 0 }),
    status: manager ? manager.status : () => ({ outbox: [], diagnostic: {} }),
    clearLocal: manager ? manager.clearLocal : () => {}
  };
});
