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
  const RETEACH_RULE =
    "【换一种讲法】当用户说没听懂或要求换种讲法，禁止只替换同义词再讲一遍。必须换教学维度：抽象→具体例子、公式→图像/步骤、定义→类比、讲解→一起做、或换成更小的前置知识；并先用一句话确认刚才可能卡在哪里。";

  const OUT_FMT =
    "\n【输出格式】只输出 JSON：{\"say\":[\"气泡1\",\"气泡2\"]}。" +
    "say 里放你这一轮说出口的话，可拆成 1~4 个气泡（像即时通讯那样分条），" +
    "不要加名字前缀、不要旁白括号、不要 markdown、不要把 JSON 以外的东西吐出来。";
  const QUIZ_CARD_FMT =
    "\n【可交互题卡】需要用户作答时，优先不要把题目只写成聊天文字；在同一个 JSON 里加 quiz。每轮最多 1 张：" +
    "{\"type\":\"choice|true_false|fill_blank\",\"prompt\":\"题目\",\"point_id\":\"当前要点id\"," +
    "\"options\":[{\"id\":\"A\",\"label\":\"选项文字\"}],\"answer\":\"标准答案或选项id\",\"aliases\":[\"可接受别名\"]," +
    "\"hints\":[\"一级：只提醒方向\",\"二级：指出关键步骤\",\"三级：给相似例子但仍不直接给答案\"],\"explanation\":\"答对后的简短解释\"}。" +
    "choice 必须有 2~5 个 options；true_false 的 answer 只能是 true/false 且不需要 options；fill_blank 可给 aliases（大小写不用重复列，系统会自动忽略）。" +
    "每题尽量给 2~3 级递进 hints；前两级绝不能直接泄露答案，最后一级也优先给相似例子。题面不要泄露答案，别在 say 里再重复整道题。只依据当前小节出题。";
  // 学习证据信号（只给 teach / nv1-teacher）：老师只能报告用户刚才真实作答的表现，不能自行宣布学会/推进。
  const STUDY_PROGRESS_FMT =
    "\n【学习证据（可选，接在同一个 JSON 里）】只有当用户刚刚真的回答了一道题、完成了练习或亲口复述时，才可加 " +
    "\"evidence\":{\"point_id\":\"当前要点id\",\"result\":\"correct|partial|incorrect\",\"support\":\"none|hinted|guided\",\"note\":\"一句具体依据\"}。" +
    "用户只是说懂了、提问、闲聊，或你刚讲完，都不算学习证据，不要输出 evidence。你无权输出 done，也无权自行推进小节。";

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
  // 课程 upsert（课程 = 大目标容器：goal + 跨 session 记忆；不再挂 units/progress）
  function saveCurriculum(cur) {
    const all = loadCurricula();
    const i = all.findIndex(function (c) { return c.id === cur.id; });
    if (i >= 0) all[i] = cur; else all.push(cur);
    saveCurricula(all);
  }
  // 把一条 session 摘要并进课程记忆（同 sessionId 覆盖旧摘要）——curriculum 内互通，不碰全局记忆库
  function pushCurriculumSummary(curId, sessionId, text) {
    const all = loadCurricula().map(function (c) {
      if (c.id !== curId) return c;
      const mem = c.memory || { summaries: [] };
      const summaries = (mem.summaries || []).filter(function (s) { return s.sessionId !== sessionId; })
        .concat([{ sessionId: sessionId, text: text, ts: Date.now() }]);
      // 保留 memory 上除 summaries 外的一切（review_items 等）——曾整体重建导致间隔复习题库被清零
      return Object.assign({}, c, { memory: Object.assign({}, mem, { summaries: summaries }), updated_at: Date.now() });
    });
    saveCurricula(all);
  }

  function newProgress(mode) {
    if (mode === "costudy") return { running_summary: "", loose_vocab: [] };
    return { current_unit: null, completed: [], mastery: {}, review_queue: [], notes: "", evidence: [], mistakes: [], exit_ticket: null,
      warmup_queue: [], warmup_started: false };
  }
  // 从本节 outline 起一份 session 进度（第一小节起步）
  function initSessionProgress(outline) {
    const p = newProgress("teach");
    const units = outline && outline.units;
    if (Array.isArray(units) && units.length) p.current_unit = units[0].id;
    return p;
  }

  // ---- 迁移：v28「课程挂 units+progress」→ v29「课程=目标容器 + session 自带 outline」----
  // 老 session 从其课程下放 units/progress，令 session 自足；课程补 memory/mode/cast。幂等。
  function migrate() {
    const curs = loadCurricula();
    if (!curs.length) return;
    const sess = loadSessions();
    const curById = {};
    curs.forEach(function (c) { curById[c.id] = c; });
    let cChanged = false, sChanged = false;
    sess.forEach(function (s) {
      if (!s.curriculum_id || s.outline || s.mode === "costudy") return;
      const c = curById[s.curriculum_id];
      if (c && Array.isArray(c.units) && c.units.length) {
        s.outline = { units: c.units, level: c.level || "", language: c.language || "中文" };
        s.progress = s.progress || (c.progress ? c.progress : initSessionProgress(s.outline));
        sChanged = true;
      }
    });
    curs.forEach(function (c) {
      if (!c.memory) { c.memory = { summaries: [], review_items: [] }; cChanged = true; }
      else if (!Array.isArray(c.memory.review_items)) { c.memory.review_items = []; cChanged = true; }
      if (!c.mode || !c.character_ids) {
        const refs = sess.filter(function (s) { return s.curriculum_id === c.id; });
        const recent = refs.slice().sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); })[0];
        if (!c.mode) c.mode = recent && recent.mode === "nv1" ? "nv1" : "teach";
        if (!c.character_ids) { c.character_ids = recent ? (recent.character_ids || []).slice() : []; c.teacher_id = recent ? (recent.teacher_id || null) : null; }
        cChanged = true;
      }
      if (!c.updated_at) { c.updated_at = c.created_at || Date.now(); cChanged = true; }
    });
    if (sChanged) saveSessions(sess);
    if (cChanged) saveCurricula(curs);
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

  // ---- 本节 outline 切片：当前小节全量 + 其余仅标题（units 来自 session.outline）----
  function outlineSlice(outline, currentUnitId, goal) {
    const units = outline && outline.units;
    if (!Array.isArray(units) || !units.length) return "";
    const idx = Math.max(0, units.findIndex(function (u) { return u.id === currentUnitId; }));
    const cu = units[idx] || units[0];
    const lines = [];
    lines.push("【本节课大纲：" + (goal || "") + "（" + (outline.level || "") + "）· 共 " + units.length + " 小节】");
    lines.push("全部小节（仅标题）：" + units.map(function (u, i) {
      return (i + 1) + "." + (u.title || u.id) + (u.id === cu.id ? "←当前" : "");
    }).join("  "));
    if (cu) {
      lines.push("\n【当前小节 · 全量】" + (cu.title || cu.id));
      if (cu.objectives && cu.objectives.length) lines.push("目标：" + cu.objectives.join("；"));
      if (cu.grammar && cu.grammar.length) lines.push("要点：" + cu.grammar.map(function (g) { return g.label + (g.note ? "（" + g.note + "）" : ""); }).join("；"));
      if (cu.vocab && cu.vocab.length) lines.push("词汇：" + cu.vocab.join("、"));
      if (cu.can_do && cu.can_do.length) lines.push("学完能做到：" + cu.can_do.join("；"));
    }
    return lines.join("\n");
  }

  function progressText(units, progress) {
    if (!progress) return "";
    const lines = ["【当前进度】"];
    const unit = Array.isArray(units) ? units.find(function (u) { return u.id === progress.current_unit; }) : null;
    lines.push("当前小节：" + (unit ? unit.title : (progress.current_unit || "第一小节")) +
      "（已完成 " + (progress.completed || []).length + " / " + (units ? units.length : "?") + " 小节）");
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
      // 薄弱点（0新学/1待复习）→ 开场先带着复习，学过的东西才会牢（艾宾浩斯同款思路）
      const weak = keys.filter(function (k) { return m[k] <= 1; }).map(function (k) { return label[k] || k; });
      if (weak.length) lines.push("【开场先复习】这些点用户还不稳，这节开头先自然带 Ta 过一遍（提问/造句/小翻译均可，别照本宣科），确认接住了再进新内容：" + weak.join("、"));
    }
    if (progress.notes) lines.push("备注：" + progress.notes);
    const unresolved = (progress.mistakes || []).filter(function (x) { return x && !x.resolved; }).slice(-5);
    if (unresolved.length) lines.push("【真实作答暴露的薄弱点】" + unresolved.map(function (x) {
      return (x.pointId || "要点") + "：" + (x.note || "需要再练");
    }).join("；"));
    return lines.join("\n");
  }

  // 顶部进度既要守住“只有结课才能算完成一小节”的纪律，也要让本节真实答题有可见反馈。
  // 当前小节内，独立答对（level>=2）的要点只贡献不足 1 小节的视觉进度，不会写进 completed。
  function studyProgressRatio(units, progress) {
    const list = Array.isArray(units) ? units : [];
    if (!list.length) return 0;
    const p = progress || {};
    const completed = Array.isArray(p.completed) ? p.completed.filter(function (id) {
      return list.some(function (u) { return u.id === id; });
    }).length : 0;
    const current = list.find(function (u) { return u.id === p.current_unit; });
    const points = current && Array.isArray(current.grammar) ? current.grammar : [];
    const mastered = points.filter(function (g) { return Number((p.mastery || {})[g.id]) >= 2; }).length;
    const withinUnit = points.length ? (mastered / points.length) * 0.9 : 0;
    return Math.max(0, Math.min(1, (completed + withinUnit) / list.length));
  }

  // ---- 课程记忆：curriculum 下跨 session 的往期摘要（内部互通，绝不碰全局聊天记忆库）----
  function curriculumMemoryText(cur) {
    if (!cur || !cur.memory || !Array.isArray(cur.memory.summaries) || !cur.memory.summaries.length) return "";
    const recent = cur.memory.summaries.slice(-8);
    return "【这门课前几次一起学到哪了（跨 session 记忆，自然衔接、别生硬复述、别从零重来）】\n" +
      recent.map(function (s, i) { return (i + 1) + ". " + s.text; }).join("\n");
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
    parts.push(RETEACH_RULE);
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
    } else {
      // 本节自带 outline+progress；再注入这门课的跨-session 记忆（curriculum 内互通）
      const outline = session.outline || null;
      const prog = session.progress || {};
      if (outline) {
        parts.push(outlineSlice(outline, prog.current_unit, session.subject));
        parts.push(progressText(outline.units, prog));
      }
      const mem = curriculumMemoryText(cur);
      if (mem) parts.push(mem);
      // 对话式推进：老师这轮把当前小节讲透、用户也跟上了，就在 JSON 里标 done 让进度条自己前进
      if (mode === "teach" || mode === "nv1-teacher") parts.push(STUDY_PROGRESS_FMT);
    }
    if (mode === "teach" || mode === "nv1-teacher") parts.push(QUIZ_CARD_FMT);
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

  function parseQuiz(raw) {
    const d = extractJSON(raw) || {};
    const q = d.quiz;
    if (!q || typeof q !== "object") return null;
    const type = ["choice", "true_false", "fill_blank"].includes(q.type) ? q.type : "";
    const prompt = String(q.prompt || "").trim();
    const pointId = String(q.point_id || q.pointId || "").trim();
    if (!type || !prompt || !pointId) return null;
    const options = type === "choice" && Array.isArray(q.options) ? q.options.slice(0, 5).map(function (o, i) {
      return { id: String(o && o.id || String.fromCharCode(65 + i)), label: String(o && o.label || "").trim() };
    }).filter(function (o) { return o.label; }) : [];
    if (type === "choice" && options.length < 2) return null;
    let answer = type === "true_false" ? String(q.answer).toLowerCase() : String(q.answer || "").trim();
    if (!answer || (type === "true_false" && !["true", "false"].includes(answer))) return null;
    if (type === "choice" && !options.some(function (o) { return o.id === answer; })) {
      // 模型常把 answer 写成选项文字而非选项 id；按归一化文字映射回 id，映射不到=坏题，宁可不出
      const hit = options.find(function (o) { return normalizeQuizAnswer(o.label) === normalizeQuizAnswer(answer); });
      if (!hit) return null;
      answer = hit.id;
    }
    return {
      type: type, prompt: prompt.slice(0, 600), pointId: pointId,
      options: options, answer: answer,
      aliases: Array.isArray(q.aliases) ? q.aliases.map(String).filter(Boolean).slice(0, 12) : [],
      hints: Array.isArray(q.hints) ? q.hints.map(String).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3) : [],
      hintsUsed: 0,
      explanation: String(q.explanation || "").trim().slice(0, 500),
      attempts: [], status: "open"
    };
  }

  // ---- 一次生成 = 一个角色一个回合（§5）------------------------------
  // 返回 { says:[...], evidence:null|{} }——老师只能报告刚刚真实发生的作答证据，不能自行推进。
  async function genTurn(active, session, char, ctx, role) {
    const sys = buildStudyPrompt(session, char, ctx, role);
    const msgs = toMessages(session.transcript, char.id, (ctx.profile && ctx.profile.name) || "用户");
    const raw = await callAI(active, sys, msgs, { maxTokens: 6400 });
    const says = parseSay(raw);
    const d = extractJSON(raw) || {};
    const evidence = d.evidence && typeof d.evidence === "object" ? d.evidence : null;
    return { says: says, evidence: evidence, quiz: parseQuiz(raw) };
  }

  function normalizeQuizAnswer(value) {
    return String(value == null ? "" : value).normalize("NFKC").trim().toLocaleLowerCase()
      .replace(/\s+/g, " ").replace(/[。.!！?？]+$/g, "").trim();
  }

  async function gradeQuizAnswer(active, quiz, userAnswer) {
    const actual = normalizeQuizAnswer(userAnswer);
    const accepted = [quiz.answer].concat(quiz.aliases || []).map(normalizeQuizAnswer);
    if (accepted.includes(actual)) return { result: "correct", feedback: "答对了", local: true };
    if (quiz.type !== "fill_blank") return { result: "incorrect", feedback: "这次还不对，再想想", local: true };
    const sys = "你只负责复核一道填空题的答案是否语义等价。忽略大小写、无关标点和不影响含义的措辞差异，但不能把反义、关键数字错误或事实错误放过。" +
      "只输出 JSON：{\"result\":\"correct|partial|incorrect\",\"feedback\":\"一句具体反馈，不泄露额外隐私\"}。";
    const u = "题目：" + quiz.prompt + "\n标准答案：" + quiz.answer +
      ((quiz.aliases || []).length ? "\n可接受别名：" + quiz.aliases.join("；") : "") + "\n用户答案：" + String(userAnswer || "");
    try {
      const raw = await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 6400 }); // 思考型模型思考预算从 maxTokens 扣，给小了直接空返回（仓库铁律 ≥6000）
      const d = extractJSON(raw) || {};
      const result = ["correct", "partial", "incorrect"].includes(d.result) ? d.result : "incorrect";
      return { result: result, feedback: String(d.feedback || (result === "correct" ? "意思对了" : "还需要再想想")).slice(0, 240), local: false };
    } catch (e) {
      return { result: "incorrect", feedback: "暂时没法复核这个表达，可以换一种写法再试", local: false, reviewFailed: true };
    }
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  function quizMasteryLevel(quiz, result, support, confidence) {
    const independent = result === "correct" && support === "none" && confidence !== "guess";
    if (independent) return quiz && quiz.isReview ? 3 : 2;
    return result === "correct" || result === "partial" ? 1 : 0;
  }
  function updateCurriculumReview(curId, session, quiz, outcome) {
    if (!curId || !quiz || !quiz.pointId) return null;
    const all = loadCurricula();
    const idx = all.findIndex(function (c) { return c.id === curId; });
    if (idx < 0) return null;
    const cur = all[idx], mem = Object.assign({ summaries: [], review_items: [] }, cur.memory || {});
    const items = (mem.review_items || []).slice();
    const key = String(quiz.reviewKey || quiz.pointId);
    const oldIdx = items.findIndex(function (x) { return x.key === key; });
    const old = oldIdx >= 0 ? items[oldIdx] : null;
    const independent = outcome.result === "correct" && outcome.support === "none" && outcome.confidence !== "guess";
    let stage, nextReviewAt;
    if (independent) {
      const oldStage = old && Number.isFinite(Number(old.stage)) ? Number(old.stage) : -1;
      stage = quiz.isReview ? Math.min(3, Math.max(-1, oldStage) + 1) : Math.max(0, oldStage);
      nextReviewAt = outcome.ts + [1, 3, 7, 14][stage] * DAY_MS;
    } else {
      stage = -1;
      nextReviewAt = outcome.ts + 4 * 60 * 60 * 1000;
    }
    const item = {
      key: key, pointId: quiz.pointId, sourceSessionId: session.id,
      type: quiz.type, prompt: quiz.prompt, options: (quiz.options || []).slice(), answer: quiz.answer,
      aliases: (quiz.aliases || []).slice(), hints: (quiz.hints || []).slice(), explanation: quiz.explanation || "",
      stage: stage, nextReviewAt: nextReviewAt, lastResult: outcome.result,
      lastConfidence: outcome.confidence, lastSupport: outcome.support, updatedAt: outcome.ts
    };
    if (oldIdx >= 0) items[oldIdx] = item; else items.push(item);
    mem.review_items = items.slice(-120);
    all[idx] = Object.assign({}, cur, { memory: mem, updated_at: Date.now() });
    saveCurricula(all);
    return item;
  }

  function dueReviewCards(cur, now) {
    const items = cur && cur.memory && cur.memory.review_items;
    return (Array.isArray(items) ? items : []).filter(function (x) { return x && Number(x.nextReviewAt) <= now; })
      .sort(function (a, b) { return Number(a.nextReviewAt) - Number(b.nextReviewAt); }).slice(0, 2).map(function (x) {
        return {
          type: x.type, prompt: x.prompt, pointId: x.pointId, options: (x.options || []).slice(), answer: x.answer,
          aliases: (x.aliases || []).slice(), hints: (x.hints || []).slice(), hintsUsed: 0,
          explanation: x.explanation || "", attempts: [], status: "open", isReview: true, reviewKey: x.key
        };
      });
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
      const raw = await callAI(active, sys, [{ role: "user", content: "【最近对话】\n" + conv }], { maxTokens: 6400 });
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
      const raw = await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 6400 });
      const d = extractJSON(raw) || {};
      return { canTeach: !!d.canTeach, level: d.level || "", posture: d.posture || "" };
    } catch (e) { return { canTeach: false, level: "", posture: "" }; }
  }

  // ---- 起草【本节 session】的小大纲：承接这门课之前的进度，设计合适的下一步 --------
  // priorCtx = 往期 session 摘要 + 上次 outline 小节标题 + 上次进度，喂给模型做衔接。
  async function draftSessionOutline(active, goal, worldbook, level, priorCtx, focus) {
    const lv = (level || "").trim();
    const first = !priorCtx || !priorCtx.trim();
    const startBlock = first
      ? (lv ? "这是这门课的第一节。学习者不是零基础，现有水平：「" + lv + "」——从合适的起点切入，别从零讲起。"
            : "这是这门课的第一节，学习者零基础，从最开头切入。")
      : "这【不是】第一节。下面给了这门课之前几节学到哪、掌握了什么、卡在哪——请**接着往下设计这一节**：复习一两个薄弱点，然后推进到合适的下一步，别重复已学牢的、也别跳太远。";
    const focusBlock = (focus && focus.trim()) ? "学习者说这节想侧重：「" + focus.trim() + "」，尽量照顾。" : "";
    const sys = "你是课程设计师，正为『" + goal + "』这门课设计**其中一节课**（一次 session，约够聊一阵）的小大纲。" +
      startBlock + focusBlock +
      "把这一节拆成 2~5 个循序渐进的小节（不是整门课，就这一次）。每个小节含：稳定 id（英文小写下划线）、title、objectives(1~2条)、" +
      "grammar/要点数组[{id(英文小写),label(中文短标签),note(一句说明)}]、vocab(若适用,数组)、can_do(学完能做到,1~2条)。" +
      "level 填这一节的难度定位。只输出 JSON：{\"level\":\"…\",\"language\":\"中文\",\"units\":[...]}。不要 markdown。";
    const u = "课程目标：" + goal + (lv ? "\n我的基础：" + lv : "") + (priorCtx && priorCtx.trim() ? "\n\n【这门课之前的记录】\n" + priorCtx.trim() : "\n（这是第一节）");
    const raw = await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 6400 });
    const d = extractJSON(raw) || {};
    // 稳健：模型常漏 id，别因缺 id 把小节整个丢掉——按序补 id（单元 & 要点都补）
    let units = Array.isArray(d.units) ? d.units.filter(function (x) { return x && x.title; }) : [];
    units = units.map(function (x, i) {
      const uid = (x.id && String(x.id).trim()) || ("unit_" + (i + 1));
      const grammar = Array.isArray(x.grammar) ? x.grammar.filter(function (g) { return g && g.label; }).map(function (g, gi) {
        return Object.assign({}, g, { id: (g.id && String(g.id).trim()) || (uid + "_g" + (gi + 1)) });
      }) : [];
      return Object.assign({}, x, { id: uid, grammar: grammar });
    });
    if (!units.length) throw new Error("大纲起草失败，请重试");
    return { level: d.level || (lv || "入门"), language: d.language || "中文", units: units };
  }

  // ---- 结算一节课，浓缩成 1~2 句给课程记忆（下次开新 session 会读到）--------
  async function summarizeStudySession(active, session, ctx) {
    const userName = (ctx.profile && ctx.profile.name) || "用户";
    const conv = tail(session.transcript, 40).map(function (m) {
      return (m.role === "user" ? userName : (m.name || "老师")) + "：" + m.content;
    }).join("\n");
    if (!conv.trim()) return "";
    const outline = session.outline || {};
    const covered = (outline.units || []).map(function (u) { return u.title; }).join("、");
    const sys = "把这一节『" + session.subject + "』的学习，浓缩成 1~2 句给下次上课的备忘：这次讲/练了什么、" + userName + "掌握得怎样、哪里还卡着/下次该接着做什么。具体、可复用。只输出正文。";
    try {
      const progress = progressText(outline.units || [], session.progress || {});
      return (await callAI(active, sys, [{ role: "user", content: "【本节安排】" + covered + "\n" + progress + "\n【对话】\n" + conv }], { maxTokens: 6400 })).trim();
    } catch (e) { return ""; }
  }

  async function generateStudyNote(active, session, char, ctx) {
    const outline = session.outline || {};
    const progress = session.progress || {};
    const userName = (ctx.profile && ctx.profile.name) || "用户";
    const conv = tail(session.transcript, 36).map(function (m) {
      return (m.role === "user" ? userName : (m.name || "老师")) + "：" + m.content;
    }).join("\n");
    const sys = "你是「" + (char && char.name || "老师") + "」，刚教完『" + session.subject + "』这一节。" +
      "请按你的人设留一张简短、真诚的课后小纸条，但所有学习判断必须依据真实作答证据，不能因为你讲过就夸用户学会，也不要学校成绩单腔。" +
      "只输出 JSON：{\"achieved\":\"今天真正做到的一件事\",\"strength\":\"有证据的一个优点，没有就坦白写仍在起步\"," +
      "\"weak\":\"还没稳的具体点，没有则写下一步挑战\",\"next\":\"下次开场先做什么\",\"note\":\"你以角色口吻留的一两句小纸条\"}。";
    const u = "【角色人设】\n" + (char && char.persona || "（暂无）") + "\n\n" + progressText(outline.units || [], progress) +
      "\n\n【本节真实对话】\n" + conv;
    const raw = await callAI(active, sys, [{ role: "user", content: u }], { maxTokens: 6400 });
    const d = extractJSON(raw) || {};
    return {
      achieved: String(d.achieved || "完成了这一节的学习与作答").slice(0, 180),
      strength: String(d.strength || "仍在积累证据").slice(0, 180),
      weak: String(d.weak || progress.notes || "下次再做一次独立回忆").slice(0, 180),
      next: String(d.next || "先复习今天的薄弱点").slice(0, 180),
      note: String(d.note || "今天先到这里，下次接着来。").slice(0, 240),
      authorId: char && char.id || null, authorName: char && char.name || "老师", ts: Date.now()
    };
  }

  // ---- checkpoint（§7）：手动触发，单独一次 JSON，对照 can_do 结算（读本节 outline）-------
  async function runCheckpoint(active, session, char, ctx) {
    const outline = session.outline;
    const units = outline && outline.units;
    if (!Array.isArray(units) || !units.length) throw new Error("本节没有大纲");
    const cp = session.progress || {};
    const unit = units.find(function (u) { return u.id === cp.current_unit; }) || units[0];
    const gram = (unit.grammar || []).map(function (g) { return g.id + "(" + g.label + ")"; }).join("、");
    const conv = tail(session.transcript, 30).map(function (m) {
      return (m.role === "user" ? (ctx.profile && ctx.profile.name || "用户") : m.name) + "：" + m.content;
    }).join("\n");
    const sys = "你在给一堂课的【结课小测】做证据式结算。当前单元「" + unit.title + "」，要点(用 id)：" + gram + "。" +
      "能做到清单：" + (unit.can_do || []).join("；") + "。" +
      "只依据最近一次标有【结课小测】的题目和它后面用户亲自给出的答案来判断，老师自己的讲解、用户说『懂了』都不能当证据。" +
      "mastery 的 key 必须是要点 id（不是中文标签），值 0~2：0答错、1需提示/部分正确、2独立答对；3只能留给未来隔时复习再次独立答对。" +
      "若没有看到小测后的真实用户答案，completed 必须 false。mistakes 只列本次暴露的薄弱点。" +
      "只输出扁平 JSON：{\"completed\":true或false,\"mastery\":{\"<id>\":0-2},\"mistakes\":[{\"point_id\":\"<id>\",\"note\":\"具体错因\"}],\"notes\":\"给下次的一句提醒\"}。";
    const raw = await callAI(active, sys, [{ role: "user", content: "【教学对话】\n" + conv }], { maxTokens: 6400 });
    const d = extractJSON(raw) || {};
    return { completed: !!d.completed, mastery: d.mastery && typeof d.mastery === "object" ? d.mastery : {}, mistakes: Array.isArray(d.mistakes) ? d.mistakes : [], notes: d.notes || "" };
  }

  // ---- 暴露给 UI 层 --------------------------------------------------
  window.Study = {
    loadSessions: loadSessions, saveSessions: saveSessions,
    loadCurricula: loadCurricula, findCurriculum: findCurriculum, findCurriculumBySubject: findCurriculumBySubject,
    saveCurricula: saveCurricula, saveCurriculum: saveCurriculum, pushCurriculumSummary: pushCurriculumSummary,
    newProgress: newProgress, initSessionProgress: initSessionProgress, curriculumMemoryText: curriculumMemoryText,
    genTurn: genTurn, inferAbility: inferAbility, draftSessionOutline: draftSessionOutline,
    summarizeStudySession: summarizeStudySession, generateStudyNote: generateStudyNote, runCheckpoint: runCheckpoint, tail: tail,
    normalizeQuizAnswer: normalizeQuizAnswer, gradeQuizAnswer: gradeQuizAnswer, parseQuiz: parseQuiz,
    updateCurriculumReview: updateCurriculumReview, dueReviewCards: dueReviewCards, quizMasteryLevel: quizMasteryLevel,
    studyProgressRatio: studyProgressRatio
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
            props.mode === "nv1" ? "还没有课程。\n新建一个大目标（如日语N4），挑会教的当老师、另一个陪学，进去开小节。" : "还没有课程。\n新建一个大目标（如日语N4），进去自己开无数节小课，每节接着上次走。")
        : curs.map(function (c) {
            const n = sessCount[c.id] || 0;
            const chars = avatarsFor(c.character_ids, props.characters);
            return h("button", { key: c.id, onClick: function () { return props.onOpen(c.id); },
              className: "w-full flex items-center gap-3 py-3 px-3 mb-2 active:opacity-70",
              style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, textAlign: "left" } },
              h("div", { className: "flex -space-x-2 shrink-0" }, chars.map(function (ch) { return h(Avatar, { key: ch.id, character: ch, size: 38, radius: 999 }); })),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "flex items-center gap-2" },
                  h("span", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.subject),
                  c.level ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: accent, border: "1px solid " + accent, borderRadius: 4, padding: "0px 5px" } }, c.level) : null),
                h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 5 } },
                  chars.map(function (ch) { return ch.name; }).join("、") + " · " + (n ? "已上 " + n + " 节 · " + timeShort(c.updated_at) : "还没开课"))),
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

  // ---- 二级：课程控制台（大目标 + 跨-session 记忆 + 历次 session + 开启新 session）----
  function CurriculumConsole(props) {
    const t = useTheme();
    const accent = t.accent || "#8a6d3b";
    const cur = props.curriculum;
    const summaries = (cur.memory && cur.memory.summaries) || [];
    const dueCount = ((cur.memory && cur.memory.review_items) || []).filter(function (x) { return Number(x.nextReviewAt) <= Date.now(); }).length;
    const sess = (props.sessions || []).filter(function (s) { return s.curriculum_id === cur.id; })
      .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
    const chars = avatarsFor(cur.character_ids, props.characters);
    function sessLabel(s) {
      const u = s.outline && s.outline.units && s.outline.units[0];
      return u ? u.title + ((s.outline.units.length > 1) ? " 等 " + s.outline.units.length + " 小节" : "") : "自由练习";
    }
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: cur.subject, en: modeTag(cur.mode), onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        h("div", { className: "flex items-center gap-2", style: { marginTop: 2, marginBottom: 2 } },
          cur.level ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: accent, border: "1px solid " + accent, borderRadius: 4, padding: "0px 6px" } }, cur.level) : null,
          h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, chars.map(function (ch) { return ch.name; }).join("、") + " · 已上 " + sess.length + " 节" + (dueCount ? " · " + dueCount + " 个待复习" : ""))),
        // 跨-session 记忆（学到哪了）
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "16px 0 8px" } }, "这门课学到哪了"),
        summaries.length === 0
          ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7 } }, "还没有记录。开一节课，聊完它会自动记住进度，下一节接着走。")
          : h("div", { className: "mb-2 p-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 10 } },
              summaries.slice().reverse().slice(0, 8).map(function (sm, i) {
                return h("div", { key: sm.sessionId || i, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.7, marginBottom: i < Math.min(summaries.length, 8) - 1 ? 6 : 0 } }, "· " + sm.text);
              })),
        // 历次 session
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, margin: "18px 0 8px" } }, "历次课（" + sess.length + "）"),
        sess.map(function (s) {
          const p = s.progress || {}, total = (s.outline && s.outline.units || []).length, done = (p.completed || []).length;
          return h("button", { key: s.id, onClick: function () { return props.onOpenSession(s.id); },
            className: "w-full flex items-center gap-3 py-2.5 px-3 mb-2 active:opacity-70",
            style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, textAlign: "left" } },
            h("div", { className: "flex-1 min-w-0" },
              h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, sessLabel(s)),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, (total ? "进度 " + done + "/" + total + " · " : "") + (s.transcript || []).length + " 条 · " + timeShort(s.updated_at))),
            props.onDelSession ? h("span", { onClick: function (e) { e.stopPropagation(); props.onDelSession(s.id); },
              style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 6px" } }, "删") : null);
        })),
      h("div", { className: "shrink-0 px-5 py-3", style: { borderTop: "1px solid " + t.line } },
        h("button", { onClick: function () { return props.onNewSession(cur); }, className: "w-full py-3 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 15, background: accent, color: "#fff", borderRadius: 12 } }, "＋ 开一节课（自动接上次进度）")));
  }

  // ---- 新建课程 = 定个大目标容器（teach / nv1）：不预生成大纲，进控制台再开小节 ----
  function NewCurriculum(props) {
    const t = useTheme();
    const mode = props.mode; // 'teach' | 'nv1'
    const want = mode === "nv1" ? 2 : 1;
    const [subject, setSubject] = useState("");
    const [level, setLevel] = useState("");
    const [picked, setPicked] = useState([]);
    const [busy, setBusy] = useState(false);
    const [confirmUnfit, setConfirmUnfit] = useState(null); // 认真教判定不够格时的弹窗 {ability, teacher}
    const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 8, padding: "10px 12px", width: "100%" };

    function toggle(id) {
      setPicked(function (p) {
        if (p.includes(id)) return p.filter(function (x) { return x !== id; });
        if (p.length >= want) return want === 1 ? [id] : [p[1], id];
        return p.concat([id]);
      });
    }

    function createCur(teacherId) {
      const cur = {
        id: "cur_" + Date.now(), subject: subject.trim(), level: level.trim(), mode: mode,
        character_ids: picked.slice(), teacher_id: teacherId, memory: { summaries: [], review_items: [] },
        created_at: Date.now(), updated_at: Date.now()
      };
      saveCurriculum(cur);
      props.onCreated(cur); // 上层落到控制台，让用户自己开第一节
    }

    async function begin() {
      if (!subject.trim()) { props.toast("先填个大目标"); return; }
      if (picked.length < want) { props.toast(want === 2 ? "挑 2 个角色" : "挑 1 个角色"); return; }
      try {
        const chars = picked.map(function (id) { return props.characters.find(function (c) { return c.id === id; }); });
        if (mode === "nv1") {
          if (!props.active) { props.toast("请先到设置配置 API"); return; }
          setBusy(true);
          const abil = [];
          for (let i = 0; i < chars.length; i++) abil.push(await inferAbility(props.active, chars[i], subject.trim(), props.worldbook));
          const idx = abil.findIndex(function (a) { return a.canTeach; });
          setBusy(false);
          if (idx < 0) { props.toast("这俩谁都不太教得了「" + subject.trim() + "」——换个会的角色，或去『一起研究』一起摸索"); return; }
          createCur(chars[idx].id);
          return;
        }
        // 认真教：先判定 TA 会不会（仅在配了 API 时判）。不够格→弹窗让用户定夺，防系统误判；判定失败/无 API 直接放行
        const teacher = chars[0];
        if (props.active) {
          setBusy(true);
          let ab;
          try { ab = await inferAbility(props.active, teacher, subject.trim(), props.worldbook); }
          catch (e) { ab = { canTeach: true }; }
          setBusy(false);
          if (ab && !ab.canTeach) { setConfirmUnfit({ ability: ab, teacher: teacher }); return; }
        }
        createCur(teacher.id);
      } catch (e) { props.toast("出错了：" + (e.message || "重试")); setBusy(false); }
    }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: mode === "nv1" ? "新建课程 · 一教一学" : "新建课程 · 认真教", en: "New", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, marginBottom: 6 } }, "大目标"),
        h("input", { value: subject, onChange: function (e) { return setSubject(e.target.value); }, placeholder: "例：日语 N4 / 吉他弹唱 / 微积分…", style: field }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 5, lineHeight: 1.6 } }, "这是一门课的大方向。建好后进去，你可以开无数节小课，每节各自生成大纲、接着上次的进度走。"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, margin: "18px 0 6px" } }, "我的基础（可选）"),
        h("input", { value: level, onChange: function (e) { return setLevel(e.target.value); }, placeholder: "不填=零基础。如：已过 N5 想冲 N4 / 会弹几个和弦", style: field }),
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
        h("button", { onClick: begin, disabled: busy, className: "w-full py-3", style: { fontFamily: F_BODY, fontSize: 15, background: t.ink, color: t.bg2, borderRadius: 12, opacity: busy ? 0.6 : 1 } },
          busy ? "判定角色能力中…" : "建课程")),
      confirmUnfit ? h("div", { className: "fixed inset-0 z-50 flex items-center justify-center", style: { background: "rgba(20,19,15,0.55)" }, onClick: function () { setConfirmUnfit(null); } },
        h("div", { onClick: function (e) { e.stopPropagation(); }, style: { width: "84%", maxWidth: 340, background: t.bg, borderRadius: 16, padding: "20px 20px 16px" } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink, marginBottom: 8 } }, confirmUnfit.teacher.name + " 可能教不了这个"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, lineHeight: 1.7, marginBottom: 16, whiteSpace: "pre-line" } },
            "系统判定 " + confirmUnfit.teacher.name + " 的人设跟『" + subject.trim() + "』不太搭" + (confirmUnfit.ability.posture ? "——" + confirmUnfit.ability.posture : "。") + "\n可能是误判。你可以坚持让 TA 认真教，或改成不设老师的「一起研究」，你俩一起摸索。"),
          h("button", { onClick: function () { var tch = confirmUnfit.teacher; setConfirmUnfit(null); createCur(tch.id); }, className: "w-full py-2.5 mb-2 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 10 } }, "坚持让 TA 认真教"),
          h("button", { onClick: function () { var tch = confirmUnfit.teacher; setConfirmUnfit(null); props.onCostudyInstead && props.onCostudyInstead(subject.trim(), tch.id); }, className: "w-full py-2.5 mb-2 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, background: "#7c5cbf", color: "#fff", borderRadius: 10 } }, "改为「一起研究」"),
          h("button", { onClick: function () { setConfirmUnfit(null); }, className: "w-full py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "取消"))) : null);
  }

  // ---- 开一节课：为本节生成小大纲（承接往期 session 摘要+进度）→ 审核 → 落地 ----
  function NewSession(props) {
    const t = useTheme();
    const cur = props.curriculum;
    const [focus, setFocus] = useState("");
    const [busy, setBusy] = useState("");   // '' | 'sum' | 'draft'
    const [draft, setDraft] = useState(null);
    const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 8, padding: "10px 12px", width: "100%" };

    // 惰性总结：开新节前，把这门课里"有内容但还没最新摘要"的旧 session 各总结一句，落进课程记忆
    async function summarizePriors() {
      const list = loadSessions().filter(function (s) { return s.curriculum_id === cur.id && s.mode !== "costudy"; });
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const hasContent = (s.transcript || []).filter(function (m) { return m.role !== "system"; }).length >= 2;
        const stale = !s.summary || (s.summaryTs || 0) < (s.updated_at || 0);
        if (!hasContent || !stale) continue;
        const text = await summarizeStudySession(props.active, s, { profile: props.profile });
        if (text) {
          const all = loadSessions().map(function (x) { return x.id === s.id ? Object.assign({}, x, { summary: text, summaryTs: Date.now() }) : x; });
          saveSessions(all);
          pushCurriculumSummary(cur.id, s.id, text);
        }
      }
    }

    function buildPriorCtx() {
      const fresh = findCurriculum(cur.id) || cur;
      const sums = ((fresh.memory && fresh.memory.summaries) || []).slice(-8).map(function (sm) { return "· " + sm.text; });
      const prior = loadSessions().filter(function (s) { return s.curriculum_id === cur.id && s.outline; })
        .sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
      const last = prior[0];
      const lines = sums.slice();
      if (last && last.outline) {
        lines.push("上一节安排的小节：" + (last.outline.units || []).map(function (u) { return u.title; }).join("、"));
        const lp = last.progress || {};
        const done = (lp.completed || []).length, tot = (last.outline.units || []).length;
        lines.push("上一节完成到 " + done + "/" + tot + " 小节" + (lp.notes ? "；上次提醒：" + lp.notes : ""));
      }
      return lines.join("\n");
    }

    async function generate() {
      if (!props.active) { props.toast("请先到设置配置 API"); return; }
      try {
        setBusy("sum");
        await summarizePriors();
        setBusy("draft");
        const priorCtx = buildPriorCtx();
        const outline = await draftSessionOutline(props.active, cur.subject, props.worldbook, cur.level, priorCtx, focus.trim());
        setDraft(outline); setBusy("");
      } catch (e) { props.toast("出错了：" + (e.message || "重试")); setBusy(""); }
    }

    function confirm(outline) {
      const chars = avatarsFor(cur.character_ids, props.characters);
      const progress = initSessionProgress(outline);
      progress.warmup_queue = dueReviewCards(findCurriculum(cur.id) || cur, Date.now());
      const sess = {
        id: "st_" + Date.now(), curriculum_id: cur.id, mode: cur.mode,
        character_ids: (cur.character_ids || []).slice(), teacher_id: cur.teacher_id || null,
        subject: cur.subject, title: cur.subject + " · " + chars.map(function (c) { return c.name; }).join("&"),
        outline: outline, progress: progress,
        created_at: Date.now(), updated_at: Date.now(), transcript: []
      };
      saveSessions(loadSessions().concat([sess]));
      props.onCreated(sess);
    }

    if (draft) {
      return h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: "本节大纲", en: cur.subject, onBack: function () { setDraft(null); } }),
        h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 12, lineHeight: 1.7 } },
            "这是为这一节课起的小大纲（已参考之前几节的进度）。确认后就按它上课；不满意可重来。"),
          (draft.units || []).map(function (u, i) {
            return h("div", { key: u.id, className: "mb-3 p-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 10 } },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, (i + 1) + ". " + u.title),
              (u.objectives || []).length ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginTop: 4, lineHeight: 1.7 } }, "目标：" + u.objectives.join("；")) : null,
              (u.grammar || []).length ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 3, lineHeight: 1.7 } }, "要点：" + u.grammar.map(function (g) { return g.label; }).join("、")) : null);
          })),
        h("div", { className: "shrink-0 px-5 py-3 flex gap-3", style: { borderTop: "1px solid " + t.line } },
          h("button", { onClick: generate, disabled: !!busy, className: "flex-1 py-3", style: { fontFamily: F_BODY, fontSize: 14, border: "1px solid " + t.line, color: t.ink, borderRadius: 10 } }, busy ? "重排中…" : "重新排"),
          h("button", { onClick: function () { confirm(draft); }, disabled: !!busy, className: "flex-1 py-3", style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 10 } }, "就按这个上课")));
    }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "开一节课", en: cur.subject, onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.7, marginBottom: 16 } },
          "这门课：" + cur.subject + (cur.level ? "（" + cur.level + "）" : "") + "。点下面生成本节小大纲——会自动参考你之前几节学到哪、卡在哪，接着往下排。"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, marginBottom: 6 } }, "这节想侧重什么（可选）"),
        h("input", { value: focus, onChange: function (e) { return setFocus(e.target.value); }, placeholder: "留空=接着上次自动安排；或写：想多练听力 / 复习上次的动词变形", style: field })),
      h("div", { className: "shrink-0 px-5 py-3", style: { borderTop: "1px solid " + t.line } },
        h("button", { onClick: generate, disabled: !!busy, className: "w-full py-3", style: { fontFamily: F_BODY, fontSize: 15, background: t.ink, color: t.bg2, borderRadius: 12, opacity: busy ? 0.6 : 1 } },
          busy === "sum" ? "回顾之前几节…" : busy === "draft" ? "为这节排大纲…" : "生成本节大纲")));
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
    const [quizDrafts, setQuizDrafts] = useState({});
    const [quizConfidence, setQuizConfidence] = useState({});
    const scrollRef = useRef(null);
    const sessRef = useRef(props.session);
    const tp = typeof useTtsPlayer === "function" ? useTtsPlayer() : null; // 台词朗读（懒合成，重听免费）
    useEffect(function () { sessRef.current = sess; }, [sess]);
    useEffect(function () {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [sess.transcript.length, busy]);

    // 本节自足：outline+progress 都挂在 session 上（costudy 的 progress 是 running_summary）
    const outline = sess.outline || null;
    const units = (outline && outline.units) || [];
    const prog = sess.progress || {};
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
      const before = sessRef.current;
      const answerEntry = (before.transcript || []).length && before.transcript[before.transcript.length - 1].role === "user"
        ? before.transcript[before.transcript.length - 1] : null;
      const res = await genTurn(props.active, sessRef.current, char, ctx, role);
      const says = (res && res.says) || [];
      for (let i = 0; i < says.length; i++) {
        if (i > 0) await new Promise(function (r) { return setTimeout(r, 400); });
        pushEntry({ id: "c_" + Date.now() + "_" + i, role: "char", speakerId: char.id, name: char.name, content: says[i], ts: Date.now() });
      }
      if (res && res.quiz) {
        // 允许全大纲的要点 id：开场复习就是会考上一小节的点（progressText 明确引导），只卡当前小节会把合法复习题吞掉
        const allowed = units.reduce(function (acc, u) { return acc.concat((u.grammar || []).map(function (g) { return String(g.id); })); }, []);
        if (allowed.includes(res.quiz.pointId)) {
          pushEntry({ id: "q_" + Date.now(), role: "char", speakerId: char.id, name: char.name,
            content: res.quiz.prompt, quiz: res.quiz, ts: Date.now() });
        } else {
          // 真越界也不许无声吞卡——老师嘴上说了「做做这道题」，屏幕上必须有东西；降级成普通文字，不带 quiz 结构不记证据
          pushEntry({ id: "q_" + Date.now(), role: "char", speakerId: char.id, name: char.name,
            content: res.quiz.prompt, ts: Date.now() });
        }
      }
      // 老师只能把用户刚刚真实作答的表现记成证据；任何模型信号都不能自动推进小节。
      if (units.length && (role === "teach" || role === "nv1-teacher")) recordEvidence(res && res.evidence, answerEntry);
    }

    function recordEvidence(raw, answerEntry) {
      if (!raw || !answerEntry || answerEntry.studyAction) return;
      const s = sessRef.current;
      const cp = Object.assign({ completed: [], mastery: {}, evidence: [], mistakes: [] }, s.progress);
      const cu = units.find(function (u) { return u.id === cp.current_unit; });
      const pointIds = (cu && cu.grammar || []).map(function (g) { return String(g.id); });
      const pointId = String(raw.point_id || raw.pointId || "");
      const result = ["correct", "partial", "incorrect"].includes(raw.result) ? raw.result : "";
      const support = ["none", "hinted", "guided"].includes(raw.support) ? raw.support : "";
      if (!pointId || !pointIds.includes(pointId) || !result || !support) return;
      const key = answerEntry.id + ":" + pointId;
      if ((cp.evidence || []).some(function (e) { return e.key === key; })) return;
      const level = result === "correct" ? (support === "none" ? 2 : 1) : (result === "partial" ? 1 : 0);
      // 掌握度以最近一次真实表现为准；答错可以降级，不能被历史高分永久遮住。
      cp.mastery = Object.assign({}, cp.mastery, { [pointId]: level });
      cp.evidence = (cp.evidence || []).concat([{
        key: key, pointId: pointId, userEntryId: answerEntry.id,
        result: result, support: support, level: level,
        note: String(raw.note || "").slice(0, 180), ts: Date.now()
      }]).slice(-80);
      if (level <= 1) {
        cp.mistakes = (cp.mistakes || []).concat([{
          id: "mist_" + Date.now(), pointId: pointId, userEntryId: answerEntry.id,
          note: String(raw.note || "还需要再练").slice(0, 180), resolved: false, ts: Date.now()
        }]).slice(-50);
      } else {
        cp.mistakes = (cp.mistakes || []).map(function (m) {
          return m.pointId === pointId && !m.resolved ? Object.assign({}, m, { resolved: true, resolvedTs: Date.now() }) : m;
        });
      }
      cp.review_queue = Object.keys(cp.mastery).filter(function (k) { return cp.mastery[k] <= 1; });
      commit(Object.assign({}, s, { progress: cp }));
    }

    // 发送即回复：符合普通聊天直觉。旧版还要再点一次“让 TA 回复”，会让人误以为题卡和进度坏了。
    function send() {
      const txt = input.trim();
      if (!txt || busy) return;
      setInput("");
      pushEntry({ id: "u_" + Date.now(), role: "user", content: txt, ts: Date.now() });
      setTimeout(function () { replyNow(); }, 60);
    }

    async function submitQuiz(entry, value, confidence) {
      if (busy || !entry || !entry.quiz || entry.quiz.status === "correct") return;
      const answer = String(value == null ? "" : value).trim();
      if (!answer) { props.toast("先填答案"); return; }
      if (!["sure", "unsure", "guess"].includes(confidence)) { props.toast("提交前选一下你有多确定"); return; }
      setBusy(true);
      try {
        const grade = await gradeQuizAnswer(props.bgActive || props.active, entry.quiz, answer);
        if (grade.reviewFailed) {
          props.toast("这次没能完成语义复核，没有判错也没有改掌握度；稍后再试");
          return;
        }
        const now = Date.now();
        const attempts = entry.quiz.attempts || [];
        const hintsUsed = Number(entry.quiz.hintsUsed) || 0;
        const support = hintsUsed >= 3 ? "guided" : ((hintsUsed > 0 || attempts.length > 0) ? "hinted" : "none");
        const level = quizMasteryLevel(entry.quiz, grade.result, support, confidence);
        const attempt = { answer: answer, result: grade.result, feedback: grade.feedback, support: support, confidence: confidence, ts: now };
        const answerId = "u_qa_" + now;
        const s = sessRef.current;
        const nextTranscript = (s.transcript || []).map(function (m) {
          if (m.id !== entry.id) return m;
          return Object.assign({}, m, { quiz: Object.assign({}, m.quiz, {
            attempts: attempts.concat([attempt]), status: grade.result === "correct" ? "correct" : "open"
          }) });
        });
        const selected = entry.quiz.type === "choice"
          ? ((entry.quiz.options || []).find(function (o) { return o.id === answer; }) || {}).label || answer
          : (entry.quiz.type === "true_false" ? (answer === "true" ? "正确" : "错误") : answer);
        nextTranscript.push({ id: answerId, role: "user", studyAction: "quiz_answer", hidden: true,
          content: "（答题卡作答｜题目：" + entry.quiz.prompt + "｜我的答案：" + selected + "｜自信：" + confidence + "｜判定：" + grade.result + "）", ts: now });

        const cp = Object.assign({ completed: [], mastery: {}, review_queue: [], evidence: [], mistakes: [] }, s.progress);
        const pointId = entry.quiz.pointId;
        cp.mastery = Object.assign({}, cp.mastery, { [pointId]: level });
        cp.evidence = (cp.evidence || []).concat([{
          key: entry.id + ":" + (attempts.length + 1), pointId: pointId, userEntryId: answerId,
          quizId: entry.id, result: grade.result, support: support, confidence: confidence, level: level,
          note: grade.feedback, ts: now
        }]).slice(-80);
        if (level <= 1) {
          cp.mistakes = (cp.mistakes || []).concat([{
            id: "mist_" + now, pointId: pointId, userEntryId: answerId, quizId: entry.id,
            note: (grade.result === "incorrect" && confidence === "sure" ? "高置信误解：" : "") + (grade.feedback || "需要再练"), resolved: false, ts: now
          }]).slice(-50);
        } else {
          cp.mistakes = (cp.mistakes || []).map(function (m) {
            return m.pointId === pointId && !m.resolved ? Object.assign({}, m, { resolved: true, resolvedTs: now }) : m;
          });
        }
        cp.review_queue = Object.keys(cp.mastery).filter(function (k) { return cp.mastery[k] <= 1; });
        commit(Object.assign({}, s, { transcript: nextTranscript, progress: cp }));
        updateCurriculumReview(s.curriculum_id, s, entry.quiz, { result: grade.result, support: support, confidence: confidence, ts: now });
        setQuizDrafts(function (old) { return Object.assign({}, old, { [entry.id]: "" }); });
        setQuizConfidence(function (old) { return Object.assign({}, old, { [entry.id]: "" }); });
        props.toast(grade.result === "correct" ? "答对了，已记成学习证据" : (grade.result === "partial" ? "基本方向对，再修一下" : "这题还不对，已经放进薄弱点"));
      } finally { setBusy(false); }
    }

    function revealQuizHint(entry) {
      if (busy || !entry || !entry.quiz || entry.quiz.status === "correct") return;
      const hints = entry.quiz.hints || [];
      const used = Number(entry.quiz.hintsUsed) || 0;
      if (!hints.length) { props.toast("这道题没有额外提示，先按自己的理解试试"); return; }
      if (used >= hints.length) { props.toast("提示已经全部给你啦"); return; }
      const s = sessRef.current;
      const nextTranscript = (s.transcript || []).map(function (m) {
        return m.id === entry.id ? Object.assign({}, m, { quiz: Object.assign({}, m.quiz, { hintsUsed: used + 1 }) }) : m;
      });
      commit(Object.assign({}, s, { transcript: nextTranscript }));
      props.toast("打开第 " + (used + 1) + " 级提示");
    }

    function startWarmup() {
      if (busy) return;
      const s = sessRef.current;
      const cp = Object.assign({ warmup_queue: [], warmup_started: false }, s.progress);
      const queue = (cp.warmup_queue || []).slice(0, 2);
      if (!queue.length || cp.warmup_started) return;
      const now = Date.now();
      const cards = queue.map(function (q, i) {
        return { id: "q_review_" + now + "_" + i, role: "char", speakerId: teacher && teacher.id,
          name: teacher && teacher.name || "老师", content: q.prompt,
          quiz: Object.assign({}, q, { attempts: [], hintsUsed: 0, status: "open", isReview: true }), ts: now + i };
      });
      cp.warmup_started = true;
      commit(Object.assign({}, s, { transcript: (s.transcript || []).concat(cards), progress: cp }));
      props.toast("先用 " + cards.length + " 道到期题热热身，再开始新内容");
    }

    // 考我：主动请老师就本节要点出题（一题一题来，答完批改讲解 + 顺手更新掌握度）
    function quizMe() {
      if (busy) return;
      pushEntry({ id: "u_" + Date.now(), role: "user", content: "（考考我吧：就这节讲过的要点出 3 道小题——用可交互题卡，难度贴我现在的水平，单选/判断/填空混着来，优先考我还不稳的点。一题一题出，等我答完再出下一题，最后告诉我哪个点还得再练。）", ts: Date.now() });
      setTimeout(function () { replyNow(); }, 60);
    }

    function reteach() {
      if (busy) return;
      pushEntry({ id: "u_" + Date.now(), role: "user", studyAction: "reteach",
        content: "这样我没听懂，换一种讲法。别只是换几个词：请换成例子、类比、图像化步骤或带我一起做，从你判断我真正卡住的地方重新来。", ts: Date.now() });
      setTimeout(function () { replyNow(); }, 60);
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

    function hasExitAnswer(s, ticket) {
      return !!ticket && (s.transcript || []).some(function (m) {
        return m.role === "user" && (!m.studyAction || m.studyAction === "quiz_answer") && (m.ts || 0) > (ticket.askedAt || 0);
      });
    }

    async function startExitTicket() {
      const s = sessRef.current;
      const cp = Object.assign({ completed: [], mastery: {}, evidence: [], mistakes: [] }, s.progress);
      const cu = units.find(function (u) { return u.id === cp.current_unit; });
      if (!cu) return;
      const askedAt = Date.now();
      cp.exit_ticket = { status: "awaiting_answer", unitId: cu.id, askedAt: askedAt };
      commit(Object.assign({}, s, { progress: cp }));
      pushEntry({
        id: "u_" + Date.now(), role: "user", studyAction: "exit_request",
        content: "（【结课小测】请针对当前小节最核心、最好也是我还不稳的点，只发 1 张需要我亲自作答的可交互题卡。先不要公布答案，也不要替我回答。）", ts: askedAt
      });
      await replyNow();
      props.toast("先答完这道小测，再点“提交结课”");
    }

    async function checkpoint() {
      if (busy || !props.active) return;
      if (sess.mode === "costudy" || !units.length) return;
      const initial = sessRef.current;
      const initialTicket = initial.progress && initial.progress.exit_ticket;
      if (!initialTicket || initialTicket.status !== "awaiting_answer") {
        await startExitTicket();
        return;
      }
      if (!hasExitAnswer(initial, initialTicket)) {
        props.toast("先亲自回答老师刚出的结课小测");
        return;
      }
      setBusy(true);
      try {
        const s = sessRef.current;
        // 本节自足：结算写进本 session 的进度（跨 session 靠开新节时的摘要衔接，不写这里）
        const cp = Object.assign({ completed: [], mastery: {} }, s.progress);
        try {
          const res = await runCheckpoint(props.active, s, teacher, ctx);
          const cu = units.find(function (u) { return u.id === cp.current_unit; });
          const allowed = (cu && cu.grammar || []).map(function (g) { return g.id; });
          const checkedMastery = {};
          Object.keys(res.mastery || {}).forEach(function (id) {
            const level = Math.max(0, Math.min(2, Math.round(Number(res.mastery[id]))));
            if (allowed.includes(id) && Number.isFinite(level)) checkedMastery[id] = level;
          });
          cp.mastery = Object.assign({}, cp.mastery, checkedMastery);
          cp.notes = res.notes || cp.notes;
          cp.evidence = (cp.evidence || []).slice();
          cp.mistakes = (cp.mistakes || []).slice();
          (res.mistakes || []).forEach(function (m) {
            const pointId = String(m.point_id || "");
            if (!allowed.includes(pointId)) return;
            cp.mistakes.push({ id: "mist_" + Date.now() + "_exit", pointId: pointId, userEntryId: null,
              note: String(m.note || "结课小测仍需复习").slice(0, 180), resolved: false, ts: Date.now() });
          });
          cp.review_queue = Object.keys(cp.mastery).filter(function (k) { return cp.mastery[k] <= 1; });
          const independentlyPassed = Object.keys(checkedMastery).some(function (id) { return checkedMastery[id] >= 2; });
          if (!res.completed || !independentlyPassed) {
            cp.exit_ticket = { status: "needs_retry", unitId: cp.current_unit, checkedAt: Date.now() };
            // 结算是好几秒的模型调用，期间用户可能又发了消息——必须用最新 sessRef 写回，不能用 await 前的旧快照（会整体覆盖丢消息）
            commit(Object.assign({}, sessRef.current, { progress: cp }));
            props.toast("这次小测还暴露了薄弱点，已经记下；练一会儿再测一次");
            return;
          }
        } catch (e) {
          props.toast("小测结算失败，没有推进进度");
          return;
        }
        cp.exit_ticket = { status: "passed", unitId: cp.current_unit, checkedAt: Date.now() };
        const idx = units.findIndex(function (u) { return u.id === cp.current_unit; });
        if (!cp.completed.includes(cp.current_unit)) cp.completed = cp.completed.concat([cp.current_unit]);
        const nextU = units[idx + 1];
        if (nextU) {
          cp.current_unit = nextU.id;
          cp.exit_ticket = null;
          const weak = (cp.review_queue || []).length;
          props.toast("进入下一小节：" + nextU.title + (weak ? "（有 " + weak + " 个点标了待复习）" : ""));
        } else {
          props.toast("本节都学完啦 🎉 回课程可以开下一节");
        }
        const completedSession = Object.assign({}, sessRef.current, { progress: cp });
        commit(completedSession);
        if (!nextU && !cp.closing_note) {
          try {
            const note = await generateStudyNote(props.bgActive || props.active, completedSession, teacher, ctx);
            const latest = sessRef.current;
            const nextProgress = Object.assign({}, latest.progress, { closing_note: note });
            const summary = "本节做到：" + note.achieved + "；还需：" + note.weak + "；下次：" + note.next;
            const noteEntry = { id: "study_note_" + note.ts, role: "system", studyNote: note,
              content: summary, ts: note.ts };
            commit(Object.assign({}, latest, { progress: nextProgress,
              transcript: (latest.transcript || []).concat([noteEntry]), summary: summary, summaryTs: Date.now() }));
            if (latest.curriculum_id) pushCurriculumSummary(latest.curriculum_id, latest.id, summary);
            props.toast((teacher && teacher.name || "老师") + " 给你留了一张课后小纸条");
          } catch (e) {
            props.toast("本节已完成；课后小纸条这次没写出来，不影响进度");
          }
        }
      } catch (e) {
        props.toast("出错了：" + (e.message || "重试"));
      } finally { setBusy(false); }
    }

    // 退回上一小节：current_unit 回上一小节，并从「已完成」移除（重新学）
    function prevUnit() {
      if (busy || !units.length) return;
      const s = sessRef.current;
      const cp = Object.assign({ completed: [] }, s.progress);
      const idx = units.findIndex(function (u) { return u.id === cp.current_unit; });
      if (idx <= 0) { props.toast("已经是第一小节了"); return; }
      const prev = units[idx - 1];
      cp.current_unit = prev.id;
      cp.completed = (cp.completed || []).filter(function (x) { return x !== prev.id; });
      commit(Object.assign({}, s, { progress: cp }));
      props.toast("退回上一小节：" + prev.title);
    }

    // 顶栏
    const accent = modeColor(sess.mode, t);
    const unit = units.length ? units.find(function (u) { return u.id === prog.current_unit; }) : null;
    const topBar = sess.mode === "costudy"
      ? h("div", { className: "px-5 pb-2", style: { background: t.bg } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: accent, lineHeight: 1.6 } },
            "一起研究 · " + (sess.progress && sess.progress.running_summary ? sess.progress.running_summary.slice(0, 60) : "还在起步，边聊边攒线索")))
      : h("div", { className: "px-5 pb-2", style: { background: t.bg } },
          h("button", { onClick: function () { return setExpand(!expand); }, className: "w-full flex items-center gap-2 active:opacity-70" },
            h("div", { className: "flex-1", style: { height: 5, background: t.line, borderRadius: 3, overflow: "hidden" } },
              h("div", { style: { height: "100%", width: (studyProgressRatio(units, prog) * 100) + "%", background: accent } })),
            h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } },
              (unit ? unit.title : "本节") + " " + ((prog.completed || []).length) + "/" + (units.length || "?"))),
          expand && unit ? h("div", { className: "mt-2 flex flex-wrap gap-1.5" }, (unit.grammar || []).map(function (g) {
            const lv = (prog.mastery || {})[g.id];
            const col = lv >= 2 ? "#4a9e5c" : lv === 1 ? "#d6a53a" : "#cf5b4e";
            return h("span", { key: g.id, style: { fontFamily: F_BODY, fontSize: 11, color: "#fff", background: col, borderRadius: 4, padding: "1px 7px" } }, g.label);
          })) : null);

    function quizCard(m) {
      const q = m.quiz;
      const attempts = q.attempts || [];
      const last = attempts[attempts.length - 1];
      const solved = q.status === "correct";
      const draft = quizDrafts[m.id] || "";
      const confidence = quizConfidence[m.id] || "";
      const hints = q.hints || [];
      const hintsUsed = Math.min(Number(q.hintsUsed) || 0, hints.length);
      const baseButton = { fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg,
        border: "1px solid " + t.line, borderRadius: 9, padding: "9px 10px", textAlign: "left" };
      let answerUI;
      if (q.type === "choice") {
        answerUI = h("div", { className: "flex flex-col gap-2" }, (q.options || []).map(function (o) {
          const on = draft === o.id;
          return h("button", { key: o.id, disabled: busy || solved, onClick: function () { setQuizDrafts(function (old) { return Object.assign({}, old, { [m.id]: o.id }); }); },
            className: "active:opacity-70 disabled:opacity-60", style: Object.assign({}, baseButton, on ? { borderColor: accent, background: accent + "12" } : {}) },
            h("span", { style: { color: accent, marginRight: 7 } }, o.id), o.label);
        }));
      } else if (q.type === "true_false") {
        answerUI = h("div", { className: "grid grid-cols-2 gap-2" },
          h("button", { disabled: busy || solved, onClick: function () { setQuizDrafts(function (old) { return Object.assign({}, old, { [m.id]: "true" }); }); }, className: "active:opacity-70 disabled:opacity-60", style: Object.assign({}, baseButton, { textAlign: "center" }, draft === "true" ? { borderColor: accent, background: accent + "12" } : {}) }, "正确"),
          h("button", { disabled: busy || solved, onClick: function () { setQuizDrafts(function (old) { return Object.assign({}, old, { [m.id]: "false" }); }); }, className: "active:opacity-70 disabled:opacity-60", style: Object.assign({}, baseButton, { textAlign: "center" }, draft === "false" ? { borderColor: accent, background: accent + "12" } : {}) }, "错误"));
      } else {
        answerUI = h("div", null,
          h("input", { value: draft, disabled: busy || solved, onChange: function (e) { setQuizDrafts(function (old) { return Object.assign({}, old, { [m.id]: e.target.value }); }); },
            placeholder: "填入答案…", style: { width: "100%", fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg, border: "1px solid " + t.line, borderRadius: 9, padding: "9px 10px" } }));
      }
      return h("div", { style: { width: "min(100%, 430px)", background: t.bg2, border: "1px solid " + accent + "55", borderRadius: 14, padding: 13 } },
        h("div", { className: "flex items-center justify-between", style: { marginBottom: 8 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: accent } }, q.type === "choice" ? "单选题" : q.type === "true_false" ? "判断题" : "填空题"),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, attempts.length ? "已答 " + attempts.length + " 次" : "未作答")),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.7, color: t.ink, marginBottom: 11, whiteSpace: "pre-wrap" } }, q.prompt),
        answerUI,
        !solved ? h("div", { style: { marginTop: 9 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 5 } }, "提交前，你有多确定？"),
          h("div", { className: "grid grid-cols-3 gap-1.5" }, [["sure", "很确定"], ["unsure", "有点犹豫"], ["guess", "我在猜"]].map(function (x) {
            const on = confidence === x[0];
            return h("button", { key: x[0], disabled: busy, onClick: function () { setQuizConfidence(function (old) { return Object.assign({}, old, { [m.id]: x[0] }); }); },
              className: "active:opacity-70 disabled:opacity-50", style: { fontFamily: F_BODY, fontSize: 11, color: on ? "#fff" : t.fog,
                background: on ? accent : t.bg, border: "1px solid " + (on ? accent : t.line), borderRadius: 7, padding: "6px 3px" } }, x[1]);
          })),
          h("button", { disabled: busy || !String(draft).trim() || !confidence, onClick: function () { submitQuiz(m, draft, confidence); },
            className: "w-full active:opacity-70 disabled:opacity-40", style: { marginTop: 7, fontFamily: F_BODY, fontSize: 12.5,
              color: "#fff", background: accent, borderRadius: 8, padding: "8px 0" } }, busy ? "判定中…" : "提交答案")) : null,
        hintsUsed ? h("div", { style: { marginTop: 9, padding: "8px 9px", background: accent + "0d", borderRadius: 8 } },
          hints.slice(0, hintsUsed).map(function (hint, i) {
            return h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.6, color: t.fog,
              marginTop: i ? 5 : 0 } }, "提示 " + (i + 1) + "：" + hint);
          })) : null,
        !solved && hints.length ? h("button", { disabled: busy || hintsUsed >= hints.length, onClick: function () { revealQuizHint(m); },
          className: "active:opacity-70 disabled:opacity-40", style: { marginTop: 8, fontFamily: F_BODY, fontSize: 11.5,
            color: accent, border: "1px solid " + accent + "66", borderRadius: 8, padding: "5px 9px" } },
          hintsUsed >= hints.length ? "提示已全部展开" : "给我一点提示 · " + hintsUsed + "/" + hints.length) : null,
        last ? h("div", { style: { marginTop: 9, fontFamily: F_BODY, fontSize: 12.5, lineHeight: 1.6,
          color: last.result === "correct" ? "#4a9e5c" : last.result === "partial" ? "#b18428" : "#c45353" } },
          (last.result === "correct" ? "✓ " : last.result === "partial" ? "△ " : "× ") + last.feedback) : null,
        solved && q.explanation ? h("div", { style: { marginTop: 7, paddingTop: 7, borderTop: "1px solid " + t.line,
          fontFamily: F_BODY, fontSize: 12, lineHeight: 1.6, color: t.fog } }, q.explanation) : null);
    }

    // 气泡渲染
    const bubbles = sess.transcript.map(function (m) {
      if (m.hidden) return null;
      if (m.studyNote) {
        const n = m.studyNote;
        return h("div", { key: m.id, className: "my-4", style: { background: accent + "0d", border: "1px solid " + accent + "55", borderRadius: 14, padding: 14 } },
          h("div", { className: "flex items-center justify-between", style: { marginBottom: 9 } },
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "课后小纸条"),
            h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, n.authorName || "老师")),
          [["今天做到", n.achieved], ["做得好的", n.strength], ["还没稳的", n.weak], ["下次先做", n.next]].map(function (x) {
            return h("div", { key: x[0], style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, lineHeight: 1.65, marginTop: 4 } },
              h("span", { style: { color: t.fog } }, x[0] + "："), x[1]);
          }),
          h("div", { style: { marginTop: 10, paddingTop: 9, borderTop: "1px solid " + t.line,
            fontFamily: F_BODY, fontSize: 13, color: accent, lineHeight: 1.7, whiteSpace: "pre-wrap" } }, n.note));
      }
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
          (sess.mode === "nv1" || (char && char.voiceId && typeof ttsReady === "function" && ttsReady())) ? h("div", { className: "flex items-center gap-1", style: { marginBottom: 2 } },
            sess.mode === "nv1" ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, m.name + (isTeacher ? "（老师）" : "（同学）")) : null,
            (tp && typeof TtsDot === "function") ? h(TtsDot, { k: "st" + m.id, text: m.content, spk: char, tp: tp }) : null) : null,
          m.quiz ? quizCard(m) : h("div", { style: { display: "inline-block", maxWidth: "100%", background: indent ? "#7c5cbf1a" : t.bg2, border: "1px solid " + t.line, color: t.ink, borderRadius: "4px 14px 14px 14px", padding: "8px 12px", fontFamily: F_BODY, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" } }, m.content)));
    });

    return h("div", { className: "h-full flex flex-col" },
      h(Head, {
        zh: sess.subject, en: modeTag(sess.mode), onBack: props.onBack,
        right: sess.mode !== "costudy" ? h("div", { className: "flex items-center gap-1.5" },
          h("button", { onClick: prevUnit, disabled: busy || !units.length || (units.findIndex(function (u) { return u.id === prog.current_unit; }) <= 0), className: "active:opacity-60 disabled:opacity-30", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, border: "1px solid " + t.line, borderRadius: 8, padding: "4px 9px" } }, "上一小节"),
          h("button", { onClick: quizMe, disabled: busy, className: "active:opacity-60 disabled:opacity-30", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, border: "1px solid " + t.line, borderRadius: 8, padding: "4px 10px" } }, "🎯考我"),
          h("button", { onClick: checkpoint, disabled: busy, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: accent, border: "1px solid " + accent, borderRadius: 8, padding: "4px 10px" } },
            prog.exit_ticket && prog.exit_ticket.status === "awaiting_answer"
              ? (hasExitAnswer(sess, prog.exit_ticket) ? "提交结课" : "先答小测")
              : (prog.exit_ticket && prog.exit_ticket.status === "needs_retry" ? "再测一次" : "结课小测"))) : null
      }),
      topBar,
      h("div", { ref: scrollRef, className: "flex-1 min-h-0 overflow-y-auto px-5 py-3" },
        bubbles.length === 0
          ? h("div", { className: "flex flex-col items-center gap-3", style: { marginTop: 30 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", lineHeight: 1.8 } },
                (prog.warmup_queue || []).length && !prog.warmup_started
                  ? "有 " + (prog.warmup_queue || []).length + " 个知识点到复习时间了。先看看今天还记不记得。"
                  : "开始吧——先说几句，或直接让 " + (teacher ? teacher.name : "对方") + " 开个头"),
              (prog.warmup_queue || []).length && !prog.warmup_started
                ? h("button", { onClick: startWarmup, disabled: busy, className: "px-4 py-2 active:opacity-70",
                    style: { fontFamily: F_BODY, fontSize: 13, background: accent, color: "#fff", borderRadius: 10 } }, "先做课前热身")
                : h("button", { onClick: replyNow, disabled: busy, className: "px-4 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: t.ink, color: t.bg2, borderRadius: 10 } }, busy ? "…" : "让 " + (teacher ? teacher.name : "对方") + " 开场"))
          : bubbles,
        busy ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "4px 2px" } }, "…") : null),
      h("div", { className: "shrink-0", style: { borderTop: "1px solid " + t.line, background: t.bg } },
        bubbles.length ? h("div", { className: "px-4 pt-2 flex gap-2" },
          sess.mode !== "costudy" ? h("button", { onClick: reteach, disabled: busy, className: "active:opacity-70 disabled:opacity-40",
            style: { flex: "0 0 auto", fontFamily: F_BODY, fontSize: 12.5, color: accent, border: "1px solid " + accent, borderRadius: 10, padding: "8px 11px" } }, "换种讲法") : null,
          h("button", { onClick: replyNow, disabled: busy, className: "flex-1 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: busy ? t.line : accent, color: "#fff", borderRadius: 10, padding: "8px 0", opacity: busy ? 0.8 : 1 } },
            busy ? "生成中…" : (sess.mode === "nv1" ? "让 " + (teacher ? teacher.name : "老师") + " / 同学接话" : "让 " + (chars[0] ? chars[0].name : "对方") + " 回复"))) : null,
        h("div", { className: "px-4 py-3 flex items-end gap-2", style: { paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" } },
          h("textarea", { value: input, onChange: function (e) { return setInput(e.target.value); }, rows: 1, placeholder: "说点什么…发送后老师会直接回复", style: { flex: 1, resize: "none", fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 18, padding: "9px 14px", maxHeight: 100 },
            onKeyDown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } } }),
          h("button", { onClick: send, disabled: busy || !input.trim(), className: "shrink-0 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 14, background: t.ink, color: t.bg2, borderRadius: 18, padding: "9px 16px", opacity: busy || !input.trim() ? 0.5 : 1 } }, busy ? "回复中…" : "发送"))));
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

    if (view === "newCurriculum") {
      return h(NewCurriculum, {
        mode: tab, active: props.active, bgActive: props.bgActive, characters: props.characters, worldbook: props.worldbook, toast: props.toast,
        onBack: function () { setView("home"); },
        onCreated: function (cur) { setCurId(cur.id); setView("console"); }, // 落到控制台，自己开第一节
        // 认真教判定不够格→用户选「改为一起研究」：建 costudy session 直接进聊天
        onCostudyInstead: function (subject, charId) {
          const chars = avatarsFor([charId], props.characters);
          const sess = {
            id: "st_" + Date.now(), curriculum_id: null, mode: "costudy",
            character_ids: [charId], teacher_id: null, subject: subject,
            title: subject + " · " + chars.map(function (c) { return c.name; }).join("&"),
            updated_at: Date.now(), progress: newProgress("costudy"), transcript: []
          };
          saveSessions(loadSessions().concat([sess]));
          setOpenId(sess.id); setView("thread");
        }
      });
    }
    if (view === "newSession") {
      const cur = curricula.find(function (c) { return c.id === curId; });
      if (!cur) { setView("home"); return null; }
      return h(NewSession, {
        curriculum: cur, active: props.active, bgActive: props.bgActive, characters: props.characters, worldbook: props.worldbook, profile: props.profile, toast: props.toast,
        onBack: function () { setView("console"); },
        onCreated: function (sess) { setOpenId(sess.id); setView("thread"); }
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
        onNewSession: function (c) { setCurId(c.id); setView("newSession"); },
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
        session: sess, active: props.active, bgActive: props.bgActive, characters: props.characters, profile: props.profile, worldbook: props.worldbook, toast: props.toast,
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
        onNew: function () { setView("newCurriculum"); },
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
