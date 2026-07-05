// ============================================================
// 一起学（study）—— 与主聊天完全隔离的学习向对话模块
// 数据走 localStorage（x_study_sessions / x_curricula），自动跟随云同步。
// 三种模式：teach（1v1 认真教）/ costudy（1v1 一起研究）/ nv1（一教一学+同学）
// 隔离命门：study 的 prompt 绝不注入主聊天记忆；只注入
//   角色卡 + 世界书 + 本 slot 的 progress + curriculum 切片 + transcript 尾巴
// ============================================================
(function () {
  // ---- 内置 prompt 块 -------------------------------------------------
  const USER_SLOT_PROTECT =
    "【用户槽位保护（最高优先级）】\n" +
    "- 你只能扮演你自己（以及角色卡/世界书明确授权你分饰的 NPC）。绝对不能替『用户』发言、代答、代做决定。\n" +
    "- 不要在输出里写用户的台词、想法或动作；轮到用户的部分一律留白，等他真实开口。\n" +
    "- 你无权替用户宣称他“学会了/掌握了/理解了/记住了”。是否掌握，只由用户本人或他手动触发的结算判定。\n" +
    "- 教/讨论时多把球抛回给用户（提问、留练习、请他复述或试answer），而不是自问自答一路讲到底。";

  const OUT_FMT =
    "\n【输出格式】只输出 JSON：{\"say\":[\"气泡1\",\"气泡2\"]}。" +
    "say 里放你这一轮说出口的话，可拆成 1~4 个气泡（像即时通讯那样分条），" +
    "不要加名字前缀、不要旁白括号、不要 markdown、不要把 JSON 以外的东西吐出来。";

  function sceneFor(mode, subject, extra) {
    if (mode === "teach")
      return "【当前场景：一起学 · 认真教】你在一对一地教「用户」学『" + subject + "』。" +
        "你是有能力的老师：按下方课程大纲的【当前单元】推进，讲解具体、给例子、可跟练，并留出让用户练习和提问的空间。" +
        "一次只推进一小步，别把整个单元一口气倒完。用自然的教学口吻，不八股。";
    if (mode === "costudy")
      return "【当前场景：一起学 · 一起研究】你和用户一起研究『" + subject + "』——你并不比他更懂，这是共同探索。" +
        "一起查、一起猜、一起试错、互相启发。别不懂装懂、别硬编权威答案；不确定就说不确定，并提出可以一起验证的思路。";
    if (mode === "nv1-teacher")
      return "【当前场景：一起学 · 你是老师，现场还有另一个同学】你在教「用户」和另一位同学一起学『" + subject + "』。" +
        "按大纲【当前单元】推进，照顾两个学生，但绝不替他们回答。" + (extra ? "另一位同学：" + extra + "。" : "");
    if (mode === "nv1-peer")
      return "【当前场景：一起学 · 你和用户是同学】你和用户一起跟老师" + (extra ? "「" + extra + "」" : "") + "学『" + subject + "』。" +
        "你也在学：会答错、会提问、会和用户讨论、偶尔走神。别抢老师的活，也绝不替用户回答；以同学身份自然参与。";
    return "";
  }

  // ---- 存储 ----------------------------------------------------------
  const K_SESS = "x_study_sessions";
  const K_CUR = "x_curricula";
  function loadSessions() { return loadJSON(K_SESS, []); }
  function saveSessions(list) { saveJSON(K_SESS, list); }
  function loadCurricula() { return loadJSON(K_CUR, []); }
  function saveCurricula(list) { saveJSON(K_CUR, list); }
  function findCurriculum(id) { return loadCurricula().find(function (c) { return c.id === id; }) || null; }
  function findCurriculumBySubject(subject) {
    const s = String(subject || "").trim().toLowerCase();
    return loadCurricula().find(function (c) { return String(c.subject || "").trim().toLowerCase() === s; }) || null;
  }
  // 课程 upsert；进度归课程（跨 session 共享 = 持续学习的载体）
  function saveCurriculum(cur) {
    const all = loadCurricula();
    const i = all.findIndex(function (c) { return c.id === cur.id; });
    if (i >= 0) all[i] = cur; else all.push(cur);
    saveCurricula(all);
  }
  function saveCurriculumProgress(id, progress) {
    const all = loadCurricula().map(function (c) {
      return c.id === id ? Object.assign({}, c, { progress: progress, updated_at: Date.now() }) : c;
    });
    saveCurricula(all);
  }

  function newProgress(mode) {
    if (mode === "costudy") return { running_summary: "", loose_vocab: [] };
    return { current_unit: null, completed: [], mastery: {}, review_queue: [], notes: "" };
  }
  // 从冻结大纲起一份新的课程进度（第一单元起步）
  function initCurriculumProgress(cur) {
    const p = newProgress("teach");
    if (cur && Array.isArray(cur.units) && cur.units.length) p.current_unit = cur.units[0].id;
    return p;
  }

  // ---- 迁移：老库把进度挂在 session 上、课程无 mode/progress ----------
  // 课程中心化：把最领先的那个 session 进度提升到课程；课程补 mode/cast。幂等。
  function migrate() {
    const curs = loadCurricula();
    if (!curs.length) return;
    const sess = loadSessions();
    let changed = false;
    curs.forEach(function (c) {
      if (c.progress && c.mode && c.character_ids) return;
      const refs = sess.filter(function (s) { return s.curriculum_id === c.id; });
      const recent = refs.slice().sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); })[0];
      if (!c.progress) {
        // 取走得最远的 session 进度（已完成单元最多者）
        let best = null;
        refs.forEach(function (s) {
          if (s.progress && Array.isArray(s.progress.completed) &&
            (!best || s.progress.completed.length > (best.completed || []).length)) best = s.progress;
        });
        c.progress = best ? {
          current_unit: best.current_unit || (c.units && c.units[0] ? c.units[0].id : null),
          completed: best.completed || [], mastery: best.mastery || {},
          review_queue: best.review_queue || [], notes: best.notes || ""
        } : initCurriculumProgress(c);
      }
      if (!c.mode) c.mode = recent && recent.mode === "nv1" ? "nv1" : "teach";
      if (!c.character_ids) {
        c.character_ids = recent ? (recent.character_ids || []).slice() : [];
        c.teacher_id = recent ? (recent.teacher_id || null) : null;
      }
      if (!c.updated_at) c.updated_at = c.created_at || Date.now();
      changed = true;
    });
    if (changed) saveCurricula(curs);
  }
  migrate();

  // ---- transcript 工具 ----------------------------------------------
  // entry: { id, role:'user'|'char', speakerId, name, content, ts }
  function tail(transcript, n) { return (transcript || []).slice(-(n || 6)); }

  // 把 transcript 尾巴映射成 API messages：目标角色自己的话=assistant，
  // 用户与其它角色的话=user（带「名字：」前缀供上下文，不影响输出）
  function toMessages(transcript, targetId, userName) {
    const msgs = [];
    tail(transcript, 12).forEach(function (m) {
      if (m.role === "char" && m.speakerId === targetId) {
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") last.content += "\n" + m.content;
        else msgs.push({ role: "assistant", content: m.content });
      } else {
        const who = m.role === "user" ? (userName || "用户") : (m.name || "同学");
        const line = who + "：" + m.content;
        const last = msgs[msgs.length - 1];
        if (last && last.role === "user") last.content += "\n" + line;
        else msgs.push({ role: "user", content: line });
      }
    });
    if (!msgs.length || msgs[msgs.length - 1].role !== "user")
      msgs.push({ role: "user", content: "（请你自然地开场 / 继续这堂课）" });
    return msgs;
  }

  // ---- curriculum 切片：只给当前单元全量 + 其余单元仅标题 --------------
  function curriculumSlice(cur, currentUnitId) {
    if (!cur || !Array.isArray(cur.units)) return "";
    const units = cur.units;
    const idx = Math.max(0, units.findIndex(function (u) { return u.id === currentUnitId; }));
    const cu = units[idx] || units[0];
    const lines = [];
    lines.push("【课程：" + (cur.subject || "") + "（" + (cur.level || "") + "）· 共 " + units.length + " 单元】");
    lines.push("全部单元（仅标题）：" + units.map(function (u, i) {
      return (i + 1) + "." + (u.title || u.id) + (u.id === cu.id ? "←当前" : "");
    }).join("  "));
    if (cu) {
      lines.push("\n【当前单元 · 全量】" + (cu.title || cu.id));
      if (cu.objectives && cu.objectives.length) lines.push("目标：" + cu.objectives.join("；"));
      if (cu.grammar && cu.grammar.length) lines.push("要点：" + cu.grammar.map(function (g) { return g.label + (g.note ? "（" + g.note + "）" : ""); }).join("；"));
      if (cu.vocab && cu.vocab.length) lines.push("词汇：" + cu.vocab.join("、"));
      if (cu.can_do && cu.can_do.length) lines.push("学完能做到：" + cu.can_do.join("；"));
    }
    return lines.join("\n");
  }

  function progressText(cur, progress) {
    if (!progress) return "";
    const lines = ["【当前进度】"];
    const unit = cur && Array.isArray(cur.units) ? cur.units.find(function (u) { return u.id === progress.current_unit; }) : null;
    lines.push("当前单元：" + (unit ? unit.title : (progress.current_unit || "第一单元")) +
      "（已完成 " + (progress.completed || []).length + " / " + (cur && cur.units ? cur.units.length : "?") + " 单元）");
    const m = progress.mastery || {};
    const keys = Object.keys(m);
    if (keys.length && unit && unit.grammar) {
      const label = {};
      unit.grammar.forEach(function (g) { label[g.id] = g.label; });
      const parts = keys.map(function (k) {
        const lv = m[k];
        const tag = lv >= 3 ? "稳" : lv === 2 ? "基本会" : lv === 1 ? "待复习" : "新学";
        return (label[k] || k) + ":" + tag;
      });
      lines.push("掌握情况：" + parts.join("，"));
    }
    if ((progress.review_queue || []).length) lines.push("需复习：见上面标『待复习』的点");
    if (progress.notes) lines.push("备注：" + progress.notes);
    return lines.join("\n");
  }

  // ---- 课程级长期上下文（跨所有 session 的积累 = 持续学习记忆）---------
  function longTermContext(cur) {
    if (!cur || !cur.progress) return "";
    const p = cur.progress;
    const labelOf = {}, unitOf = {};
    (cur.units || []).forEach(function (u) {
      (u.grammar || []).forEach(function (g) { labelOf[g.id] = g.label; unitOf[g.id] = u.title; });
    });
    const m = p.mastery || {};
    const weak = Object.keys(m).filter(function (k) { return m[k] <= 1; });
    const strong = Object.keys(m).filter(function (k) { return m[k] >= 3; });
    const lines = [];
    if (weak.length) lines.push("弱项/待复习（历次练习累计，教学时顺带带一带、别当没学过重讲）：" +
      weak.map(function (k) { return (labelOf[k] || k) + (unitOf[k] ? "[" + unitOf[k] + "]" : ""); }).join("、"));
    if (strong.length) lines.push("已掌握牢固（别再从头细讲，可直接用）：" +
      strong.map(function (k) { return labelOf[k] || k; }).join("、"));
    if (p.notes) lines.push("上次结算给下次的提醒：" + p.notes);
    if (!lines.length) return "";
    return "【这门课的长期积累 · 跨所有练习（持续学习记忆）】\n" + lines.join("\n");
  }

  // ---- 组 prompt（隔离：只注入被允许的几块） --------------------------
  function buildStudyPrompt(session, char, ctx, role) {
    const worldbook = ctx.worldbook || "";
    const profile = ctx.profile || {};
    const cur = session.curriculum_id ? findCurriculum(session.curriculum_id) : null;
    const parts = [];
    parts.push(ANTI_CLICHE);
    if (worldbook && worldbook.trim()) parts.push(WORLDBOOK_RULE);
    parts.push(CHARCARD_RULE);
    parts.push(USER_SLOT_PROTECT);
    parts.push("【角色人设】\n" + (char.persona || "（暂无设定）"));
    if (profile.name || profile.persona)
      parts.push("【和你一起学的人 · " + (profile.name || "用户") + "】\n" + (profile.persona || "（未填写）"));
    if (worldbook && worldbook.trim()) parts.push("【世界书】\n" + worldbook.trim());

    const mode = role || session.mode;
    // 场景 + 大纲切片 + 进度（costudy 无大纲，改注入 running_summary）
    let peerName = "";
    if (session.mode === "nv1") {
      const others = (session.character_ids || []).filter(function (id) { return id !== char.id; });
      const oc = (ctx.characters || []).find(function (c) { return c.id === others[0]; });
      peerName = oc ? oc.name : "";
    }
    parts.push(sceneFor(mode, session.subject, peerName));

    if (session.mode === "costudy") {
      if (session.progress && session.progress.running_summary)
        parts.push("【到目前为止你俩研究到哪了（摘要）】\n" + session.progress.running_summary);
    } else if (cur) {
      // 进度归课程：读课程共享进度（不再是本 session 的独立进度）
      const cp = cur.progress || {};
      parts.push(curriculumSlice(cur, cp.current_unit));
      parts.push(progressText(cur, cp));
      const lt = longTermContext(cur);
      if (lt) parts.push(lt);
    }
    parts.push(OUT_FMT);
    return parts.join("\n\n");
  }

  // ---- 输出清洗（沿用主聊天：去名字前缀 + 越位探测截断）-----------------
  function stripName(s) { return String(s || "").replace(/^\s*[^\s:：]{1,14}[:：]\s*/, "").trim(); }
  // 正常学习对话不含「你：」「用户：」这类替他人代言标记；出现即判越位，从该处截断
  function guardOverspeak(s) {
    const t = String(s || "");
    const m = t.match(/(^|\n)\s*(你|用户|我)\s*[:：]/);
    return m ? t.slice(0, m.index).trim() : t;
  }
  function sayFallback(raw) {
    const txt = String(raw || "");
    const seg = (txt.match(/"say"\s*:\s*\[([\s\S]*?)(\]|$)/) || [])[1] || txt;
    let arr = (seg.match(/"((?:[^"\\]|\\.)*)"/g) || []).map(function (s) {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, " ");
    }).map(stripName).filter(Boolean);
    if (!arr.length) {
      const t = stripName(txt.replace(/```(?:json)?/gi, "").replace(/["{}\[\]]/g, "").replace(/\bsay\b\s*:?/gi, "").trim());
      if (t) arr = [t];
    }
    return arr;
  }
  function parseSay(raw) {
    const d = extractJSON(raw) || {};
    let says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
    says = says.map(stripName).map(guardOverspeak).filter(Boolean);
    if (!says.length) says = sayFallback(raw).map(guardOverspeak).filter(Boolean);
    return says;
  }

  // ---- 一次生成 = 一个角色一个回合（§5）------------------------------
  async function genTurn(active, session, char, ctx, role) {
    const sys = buildStudyPrompt(session, char, ctx, role);
    const msgs = toMessages(session.transcript, char.id, (ctx.profile && ctx.profile.name) || "用户");
    const raw = await callAI(active, sys, msgs, { maxTokens: 3200 });
    return parseSay(raw);
  }

  // ---- nv1 轮次导演（§8）：模型决定这一轮谁开口、按什么顺序 -----------------
  // 返回 ['teacher'|'peer', ...]（1~3 个）；失败兜底 ['teacher']
  async function directNv1(active, session, teacher, peer, ctx) {
    const userName = (ctx.profile && ctx.profile.name) || "用户";
    const conv = tail(session.transcript, 8).map(function (m) {
      return (m.role === "user" ? userName : m.name) + "：" + m.content;
    }).join("\n") || "（还没开始）";
    const sys = "你在导演一堂课的多人对话。老师是「" + teacher.name + "」，同学是「" + peer.name + "」，还有真人用户「" + userName +
      "」。根据下面最近的对话，决定【这一轮】接下来谁开口、按什么顺序——可以只老师、只同学、两个都说（谁先谁后）、或来回几次（如 老师→同学→老师）。" +
      "别每轮都硬让两个人都说、也别让谁一直沉默；贴合当下语境（比如用户在问老师就老师答，用户和同学讨论就同学接）。绝不替用户发言。" +
      "只输出 JSON：{\"order\":[\"teacher\"或\"peer\", …]}，1~3 个元素。";
    try {
      const raw = await callAI(active, sys, [{ role: "user", content: "【最近对话】\n" + conv }], { maxTokens: 200 });
      const d = extractJSON(raw) || {};
      let order = Array.isArray(d.order) ? d.order.filter(function (x) { return x === "teacher" || x === "peer"; }) : [];
      if (!order.length) order = ["teacher"];
      return order.slice(0, 3);
    } catch (e) { return ["teacher"]; }
  }

  // ---- 能力档推定（§6）：从人设判断能否认真教该科目 --------------------
  async function inferAbility(active, char, subject, worldbook) {
    const sys = "根据角色的人设" + (worldbook ? "与世界书" : "") + "，判断 TA 能不能教一个初学者学『" + subject + "』。" +
      "【判据放宽】：只要 TA 的职业、专业、身份、特长或经历跟这门学问直接相关，就算能教（canTeach=true）——" +
      "例如程序员/工程师教编程，母语者或语言老师教该语言，某领域从业者、学者、爱好者教该领域，都算能教，不要求 TA 是顶尖专家。" +
      "只有当 TA 跟这门学问明显八竿子打不着、人设里完全没有相关线索时，才 canTeach=false。拿不准时倾向 true。" +
      "只输出 JSON：{\"canTeach\":true或false,\"level\":\"入门/进阶/精通/无\",\"posture\":\"若不会，一句话态度\"}";
    const u = "【要学的】" + subject + "\n【角色人设】" + (char.persona || "（空）") + (worldbook ? "\n【世界书】" + worldbook : "");
    try {
      const raw = await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 500 });
      const d = extractJSON(raw) || {};
      return { canTeach: !!d.canTeach, level: d.level || "", posture: d.posture || "" };
    } catch (e) { return { canTeach: false, level: "", posture: "" }; }
  }

  // ---- 模型起草课程大纲（§6）：teach 无 curriculum 时触发 --------------
  async function draftCurriculum(active, subject, worldbook, level) {
    const lv = (level || "").trim();
    const levelBlock = lv
      ? "学习者【不是零基础】，TA 的现有水平/基础是：「" + lv + "」。请据此**从合适的起点开始**：跳过 TA 已经会的部分，第一单元就衔接 TA 当前水平的下一步，难度和进度匹配 TA，别从最基础的从零讲起。整体仍循序渐进到能实用。"
      : "学习者是**零基础**，从头设计一份从零到能用的入门大纲。";
    const sys = "你是课程设计师。为『" + subject + "』设计一份 4~7 个单元、循序渐进的课程大纲。" + levelBlock +
      "每个单元含：稳定 id（英文小写下划线，如 unit_greetings）、title、objectives(2~3条)、" +
      "grammar/要点数组[{id(稳定英文小写),label(中文短标签),note(一句说明)}]、vocab(若适用,数组)、can_do(学完能做到的事,1~3条)、prereq(前置单元id数组,可空)。" +
      "level 字段填这份大纲的实际难度定位（如 入门/N4冲刺/进阶 等）。只输出 JSON：{\"level\":\"…\",\"language\":\"中文\",\"units\":[...]}。不要 markdown。";
    // 4~7 单元 × (objectives+grammar+vocab+can_do) 的 JSON 很长，token 给足否则被截断只剩两三课
    const raw = await callAI(active, sys, [{ role: "user", content: "科目：" + subject + (lv ? "\n我的基础：" + lv : "\n（零基础）") }], { maxTokens: 8000 });
    const d = extractJSON(raw) || {};
    const units = Array.isArray(d.units) ? d.units.filter(function (u) { return u && u.id && u.title; }) : [];
    if (!units.length) throw new Error("大纲起草失败，请重试");
    return { id: "cur_" + Date.now(), subject: subject, level: d.level || (lv ? lv : "入门"), language: d.language || "中文", units: units };
  }

  // ---- checkpoint（§7）：手动触发，单独一次 JSON，对照 can_do 结算 -------
  async function runCheckpoint(active, session, char, ctx) {
    const cur = findCurriculum(session.curriculum_id);
    if (!cur) throw new Error("无课程大纲");
    const cp = cur.progress || {};
    const unit = cur.units.find(function (u) { return u.id === cp.current_unit; }) || cur.units[0];
    const gram = (unit.grammar || []).map(function (g) { return g.id + "(" + g.label + ")"; }).join("、");
    const conv = tail(session.transcript, 30).map(function (m) {
      return (m.role === "user" ? (ctx.profile && ctx.profile.name || "用户") : m.name) + "：" + m.content;
    }).join("\n");
    const sys = "你在给一堂课做结算。当前单元「" + unit.title + "」，要点(用 id)：" + gram + "。" +
      "能做到清单：" + (unit.can_do || []).join("；") + "。" +
      "根据下面真实发生的教学对话，判断用户对每个要点的掌握程度，并判断本单元是否可视为完成。" +
      "mastery 的 key 必须是要点 id（不是中文标签），值 0~3（0新学/1待复习/2基本会/3稳）。" +
      "只输出扁平 JSON：{\"completed\":true或false,\"mastery\":{\"<id>\":0-3},\"notes\":\"给下次的一句提醒\"}。";
    const raw = await callAI(active, sys, [{ role: "user", content: "【教学对话】\n" + conv }], { maxTokens: 1400 });
    const d = extractJSON(raw) || {};
    return { completed: !!d.completed, mastery: d.mastery && typeof d.mastery === "object" ? d.mastery : {}, notes: d.notes || "" };
  }

  // ---- 暴露给 UI 层 --------------------------------------------------
  window.Study = {
    loadSessions: loadSessions, saveSessions: saveSessions,
    loadCurricula: loadCurricula, findCurriculum: findCurriculum, findCurriculumBySubject: findCurriculumBySubject,
    saveCurricula: saveCurricula, saveCurriculum: saveCurriculum, saveCurriculumProgress: saveCurriculumProgress,
    newProgress: newProgress, initCurriculumProgress: initCurriculumProgress, longTermContext: longTermContext,
    genTurn: genTurn, inferAbility: inferAbility, draftCurriculum: draftCurriculum, runCheckpoint: runCheckpoint,
    tail: tail
  };

  // ============================================================
  // UI
  // ============================================================
  function modeTag(mode) {
    return mode === "teach" ? "认真教" : mode === "costudy" ? "一起研究" : "一教一学";
  }
  function modeColor(mode, t) {
    return mode === "costudy" ? "#7c5cbf" : (t.accent || "#8a6d3b");
  }

  function timeShort(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts), now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
        : (d.getMonth() + 1) + "月" + d.getDate() + "日";
    } catch (e) { return ""; }
  }
  function avatarsFor(charIds, characters) {
    return (charIds || []).map(function (id) { return (characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
  }

  // ---- 一级：某个模式下的课程列表（teach / nv1）----------------------
  function CurriculumList(props) {
    const t = useTheme();
    const accent = t.accent || "#8a6d3b";
    const curs = props.curricula;
    const sessCount = {};
    (props.sessions || []).forEach(function (s) { if (s.curriculum_id) sessCount[s.curriculum_id] = (sessCount[s.curriculum_id] || 0) + 1; });
    return h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-8" },
      h("button", { onClick: props.onNew, className: "w-full py-3 mb-4 active:opacity-70",
        style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 10 } }, "＋ 新建课程"),
      curs.length === 0
        ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", marginTop: 40, lineHeight: 1.8 } },
            props.mode === "nv1" ? "还没有课程。\n新建后挑 2 个角色，会教的当老师、另一个陪你一起学。" : "还没有课程。\n新建后挑 1 个会教的角色，定一份大纲开始。")
        : curs.map(function (c) {
            const done = (c.progress && c.progress.completed || []).length, total = (c.units || []).length;
            const chars = avatarsFor(c.character_ids, props.characters);
            return h("button", { key: c.id, onClick: function () { return props.onOpen(c.id); },
              className: "w-full flex items-center gap-3 py-3 px-3 mb-2 active:opacity-70",
              style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, textAlign: "left" } },
              h("div", { className: "flex -space-x-2 shrink-0" }, chars.map(function (ch) { return h(Avatar, { key: ch.id, character: ch, size: 38, radius: 999 }); })),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "flex items-center gap-2" },
                  h("span", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.subject),
                  c.level ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: accent, border: "1px solid " + accent, borderRadius: 4, padding: "0px 5px" } }, c.level) : null),
                h("div", { className: "flex items-center gap-2", style: { marginTop: 6 } },
                  h("div", { className: "flex-1", style: { height: 5, background: t.line, borderRadius: 3, overflow: "hidden" } },
                    h("div", { style: { height: "100%", width: (total ? done / total * 100 : 0) + "%", background: accent } })),
                  h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, whiteSpace: "nowrap" } }, done + "/" + total)),
                h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 4 } },
                  chars.map(function (ch) { return ch.name; }).join("、") + " · " + (sessCount[c.id] || 0) + " 次练习")),
              props.onDel && h("span", { onClick: function (e) { e.stopPropagation(); props.onDel(c.id); },
                style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 6px" } }, "删"));
          }));
  }

  // ---- 一级（扁平）：一起研究的 session 列表 --------------------------
  function CostudyList(props) {
    const t = useTheme();
    const sessions = props.sessions;
    return h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-8" },
      h("button", { onClick: props.onNew, className: "w-full py-3 mb-4 active:opacity-70",
        style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 10 } }, "＋ 新建研究"),
      sessions.length === 0
        ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", marginTop: 40, lineHeight: 1.8 } },
            "还没有研究记录。\n挑个题目和一个角色，一起从头摸索。")
        : sessions.map(function (s) {
            const chars = avatarsFor(s.character_ids, props.characters);
            return h("button", { key: s.id, onClick: function () { return props.onOpen(s.id); },
              className: "w-full flex items-center gap-3 py-3 px-3 mb-2 active:opacity-70",
              style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, textAlign: "left" } },
              h("div", { className: "flex -space-x-2 shrink-0" }, chars.map(function (ch) { return h(Avatar, { key: ch.id, character: ch, size: 38, radius: 999 }); })),
              h("div", { className: "flex-1 min-w-0" },
                h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, s.subject),
                h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 3 } },
                  chars.map(function (ch) { return ch.name; }).join("、") + " · " + timeShort(s.updated_at))),
              props.onDel && h("span", { onClick: function (e) { e.stopPropagation(); props.onDel(s.id); },
                style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 6px" } }, "删"));
          }));
  }

  // ---- 二级：课程控制台（进度总览 + 单元清单 + 历次练习 + 开启新练习）----
  function CurriculumConsole(props) {
    const t = useTheme();
    const accent = t.accent || "#8a6d3b";
    const cur = props.curriculum;
    const p = cur.progress || {};
    const done = (p.completed || []).length, total = (cur.units || []).length;
    const sess = (props.sessions || []).filter(function (s) { return s.curriculum_id === cur.id; })
      .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: cur.subject, en: modeTag(cur.mode), onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        // 总进度条
        h("div", { className: "flex items-center gap-2", style: { marginBottom: 4 } },
          h("div", { className: "flex-1", style: { height: 7, background: t.line, borderRadius: 4, overflow: "hidden" } },
            h("div", { style: { height: "100%", width: (total ? done / total * 100 : 0) + "%", background: accent } })),
          h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, done + " / " + total + " 单元")),
        p.notes ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 6, lineHeight: 1.6 } }, "上次提醒：" + p.notes) : null,
        // 单元清单
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "16px 0 8px" } }, "课程大纲"),
        (cur.units || []).map(function (u, i) {
          const isDone = (p.completed || []).indexOf(u.id) >= 0;
          const isCur = u.id === p.current_unit;
          return h("div", { key: u.id, className: "mb-2 p-3", style: { background: isCur ? accent + "12" : t.bg2, border: "1px solid " + (isCur ? accent : t.line), borderRadius: 10 } },
            h("div", { className: "flex items-center gap-2" },
              h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: isDone ? "#4a9e5c" : t.fog, width: 16 } }, isDone ? "✓" : (i + 1)),
              h("span", { className: "flex-1", style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, u.title),
              isCur ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: "#fff", background: accent, borderRadius: 4, padding: "1px 6px" } }, "当前") : null),
            (u.grammar || []).length ? h("div", { className: "flex flex-wrap gap-1.5", style: { marginTop: 7 } }, u.grammar.map(function (g) {
              const lv = (p.mastery || {})[g.id];
              const col = lv >= 2 ? "#4a9e5c" : lv === 1 ? "#d6a53a" : lv === 0 ? "#cf5b4e" : t.line;
              const fg = lv >= 0 && lv !== undefined ? "#fff" : t.fog;
              return h("span", { key: g.id, style: { fontFamily: F_BODY, fontSize: 10.5, color: fg, background: col, borderRadius: 4, padding: "1px 6px" } }, g.label);
            })) : null);
        }),
        // 历次练习
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "18px 0 8px" } }, "历次练习（" + sess.length + "）"),
        sess.length === 0
          ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7 } }, "还没练过。点下面「开启新练习」，进度会一直接着走。")
          : sess.map(function (s) {
              const chars = avatarsFor(s.character_ids, props.characters);
              return h("button", { key: s.id, onClick: function () { return props.onOpenSession(s.id); },
                className: "w-full flex items-center gap-3 py-2.5 px-3 mb-2 active:opacity-70",
                style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, textAlign: "left" } },
                h("div", { className: "flex -space-x-2 shrink-0" }, chars.map(function (ch) { return h(Avatar, { key: ch.id, character: ch, size: 30, radius: 999 }); })),
                h("div", { className: "flex-1 min-w-0" },
                  h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, chars.map(function (ch) { return ch.name; }).join("、")),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, (s.transcript || []).length + " 条 · " + timeShort(s.updated_at))),
                props.onDelSession ? h("span", { onClick: function (e) { e.stopPropagation(); props.onDelSession(s.id); },
                  style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 6px" } }, "删") : null);
            })),
      h("div", { className: "shrink-0 px-5 py-3", style: { borderTop: "1px solid " + t.line } },
        h("button", { onClick: function () { return props.onNewPractice(cur); }, className: "w-full py-3 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 15, background: accent, color: "#fff", borderRadius: 12 } }, "＋ 开启新练习")));
  }

  // ---- 新建课程流程（teach / nv1；复用大纲落库，session 不再重复起草）----
  function NewCourse(props) {
    const t = useTheme();
    const mode = props.mode; // 'teach' | 'nv1'
    const want = mode === "nv1" ? 2 : 1;
    const [subject, setSubject] = useState("");
    const [level, setLevel] = useState("");
    const [picked, setPicked] = useState([]);
    const [busy, setBusy] = useState("");
    const [draft, setDraft] = useState(null);
    const [pendCast, setPendCast] = useState(null); // { teacherId, charIds }
    const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 8, padding: "10px 12px", width: "100%" };

    function toggle(id) {
      setPicked(function (p) {
        if (p.includes(id)) return p.filter(function (x) { return x !== id; });
        if (p.length >= want) return want === 1 ? [id] : [p[1], id];
        return p.concat([id]);
      });
    }

    async function begin() {
      if (!subject.trim()) { props.toast("先填个科目"); return; }
      if (picked.length < want) { props.toast(want === 2 ? "挑 2 个角色" : "挑 1 个角色"); return; }
      if (!props.active) { props.toast("请先到设置配置 API"); return; }
      try {
        const chars = picked.map(function (id) { return props.characters.find(function (c) { return c.id === id; }); });
        let teacherId;
        if (mode === "teach") {
          // 认真教板块：你已明确要教，直接以选中角色为老师，省掉一次能力判定调用
          teacherId = chars[0].id;
        } else {
          // 一教一学：判两位谁能教，能教的当老师；都不能则挡回（去一起研究）
          setBusy("infer");
          const abil = [];
          for (let i = 0; i < chars.length; i++) abil.push(await inferAbility(props.active, chars[i], subject.trim(), props.worldbook));
          const idx = abil.findIndex(function (a) { return a.canTeach; });
          if (idx < 0) { setBusy(""); props.toast("这俩谁都不太教得了「" + subject.trim() + "」——换个会的角色，或去『一起研究』一起摸索"); return; }
          teacherId = chars[idx].id;
        }
        setBusy("draft");
        const cur = await draftCurriculum(props.active, subject.trim(), props.worldbook, level.trim());
        setDraft(cur); setPendCast({ teacherId: teacherId, charIds: picked.slice() });
        setBusy("");
      } catch (e) { props.toast("出错了：" + (e.message || "重试")); setBusy(""); }
    }

    function confirm(dr) {
      const chars = pendCast.charIds.map(function (id) { return props.characters.find(function (c) { return c.id === id; }); });
      const cur = {
        id: "cur_" + Date.now(), subject: subject.trim(), level: dr.level || (level.trim() || "入门"),
        language: dr.language || "中文", units: dr.units, mode: mode,
        character_ids: pendCast.charIds.slice(), teacher_id: pendCast.teacherId,
        progress: initCurriculumProgress(dr), created_at: Date.now(), updated_at: Date.now(),
        _castNames: chars.map(function (c) { return c.name; })
      };
      saveCurriculum(cur);
      props.onCreated(cur); // 上层建首个 session 并进入
    }

    if (draft) {
      return h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: "审核大纲", en: draft.subject, onBack: function () { setDraft(null); setPendCast(null); } }),
        h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 12, lineHeight: 1.7 } },
            "这是模型起草的课程大纲。确认后冻结落库成一门课，之后每次练习都接着同一条进度走。不满意可重新起草。"),
          (draft.units || []).map(function (u, i) {
            return h("div", { key: u.id, className: "mb-3 p-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 10 } },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, (i + 1) + ". " + u.title),
              (u.objectives || []).length ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginTop: 4, lineHeight: 1.7 } }, "目标：" + u.objectives.join("；")) : null,
              (u.grammar || []).length ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 3, lineHeight: 1.7 } }, "要点：" + u.grammar.map(function (g) { return g.label; }).join("、")) : null);
          })),
        h("div", { className: "shrink-0 px-5 py-3 flex gap-3", style: { borderTop: "1px solid " + t.line } },
          h("button", { onClick: async function () { setBusy("draft"); try { const c = await draftCurriculum(props.active, draft.subject, props.worldbook, level.trim()); setDraft(c); } catch (e) { props.toast(e.message); } setBusy(""); }, disabled: !!busy, className: "flex-1 py-3", style: { fontFamily: F_BODY, fontSize: 14, border: "1px solid " + t.line, color: t.ink, borderRadius: 10 } }, busy === "draft" ? "起草中…" : "重新起草"),
          h("button", { onClick: function () { confirm(draft); }, disabled: !!busy, className: "flex-1 py-3", style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 10 } }, "确认冻结并开始")));
    }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: mode === "nv1" ? "新建课程 · 一教一学" : "新建课程 · 认真教", en: "New", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, marginBottom: 6 } }, "学什么"),
        h("input", { value: subject, onChange: function (e) { return setSubject(e.target.value); }, placeholder: "例：日语 N5 / 吉他入门 / 微积分…", style: field }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, margin: "18px 0 6px" } }, "我的基础（可选）"),
        h("input", { value: level, onChange: function (e) { return setLevel(e.target.value); }, placeholder: "不填=零基础。填了会按你的水平起草，如：已过 N5 想冲 N4 / 会弹几个和弦", style: field }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 5, lineHeight: 1.6 } }, "大纲会跳过你已经会的、从合适的地方开始。"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, margin: "18px 0 6px" } }, mode === "nv1" ? "老师 + 同学（选 2 个）" : "找谁教（选 1 个）"),
        h("div", { className: "flex flex-col gap-2" }, (props.characters || []).map(function (c) {
          const on = picked.includes(c.id);
          return h("button", { key: c.id, onClick: function () { return toggle(c.id); }, className: "flex items-center gap-3 p-2 active:opacity-70",
            style: { background: on ? (t.accent || "#8a6d3b") + "1a" : t.bg2, border: "1px solid " + (on ? (t.accent || "#8a6d3b") : t.line), borderRadius: 12, textAlign: "left" } },
            h(Avatar, { character: c, size: 40, radius: 999 }),
            h("span", { className: "flex-1", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name),
            on ? h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.accent || "#8a6d3b" } }, "已选") : null);
        })),
        mode === "nv1" ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 10, lineHeight: 1.7 } }, "会自动判两位谁能教这门——能教的当老师，另一个当同学陪你学。") : null),
      h("div", { className: "shrink-0 px-5 py-3", style: { borderTop: "1px solid " + t.line } },
        h("button", { onClick: begin, disabled: !!busy, className: "w-full py-3", style: { fontFamily: F_BODY, fontSize: 15, background: t.ink, color: t.bg2, borderRadius: 12, opacity: busy ? 0.6 : 1 } },
          busy === "infer" ? "判定角色能力中…" : busy === "draft" ? "起草课程大纲中…" : "起草大纲")));
  }

  // ---- 新建研究（costudy）：挑 1 角色 + 题目，直接开聊，无大纲无判定 ----
  function NewCostudy(props) {
    const t = useTheme();
    const [subject, setSubject] = useState("");
    const [pick, setPick] = useState(null);
    const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 8, padding: "10px 12px", width: "100%" };
    function begin() {
      if (!subject.trim()) { props.toast("先填个题目"); return; }
      if (!pick) { props.toast("挑 1 个角色"); return; }
      props.onCreated({ subject: subject.trim(), charId: pick });
    }
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "新建研究 · 一起研究", en: "New", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, marginBottom: 6 } }, "研究什么"),
        h("input", { value: subject, onChange: function (e) { return setSubject(e.target.value); }, placeholder: "例：黑洞怎么蒸发 / 某本书的读法 / 一道难题…", style: field }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 5, lineHeight: 1.6 } }, "一起研究不设大纲：你俩谁也不比谁更懂，边聊边攒线索、一起试错。"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, margin: "18px 0 6px" } }, "找谁一起（1 个）"),
        h("div", { className: "flex flex-col gap-2" }, (props.characters || []).map(function (c) {
          const on = pick === c.id;
          return h("button", { key: c.id, onClick: function () { return setPick(on ? null : c.id); }, className: "flex items-center gap-3 p-2 active:opacity-70",
            style: { background: on ? "#7c5cbf1a" : t.bg2, border: "1px solid " + (on ? "#7c5cbf" : t.line), borderRadius: 12, textAlign: "left" } },
            h(Avatar, { character: c, size: 40, radius: 999 }),
            h("span", { className: "flex-1", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name),
            on ? h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: "#7c5cbf" } }, "已选") : null);
        }))),
      h("div", { className: "shrink-0 px-5 py-3", style: { borderTop: "1px solid " + t.line } },
        h("button", { onClick: begin, className: "w-full py-3", style: { fontFamily: F_BODY, fontSize: 15, background: t.ink, color: t.bg2, borderRadius: 12 } }, "开始研究")));
  }

  // 聊天主体
  function StudyThread(props) {
    const t = useTheme();
    const [sess, setSess] = useState(props.session);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [expand, setExpand] = useState(false);
    const scrollRef = useRef(null);
    const sessRef = useRef(props.session);
    useEffect(function () { sessRef.current = sess; }, [sess]);
    useEffect(function () {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [sess.transcript.length, busy]);

    const cur = sess.curriculum_id ? findCurriculum(sess.curriculum_id) : null;
    // 进度归课程：teach/nv1 读课程共享进度；costudy 仍用 session 自己的滚动摘要
    const prog = cur ? (cur.progress || {}) : (sess.progress || {});
    const chars = (sess.character_ids || []).map(function (id) { return (props.characters || []).find(function (c) { return c.id === id; }); }).filter(Boolean);
    const teacher = sess.teacher_id ? chars.find(function (c) { return c.id === sess.teacher_id; }) : chars[0];
    const userName = (props.profile && props.profile.name) || "我";
    const ctx = { worldbook: props.worldbook, profile: props.profile, characters: props.characters };

    // 持久化：改 transcript / progress 后存库并回写列表
    function commit(next) {
      next.updated_at = Date.now();
      // transcript 截断：只留尾部 N 条（续档靠 progress，不靠它）；costudy 把丢弃的头折进 running_summary
      const CAP = 80;
      if (next.transcript.length > CAP) {
        next.transcript = next.transcript.slice(next.transcript.length - CAP);
      }
      setSess(next);
      sessRef.current = next;
      const all = loadSessions().map(function (s) { return s.id === next.id ? next : s; });
      saveSessions(all);
      props.onUpdated && props.onUpdated(next);
    }

    function pushEntry(entry) {
      const s = sessRef.current;
      const next = Object.assign({}, s, { transcript: s.transcript.concat([entry]) });
      commit(next);
      return next;
    }

    async function runChar(char, role) {
      const says = await genTurn(props.active, sessRef.current, char, ctx, role);
      for (let i = 0; i < says.length; i++) {
        if (i > 0) await new Promise(function (r) { return setTimeout(r, 400); });
        pushEntry({ id: "c_" + Date.now() + "_" + i, role: "char", speakerId: char.id, name: char.name, content: says[i], ts: Date.now() });
      }
    }

    // 发送：只把用户这条加进对话，不触发角色（可连发多条），像主聊天一样
    function send() {
      const txt = input.trim();
      if (!txt) return;
      setInput("");
      pushEntry({ id: "u_" + Date.now(), role: "user", content: txt, ts: Date.now() });
    }

    // 让角色回复（手动触发）：teach/costudy 单角色回复；nv1 走导演
    async function replyNow() {
      if (busy) return;
      if (!props.active) { props.toast("请先到设置配置 API"); return; }
      setBusy(true);
      try {
        if (sess.mode === "nv1") {
          const peer = chars.find(function (c) { return c.id !== (teacher && teacher.id); });
          const teacherRole = sess.teacher_id ? "nv1-teacher" : "costudy";
          if (teacher && peer) {
            // 模型导演：决定这一轮谁开口、什么顺序，再逐个 fire
            const order = await directNv1(props.active, sessRef.current, teacher, peer, ctx);
            for (let k = 0; k < order.length; k++) {
              const ch = order[k] === "peer" ? peer : teacher;
              await runChar(ch, order[k] === "peer" ? "nv1-peer" : teacherRole);
            }
          } else if (teacher) {
            await runChar(teacher, teacherRole);
          }
        } else {
          await runChar(chars[0], sess.mode);
        }
      } catch (e) {
        props.toast("生成失败：" + (e.message || "重试"));
      } finally { setBusy(false); }
    }

    async function checkpoint() {
      if (busy || !props.active) return;
      if (sess.mode === "costudy" || !cur) return;
      setBusy(true);
      try {
        const s = sessRef.current;
        // 进度归课程：结算写进课程共享进度（下次任何练习都能读到），不再写 session
        const cp = Object.assign({ completed: [], mastery: {} }, cur.progress);
        // 结算这课的掌握程度（模型评估各要点，写进三色灯 + 待复习队列）；评估失败也不挡推进
        try {
          const res = await runCheckpoint(props.active, s, teacher, ctx);
          cp.mastery = Object.assign({}, cp.mastery, res.mastery);
          cp.notes = res.notes || cp.notes;
          cp.review_queue = Object.keys(cp.mastery).filter(function (k) { return cp.mastery[k] <= 1; });
        } catch (e) {/* 掌握评估失败：仍然按用户意愿推进 */}
        // 你手动点了「这课学完」= 你决定推进，无条件进下一课（是否掌握由你说了算）
        const idx = cur.units.findIndex(function (u) { return u.id === cp.current_unit; });
        if (!cp.completed.includes(cp.current_unit)) cp.completed = cp.completed.concat([cp.current_unit]);
        const nextU = cur.units[idx + 1];
        if (nextU) {
          cp.current_unit = nextU.id;
          const weak = (cp.review_queue || []).length;
          props.toast("进入下一课：" + nextU.title + (weak ? "（有 " + weak + " 个点标了待复习）" : ""));
        } else {
          props.toast("全部单元都学完啦 🎉");
        }
        saveCurriculumProgress(cur.id, cp);
        commit(Object.assign({}, s)); // 仅 bump session 时间 + 触发重渲染读新课程进度
      } catch (e) {
        props.toast("出错了：" + (e.message || "重试"));
      } finally { setBusy(false); }
    }

    // 退回上一课：current_unit 回到上一单元，并把上一单元从「已完成」里移除（重新学）
    function prevUnit() {
      if (busy || !cur) return;
      const cp = Object.assign({ completed: [] }, cur.progress);
      const idx = cur.units.findIndex(function (u) { return u.id === cp.current_unit; });
      if (idx <= 0) { props.toast("已经是第一课了"); return; }
      const prev = cur.units[idx - 1];
      cp.current_unit = prev.id;
      cp.completed = (cp.completed || []).filter(function (x) { return x !== prev.id; });
      saveCurriculumProgress(cur.id, cp);
      commit(Object.assign({}, sessRef.current));
      props.toast("退回上一课：" + prev.title);
    }

    // 顶栏
    const accent = modeColor(sess.mode, t);
    const unit = cur ? cur.units.find(function (u) { return u.id === prog.current_unit; }) : null;
    const topBar = sess.mode === "costudy"
      ? h("div", { className: "px-5 pb-2", style: { background: t.bg } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: accent, lineHeight: 1.6 } },
            "一起研究 · " + (sess.progress && sess.progress.running_summary ? sess.progress.running_summary.slice(0, 60) : "还在起步，边聊边攒线索")))
      : h("div", { className: "px-5 pb-2", style: { background: t.bg } },
          h("button", { onClick: function () { return setExpand(!expand); }, className: "w-full flex items-center gap-2 active:opacity-70" },
            h("div", { className: "flex-1", style: { height: 5, background: t.line, borderRadius: 3, overflow: "hidden" } },
              h("div", { style: { height: "100%", width: (cur ? ((prog.completed || []).length / cur.units.length * 100) : 0) + "%", background: accent } })),
            h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } },
              (unit ? unit.title : "") + " " + ((prog.completed || []).length) + "/" + (cur ? cur.units.length : "?"))),
          expand && unit ? h("div", { className: "mt-2 flex flex-wrap gap-1.5" }, (unit.grammar || []).map(function (g) {
            const lv = (prog.mastery || {})[g.id];
            const col = lv >= 2 ? "#4a9e5c" : lv === 1 ? "#d6a53a" : "#cf5b4e";
            return h("span", { key: g.id, style: { fontFamily: F_BODY, fontSize: 11, color: "#fff", background: col, borderRadius: 4, padding: "1px 7px" } }, g.label);
          })) : null);

    // 气泡渲染
    const bubbles = sess.transcript.map(function (m) {
      if (m.role === "user") {
        return h("div", { key: m.id, className: "flex justify-end mb-2" },
          h("div", { style: { maxWidth: "76%", background: accent, color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "8px 12px", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" } }, m.content));
      }
      const isTeacher = !teacher || m.speakerId === teacher.id;
      const char = chars.find(function (c) { return c.id === m.speakerId; });
      const indent = sess.mode === "nv1" && !isTeacher;
      return h("div", { key: m.id, className: "flex items-start gap-2 mb-2", style: indent ? { paddingLeft: 22 } : null },
        h(Avatar, { character: char, size: 30, radius: 999 }),
        h("div", { className: "min-w-0" },
          sess.mode === "nv1" ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 2 } }, m.name + (isTeacher ? "（老师）" : "（同学）")) : null,
          h("div", { style: { display: "inline-block", maxWidth: "100%", background: indent ? "#7c5cbf1a" : t.bg2, border: "1px solid " + t.line, color: t.ink, borderRadius: "4px 14px 14px 14px", padding: "8px 12px", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" } }, m.content)));
    });

    return h("div", { className: "h-full flex flex-col" },
      h(Head, {
        zh: sess.subject, en: modeTag(sess.mode), onBack: props.onBack,
        right: sess.mode !== "costudy" ? h("div", { className: "flex items-center gap-1.5" },
          h("button", { onClick: prevUnit, disabled: busy || !cur || (cur.units.findIndex(function (u) { return u.id === prog.current_unit; }) <= 0), className: "active:opacity-60 disabled:opacity-30", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, border: "1px solid " + t.line, borderRadius: 8, padding: "4px 9px" } }, "上一课"),
          h("button", { onClick: checkpoint, disabled: busy, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: accent, border: "1px solid " + accent, borderRadius: 8, padding: "4px 10px" } }, "这课学完")) : null
      }),
      topBar,
      h("div", { ref: scrollRef, className: "flex-1 min-h-0 overflow-y-auto px-5 py-3" },
        bubbles.length === 0
          ? h("div", { className: "flex flex-col items-center gap-3", style: { marginTop: 30 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", lineHeight: 1.8 } }, "开始吧——先说几句，或直接让 " + (teacher ? teacher.name : "对方") + " 开个头"),
              h("button", { onClick: replyNow, disabled: busy, className: "px-4 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: t.ink, color: t.bg2, borderRadius: 10 } }, busy ? "…" : "让 " + (teacher ? teacher.name : "对方") + " 开场"))
          : bubbles,
        busy ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 2px" } }, "…") : null),
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, background: t.bg } },
        bubbles.length ? h("div", { className: "px-4 pt-2" },
          h("button", { onClick: replyNow, disabled: busy, className: "w-full active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: busy ? t.line : accent, color: "#fff", borderRadius: 10, padding: "8px 0", opacity: busy ? 0.8 : 1 } },
            busy ? "生成中…" : (sess.mode === "nv1" ? "让 " + (teacher ? teacher.name : "老师") + " / 同学接话" : "让 " + (chars[0] ? chars[0].name : "对方") + " 回复"))) : null,
        h("div", { className: "px-4 py-3 flex items-end gap-2", style: { paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" } },
          h("textarea", { value: input, onChange: function (e) { return setInput(e.target.value); }, rows: 1, placeholder: "说点什么…（可连发几条再点上面让 TA 回复）", style: { flex: 1, resize: "none", fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 18, padding: "9px 14px", maxHeight: 100 },
            onKeyDown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } } }),
          h("button", { onClick: send, disabled: !input.trim(), className: "shrink-0 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 18, padding: "9px 16px", opacity: !input.trim() ? 0.5 : 1 } }, "发送"))));
  }

  // 顶层：三板分区 + 三级导航
  //  home(tab: teach/costudy/nv1) → console(课程) / newCourse / newCostudy → thread
  function StudyApp(props) {
    const t = useTheme();
    const accent = t.accent || "#8a6d3b";
    const [view, setView] = useState("home");
    const [tab, setTab] = useState("teach");
    const [tick, setTick] = useState(0); // 强制从库重读
    const [openId, setOpenId] = useState(null);   // session id（thread）
    const [curId, setCurId] = useState(null);      // curriculum id（console）
    function refresh() { setTick(function (x) { return x + 1; }); }

    const sessions = loadSessions();
    const curricula = loadCurricula();

    // 用某门课的 cast 建一个新练习 session（复用 curriculum_id，绝不重复起草）
    function startPractice(cur) {
      const chars = avatarsFor(cur.character_ids, props.characters);
      const sess = {
        id: "st_" + Date.now(), curriculum_id: cur.id, mode: cur.mode,
        character_ids: (cur.character_ids || []).slice(), teacher_id: cur.teacher_id || null,
        subject: cur.subject, title: cur.subject + " · " + chars.map(function (c) { return c.name; }).join("&"),
        updated_at: Date.now(), progress: null, transcript: []
      };
      saveSessions(loadSessions().concat([sess]));
      setOpenId(sess.id); setView("thread");
    }

    if (view === "newCourse") {
      return h(NewCourse, {
        mode: tab, active: props.active, characters: props.characters, worldbook: props.worldbook, toast: props.toast,
        onBack: function () { setView("home"); },
        onCreated: function (cur) { startPractice(cur); }
      });
    }
    if (view === "newCostudy") {
      return h(NewCostudy, {
        characters: props.characters, toast: props.toast,
        onBack: function () { setView("home"); },
        onCreated: function (d) {
          const chars = avatarsFor([d.charId], props.characters);
          const sess = {
            id: "st_" + Date.now(), curriculum_id: null, mode: "costudy",
            character_ids: [d.charId], teacher_id: null, subject: d.subject,
            title: d.subject + " · " + chars.map(function (c) { return c.name; }).join("&"),
            updated_at: Date.now(), progress: newProgress("costudy"), transcript: []
          };
          saveSessions(loadSessions().concat([sess]));
          setOpenId(sess.id); setView("thread");
        }
      });
    }
    if (view === "console") {
      const cur = curricula.find(function (c) { return c.id === curId; });
      if (!cur) { setView("home"); return null; }
      return h(CurriculumConsole, {
        curriculum: cur, sessions: sessions, characters: props.characters,
        onBack: function () { refresh(); setView("home"); },
        onOpenSession: function (id) { setOpenId(id); setView("thread"); },
        onNewPractice: function (c) { startPractice(c); },
        onDelSession: function (id) {
          saveSessions(loadSessions().filter(function (s) { return s.id !== id; }));
          refresh(); props.toast && props.toast("已删除");
        }
      });
    }
    if (view === "thread") {
      const sess = loadSessions().find(function (s) { return s.id === openId; });
      if (!sess) { setView("home"); return null; }
      return h(StudyThread, {
        session: sess, active: props.active, characters: props.characters, profile: props.profile, worldbook: props.worldbook, toast: props.toast,
        onBack: function () { refresh(); setView(sess.curriculum_id ? "console" : "home"); if (sess.curriculum_id) setCurId(sess.curriculum_id); },
        onUpdated: function () { }
      });
    }

    // home：顶部三板 tab
    const tabs = [["teach", "认真教"], ["costudy", "一起研究"], ["nv1", "一教一学"]];
    let panel;
    if (tab === "costudy") {
      const cs = sessions.filter(function (s) { return !s.curriculum_id; })
        .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
      panel = h(CostudyList, {
        sessions: cs, characters: props.characters,
        onNew: function () { setView("newCostudy"); },
        onOpen: function (id) { setOpenId(id); setView("thread"); },
        onDel: function (id) { saveSessions(loadSessions().filter(function (s) { return s.id !== id; })); refresh(); props.toast && props.toast("已删除"); }
      });
    } else {
      const cs = curricula.filter(function (c) { return c.mode === tab; })
        .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
      panel = h(CurriculumList, {
        mode: tab, curricula: cs, sessions: sessions, characters: props.characters,
        onNew: function () { setView("newCourse"); },
        onOpen: function (id) { setCurId(id); setView("console"); },
        onDel: function (id) {
          saveCurricula(loadCurricula().filter(function (c) { return c.id !== id; }));
          saveSessions(loadSessions().filter(function (s) { return s.curriculum_id !== id; }));
          refresh(); props.toast && props.toast("已删除课程");
        }
      });
    }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "一起学", en: "Study", onBack: props.onBack }),
      h("div", { className: "flex px-5 pb-3 gap-1.5 shrink-0" }, tabs.map(function (tb) {
        const on = tab === tb[0];
        return h("button", { key: tb[0], onClick: function () { setTab(tb[0]); }, className: "flex-1 py-2 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 13, borderRadius: 9, background: on ? t.ink : t.bg2, color: on ? t.bg2 : t.fog, border: "1px solid " + (on ? t.ink : t.line) } }, tb[1]);
      })),
      panel);
  }

  window.StudyApp = StudyApp;
})();
