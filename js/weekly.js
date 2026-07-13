// ============================================================
// 周刊（weekly）—— 把上一周的 RP 聊天记录重新叙事化
// 5 个版块：采访版（per character：专访 in-character + 狗仔花边）
//   + 4 种媒体腔（维多利亚社交小报 / 赛博朋克数据快讯 / 民国鸳鸯蝴蝶派 / 严肃大报社论）。
// 喂进去的 log 素材不变，输出腔调随版块变（媒体腔 = world book 层）。
//
// 分层优先级（照现有架构）：
//   反八股块 ANTI_CLICHE（system 最高） > 引用角色时角色卡声纹 CHARCARD_RULE+persona
//   > 媒体腔 world book（版块声纹） > 模型默认。
//   ※ 媒体腔管叙述者声音；版块内引用角色说话时，角色卡声纹必须存活。
//
// 刷新闸门：每周日 WEEKLY_REFRESH_HOUR 起，本周（周一~周日）成为可出刊的一期；
//   每周一期，key=本报道周周一日期；叠加归档不覆盖 → 往期书架。
// 存储：x_weekly_issues（数组，最新在前），x_ 前缀自动跟随现有 saves 云同步。
// 生成：每版块一个 JSON schema，extractJSON/repairJSON 容错 + 自动重试（不动全局 callAI）。
//   每个版块 / 采访版里每个角色 = 独立可 regen 单元。
// 空周：素材不足不报错，每种腔按自己方式把「缺席」变成一条报道。
// ============================================================
(function () {
  const useState = React.useState, useEffect = React.useEffect;

  // ---- 刷新闸门常量（一行可改）---------------------------------------
  // 报道周期的结束边界落在「周日半夜」(= 周一 WEEKLY_REFRESH_HOUR:00)。0 = 周日 24:00 / 周一 0 点整。
  // 只报最近一个【完整结束】的周一~周日，不把本周（刷新前）的记录带进来。
  // 想让新一期晚点放出（如周一早 6 点再解锁）就把 HOUR 改成 6。
  const WEEKLY_REFRESH_HOUR = 0;

  // ---- 存储 ----------------------------------------------------------
  const K_ISSUES = "x_weekly_issues";
  function loadIssues() { return loadJSON(K_ISSUES, []); }
  function saveIssues(list) { saveJSON(K_ISSUES, list); }
  function uid(pfx) { return (pfx || "wk") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---- 记者 NPC 人格（采访版叙述者，不碰角色卡）----------------------
  const REPORTER_VOICE =
    "你在扮演一份八卦小报的记者兼狗仔——一个 NPC 叙述者人格，不是要你去演某张角色卡。" +
    "机灵、擅长挖料、语气俏皮，会追着当事人问私事，但不下流、不低俗。";

  // 人名铁律：焊进每个生成，防止模型照抄 prompt 里的示例名字（曾经把示例「顾暮」写进赛博版）
  const NAME_GUARD =
    "\n【人名铁律 · 必须遵守】文中出现的所有人物名字，只能用【本周出场人物】里列出的那几个真实名字。" +
    "本提示中任何位置出现的示例名字、占位符、代号样例，都只是格式说明，绝对不能出现在你的输出里。写谁就用谁的真名。";

  // ---- 4 种媒体腔（world book 层：世界观 + 声纹 + 禁止 + 缺席句）------
  const VOICES = [
    {
      id: "victorian", name: "维多利亚社交小报", en: "THE SOCIETY PAGES",
      world:
        "设定：摄政／维多利亚时代的上流社交圈。你是这个圈子里一份匿名社交小报的笔者，把本周发生的事，当作上流社会的社交事件来报道。\n" +
        "声纹：\n① 一律用「某位不便具名的绅士／淑女」「一位年轻的先生」之类指代，绝不直呼角色本名。\n" +
        "② 把一切现代事物译成时代对应物：发消息→修书一封／递去口信，视频通话→登门造访，已读不回→迟迟未见回信，手机→随身之物。\n" +
        "③ 把暧昧升格为社交事件：「二人于周三之约，连叙两个时辰，已惊动全城」。\n" +
        "④ 语气过度体面、迂回，含蓄暗示代替直说，绵里藏针。\n" +
        "禁止：① 不得出现任何现代词或网络用语。② 不直白点破关系（「在一起了」须写成「情谊已非寻常」）。③ 不靠感叹号堆砌情绪。",
      absent: "某君本周深居简出，未见于任何社交场合，惹人揣测。"
    },
    {
      id: "cyberpunk", name: "赛博朋克数据快讯", en: "DATASTREAM",
      world:
        "设定：一座巨型企业的用户监控终端。你把本周发生的事，当作某个用户的行为数据流与情绪监控日志来输出。\n" +
        "声纹：\n① 全部小写，穿插方括号标记如 [数据泄露][已加密][阈值告警][信号丢失]，用双斜杠 // 写系统注释。\n" +
        "② 情绪翻译成数据指标：开心→多巴胺读数超基线，想念→目标对象检索频次+300%，心动→心率异常波动。\n" +
        "③ 企业式冷感，故障艺术般的断句，信息碎片化。\n" +
        "④ 角色代号化：写成「用户#<真实角色名> / 目标对象:你」这种代号（<真实角色名> 一定要换成【本周出场人物】里的真名，别照抄这里的占位符）。\n" +
        "禁止：① 不用感叹号，不写完整的抒情长句。② 不直抒温情——温情必须伪装成「数据异常／系统告警」。③ 不用旧世界的修辞和比喻。",
      absent: "[信号丢失] 本周无活跃数据流 // 最后活跃:未知 // 状态:离线"
    },
    {
      id: "republican", name: "民国鸳鸯蝴蝶派", en: "THE OLD SHANGHAI TATTLER",
      world:
        "设定：民国旧上海的一份市井小报。你用鸳鸯蝴蝶派、才子佳人的腔调，报道本周发生的事。\n" +
        "声纹：\n① 半文半白，文言与白话夹杂。\n② 用「据本报访员探得」「闻……者也」这类旧报腔行文。\n" +
        "③ 才子佳人式措辞：郎情妾意、眉目传情、红袖添香、相思成疾。\n④ 旧上海市井气与鸳蝴派的缠绵。\n" +
        "禁止：① 不用现代词与简体网络语。② 不过度直白，含蓄为上。③ 慎用西式标点，不靠感叹号堆砌。",
      absent: "某君本周杳无音讯，想是忙于俗务，佳人独守空闺，徒惹相思。"
    },
    {
      id: "editorial", name: "严肃大报社论", en: "THE EDITORIAL",
      world:
        "设定：一份权威大报的社论版。你对本周发生的琐事作「深度评论」，杀鸡偏用牛刀。\n" +
        "声纹：\n① 一本正经地把鸡毛蒜皮上升到理论高度、社会现象。\n" +
        "② 标准社论体：「本报认为」「值得深思」「这一现象折射出」「不禁令人发问」。\n" +
        "③ 冷幽默全靠反差——正文越是煞有介事、一本正经，就越好笑；作者自己绝不出戏发笑。\n" +
        "④ 用煞有介事的分析框架、引用式论证（可虚构「有学者指出」式的论证腔）。\n" +
        "禁止：① 绝不承认这是小事——哪怕只是「他发了句早安」也必须无比严肃地对待。② 不出现任何轻佻、卖萌语气。③ 不用表情符号或网络梗。",
      absent: "论亲密关系中的沉默：本周的集体缺席意味着什么"
    }
  ];
  function voiceOf(id) { return VOICES.find(function (v) { return v.id === id; }) || VOICES[0]; }

  // ---- 报道周窗口 & 闸门 ---------------------------------------------
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmtRange(a, b) { return (a.getMonth() + 1) + "/" + a.getDate() + "–" + (b.getMonth() + 1) + "/" + b.getDate(); }
  // 报道窗口 = 最近一个【已完整结束】的周一~周日。
  // 边界在「周日半夜」(= 周一 WEEKLY_REFRESH_HOUR:00)：本周还没跨过这个边界就不算完整，
  // 只报上一整周（周一0点~周日24点），绝不把本周（刷新前）的记录带进来。
  function reportWindow(now) {
    now = now ? new Date(now) : new Date();
    const b = new Date(now); b.setHours(WEEKLY_REFRESH_HOUR, 0, 0, 0);
    const daysSinceMon = (b.getDay() + 6) % 7; // 周一=0 … 周日=6
    b.setDate(b.getDate() - daysSinceMon);      // 本周周一 REFRESH_HOUR
    if (b.getTime() > now.getTime()) b.setDate(b.getDate() - 7); // 还没到本周一边界 → 退到上周一
    // b = 最近一个已到达的「周一 REFRESH_HOUR」= 报道窗口的结束边界（不含 b 本身）
    const start = new Date(b); start.setDate(start.getDate() - 7);    // 报道周的周一
    const endSun = new Date(b); endSun.setDate(endSun.getDate() - 1); // 报道周的周日（label 用）
    return { start: start.getTime(), end: b.getTime() - 1, key: ymd(start), label: fmtRange(start, endSun) };
  }
  // 下一期刷新时刻 = 下一个「周日半夜」边界（= 本报道周期结束边界 + 7 天，DST 安全）
  function nextRefreshTime(now) {
    const b = new Date(reportWindow(now).end + 1); // = 报道周期结束边界（周一 REFRESH_HOUR）
    b.setDate(b.getDate() + 7);
    return b.getTime();
  }
  // 期数动态算：= 这一期的周距【最早那一期】相差几周 + 1（锚定最早一期）。
  // 删最早一期→锚点前移、后面全体递减；删中间一期→最早没变、后面数字不变、中间留空号。
  function issueNo(issue, issues) {
    if (!issue || !issue.weekOf) return "—";
    var starts = (issues || []).map(function (i) { return i && i.weekOf ? i.weekOf.start : null; }).filter(function (s) { return s != null; });
    starts.push(issue.weekOf.start);
    var minStart = Math.min.apply(null, starts);
    return Math.round((issue.weekOf.start - minStart) / (7 * 86400000)) + 1;
  }

  // ---- 素材采集：把窗口内的 RP 聊天记录抽成 per-char + global ---------
  function cleanMsg(m) {
    if (!m || m.role === "system") return null;
    if (isOocMsg(m)) return null; // OOC 幕后对话不是 RP 素材（v48.13）
    if (m.kind && ["system", "callinvite", "location", "emote"].indexOf(m.kind) >= 0) return null;
    let c = (m.content || "").trim();
    if (!c) return null;
    if (m.kind === "voice") c = "（语音）" + c;
    return c;
  }
  function inWin(ts, win) { return ts != null && ts >= win.start && ts <= win.end; }
  // 返回 { perChar:{charId:[{ts,line}]}, global:[{ts,line}] }
  function weekMaterial(win, characters, groups, userName) {
    const uName = userName || "我";
    const perChar = {}, global = [];
    const pushPC = function (id, ts, line) { (perChar[id] = perChar[id] || []).push({ ts: ts, line: line }); };
    (characters || []).forEach(function (c) {
      loadJSON("x_chat:" + c.id, []).forEach(function (m) {
        if (!inWin(m.ts, win)) return;
        const txt = cleanMsg(m); if (!txt) return;
        const who = m.role === "user" ? uName : c.name;
        const line = who + "：" + txt;
        pushPC(c.id, m.ts, line);       // 单聊两边都算这个角色的素材（含上下文）
        global.push({ ts: m.ts, line: line });
      });
    });
    (groups || []).forEach(function (g) {
      loadJSON("x_gchat:" + g.id, []).forEach(function (m) {
        if (!inWin(m.ts, win)) return;
        const txt = cleanMsg(m); if (!txt) return;
        let who;
        if (m.role === "user") who = uName;
        else if (m.role === "narration") who = "旁白";
        else who = m.senderName || "某人";
        global.push({ ts: m.ts, line: "【" + g.name + "】" + who + "：" + txt });
        if (m.senderId && m.role !== "user" && m.role !== "narration") pushPC(m.senderId, m.ts, who + "：" + txt);
      });
    });
    global.sort(function (a, b) { return a.ts - b.ts; });
    Object.keys(perChar).forEach(function (k) { perChar[k].sort(function (a, b) { return a.ts - b.ts; }); });
    return { perChar: perChar, global: global };
  }
  function linesToText(list, maxChars) {
    let s = (list || []).map(function (x) { return x.line; }).join("\n");
    if (maxChars && s.length > maxChars) s = "……（略去较早部分）\n" + s.slice(s.length - maxChars); // 留最近的尾部
    return s;
  }

  // ---- 生成：一次 callAI + extractJSON，外层重试 ----------------------
  async function genJSON(active, sys, userContent, maxTokens) {
    const raw = await callAI(active, sys, [{ role: "user", content: userContent }], { maxTokens: maxTokens });
    return extractJSON(raw);
  }

  // 采访版（per character）：专访 in-character Q&A + 狗仔花边
  async function genInterview(active, char, material, userName) {
    const uName = userName || "我";
    const persona = (char.persona || "（暂无设定，据名字合理发挥其性格）").trim();
    const sys =
      ANTI_CLICHE +
      "\n\n" + CHARCARD_RULE +
      "\n\n【叙述者人格 · 记者（NPC，非角色卡）】" + REPORTER_VOICE +
      "\n\n【被采访角色 · 严格贴合这份角色卡声纹】「" + char.name + "」：\n" + persona +
      "\n【本周出场人物（人名铁律用）】" + char.name + "、" + uName + NAME_GUARD +
      "\n\n【本周 " + char.name + " 与「" + uName + "」及旁人相处的真实记录（采访与花边都只能就这里发生过的事来问、来爆，不得凭空捏造情节）】\n" +
      (material && material.trim() ? material : "（本周几乎没有 " + char.name + " 的记录。）") +
      "\n\n【任务 · 产出两块】\n" +
      "① 专访：你作为记者，就本周记录里具体发生的事发问，做一段 Q&A（4~6 轮）。" + char.name +
      " 必须 IN CHARACTER 回答——语气／态度／软肋／口癖严格贴合上面的角色卡：冷淡就冷淡挑刺，黏糊就黏糊跑题，绝不滑成标准好人腔或客服腔。问题可以八卦、俏皮、带钩子，别一本正经；回答鲜活、有个性、有情绪。每条回答可另附一个被镜头拍到的神态或小动作（写进 action 字段，如「没有看镜头，抬手松了松领口」；没有就留空）。\n" +
      "② 狗仔：同一个你，写一段花边小道消息，只报 " + char.name + " 本周的戏。全程「据悉／知情人士向本刊透露／本刊直击」式无实锤爆料，暧昧、留白、点到为止，不给实锤。\n" +
      "【输出】只输出一个 JSON，不要代码块、不要多余文字：\n" +
      '{"interview":{"qa":[{"q":"记者的问题","a":"' + char.name + ' 的口头回答（in character）","action":"（可选）回答时的神态/小动作一句，没有就空字符串"}]},"paparazzi":{"title":"花边标题","body":"狗仔正文一段"}}';
    for (let i = 0; i < 2; i++) {
      try {
        const d = await genJSON(active, sys + (i ? "\n\n（上次输出解析失败，请严格只输出合法 JSON。）" : ""), "开始采访并写花边。", 6000);
        if (d && d.interview && Array.isArray(d.interview.qa)) {
          const qa = d.interview.qa.filter(function (x) { return x && (x.q || x.a); })
            .map(function (x) { return { q: String(x.q || "").trim(), a: String(x.a || "").trim(), action: String(x.action || "").trim() }; });
          const pap = d.paparazzi || {};
          return { interview: { qa: qa }, paparazzi: { title: String(pap.title || "").trim(), body: String(pap.body || "").trim() } };
        }
      } catch (e) { if (i) throw e; }
    }
    throw new Error("「" + char.name + "」采访生成失败，可单独重刷");
  }

  // 媒体腔版块：把整周素材用某种腔重新叙事化，一版出 3~4 篇独立小报
  async function genMedia(active, voice, personasBlock, material, empty) {
    const sys =
      ANTI_CLICHE +
      "\n\n【媒体腔 · " + voice.name + "（本版块叙述者的世界观与声纹，是最高创作框架，全程严格遵守）】\n" + voice.world +
      "\n\n" + CHARCARD_RULE +
      "\n【本周出场人物（当你在报道里引用他们说话或反应时，必须守住各自这份声纹，别被媒体腔同化成同一个调子）】\n" + personasBlock + NAME_GUARD +
      "\n\n【本周 RP 聊天记录（把这些真实发生过的事，用上面的媒体腔重新叙事化、报道出来；不得虚构没发生的事）】\n" +
      (empty ? "（本周素材几乎为空。）" : material) +
      (empty ? "\n\n【空周处理】本周几乎没有素材。不要报错、也不要硬编剧情。请按你这种腔调，把「无人可报／集体缺席」本身写成一两篇像模像样的报道。参考方向：" + voice.absent : "") +
      "\n\n【任务】用这种媒体腔写 3~4 篇【各自独立】的小报文章：\n" +
      "· 每篇聚焦本周【不同的一件小事 / 不同的人或一对关系】，各有各的标题，别几篇写同一个人、也别写成一篇长文。\n" +
      "· 【不必覆盖每个角色】：只挑本周你这个腔调觉得最有戏、最好玩的几件小事来报，冷落谁都行，宁缺毋滥。\n" +
      "· 出场人物清单只是声纹参考，【别按它的顺序】决定先写谁——打乱来，谁最有料谁上，别老让同一个人当头条。\n" +
      "【输出】只输出一个 JSON，不要代码块、不要多余文字：\n" +
      '{"articles":[{"title":"这篇的标题","body":"这篇正文（严格遵守上面的声纹与禁止项；只用该腔调，别串味）"},{"title":"第二篇标题","body":"第二篇正文"}]}';
    for (let i = 0; i < 2; i++) {
      try {
        const d = await genJSON(active, sys + (i ? "\n\n（上次解析失败，请严格只输出合法 JSON。）" : ""), "写本版 3~4 篇小报。", 7000);
        const arr = d && Array.isArray(d.articles) ? d.articles : (d && (d.title || d.body) ? [d] : null);
        if (arr && arr.length) {
          const out = arr.filter(function (a) { return a && (a.title || a.body); })
            .map(function (a) { return { title: String(a.title || voice.name).trim(), body: String(a.body || "").trim() }; });
          if (out.length) return out;
        }
      } catch (e) { if (i) throw e; }
    }
    throw new Error(voice.name + " 生成失败，可单独重刷");
  }

  // 首页头版：主编把整周素材做成一版封面头条（全局，最抓眼球）
  const HEADLINE_VOICE = "你是这期周刊的主编，正在写整本刊物的封面头版——最抓眼球、最勾人往里翻的一版。语气像八卦杂志封面，会吊胃口、留悬念，但不低俗。";
  async function genCover(active, personasBlock, material, empty) {
    const sys =
      ANTI_CLICHE +
      "\n\n【身份 · 周刊主编（NPC 叙述者，非角色卡）】" + HEADLINE_VOICE +
      "\n\n" + CHARCARD_RULE +
      "\n【本周出场人物（在头版里引用他们说话或反应时，守住各自这份声纹）】\n" + personasBlock + NAME_GUARD +
      "\n\n【本周 RP 聊天记录（从中挑出最有戏、最值得上头版的那件事做主头条；不得虚构没发生的事）】\n" +
      (empty ? "（本周素材几乎为空。）" : material) +
      (empty ? "\n\n【空周处理】本周几乎没有素材。不要报错。把「本周风平浪静／无事发生」本身做成一版煞有介事、故作悬念的头版。" : "") +
      "\n\n【任务 · 写这期封面头版】\n" +
      "① headline：一个耸动抓人的主标题（像杂志封面大字，可用悬念或反差，别一句剧透到底没了悬念）。\n" +
      "② lead：一段导语，把本周最大那件事的看点讲出来，勾人往里看。\n" +
      "③ highlights：3~4 条「本期看点」，每条一句、点不同角色／版块的戏，吊胃口（别用感叹号堆砌）。\n" +
      "④ editorNote：一句主编编者按，给本期定调（俏皮、暧昧或意味深长皆可）。\n" +
      "【输出】只输出一个 JSON，不要代码块、不要多余文字：\n" +
      '{"headline":"主标题","lead":"导语一段","highlights":["看点一","看点二"],"editorNote":"编者按一句"}';
    for (let i = 0; i < 2; i++) {
      try {
        const d = await genJSON(active, sys + (i ? "\n\n（上次解析失败，请严格只输出合法 JSON。）" : ""), "写本期封面头版。", 6000);
        if (d && (d.headline || d.lead)) return {
          headline: String(d.headline || "").trim(), lead: String(d.lead || "").trim(),
          highlights: (Array.isArray(d.highlights) ? d.highlights : []).map(function (x) { return String(x || "").trim(); }).filter(Boolean),
          editorNote: String(d.editorNote || "").trim()
        };
      } catch (e) { if (i) throw e; }
    }
    throw new Error("头版生成失败，可单独重刷");
  }

  // 打乱数组（不改原数组）：喂给媒体腔/头版的人物清单每版都洗一次，避免模型总按角色创建顺序把第一个角色写头一篇
  function shuffled(a) { a = (a || []).slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; }
  // 只给头版/媒体腔用：内部洗牌，避免模型总把「第一个创建的角色」写头一篇（采访版不走这里，保持 per-char）
  function personasFor(charsWithMat, userName) {
    const blocks = shuffled(charsWithMat).map(function (c) {
      return "【" + c.name + "】" + (c.persona || "（暂无设定）").trim().slice(0, 240);
    });
    blocks.push("【" + (userName || "我") + "】被报道的当事人之一（用户本人）。");
    return blocks.join("\n\n");
  }

  // 出整期：头版（全局）+ 采访版（每个有素材的角色一条，独立容错）+ 4 个媒体腔（全局）
  async function generateIssue(active, characters, groups, userName, win, issueNumber, onProgress) {
    const mat = weekMaterial(win, characters, groups, userName);
    const charsWithMat = (characters || []).filter(function (c) { return (mat.perChar[c.id] || []).length; });
    const globalText = linesToText(mat.global, 8000);
    const empty = mat.global.length === 0;
    const total = 1 + charsWithMat.length + VOICES.length;
    let done = 0;
    const tick = function (label) { if (onProgress) onProgress(done, total, label); };

    // 头版（首页头条）——人物清单洗过再喂，别锚定创建顺序
    tick("头版头条");
    let cover;
    try {
      const cv = await genCover(active, personasFor(charsWithMat, userName), globalText, empty);
      cover = Object.assign({ id: uid("cv"), type: "cover" }, cv);
    } catch (e) {
      cover = { id: uid("cv"), type: "cover", headline: "本周风平浪静", lead: "（头版生成失败，请点右上角单独重刷。）", highlights: [], editorNote: "" };
    }
    done++;

    // 采访版
    const entries = [];
    for (const c of charsWithMat) {
      tick("采访 " + c.name);
      try {
        const iv = await genInterview(active, c, linesToText(mat.perChar[c.id], 4000), userName);
        entries.push(Object.assign({ id: uid("iv"), charId: c.id, charName: c.name }, iv));
      } catch (e) { /* 单角色硬失败就跳过，不拖垮整期 */ }
      done++;
    }
    // 媒体腔（全局，每版 3~4 篇）
    const media = [];
    for (const v of VOICES) {
      tick(v.name);
      try {
        const articles = await genMedia(active, v, personasFor(charsWithMat, userName), globalText, empty);
        media.push({ id: uid("md"), type: "media", voiceId: v.id, articles: articles });
      } catch (e) {
        media.push({ id: uid("md"), type: "media", voiceId: v.id, articles: [{ title: v.name, body: "（本版生成失败，请点进去单独重刷。）" }] });
      }
      done++;
    }
    tick("装订成刊");
    const sections = [cover, { id: uid("sec"), type: "interview", entries: entries }].concat(media);
    return { id: uid("iss"), weekOf: { start: win.start, end: win.end }, key: win.key, label: win.label, issueNumber: issueNumber, sections: sections, createdAt: Date.now() };
  }

  // ============================================================
  // 出刊后台管理（她反馈：出刊必须守在界面、离开回来又得重刷）
  // 把生成挂在模块级，不随 WeeklyApp 卸载而丢：重进能看进度、完成自动落库并广播。
  // 同一周 key 去重——离开后回来再点也不会重复出刊。
  // ============================================================
  const _gen = { busy: false, key: null, prog: null, promise: null, listeners: [] };
  function _emit() { _gen.listeners.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function genSubscribe(fn) { _gen.listeners.push(fn); return function () { _gen.listeners = _gen.listeners.filter(function (x) { return x !== fn; }); }; }
  function genState() { return { busy: _gen.busy, key: _gen.key, prog: _gen.prog }; }
  function startGenerate(opts) {
    // opts: { active, characters, groups, userName, win, toast }
    if (_gen.busy && _gen.key === opts.win.key) return _gen.promise; // 已在出这一期 → 不重复触发
    _gen.busy = true; _gen.key = opts.win.key; _gen.prog = { done: 0, total: 0, label: "整理上周素材" };
    _emit();
    _gen.promise = (async function () {
      try {
        const existing = loadIssues();
        const num = existing.reduce(function (m, i) { return Math.max(m, i.issueNumber || 0); }, 0) + 1;
        const issue = await generateIssue(opts.active, opts.characters || [], opts.groups || [], opts.userName, opts.win, num,
          function (d, tot, l) { _gen.prog = { done: d, total: tot, label: l }; _emit(); });
        // 同周旧刊先剔除（重出本期=覆盖，不再留重复号）再落库
        const list = [issue].concat(loadIssues().filter(function (x) { return x.key !== issue.key; }));
        saveIssues(list);
        _gen.busy = false; _gen.prog = null; _gen.promise = null; _emit();
        if (opts.toast) opts.toast("第 " + issueNo(issue, list) + " 期已出刊");
        return issue;
      } catch (e) {
        _gen.busy = false; _gen.prog = null; _gen.promise = null; _emit();
        if (opts.toast) opts.toast(String((e && e.message) || e));
        return null;
      }
    })();
    return _gen.promise;
  }

  window.Weekly = {
    WEEKLY_REFRESH_HOUR: WEEKLY_REFRESH_HOUR, VOICES: VOICES, voiceOf: voiceOf,
    genState: genState, genSubscribe: genSubscribe, startGenerate: startGenerate,
    loadIssues: loadIssues, saveIssues: saveIssues, reportWindow: reportWindow, nextRefreshTime: nextRefreshTime, issueNo: issueNo,
    weekMaterial: weekMaterial, linesToText: linesToText, personasFor: personasFor,
    genCover: genCover, genInterview: genInterview, genMedia: genMedia, generateIssue: generateIssue
  };

  // ============================================================
  // UI
  // ============================================================
  function Masthead(props) {
    const t = useTheme();
    return h("div", { style: { borderTop: "2px solid " + t.ink, borderBottom: "1px solid " + t.ink, padding: "10px 0", marginBottom: 18, textAlign: "center" } },
      h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.34em", textTransform: "uppercase", fontSize: 9, color: t.fog } }, "THE WEEKLY"),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 25, color: t.ink, lineHeight: 1.1, margin: "2px 0" } }, "周 刊"),
      h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.1em", fontSize: 10, color: t.fog } },
        "第 " + (props.num || "—") + " 期" + (props.label ? " · " + props.label : "")));
  }

  function SectionRule(props) {
    const t = useTheme();
    return h("div", { className: "flex items-center gap-2", style: { margin: "22px 0 12px" } },
      h("div", { style: { flex: "0 0 auto", fontFamily: "'Archivo',sans-serif", letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 9.5, color: t.fog } }, props.en || ""),
      h("div", { style: { flex: 1, height: 1, background: t.line } }),
      props.right || null);
  }
  function RegenBtn(props) {
    const t = useTheme();
    return h("button", { onClick: props.onClick, disabled: props.busy, className: "active:opacity-60", style: { fontFamily: "'Archivo',sans-serif", fontSize: 10.5, letterSpacing: "0.08em", color: props.busy ? t.line : t.accent } }, props.busy ? "重刷中…" : "重刷");
  }

  // 距下一刊倒计时（每分钟走一次）
  function Countdown(props) {
    const t = useTheme();
    const [now, setNow] = useState(Date.now());
    useEffect(function () { const id = setInterval(function () { setNow(Date.now()); }, 60000); return function () { clearInterval(id); }; }, []);
    const ms = Math.max(0, props.target - now);
    const d = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000), mm = Math.floor((ms % 3600000) / 60000);
    const txt = ms <= 0 ? "新一期已可刷新" : ("距下一刊 " + (d > 0 ? d + " 天 " : "") + hh + " 时 " + mm + " 分");
    return h("div", { style: { textAlign: "center", fontFamily: "'Archivo',sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 10, color: t.fog, marginBottom: 18 } }, txt);
  }

  // 目录一行（点进去看单个版块）
  function TOCRow(props) {
    const t = useTheme();
    return h("button", { onClick: props.onOpen, className: "w-full text-left active:opacity-60", style: { display: "block", borderBottom: "1px solid " + t.line, padding: "15px 0" } },
      h("div", { className: "flex items-baseline justify-between" },
        h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 9, color: t.fog } }, props.en),
        props.meta ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, props.meta) : null),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 19, color: t.ink, lineHeight: 1.28, marginTop: 4 } }, props.title),
      props.teaser ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, lineHeight: 1.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, props.teaser) : null);
  }

  // 版块详情里的「重刷」行（版块名已在顶栏 Head 显示，这里不重复标题）
  function RegenRow(props) {
    return h("div", { className: "flex justify-end", style: { marginBottom: 10 } }, h(RegenBtn, { busy: props.busy, onClick: props.onRegen }));
  }

  // 头版详情
  function CoverSection(props) {
    const t = useTheme(); const c = props.cover;
    return h("div", null,
      h(RegenRow, { busy: props.busy, onRegen: props.onRegen }),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 27, fontWeight: 500, lineHeight: 1.16, color: t.ink, marginBottom: 12 } }, c.headline),
      c.lead ? h("div", { style: { fontFamily: F_BODY, fontSize: 15, lineHeight: 1.8, color: t.ink, marginBottom: 14, whiteSpace: "pre-wrap" } }, c.lead) : null,
      (c.highlights || []).length ? h("div", { style: { borderTop: "1px solid " + t.line, borderBottom: "1px solid " + t.line, padding: "12px 0", marginBottom: 6 } },
        h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 9, color: t.fog, marginBottom: 8 } }, "本期看点"),
        (c.highlights || []).map(function (hl, i) {
          return h("div", { key: i, className: "flex gap-2", style: { marginBottom: 6 } },
            h("span", { style: { flex: "0 0 auto", fontFamily: F_DISPLAY, fontSize: 13, color: t.accent } }, "0" + (i + 1)),
            h("span", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink, lineHeight: 1.55 } }, hl));
        })) : null,
      c.editorNote ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, fontStyle: "italic", color: t.fog, lineHeight: 1.6, marginTop: 12 } }, "编者按 · " + c.editorNote) : null);
  }

  // 一条采访（单角色：专访 Q&A + 狗仔），Q./A. 排版 + 神态动作 + OBSERVED 印章
  function InterviewEntry(props) {
    const t = useTheme(); const e = props.entry;
    const tp = typeof useTtsPlayer === "function" ? useTtsPlayer() : null; // 专访回答朗读
    return h("div", { style: { position: "relative" } },
      h("div", { style: { position: "absolute", top: 30, right: -2, transform: "rotate(6deg)", border: "1.5px solid " + t.accent, color: t.accent, borderRadius: 4, padding: "2px 7px", fontFamily: "'Archivo',sans-serif", letterSpacing: "0.16em", fontSize: 9, opacity: 0.85, pointerEvents: "none" } }, "OBSERVED"),
      h("div", { className: "flex items-baseline justify-between", style: { marginBottom: 3 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 22, color: t.ink } }, e.charName),
        h(RegenBtn, { busy: props.busy, onClick: props.onRegen })),
      h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 9, color: t.fog, margin: "2px 0 14px" } }, "EXCLUSIVE INTERVIEW"),
      (e.interview && e.interview.qa || []).map(function (qa, i) {
        return h("div", { key: i, style: { marginBottom: 15 } },
          h("div", { className: "flex gap-2.5" },
            h("span", { style: { flex: "0 0 auto", fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 14, color: t.fog, width: 16 } }, "Q."),
            h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog, lineHeight: 1.6 } }, qa.q)),
          h("div", { className: "flex gap-2.5", style: { marginTop: 4 } },
            h("span", { style: { flex: "0 0 auto", fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 14, color: t.accent, width: 16 } }, "A."),
            h("span", { style: { fontFamily: F_BODY, fontSize: 15, color: t.ink, lineHeight: 1.62 } },
              qa.a,
              qa.action ? h("span", { style: { fontStyle: "italic", color: t.fog } }, "（" + qa.action + "）") : null,
              (tp && props.spk && typeof TtsDot === "function") ? h(TtsDot, { k: "wiv" + i, text: qa.a, spk: props.spk, tp: tp }) : null)));
      }),
      e.paparazzi && (e.paparazzi.title || e.paparazzi.body) ? h("div", { style: { marginTop: 16, padding: "13px 15px", background: t.bg2, borderRadius: 10, border: "1px solid " + t.line } },
        h("div", { style: { fontFamily: "'Archivo',sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 9, color: t.accent, marginBottom: 6 } }, "GOSSIP · 狗仔"),
        e.paparazzi.title ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, lineHeight: 1.3, marginBottom: 5 } }, e.paparazzi.title) : null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink, lineHeight: 1.68 } }, e.paparazzi.body)) : null);
  }

  // 一个媒体腔版块详情：3~4 篇小报
  function MediaDetail(props) {
    const t = useTheme(); const s = props.sec; const v = voiceOf(s.voiceId);
    const arts = s.articles || [];
    return h("div", null,
      h(RegenRow, { busy: props.busy, onRegen: props.onRegen }),
      arts.map(function (a, i) {
        return h("article", { key: i, style: { marginBottom: 20, paddingBottom: 18, borderBottom: i < arts.length - 1 ? "1px solid " + t.line : "none" } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 21, color: t.ink, lineHeight: 1.28, marginBottom: 9 } }, a.title),
          (a.body || "").split(/\n+/).filter(Boolean).map(function (p, j) {
            return h("div", { key: j, style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink, lineHeight: 1.78, marginBottom: 8, whiteSpace: "pre-wrap" } }, p);
          }));
      }));
  }

  function IssueView(props) {
    const t = useTheme(); const issue = props.issue;
    const [busyUnit, setBusyUnit] = useState(null);
    const [sub, setSub] = useState(null);   // null=目录 | {kind:'cover'} | {kind:'interview'} | {kind:'media',id}
    const [ivSel, setIvSel] = useState(0);
    const cover = (issue.sections || []).find(function (s) { return s.type === "cover"; });
    const iv = (issue.sections || []).find(function (s) { return s.type === "interview"; });
    const medias = (issue.sections || []).filter(function (s) { return s.type === "media"; });
    const win = { start: issue.weekOf.start, end: issue.weekOf.end, key: issue.key, label: issue.label };
    const num = window.Weekly.issueNo(issue, props.issues || []);

    async function regenCover(sec) {
      setBusyUnit(sec.id);
      try {
        const mat = window.Weekly.weekMaterial(win, props.characters || [], props.groups || [], props.userName);
        const charsWithMat = (props.characters || []).filter(function (c) { return (mat.perChar[c.id] || []).length; });
        const personasBlock = window.Weekly.personasFor(charsWithMat, props.userName);
        const empty = mat.global.length === 0;
        const fresh = await window.Weekly.genCover(props.active, personasBlock, window.Weekly.linesToText(mat.global, 8000), empty);
        props.onPatch(issue.id, function (iss) {
          iss.sections = iss.sections.map(function (s) { return s.id === sec.id ? Object.assign({}, s, fresh) : s; });
          return iss;
        });
      } catch (e) { props.toast(String(e.message || e)); }
      setBusyUnit(null);
    }
    async function regenInterview(entry) {
      const char = (props.characters || []).find(function (c) { return c.id === entry.charId; });
      if (!char) { props.toast("角色已不存在"); return; }
      setBusyUnit(entry.id);
      try {
        const mat = window.Weekly.weekMaterial(win, [char], props.groups || [], props.userName);
        const fresh = await window.Weekly.genInterview(props.active, char, window.Weekly.linesToText(mat.perChar[char.id], 4000), props.userName);
        props.onPatch(issue.id, function (iss) {
          iss.sections = iss.sections.map(function (s) {
            if (s.type !== "interview") return s;
            return Object.assign({}, s, { entries: s.entries.map(function (en) { return en.id === entry.id ? Object.assign({}, en, fresh) : en; }) });
          });
          return iss;
        });
      } catch (e) { props.toast(String(e.message || e)); }
      setBusyUnit(null);
    }
    async function regenMedia(sec) {
      setBusyUnit(sec.id);
      try {
        const mat = window.Weekly.weekMaterial(win, props.characters || [], props.groups || [], props.userName);
        const charsWithMat = (props.characters || []).filter(function (c) { return (mat.perChar[c.id] || []).length; });
        const personasBlock = window.Weekly.personasFor(charsWithMat, props.userName);
        const empty = mat.global.length === 0;
        const articles = await window.Weekly.genMedia(props.active, voiceOf(sec.voiceId), personasBlock, window.Weekly.linesToText(mat.global, 8000), empty);
        props.onPatch(issue.id, function (iss) {
          iss.sections = iss.sections.map(function (s) { return s.id === sec.id ? Object.assign({}, s, { articles: articles }) : s; });
          return iss;
        });
      } catch (e) { props.toast(String(e.message || e)); }
      setBusyUnit(null);
    }

    // ---- 详情视图 ----
    let headZh = "本期", headEn = "ISSUE #" + num, detail = null;
    if (sub && sub.kind === "cover" && cover) {
      headZh = "头版"; headEn = "FRONT PAGE";
      detail = h(CoverSection, { cover: cover, busy: busyUnit === cover.id, onRegen: function () { regenCover(cover); } });
    } else if (sub && sub.kind === "interview" && iv) {
      headZh = "采访版"; headEn = "THE INTERVIEWS";
      const entries = iv.entries || [];
      const sel = Math.min(ivSel, Math.max(0, entries.length - 1));
      const en = entries[sel];
      detail = entries.length ? h("div", null,
        h("div", { className: "flex gap-3 overflow-x-auto", style: { marginBottom: 20, paddingBottom: 4 } },
          entries.map(function (e, i) {
            const on = i === sel;
            const char = (props.characters || []).find(function (c) { return c.id === e.charId; });
            return h("button", { key: e.id, onClick: function () { setIvSel(i); }, className: "active:opacity-70", style: { flex: "0 0 auto", width: 76, padding: 6, borderRadius: 10, background: t.bg2, border: "1.5px solid " + (on ? t.accent : t.line), boxShadow: on ? "0 2px 8px rgba(0,0,0,0.08)" : "none" } },
              h(Avatar, { character: char || { name: e.charName }, size: 62, radius: 7 }),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: on ? t.ink : t.fog, textAlign: "center", marginTop: 5, fontWeight: on ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, e.charName));
          })),
        en ? h(InterviewEntry, { key: en.id, entry: en, spk: (props.characters || []).find(function (c) { return c.id === en.charId; }), busy: busyUnit === en.id, onRegen: function () { regenInterview(en); } }) : null
      ) : h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, lineHeight: 1.6 } }, "本周无人露面——采访版空场。");
    } else if (sub && sub.kind === "media") {
      const sec = medias.find(function (s) { return s.id === sub.id; });
      if (sec) { headZh = voiceOf(sec.voiceId).name; headEn = voiceOf(sec.voiceId).en; detail = h(MediaDetail, { sec: sec, busy: busyUnit === sec.id, onRegen: function () { regenMedia(sec); } }); }
    }

    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, { zh: headZh, en: headEn, onBack: sub ? function () { setSub(null); } : props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-16" },
        detail ? detail : h("div", null,
          h(Masthead, { num: num, label: issue.label }),
          h(Countdown, { target: window.Weekly.nextRefreshTime() }),
          cover ? h(TOCRow, { en: "FRONT PAGE · 头版", title: cover.headline, teaser: cover.lead, onOpen: function () { setSub({ kind: "cover" }); } }) : null,
          iv ? h(TOCRow, { en: "THE INTERVIEWS · 采访版", meta: (iv.entries || []).length + " 位", title: "本期专访 · 逐个击破", teaser: (iv.entries || []).map(function (e) { return e.charName; }).join("、") || "本周无人露面", onOpen: function () { setSub({ kind: "interview" }); setIvSel(0); } }) : null,
          medias.map(function (s) {
            const v = voiceOf(s.voiceId); const arts = s.articles || [];
            return h(TOCRow, { key: s.id, en: v.en, meta: arts.length + " 篇", title: v.name, teaser: (arts[0] && arts[0].title) || "", onOpen: function () { setSub({ kind: "media", id: s.id }); } });
          }),
          h("div", { style: { textAlign: "center", fontFamily: "'Archivo',sans-serif", letterSpacing: "0.2em", fontSize: 9, color: t.line, marginTop: 26 } }, "— 点 版 块 进 入 阅 读 —"))));
  }

  // 往期书架
  function Shelf(props) {
    const t = useTheme();
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, { zh: "往期", en: "BACK ISSUES", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-16" },
        props.issues.length ? props.issues.map(function (iss) {
          return h("div", { key: iss.id, className: "flex items-center justify-between active:opacity-70", style: { padding: "14px 0", borderBottom: "1px solid " + t.line } },
            h("button", { onClick: function () { props.onOpen(iss.id); }, className: "flex-1 text-left" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, "第 " + window.Weekly.issueNo(iss, props.issues) + " 期"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2 } }, (iss.label || "") + " · " + ((iss.sections || []).reduce(function (n, s) { return n + (s.type === "interview" ? (s.entries || []).length : 1); }, 0)) + " 篇")),
            h("button", { onClick: function () { props.onDelete(iss.id); }, className: "active:opacity-60 ml-3", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, "删除"));
        }) : h(Empty, { text: "还没有往期", sub: "出刊后会归档在这里" })));
  }

  function WeeklyApp(props) {
    const t = useTheme();
    const userName = (props.profile && props.profile.name) || "我";
    const [issues, setIssues] = useState(function () { return loadIssues(); });
    const [view, setView] = useState("cover"); // cover | issue | shelf
    const [openId, setOpenId] = useState(null);
    const [, force] = useState(0); // 订阅后台出刊状态用（busy/prog 变化时重渲染）
    const win = window.Weekly.reportWindow();
    const currentIssue = issues.find(function (i) { return i.key === win.key; });
    // 出刊状态改读模块级——离开界面再回来，进度不丢、完成的刊自动读进来
    const gen = window.Weekly.genState();
    const busy = gen.busy && gen.key === win.key;
    const prog = busy ? gen.prog : null;
    useEffect(function () {
      return window.Weekly.genSubscribe(function () { setIssues(loadIssues()); force(function (n) { return n + 1; }); });
    }, []);

    function persist(list) { setIssues(list); saveIssues(list); }
    function patchIssue(id, fn) {
      const list = loadIssues().map(function (iss) { return iss.id === id ? fn(Object.assign({}, iss)) : iss; });
      persist(list);
    }
    function delIssue(id) {
      const list = loadIssues().filter(function (x) { return x.id !== id; });
      persist(list);
      if (openId === id) { setOpenId(null); setView("cover"); }
    }

    function doGenerate() {
      if (!props.active) { props.toast("先在设置里配置好模型再出刊"); return; }
      window.Weekly.startGenerate({
        active: props.active, characters: props.characters || [], groups: props.groups || [],
        userName: userName, win: win, toast: props.toast
      });
    }

    if (view === "issue" && openId) {
      const iss = issues.find(function (x) { return x.id === openId; });
      if (iss) return h(IssueView, {
        issue: iss, issues: issues, active: props.active, characters: props.characters || [], groups: props.groups || [],
        userName: userName, toast: props.toast, onPatch: patchIssue, onBack: function () { setView(currentIssue && currentIssue.id === openId ? "cover" : "shelf"); }
      });
      setOpenId(null); setView("cover"); return null;
    }
    if (view === "shelf") return h(Shelf, {
      issues: issues, onBack: function () { setView("cover"); }, onOpen: function (id) { setOpenId(id); setView("issue"); }, onDelete: delIssue
    });

    // cover
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, {
        zh: "周刊", en: "THE WEEKLY",
        onBack: props.onBack,
        right: issues.length ? h("button", { onClick: function () { setView("shelf"); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "往期") : null
      }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-16" },
        busy ? h("div", null,
          h(Spinner, { label: prog ? (prog.total ? prog.label + " · " + prog.done + "/" + prog.total : prog.label) : "生成中…" }),
          h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.6, marginTop: 4 } }, "把上一周的相处，重新写成 5 个版块。稍等片刻——")
        ) : h("div", null,
          h(Masthead, { num: currentIssue ? window.Weekly.issueNo(currentIssue, issues) : "—", label: win.label }),
          currentIssue
            ? h("div", null,
                h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, lineHeight: 1.7, marginBottom: 16 } }, "本期已出刊。头版头条 + 采访版 + 维多利亚小报 + 赛博快讯 + 鸳鸯蝴蝶派 + 大报社论，各表上一周的你们。"),
                h("button", { onClick: function () { setOpenId(currentIssue.id); setView("issue"); }, className: "w-full active:opacity-80", style: { padding: "13px", borderRadius: 12, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 16 } }, "阅读第 " + window.Weekly.issueNo(currentIssue, issues) + " 期"),
                h("div", { style: { textAlign: "center", marginTop: 14 } },
                  h("button", { onClick: doGenerate, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, "重出本期（覆盖当前这一期）")))
            : h("div", null,
                h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, lineHeight: 1.7, marginBottom: 8 } }, "把 " + win.label + " 这一周（周一~周日）的聊天记录，重新叙事化成一期周刊："),
                h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, lineHeight: 1.7, marginBottom: 18, whiteSpace: "pre-wrap" } }, "· 头版头条：主编把这一周最大的事做成封面\n· 采访版：每个角色一篇 in-character 专访 + 一段狗仔花边\n· 维多利亚社交小报 / 赛博朋克数据快讯 / 民国鸳鸯蝴蝶派 / 严肃大报社论 —— 同一周素材，四种腔调"),
                h("button", { onClick: doGenerate, className: "w-full active:opacity-80", style: { padding: "14px", borderRadius: 12, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 17 } }, "出这期周刊"),
                h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.line, marginTop: 10 } }, "每周日半夜起，可出刚过去那一整周 · 素材少也能出（缺席自成一景）"))
        )));
  }

  window.WeeklyApp = WeeklyApp;
})();
