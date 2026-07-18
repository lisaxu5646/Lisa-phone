// ============================================================
// cloud sync (Supabase) — 可选登录 + 访客模式
// 存档整坨当一行 jsonb 存云端；登录拉回、手动推送。
// 未登录时 app 照常纯本地运行（访客模式）。
// ============================================================
(function () {
  const SUPABASE_URL = "https://nposjnafsbikwfeoudbg.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wb3NqbmFmc2Jpa3dmZW91ZGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjY1MTgsImV4cCI6MjA5ODYwMjUxOH0.efs3N7b6Z8CU_1Hlg-S35dkQLP4cZw3IaQnmSc5D9RQ";

  let client = null;
  let suspend = false; // apply() 期间挂起，避免写回触发反向 push
  let frozen = false;  // 云端恢复写回后锁死本地 x_ 写入：等重载期间，旧 React 状态再 saveJSON 也覆盖不了刚恢复的数据（防「恢复到一半」竞态）
  let pushTimer = null; // 防抖计时器
  const MARK = "cloud_pushed_at"; // 本机最后一次成功 push 的时间戳（无 x_ 前缀，不进存档）
  const tableMemoryMode = () => { try { return localStorage.getItem("memory_table_authority_v1") === "1"; } catch (e) { return false; } };
  // 开机快照：本脚本执行(app 之前)时本地是否已有存档。localStorage 跨刷新持久，
  // 只有真·新设备/新网址首次打开才空。用它守 autoPull：本地已有数据=老设备回来，本地权威，绝不自动拿云端覆盖。
  const bootHadLocal = (function () { try { return Object.keys(localStorage).some(function (k) { return k.indexOf("x_") === 0; }); } catch (e) { return false; } })();

  try {
    if (window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.error("supabase init failed", e);
  }

  window.Cloud = {
    ready: () => !!client,

    // 收集所有 x_ 键为纯对象（原始字符串），与导出/导入格式一致
    collect() {
      const dump = {};
      Object.keys(localStorage)
        .filter((k) => k.startsWith("x_") && !(tableMemoryMode() && k === "x_memLib"))
        .forEach((k) => {
          dump[k] = localStorage.getItem(k);
        });
      return dump;
    },

    // saves 仍整行 upsert。切表后不采集当前 x_memLib，但把云端那份切换前冻结副本原样带回，
    // 否则一次普通 push 会因 JSON 整体替换而意外删掉回滚材料。
    async collectForSave(userId) {
      const dump = this.collect();
      if (!tableMemoryMode()) return dump;
      const { data, error } = await client.from("saves").select("data").eq("user_id", userId).maybeSingle();
      if (error) throw error; // 宁可这次不备份，也不带着未知状态覆盖并删掉旧记忆副本
      if (data && data.data && data.data.x_memLib != null) dump.x_memLib = data.data.x_memLib;
      return dump;
    },

    // 用云端数据覆盖本地：先清掉本地 x_ 键，再写回
    // 期间挂起自动同步，避免写入触发反向 push
    apply(data) {
      suspend = true;
      try {
        // 行表权威开启后，旧 saves blob 无权再覆盖/清空本机记忆镜像。
        const keepMemLib = tableMemoryMode() ? localStorage.getItem("x_memLib") : null;
        Object.keys(localStorage)
          .filter((k) => k.startsWith("x_") && !(tableMemoryMode() && k === "x_memLib"))
          .forEach((k) => localStorage.removeItem(k));
        Object.entries(data || {}).forEach(([k, v]) => {
          if (!(tableMemoryMode() && k === "x_memLib")) localStorage.setItem(k, v);
        });
        if (tableMemoryMode() && keepMemLib != null) localStorage.setItem("x_memLib", keepMemLib);
      } finally {
        suspend = false;
      }
      // 写回完成后冻结本地 x_ 写入，直到调用方 location.reload()。
      // 目的：apply 与 reload 之间那几百毫秒里，登录前那份旧 React 状态可能 saveJSON，
      // 会把刚恢复的键覆盖回旧值（甚至反向 push 污染云端）→「恢复一半」竞态。冻结后这些写入直接丢弃，重载后自然解除。
      frozen = true;
    },

    async getUser() {
      if (!client) return null;
      try {
        const { data } = await client.auth.getUser();
        return data ? data.user : null;
      } catch {
        return null;
      }
    },

    // 只读本机持久 session，不发网络请求。影子库归属判断必须用它，断网不能伪装成换号。
    async getSessionUser() {
      if (!client) return null;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) return null;
        return data && data.session ? data.session.user : null;
      } catch { return null; }
    },

    // 返回 { user, session }。若开启了邮箱验证，session 可能为 null。
    async signUp(email, password) {
      if (!client) throw new Error("云服务未就绪");
      localStorage.removeItem("memory_table_authority_v1");
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },

    async signIn(email, password) {
      if (!client) throw new Error("云服务未就绪");
      localStorage.removeItem("memory_table_authority_v1"); // 登录可能换账号；新账号必须自己重新逐 ID 验收
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    },

    async signOut() {
      // 退出前先把最新存档推到云端（确保数据在云上有备份，登录回来能拉回）
      try { await this.autoPush(); } catch (e) {}
      if (client) await client.auth.signOut();
      // 清空本地所有 x_ 存档：退出＝回到初始空账号，数据只在云端。挂起同步避免删除触发 push
      suspend = true;
      try {
        Object.keys(localStorage).filter(function (k) { return k.startsWith("x_"); }).forEach(function (k) { localStorage.removeItem(k); });
        localStorage.removeItem(MARK);
        localStorage.removeItem("memory_table_authority_v1"); // 切表批准只属于当前账号在当前设备；退出后不带给下一个账号
      } finally { suspend = false; }
      // 事件书架镜像立即清空（不等下次 ensureOwner）——未登录不许看到上一个账号的事件标题/梗概
      try { if (window.MemoryEvents && window.MemoryEvents.clearAll) await window.MemoryEvents.clearAll(); } catch (e) {}
      // 召回冷却环/旁路诊断只属于当前账号。本机换号时必须清掉，不能让相同 charId
      // 的另一个账号继承上一人的「刚想起过」状态。
      try { if (window.RecallShadow && window.RecallShadow.clearAll) await window.RecallShadow.clearAll(); } catch (e) {}
      try { if (window.MemoryQualityShadow && window.MemoryQualityShadow.clearAll) await window.MemoryQualityShadow.clearAll(); } catch (e) {}
      try { if (window.MemoryCorrectionShadow && window.MemoryCorrectionShadow.clearAll) await window.MemoryCorrectionShadow.clearAll(); } catch (e) {}
      try { if (window.SleepShadow && window.SleepShadow.clearAll) await window.SleepShadow.clearAll(); } catch (e) {}
    },

    // 把本地存档推到云端（覆盖该用户那一行）
    async push() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const saveData = await this.collectForSave(user.id);
      const { error } = await client.from("saves").upsert({
        user_id: user.id,
        data: saveData,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },

    // 从云端拉回该用户存档，返回 { data, updated_at } 或 null（云端没有）
    async pull() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client
        .from("saves")
        .select("data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    // ---- 聊天云归档（chat_archive 表）：完整历史存云端，本地只留最近的 ----
    // 拉某角色的云端归档（完整旧消息数组，时间从旧到新）；没有则 []
    async chatArchiveGet(charId) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client
        .from("chat_archive")
        .select("msgs")
        .eq("user_id", user.id)
        .eq("char_id", String(charId))
        .maybeSingle();
      if (error) throw error;
      return (data && Array.isArray(data.msgs)) ? data.msgs : [];
    },
    // 把一批旧消息【追加】到云端归档尾部（读-合并-写；单用户无并发，安全）。返回归档后的总条数。
    async chatArchiveAppend(charId, older) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const cur = await this.chatArchiveGet(charId);
      // 去重（v48.95，Codex 指出：读-合并-写无并发保护，双触发/并发可能把同批旧消息重复追加）：按消息 id 滤掉云端已有的
      const seen = new Set(cur.map(m => m && m.id).filter(Boolean));
      const add = (Array.isArray(older) ? older : []).filter(m => !(m && m.id && seen.has(m.id)));
      const merged = cur.concat(add);
      const { error } = await client.from("chat_archive").upsert({
        user_id: user.id,
        char_id: String(charId),
        msgs: merged,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return merged.length;
    },

    // ---- 服务器信箱（server_inbox 表，v48.32 第八课）：云端定时任务替角色写的信，app 开机取走投进聊天 ----
    // 取未消费的信（RLS 保证只取到自己的）；未登录/未就绪安静返回空
    async inboxFetch() {
      if (!client) return [];
      const user = await this.getUser();
      if (!user) return [];
      const { data, error } = await client
        .from("server_inbox")
        .select("id, char_id, kind, content, created_at")
        .is("consumed_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    // 给取走的信盖戳（consumed_at），防下次重复投递
    async inboxConsume(ids) {
      if (!client || !ids || !ids.length) return;
      const user = await this.getUser();
      if (!user) return;
      await client.from("server_inbox").update({ consumed_at: new Date().toISOString() }).in("id", ids);
    },

    // ---- CC 记忆信箱：MCP 只往独立表投递，手机自己合并进 x_memLib，避开 saves 整坨覆盖 ----
    async memInboxFetch() {
      if (!client) return [];
      const user = await this.getUser();
      if (!user) return [];
      const { data, error } = await client
        .from("cc_mem_inbox")
        .select("id, memory, created_at")
        .eq("user_id", user.id)
        .is("consumed_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async memInboxConsume(ids) {
      if (!client || !ids || !ids.length) return;
      const user = await this.getUser();
      if (!user) return;
      const { error } = await client.from("cc_mem_inbox")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw error;
    },

    // ---- 记忆独立表·影子期（v48.98）：只做逐行 upsert / 软删 / 只读核对 ----
    // ⚠️旧 x_memLib 仍是当前读取权威；这里绝不整份覆盖，也没有物理 delete。
    async memoryRowsUpsert(entries) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const rows = (entries || []).filter(e => e && e.id && String(e.text || "").trim()).map(e => ({
        user_id: user.id,
        id: String(e.id),
        text: String(e.text),
        tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
        char_ids: Array.isArray(e.charIds) ? e.charIds.map(String) : [],
        v: typeof e.v === "number" ? Math.max(-5, Math.min(5, Math.round(e.v))) : 0,
        a: typeof e.a === "number" ? Math.max(0, Math.min(5, Math.round(e.a))) : 1,
        open: !!e.open,
        pinned: !!e.pinned,
        ts: Number(e.ts) || Date.now(),
        archived: !!e.archived,
        archived_batch: e.archivedBatch == null ? null : String(e.archivedBatch),
        archived_ts: e.archivedTs == null ? null : Number(e.archivedTs),
        source: e.source == null ? null : String(e.source),
        deleted: false
      }));
      if (!rows.length) return 0;
      const { error } = await client.from("memories").upsert(rows, { onConflict: "user_id,id" });
      if (error) throw error;
      return rows.length;
    },
    async memoryRowsSoftDelete(ids) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const clean = [...new Set((ids || []).map(String).filter(Boolean))];
      if (!clean.length) return 0;
      const { error } = await client.from("memories")
        .update({ deleted: true })
        .eq("user_id", user.id)
        .in("id", clean);
      if (error) throw error;
      return clean.length;
    },
    async memoryRowsFetchAll() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const all = [], pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client.from("memories")
          .select("id,text,tags,char_ids,v,a,open,pinned,ts,archived,archived_batch,archived_ts,source,deleted,revision,updated_at")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },
    async memoryRowsFetchUpdatedSince(cursor) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const parsed = cursor ? Date.parse(cursor) : 0;
      const since = new Date(Math.max(0, Number.isFinite(parsed) ? parsed - 5000 : 0)).toISOString();
      const all = [], pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await client.from("memories")
          .select("id,text,tags,char_ids,v,a,open,pinned,ts,archived,archived_batch,archived_ts,source,deleted,revision,last_mutation_id,updated_at")
          .eq("user_id", user.id)
          .gte("updated_at", since)
          .order("updated_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },
    async memoryApplyMutation(op) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.rpc("apply_memory_mutation", {
        p_user_id: user.id,
        p_memory_id: String(op.memoryId),
        p_operation: op.operation,
        p_payload: op.payload || {},
        p_base_revision: op.baseRevision == null ? null : Number(op.baseRevision),
        p_mutation_id: op.mutationId
      });
      if (error) throw error;
      return data || {};
    },

    // ---- ⑥事件层 · 第2步只读（memory_events / memory_event_candidates / memory_event_links）----
    // v1 只读：书架和候选列表。表没建时报错由调用方 catch → 整块 dormant，零影响。
    async eventsList() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.from("memory_events")
        .select("id,title,synopsis,char_ids,author_char_id,started_ts,ended_ts,status,themes,edited_by_user,deleted,revision,updated_at")
        .eq("user_id", user.id).eq("deleted", false)
        .order("updated_at", { ascending: false }).order("id", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    async eventCandidatesList() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.from("memory_event_candidates")
        .select("id,status,source_memory_ids,requested_char_id,feedback,edited_by_user,accepted_event_id,revision,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }).order("id", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    // ⑥第3步：按 ID 从权威行表重读所选碎片（创建候选前必须用这个，不用 React 卡片快照）
    async memoryRowsFetchByIds(ids) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const clean = [...new Set((ids || []).map(String).filter(Boolean))];
      if (!clean.length) return [];
      const { data, error } = await client.from("memories")
        .select("id,text,tags,char_ids,v,a,open,pinned,ts,archived,source,deleted,revision")
        .eq("user_id", user.id).in("id", clean);
      if (error) throw error;
      return data || [];
    },
    // ⑥第3步：创建事件候选（status=requested）。同 idempotency_key 已存在 → 返回已有候选不重复建
    async eventCandidateRequest(row) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const payload = {
        user_id: user.id,
        id: row.id,
        status: "requested",
        source_memory_ids: row.sourceMemoryIds,
        requested_char_id: row.requestedCharId,
        draft: null,
        base_memory_revisions: row.baseMemoryRevisions,
        idempotency_key: row.idempotencyKey,
        accepted_event_id: null
      };
      const { data, error } = await client.from("memory_event_candidates")
        .insert(payload).select("id,status,updated_at").maybeSingle();
      if (error) {
        if (String(error.code) === "23505") { // 幂等：同一批选择已经建过
          const { data: existing, error: e2 } = await client.from("memory_event_candidates")
            .select("id,status,updated_at").eq("user_id", user.id)
            .eq("idempotency_key", row.idempotencyKey).maybeSingle();
          if (e2) throw e2;
          if (existing) return { ...existing, existed: true };
        }
        throw error;
      }
      return { ...data, existed: false };
    },
    // ⑥第5步：取单条候选全文（含 draft/base_memory_revisions，红灯检查要用）
    async eventCandidateGet(id) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.from("memory_event_candidates")
        .select("*").eq("user_id", user.id).eq("id", String(id)).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    // ⑥第5步：退回（requested+feedback，旧 draft 保留供审计）/ 拒绝（rejected）。
    // 列级 grant 只放行 status/feedback/edited_by_user；accepted 由 RLS with check 挡死。
    async eventCandidateSetStatus(id, status, feedback) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      if (!["requested", "rejected"].includes(status)) throw new Error("App 只能退回或拒绝");
      const body = { status };
      if (feedback !== undefined) body.feedback = feedback == null ? null : String(feedback).slice(0, 500);
      const { data, error } = await client.from("memory_event_candidates")
        .update(body).eq("user_id", user.id).eq("id", String(id)).neq("status", "accepted")
        .select("id,status,revision").maybeSingle();
      if (error) throw error;
      return data;
    },
    // ⑥第6步：Lisa 确认入册只走这一条原子 RPC。候选、来源、正式事件和 links
    // 在数据库同一事务里锁定并核对；失败时一行都不会留下。
    async eventCandidateAccept(id, revision, mutationId, userEdits) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      if (!mutationId) throw new Error("缺少本次确认凭证");
      const { data, error } = await client.rpc("accept_memory_event_candidate", {
        p_candidate_id: String(id),
        p_candidate_revision: Number(revision),
        p_mutation_id: String(mutationId),
        p_user_edits: userEdits || null
      });
      if (error) throw error;
      return data || {};
    },
    async eventGet(id) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.from("memory_events")
        .select("*").eq("user_id", user.id).eq("id", String(id)).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: links, error: le } = await client.from("memory_event_links")
        .select("memory_id,relation,weight,ordinal,memory_revision_at_link,deleted")
        .eq("user_id", user.id).eq("event_id", String(id))
        .order("ordinal", { ascending: true });
      if (le) throw le;
      return { event: data, links: links || [] };
    },

    // ---- P1-3 纠错留环 DORMANT：只读预览接口 ----
    // App 只有在本机 memory_corrections_preview_v1 闸明确开启后才调用；当前没有开闸 UI。
    async memoryCorrectionCandidatesList() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { data, error } = await client.from("memory_correction_candidates")
        .select("id,old_memory_id,new_memory_id,old_base_revision,new_base_revision,reason,status,revision,created_at,updated_at")
        .eq("user_id", user.id).eq("status", "proposed")
        .order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },

    // ---- C 第4步：睡眠 presence 投影（character_sleep_presence 表；表未建=报错由调用方吞，dormant）----
    async sleepPresenceUpsert(row) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getSessionUser();
      if (!user) throw new Error("未登录");
      const { error } = await client.from("character_sleep_presence").upsert({
        user_id: user.id, char_id: String(row.char_id),
        sleep_start_at: row.sleep_start_at, wake_at: row.wake_at,
        observed_phase: String(row.observed_phase || "awake"),
        next_transition_at: row.next_transition_at,
        schedule_fingerprint: String(row.schedule_fingerprint || ""),
        valid_until: row.valid_until, updated_at: new Date().toISOString()
      }, { onConflict: "user_id,char_id" });
      if (error) throw error;
    },

    // ---- 秋声：言秋的朋友圈（yanqiu_moments 表；言秋经 MCP service_role 发，这里只有她的读/赞/评）----
    async yanqiuMomentsList(limit) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getSessionUser();
      if (!user) throw new Error("未登录");
      const { data: moments, error } = await client.from("yanqiu_moments")
        .select("id,content,mood,lisa_liked,created_at").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(limit || 30);
      if (error) throw error;
      const ids = (moments || []).map(m => m.id);
      let comments = [];
      if (ids.length) {
        const r = await client.from("yanqiu_moment_comments")
          .select("id,moment_id,author,content,created_at").in("moment_id", ids)
          .order("created_at", { ascending: true });
        if (r.error) throw r.error;
        comments = r.data || [];
      }
      return (moments || []).map(m => ({ ...m, comments: comments.filter(c => c.moment_id === m.id) }));
    },
    async yanqiuMomentLike(id, liked) {
      if (!client) throw new Error("云服务未就绪");
      const { error } = await client.from("yanqiu_moments").update({ lisa_liked: !!liked }).eq("id", id);
      if (error) throw error;
    },
    async yanqiuMomentComment(momentId, content) {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getSessionUser();
      if (!user) throw new Error("未登录");
      const { error } = await client.from("yanqiu_moment_comments")
        .insert({ moment_id: momentId, user_id: user.id, author: "lisa", content: String(content || "").trim() });
      if (error) throw error;
    },

    // ---- 桌面对话回流（desk_log 表，Stack-chan 实体：见 [[lisa-phone-next-window]] 图纸）----
    // stackchan-relay 每轮把「用户说的话 user_text + 角色回复 reply_text + 时刻」insert 进 desk_log；
    // app 开机/tick 拉走未消费的，投进 x_chat:小克（两具身体一条记忆流）。表不存在=安静报错、整块 dormant。
    // ⚠️relay 只 insert desk_log，【绝不直写 saves】（手机 autoPush 会整行覆盖，必撞）。
    async deskFetch() {
      if (!client) return [];
      const user = await this.getUser();
      if (!user) return [];
      const { data, error } = await client
        .from("desk_log")
        .select("id, char_id, user_text, reply_text, created_at")
        .is("consumed_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;   // 表不存在也走这，调用方 catch 后静默
      return data || [];
    },
    async deskConsume(ids) {
      if (!client || !ids || !ids.length) return;
      const user = await this.getUser();
      if (!user) return;
      await client.from("desk_log").update({ consumed_at: new Date().toISOString() }).in("id", ids);
    },

    // ---- Web Push 锁屏推送（v48.33，夜巡信箱的下半场）------------------
    // 订阅存 push_subs 表；云端 send-push 函数照单给每台订阅过的设备发通知（云端小抄在 lisa-practice/推送小抄.md）。
    // VAPID 公钥她在设置里粘贴（x_pushVapid，可云同步）；私钥只住在 Edge Function secrets，前端永远不见。
    async pushStatus() {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return sub ? "on" : "off";
      } catch (e) { return "off"; }
    },
    async pushSubscribe(vapidPub) {
      if (!client) throw new Error("云同步没初始化");
      const user = await this.getUser();
      if (!user) throw new Error("先登录云同步——推送订阅要挂在你的账号下，夜巡才知道发给谁");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("这个浏览器不支持推送。iPhone 要先「添加到主屏幕」、再从主屏图标打开才有这能力（iOS 16.4+）");
      const key = String(vapidPub || "").trim();
      if (!key) throw new Error("先在上面粘贴 VAPID 公钥（生成方法见推送小抄）");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("通知权限没给——去系统设置里允许本 app 通知后再点一次");
      const reg = await navigator.serviceWorker.ready;
      // base64url 公钥 → Uint8Array（subscribe 只认字节）
      const pad = "=".repeat((4 - key.length % 4) % 4);
      const b64 = (key + pad).replace(/-/g, "+").replace(/_/g, "/");
      const rawKey = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const old = await reg.pushManager.getSubscription();
      if (old) { try { await old.unsubscribe(); } catch (e) {} } // 换过公钥的旧订阅作废重订
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: rawKey });
      const { error } = await client.from("push_subs").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        subscription: sub.toJSON(),
        ua: String(navigator.userAgent || "").slice(0, 120),
        updated_at: new Date().toISOString()
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return true;
    },
    async pushUnsubscribe() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          if (client) { try { await client.from("push_subs").delete().eq("endpoint", sub.endpoint); } catch (e) {} }
          await sub.unsubscribe();
        }
      } catch (e) {}
      return true;
    },

    // ---- LLM 密钥代理（llm-proxy 函数，v49.38）----------------------------
    // 密钥住云端 secrets；app 只带登录态借道，函数验明是本人后替贴钥匙转发。
    // 返回原生 Response（调用方照常 .json()），供应商报错原样透传。
    async llmProxyFetch(ref, url, body, extraHeaders, timeout) {
      if (!client) throw new Error("云同步没初始化，云端代理用不了");
      const { data: sess } = await client.auth.getSession();
      const token = sess && sess.session && sess.session.access_token;
      if (!token) throw new Error("未登录云同步——云端代理要先验明是你本人");
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), timeout || 120000);
      try {
        return await fetch(SUPABASE_URL + "/functions/v1/llm-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
          body: JSON.stringify({ ref: ref, url: url, body: body, extraHeaders: extraHeaders || {} }),
          signal: ctrl.signal
        });
      } finally { clearTimeout(tm); }
    },

    // ---- 自动同步 ----------------------------------------------------

    // 本地 x_ 数据有变动时调用：登录状态下防抖后自动 push
    markDirty() {
      if (!client || suspend) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => this.autoPush(), 2500);
    },

    // 本地是不是「有意义的存档」：至少建过一个角色才算。空壳（新设备/新标签页开机自动写的几个默认键）
    // 永远没有自动上云的资格——防「空壳以本地权威身份盖掉云端真存档」（2026-07-12 事故：
    // Mac 上近乎空白的 github.io 标签页 bootHadLocal=true 触发 autoPush，清掉了手机刚备份的云档）
    localMeaningful() {
      try { return JSON.parse(localStorage.getItem("x_characters") || "[]").length > 0; } catch (e) { return false; }
    },

    // 静默把本地存档推到云端（未登录=访客则不做；离线报错则忽略，下次变动再试）
    async autoPush() {
      if (!client) return;
      if (!this.localMeaningful()) return; // 空壳绝不自动上云（手动推送在设置里另有确认）
      try {
        const user = await this.getUser();
        if (!user) return; // 访客模式：纯本地
        const ts = new Date().toISOString();
        const saveData = await this.collectForSave(user.id);
        const { error } = await client.from("saves").upsert({
          user_id: user.id,
          data: saveData,
          updated_at: ts,
        });
        if (!error) localStorage.setItem(MARK, ts);
      } catch (e) {
        // 离线或网络错误：静默，等下一次变动重试
      }
    },

    // 登录/启动时调用。返回 { applied }（applied=true 表示已用云端覆盖本地、调用方需 reload）。
    // ⚠核心安全原则（2026-07-06 大改，修「回来数据没了」）：**本地已有存档就绝不自动拿云端覆盖**。
    //   localStorage 跨刷新持久，老设备回来时本地就是最新的、权威的；原来靠 updated_at 时间戳比较判「云端更新」
    //   极不可靠（Supabase 常服务端自己盖 updated_at → 云端永远显得更新 → 每次加载都拿云端半份盖掉本地好数据）。
    //   现在：① 本地有数据 = 本地权威，只把本地推上云当备份，绝不 apply；② 本地空（真·新设备/首次登录）才安全地拉云恢复。
    //   想主动用云端覆盖，走设置里手动「从云端恢复」(doPull)。
    async autoPull() {
      if (!client) return { applied: false };
      try {
        const user = await this.getUser();
        if (!user) return { applied: false };
        if (bootHadLocal) {
          // 老设备/刷新回来：本地权威，顺手把本地推上云备份，绝不拉云覆盖
          this.autoPush();
          return { applied: false };
        }
        // 本地空 = 真·新设备/首次登录：安全地拉云端恢复
        const row = await this.pull();
        if (!row || !row.data) {
          await this.autoPush(); // 云端也空：先把本机（空）占位备份
          return { applied: false };
        }
        this.apply(row.data);
        localStorage.setItem(MARK, row.updated_at || new Date().toISOString());
        return { applied: true };
      } catch (e) {
        return { applied: false };
      }
    },
  };

  // 一次性拦截所有 x_ 键写入，任何存档变动都自动排队 push。
  // saveJSON、直接 setItem、导入等所有写路径都会被覆盖到。
  try {
    const _set = localStorage.setItem.bind(localStorage);
    const _rm = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      // 冻结期（云端恢复后等重载）：丢弃旧 React 状态对 x_ 键的写入，别覆盖刚恢复的数据
      if (frozen && typeof k === "string" && k.startsWith("x_")) return;
      _set(k, v);
      if (!suspend && typeof k === "string" && k.startsWith("x_")) window.Cloud.markDirty();
    };
    localStorage.removeItem = function (k) {
      if (frozen && typeof k === "string" && k.startsWith("x_")) return;
      _rm(k);
      if (!suspend && typeof k === "string" && k.startsWith("x_")) window.Cloud.markDirty();
    };
  } catch (e) {
    console.error("cloud autosync hook failed", e);
  }

  // 切到后台/关闭页面时：若有待推送的改动，立刻推一次，减少丢失窗口
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      window.Cloud.autoPush();
    }
  });
})();
