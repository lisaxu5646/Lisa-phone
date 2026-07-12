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
        .filter((k) => k.startsWith("x_"))
        .forEach((k) => {
          dump[k] = localStorage.getItem(k);
        });
      return dump;
    },

    // 用云端数据覆盖本地：先清掉本地 x_ 键，再写回
    // 期间挂起自动同步，避免写入触发反向 push
    apply(data) {
      suspend = true;
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("x_"))
          .forEach((k) => localStorage.removeItem(k));
        Object.entries(data || {}).forEach(([k, v]) => localStorage.setItem(k, v));
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

    // 返回 { user, session }。若开启了邮箱验证，session 可能为 null。
    async signUp(email, password) {
      if (!client) throw new Error("云服务未就绪");
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },

    async signIn(email, password) {
      if (!client) throw new Error("云服务未就绪");
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
      } finally { suspend = false; }
    },

    // 把本地存档推到云端（覆盖该用户那一行）
    async push() {
      if (!client) throw new Error("云服务未就绪");
      const user = await this.getUser();
      if (!user) throw new Error("未登录");
      const { error } = await client.from("saves").upsert({
        user_id: user.id,
        data: this.collect(),
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
      const merged = cur.concat(Array.isArray(older) ? older : []);
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
        const { error } = await client.from("saves").upsert({
          user_id: user.id,
          data: this.collect(),
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
