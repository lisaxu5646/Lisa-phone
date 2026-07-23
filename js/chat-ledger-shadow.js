// App ↔ CC 共享聊天账本（第 4 步 shadow）
// App 写出照旧；CC 入站目前只做无正文诊断，不合并真实聊天、不注入 prompt。
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChatLedgerShadow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const OUTBOX_KEY = "chat_ledger_outbox_v1"; // 无 x_ 前缀：不混进整份 saves
  const DELETE_OUTBOX_KEY = "chat_ledger_delete_outbox_v1";
  const DIAG_KEY = "chat_ledger_shadow_diag_v1";
  const PULL_KEY = "chat_ledger_pull_shadow_v1";
  const LIVE_CURSOR_KEY = "chat_ledger_live_cursor_v1";
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

  // 第 5 步：把 CC/Stack-chan 的合格逐字句段投影成 App 私聊消息。
  // 纯函数只负责核验、幂等、修订与软删；真正落盘和游标提交由 App 按“先消息、后游标”完成。
  function reconcileIncoming(existing, incoming, charId) {
    const allowedKinds = new Set(["life", "emotion", "decision", "joke"]);
    const cid = String(charId || ""), list = asArray(existing).slice();
    const byKey = new Map();
    list.forEach((m, index) => { if (m && m.ledgerKey) byKey.set(String(m.ledgerKey), index); });
    let added = 0, updated = 0, deleted = 0, skipped = 0;
    const personalityEvents = [];
    asArray(incoming).forEach(row => {
      const meta = row && row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const key = text(row && row.message_key), source = text(row && row.source);
      const kind = text(meta.sync_kind), speaker = text(row && row.speaker_type);
      if (!key || String(row && row.char_id || "") !== cid || !["cc", "stackchan"].includes(source)
        || !allowedKinds.has(kind) || !["lisa", "character"].includes(speaker)) { skipped++; return; }
      const ts = Date.parse(row.occurred_at), safeTs = Number.isFinite(ts) ? ts : Date.now();
      const revision = Math.max(1, Number(row.revision) || 1), isDeleted = !!row.deleted_at;
      const next = {
        id: "ledger:" + String(row.id || key), ledgerKey: key, ledgerRevision: revision,
        ledgerUpdatedAt: row.updated_at || null, ledgerImported: true, crossSource: source,
        crossThreadId: row.thread_id || null, syncKind: kind,
        role: speaker === "lisa" ? "user" : "assistant", content: text(row.content),
        ts: safeTs, read: speaker === "lisa", recalled: isDeleted
      };
      if (!byKey.has(key)) {
        list.push(next); byKey.set(key, list.length - 1); added++; if (isDeleted) deleted++;
        if (!isDeleted) personalityEvents.push({
          eventKey:key + ":" + revision, messageKey:key, speaker,
          content:next.content, ts:safeTs,
          evidence:meta.personality_evidence && typeof meta.personality_evidence === "object" ? meta.personality_evidence : null
        });
        return;
      }
      const index = byKey.get(key), prev = list[index] || {};
      if (revision <= Number(prev.ledgerRevision || 0) && !!prev.recalled === isDeleted) return;
      list[index] = { ...prev, ...next };
      updated++; if (isDeleted && !prev.recalled) deleted++;
    });
    list.sort((a, b) => Number(a && a.ts || 0) - Number(b && b.ts || 0));
    return { messages: list, added, updated, deleted, skipped, personalityEvents };
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
    const clearLocal = () => { storage.removeItem(OUTBOX_KEY); storage.removeItem(DELETE_OUTBOX_KEY); storage.removeItem(DIAG_KEY); storage.removeItem(LIVE_CURSOR_KEY); };
    return { enqueue, invalidate, flush, status, clearLocal };
  }

  // 第 4 步：只观察 CC/Stack-chan 入站，不保存正文、更不写进真实聊天。
  function createPullObserver(options) {
    options = options || {};
    const storage = options.storage || root.localStorage;
    const clock = options.now || (() => Date.now());
    const fetchPage = options.fetchPage || (async (charId, cursor, limit) => {
      if (!root.Cloud || typeof root.Cloud.chatMessagesPullShadow !== "function") throw new Error("chat ledger pull unavailable");
      return root.Cloud.chatMessagesPullShadow(charId, cursor, limit);
    });
    let chain = Promise.resolve();
    const empty = ownerId => ({ owner_id: String(ownerId), cursor: null, total_seen: 0, live_seen: 0, deleted_seen: 0, duplicate_keys: 0, same_text_distinct_turns: 0, out_of_order_rows: 0 });
    const ownerState = ownerId => {
      const id = String(ownerId || "");
      const old = parse(storage, PULL_KEY, null);
      return old && old.owner_id === id ? old : empty(id);
    };
    const observe = ({ ownerId, charId }) => {
      chain = chain.catch(() => {}).then(async () => {
        if (!ownerId || !charId) return { skipped: true };
        const before = ownerState(ownerId);
        let cursor = before.cursor || null, total = 0, live = 0, deleted = 0, duplicate = 0, sameText = 0, outOfOrder = 0;
        const keys = new Set(), texts = new Map();
        let previousOccurred = null;
        try {
          for (let pageNo = 0; pageNo < 5; pageNo++) {
            const page = await fetchPage(String(charId), cursor, 100);
            const rows = asArray(page && page.rows);
            for (const row of rows) {
              total++;
              const key = text(row && row.message_key);
              if (keys.has(key)) duplicate++; else keys.add(key);
              const body = text(row && row.content);
              if (body && texts.has(body) && texts.get(body) !== key) sameText++;
              else if (body) texts.set(body, key);
              const occurred = Date.parse(row && row.occurred_at);
              if (Number.isFinite(previousOccurred) && Number.isFinite(occurred) && occurred < previousOccurred) outOfOrder++;
              if (Number.isFinite(occurred)) previousOccurred = occurred;
              if (row && row.deleted_at) deleted++; else live++;
            }
            cursor = page && page.nextCursor ? page.nextCursor : cursor;
            if (rows.length < 100) break;
          }
          const next = {
            ...before, cursor,
            total_seen: Number(before.total_seen || 0) + total,
            live_seen: Number(before.live_seen || 0) + live,
            deleted_seen: Number(before.deleted_seen || 0) + deleted,
            duplicate_keys: Number(before.duplicate_keys || 0) + duplicate,
            same_text_distinct_turns: Number(before.same_text_distinct_turns || 0) + sameText,
            out_of_order_rows: Number(before.out_of_order_rows || 0) + outOfOrder,
            last_batch: { rows: total, live, deleted, duplicate_keys: duplicate, same_text_distinct_turns: sameText, out_of_order_rows: outOfOrder },
            last_success_at: new Date(clock()).toISOString(), last_error: null, char_id: String(charId)
          };
          write(storage, PULL_KEY, next);
          return next;
        } catch (error) {
          // 失败绝不推进游标；下次从 before.cursor 原位安全重试。
          const failed = { ...before, last_error: String(error && error.message || error), last_attempt_at: new Date(clock()).toISOString(), char_id: String(charId) };
          write(storage, PULL_KEY, failed);
          return failed;
        }
      });
      return chain;
    };
    const status = () => parse(storage, PULL_KEY, null);
    const clear = () => storage.removeItem(PULL_KEY);
    return { observe, status, clear };
  }

  const manager = root.localStorage ? createManager() : null;
  const pullObserver = root.localStorage ? createPullObserver() : null;
  return {
    OUTBOX_KEY, DELETE_OUTBOX_KEY, DIAG_KEY, PULL_KEY, LIVE_CURSOR_KEY, findYanqiu, eligibleContext, isRealMessage, speakerFor,
    rowsFor, addedSessionMessages, reconcileIncoming, createManager, createPullObserver,
    enqueue: manager ? manager.enqueue : async () => ({ queued: 0, pending: 0 }),
    invalidate: manager ? manager.invalidate : async () => ({ sent: 0, pending: 0 }),
    flush: manager ? manager.flush : async () => ({ sent: 0, pending: 0 }),
    observePull: pullObserver ? pullObserver.observe : async () => ({ skipped: true }),
    status: () => ({ ...(manager ? manager.status() : { outbox: [], diagnostic: {} }), pull: pullObserver ? pullObserver.status() : null }),
    clearLocal: () => { if (manager) manager.clearLocal(); if (pullObserver) pullObserver.clear(); }
  };
});
