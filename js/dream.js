// ============================================================
// 梦境（dream）—— 进入角色的梦，不是聊天框
// · 这场梦属于某个角色、为 Ta 而做，顺着 Ta 内心的渴望/执念/恐惧铺展
// · 我（user）是闯进梦里的客人，不能自由行动，只能在 char 给的选项里选
// · 每幕 3 个选项：2 个是这场梦所期待/顺应的，1 个是 char 内心抗拒的
//   —— 字面上分不出哪个是哪个；选到「抗拒」项 → 梦碎、被惊醒踢出梦境
//   —— 一直没选到抗拒，剧情就一直往深处走下去
// · 可同时开很多场梦；发起时可递 3 个关键词，让 char 把它们编进梦里
// 存 localStorage x_dream_saves（随云同步）；模型走全局 callAI + ANTI_CLICHE。
// 记忆不互通：只把最近聊天当语气参考，梦醒后什么都不写回记忆库。
// ============================================================
(function () {
  const ACCENT = "#6a5b86";      // 梦的主色（雾紫）
  const AC = () => (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "");
  const NAC = () => (typeof NARRATIVE_ANTI_CLICHE !== "undefined" ? NARRATIVE_ANTI_CLICHE + "\n\n" : "");
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function loadSaves() { return loadJSON("x_dream_saves", []); }
  function saveSaves(list) { saveJSON("x_dream_saves", list); }

  // 角色最近聊天抓一小段，仅当语气/近况参考（梦醒后不写回）
  function recentChatSnippet(charId, uName, charName) {
    const msgs = loadJSON("x_chat:" + charId, []);
    if (!msgs.length) return "";
    return msgs.slice(-12)
      .filter(m => m && (m.content || "").trim() && (m.role === "user" || m.role === "assistant"))
      .map(m => (m.role === "user" ? uName : charName) + "：" + String(m.content).replace(/\s+/g, " ").slice(0, 80))
      .join("\n");
  }

  // 已发生的梦（喂续写用）：每幕叙事 + 我当时选了什么
  function transcript(session, uName) {
    const lines = [];
    (session.scenes || []).forEach((sc, i) => {
      lines.push("〔第" + (i + 1) + "幕〕" + String(sc.text || "").replace(/\s+/g, " "));
      if (sc.chosen != null && sc.options && sc.options[sc.chosen]) {
        lines.push("（" + uName + "选择了：" + sc.options[sc.chosen].text + "）");
      }
    });
    return lines.join("\n").slice(-4000);
  }

  // 校验/归一模型给的选项：确保是 3 个、恰好 1 个 resist（抗拒），其余 accord；再打乱顺序
  function normOptions(raw) {
    let opts = (Array.isArray(raw) ? raw : [])
      .map(o => ({ text: String((o && o.text) || "").trim(), kind: (o && o.kind) === "resist" ? "resist" : "accord" }))
      .filter(o => o.text);
    if (opts.length < 3) return null;
    opts = opts.slice(0, 3);
    const resists = opts.filter(o => o.kind === "resist");
    if (resists.length === 0) opts[opts.length - 1].kind = "resist";          // 一个都没标 → 最后一个当抗拒
    else if (resists.length > 1) {                                            // 标多了 → 只留第一个抗拒
      let kept = false;
      opts = opts.map(o => o.kind === "resist" ? (kept ? { text: o.text, kind: "accord" } : (kept = true, o)) : o);
    }
    return shuffle(opts);
  }

  // stage: open 入梦 / rise 渐深 / deep 临近梦核；canFinal 允许模型标可收束；forceFinal 本幕必须逼到梦核边缘
  function sceneRules(cotT, opts) {
    opts = opts || {};
    const nm = opts.charName || "做梦人";
    const stage = opts.stage || "open";
    const stageLine = stage === "open"
      ? "· 【这一幕的位置：入梦】把梦的门推开、把客人放进去，先立起一个【具体、抓得住】的场景（有地点、有在场的人或物、有正在发生的事），一眼看得出这是「" + nm + "」的梦。"
      : stage === "deep"
      ? "· 【这一幕的位置：临近梦核】梦该收拢了：朝这场梦真正围着转的那个东西（" + nm + " 心里最深的渴望，或最怕、最不愿面对的真相）逼近，让它快浮出水面——别再横向铺无关的新枝节。"
      : "· 【这一幕的位置：渐深】让上一幕的场景/人/意象【变形、复现或被推翻升级】，把情绪与张力往上顶一档、推出新的情节转折，别平移、别复读上一幕。";
    const finalLine = opts.forceFinal
      ? "\n· 【这场梦已经够深了】这一幕写成「就差最后一步就能抵达梦核」的临界感，并把 final 设为 true。"
      : opts.canFinal
      ? "\n· 若你判断梦已经走到了它核心的边缘、再顺一步就该抵达并揭开那个最深的东西，就把 final 设为 true（否则 false）——抵达与否交给客人下一次选择。"
      : "";
    return "\n\n【怎么写这一幕】\n" +
      stageLine + "\n" +
      "· 用第二人称『你』，130~280 字。氛围要像梦：细节鲜明却哪里不对劲、逻辑会打滑、情绪被放大——但【必须有具体发生的情节】（场景＋对象＋动作/对话/事件），不能是纯情绪、纯意识流的漂浮描写。梦可以怪诞，但始终要有抓得住的东西在推进，别越写越虚。\n" +
      "· 【角色色彩·硬要求】这一幕的场景、出现的人、反复的意象，都要从「" + nm + "」自己的人设、Ta 和你的关系、Ta 的近况里长出来，是【只有 Ta 会做的梦】——把人物、地点、心结换成别人就不成立。绝不写放之四海皆准的通用梦意象堆砌。\n" +
      "· 然后给『你』三个可做的回应/行动：其中【两个】顺着这场梦、能让它继续往下走；【剩一个】戳到 " + nm + " 内心抗拒、不愿被打破的东西，一旦选中梦就碎。三个字面上都像合理选择，别露出哪个安全哪个危险、别用语气暗示；抗拒项是「看着无害、却恰好碰了逆鳞」。" +
      finalLine +
      (typeof cotSystemBlock === "function" ? cotSystemBlock(cotT) : "") +
      "\n【输出】只输出 JSON：{" + (typeof cotJsonField === "function" ? cotJsonField(cotT) : "") + "\"scene\":\"梦境叙事\"," + ((opts.canFinal || opts.forceFinal) ? "\"final\":true或false," : "") + "\"options\":[{\"text\":\"…\",\"kind\":\"accord\"},{\"text\":\"…\",\"kind\":\"accord\"},{\"text\":\"…\",\"kind\":\"resist\"}]}。别加解释。";
  }

  function charBlock(session) {
    let s = "【做这场梦的人是「" + session.charName + "」】\n· 人设：" + (session.charPersona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 900) +
      (session.voiceRef ? "\n\n【Ta 近期的语气 / 近况，仅作参考】\n" + session.voiceRef : "");
    const guests = (session.guests || []).filter(g => g && g.name);
    if (guests.length) {
      s += "\n\n【这场梦里还会出现这些人（" + session.charName + " 梦见的其他角色）】\n" +
        "他们要作为真正的角色进入梦境，不是背景板。梦怎么呈现他们——样子、态度、在梦里对你或对 " + session.charName + " 做什么——都要顺着「" + session.charName + "」此刻对他们的真实感觉长出来（爱慕会美化、忌惮会扭曲、愧疚会纠缠、思念会朦胧、憎恶会狰狞）。";
      guests.forEach((g, i) => {
        s += "\n\n" + (i + 1) + ".「" + g.name + "」\n· 人设：" + (g.persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 500);
        if (g.relText) s += "\n· " + session.charName + " 此刻对 Ta 的看法/关系：" + g.relText;
        else s += "\n· （没有设定 " + session.charName + " 和 Ta 认识）——请你读两人的人设，合理判断此刻 " + session.charName + " 会怎么看待、怎么感觉 Ta，再据此把 Ta 编进梦里，别生硬。";
        if (g.voiceRef) s += "\n· Ta 近期的语气 / 近况（仅参考）：\n" + g.voiceRef;
      });
    }
    return s;
  }

  // ---- 模型：编织第一幕 ----
  async function weaveFirst(active, session, worldbook, uName) {
    const kw = (session.keywords || []).filter(Boolean);
    const cotT = (typeof cotThink === "function") ? cotThink({ char: session.charName, user: uName }) : "";
    const sys = AC() + NAC() +
      "你在为「" + session.charName + "」编织一场梦。这场梦属于 Ta、为 Ta 而做——梦境顺着 Ta 内心最深的渴望、执念与恐惧铺展。" +
      uName + " 是闯进这场梦的客人，无法自由行动，只能在你给出的选项里选择怎么回应。\n\n" +
      charBlock(session) +
      (worldbook && worldbook.trim() ? (typeof WORLDBOOK_RULE !== "undefined" ? "\n\n" + WORLDBOOK_RULE : "") + "\n\n【世界书】\n" + worldbook.trim() : "") +
      (kw.length ? "\n\n【" + uName + "递来的关键词，把它们自然编进这场梦】" + kw.join("、") : "") +
      "\n\n这是开场第一幕：把梦的门推开，让 " + uName + " 落进 " + session.charName + " 的梦里。" +
      sceneRules(cotT, { stage: "open", charName: session.charName });
    const raw = await callAI(active, sys, [{ role: "user", content: "开始做梦。" }], { maxTokens: 4000 });
    const sp = (typeof splitCot === "function") ? splitCot(raw, !!cotT) : { cot: null, clean: raw };
    const p = extractJSON(sp.clean) || {};
    const opts = normOptions(p.options);
    if (!p.scene || !opts) throw new Error("梦没成形，重试");
    return { text: String(p.scene).trim(), options: opts, chosen: null, cot: sp.cot };
  }

  // ---- 模型：顺着选择往下做（续写下一幕） ----
  // 阶段随已走幕数推进：3 幕后模型可标 final、5 幕后强制逼近梦核 → 梦有弧线、不无限飘
  async function weaveNext(active, session, worldbook, uName) {
    const done = (session.scenes || []).length;
    const canFinal = done >= 3;
    const forceFinal = done >= 5;
    const stage = (canFinal || forceFinal) ? "deep" : "rise";
    const cotT = (typeof cotThink === "function") ? cotThink({ char: session.charName, user: uName }) : "";
    const sys = AC() + NAC() +
      "你在继续为「" + session.charName + "」编织同一场梦。" + uName + " 是闯梦的客人，刚在上一幕做了选择，且这个选择是这场梦所接纳的——梦没有碎，顺着做梦人的心愿往更深处走。\n\n" +
      charBlock(session) +
      (worldbook && worldbook.trim() ? (typeof WORLDBOOK_RULE !== "undefined" ? "\n\n" + WORLDBOOK_RULE : "") + "\n\n【世界书】\n" + worldbook.trim() : "") +
      "\n\n【梦到目前为止】\n" + transcript(session, uName) +
      "\n\n接着上一幕 " + uName + " 的选择往下写新的一幕：推进新情节、让梦更贴近 " + session.charName + " 藏着的东西，别原地打转、别复读上一幕。" +
      sceneRules(cotT, { stage: stage, canFinal: canFinal && !forceFinal, forceFinal: forceFinal, charName: session.charName });
    const raw = await callAI(active, sys, [{ role: "user", content: "继续做梦。" }], { maxTokens: 4000 });
    const sp = (typeof splitCot === "function") ? splitCot(raw, !!cotT) : { cot: null, clean: raw };
    const p = extractJSON(sp.clean) || {};
    const opts = normOptions(p.options);
    if (!p.scene || !opts) throw new Error("梦没接上，重试");
    return { text: String(p.scene).trim(), options: opts, chosen: null, cot: sp.cot, final: forceFinal || !!p.final };
  }

  // ---- 模型：抵达梦核（一路选对、够深了、再顺一步 → 圆满收束，第三种结局） ----
  async function weaveEnding(active, session, worldbook, uName, chosenText) {
    const cotT = (typeof cotThink === "function") ? cotThink({ char: session.charName, user: uName }) : "";
    const sys = AC() + NAC() +
      "你在收束「" + session.charName + "」的这场梦——这次不是梦碎。" + uName + " 一路都选对了，梦没有崩，反而顺着做梦人的心一直走到了它的核心。" + uName + " 刚选择了「" + chosenText + "」，这一步把梦带到了它真正围着转的那个东西面前。\n\n" +
      charBlock(session) +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim() : "") +
      "\n\n【梦到目前为止】\n" + transcript(session, uName) +
      "\n\n① 写抵达梦核的这一幕（arrive，160~320字，第二人称『你』）：让整场梦收束到它最深处那个【具体的渴望/执念/恐惧】上——把它揭开，让它成真、或让 " + session.charName + " 终于直面它。这是全梦的情绪高点，顺着这一路走来的基调与 Ta 的人设去写：可以温柔、可以酸楚、可以释然、可以惊心，但要有具体的画面和落点，不是抽象升华、不是空转的意识流。最后梦【温和地、走完了地】合上——不是被赶出去，是抵达终点后自然醒来。\n" +
      "② 再抽离出来，点破这场梦到底关于什么（core，40~90字，旁白口吻）：这场梦一路在绕的，其实是 " + session.charName + " 心里的什么。具体、贴人设，别空泛。\n" +
      (typeof cotSystemBlock === "function" ? cotSystemBlock(cotT) : "") +
      "【输出】只输出 JSON：{" + (typeof cotJsonField === "function" ? cotJsonField(cotT) : "") + "\"arrive\":\"抵达梦核的叙事\",\"core\":\"这场梦其实是关于什么\"}。别加别的。";
    const raw = await callAI(active, sys, [{ role: "user", content: "抵达梦核。" }], { maxTokens: 3500 });
    const sp = (typeof splitCot === "function") ? splitCot(raw, !!cotT) : { cot: null, clean: raw };
    const p = extractJSON(sp.clean) || {};
    return { arrive: String(p.arrive || sp.clean || "梦走到了最深处，然后温柔地合上。你缓缓醒来，胸口还留着余温。").trim(), core: String(p.core || "").trim(), cot: sp.cot };
  }

  // ---- 模型：梦碎（选到抗拒项） ----
  async function weaveShatter(active, session, worldbook, uName, resistText) {
    const cotT = (typeof cotThink === "function") ? cotThink({ char: session.charName, user: uName }) : "";
    const sys = AC() + NAC() +
      "你在收束「" + session.charName + "」的这场梦。" + uName + " 刚做了一个选择——「" + resistText + "」——它恰好触到了 " + session.charName + " 内心最抗拒、不愿被戳破的东西。梦承受不住，开始碎裂。\n\n" +
      charBlock(session) +
      "\n\n【梦到破碎前】\n" + transcript(session, uName) +
      "\n\n① 写梦碎的这一幕（collapse，120~240字，第二人称『你』）：从那个选择的瞬间起，梦境如何变质、扭曲、崩塌；" + session.charName + " 的潜意识如何反应（退缩、失控、痛楚或愤怒，看人设）；最后 " + uName + " 被逐出梦、猛地惊醒。\n" +
      "② 再抽离出来，说清这个选择为什么是错的（why，40~90字，跳出梦、用旁白口吻）：「" + resistText + "」触到了 " + session.charName + " 的什么逆鳞/软肋/不愿面对的真相，为什么在 Ta 的梦里这条路走不通。要具体贴人设，别空泛。\n" +
      (typeof cotSystemBlock === "function" ? cotSystemBlock(cotT) : "") +
      "【输出】只输出 JSON：{" + (typeof cotJsonField === "function" ? cotJsonField(cotT) : "") + "\"collapse\":\"梦碎叙事\",\"why\":\"为什么这个选择戳破了梦\"}。别加别的。";
    const raw = await callAI(active, sys, [{ role: "user", content: "梦碎。" }], { maxTokens: 3000 });
    const sp = (typeof splitCot === "function") ? splitCot(raw, !!cotT) : { cot: null, clean: raw };
    const p = extractJSON(sp.clean) || {};
    return { collapse: String(p.collapse || sp.clean || "梦在你眼前碎成光斑，你猛地醒来。").trim(), why: String(p.why || "").trim(), cot: sp.cot };
  }

  // ============================================================
  // 主组件
  // ============================================================
  function Dream(props) {
    const t = useTheme();
    const [saves, setSaves] = useState(loadSaves);
    const [view, setView] = useState("home"); // "home" | "setup" | <sessionId>
    const lpTimer = useRef(null), lpFired = useRef(false);

    const persist = list => { setSaves(list); saveSaves(list); };
    const patchSession = (id, patch) => {
      const list = loadSaves().map(s => s.id === id ? Object.assign({}, s, patch, { lastTs: Date.now() }) : s);
      persist(list);
    };
    const delSession = id => { if (window.confirm("忘掉这场梦？")) { persist(loadSaves().filter(s => s.id !== id)); if (view === id) setView("home"); } };

    const startLP = id => { lpFired.current = false; lpTimer.current = setTimeout(() => { lpFired.current = true; delSession(id); }, 550); };
    const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };

    if (view === "setup") {
      return h(Setup, {
        characters: props.characters, profile: props.profile, rels: props.rels, toast: props.toast,
        onCancel: () => setView("home"),
        onCreate: session => { persist([session].concat(loadSaves())); setView(session.id); }
      });
    }
    if (view !== "home") {
      const s = saves.find(x => x.id === view);
      if (!s) { setView("home"); return null; }
      return h(DreamView, {
        session: s, active: props.active, profile: props.profile, worldbook: props.worldbook, toast: props.toast,
        onBack: () => { setSaves(loadSaves()); setView("home"); },
        onPatch: patch => patchSession(s.id, patch)
      });
    }

    // 落地页
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "梦境", en: "Dream", onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        h("button", {
          onClick: () => { if (!props.characters.length) { props.toast && props.toast("先去『名录』建个角色"); return; } setView("setup"); },
          className: "w-full py-3 mb-5 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 14, borderRadius: 11, border: "1px dashed " + t.line, color: t.sub, background: t.bg2 }
        }, "＋ 编织一场梦"),
        saves.length === 0
          ? h("div", { style: { textAlign: "center", color: t.fog, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.8, paddingTop: 40, whiteSpace: "pre-line" } }, "还没有梦。\n挑一个人，递三个关键词，\n看你能在 Ta 的梦里走多深。")
          : h("div", { style: { display: "flex", flexDirection: "column", gap: 11 } },
            saves.slice().sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)).map(s => {
              const broken = s.status === "broken", left = s.status === "left", done = s.status === "fulfilled";
              const badge = broken ? { txt: "已碎", bg: "#a24a4a" } : done ? { txt: "抵达", bg: "#4f8a6a" } : left ? { txt: "已醒", bg: t.fog } : { txt: "梦中", bg: ACCENT };
              return h("div", {
                key: s.id,
                onClick: () => { if (lpFired.current) { lpFired.current = false; return; } setView(s.id); },
                onContextMenu: e => { e.preventDefault(); delSession(s.id); },
                onTouchStart: () => startLP(s.id), onTouchEnd: cancelLP, onTouchMove: cancelLP, onTouchCancel: cancelLP,
                onMouseDown: () => startLP(s.id), onMouseUp: cancelLP, onMouseLeave: cancelLP,
                className: "active:opacity-70",
                style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 13, padding: "13px 15px", cursor: "pointer" }
              },
                h("div", { style: { display: "flex", alignItems: "center", gap: 7, marginBottom: 5 } },
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, letterSpacing: .5, padding: "1px 7px", borderRadius: 6, color: "#fff", background: badge.bg } }, badge.txt),
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "第 " + ((s.scenes || []).length || 1) + " 幕")),
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.35, color: t.ink, marginBottom: 4 } }, s.charName + " 的梦"),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                  (s.keywords || []).filter(Boolean).join(" · ") || "（没给关键词，任梦自由生长）")
              );
            })),
        saves.length > 0 ? h("div", { style: { marginTop: 16, textAlign: "center", fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "长按可忘掉这场梦") : null
      ));
  }

  // ============================================================
  // 发起设置：选 1 个角色 + 3 个关键词
  // ============================================================
  function Setup(props) {
    const t = useTheme();
    const [charId, setCharId] = useState("");
    const [guestIds, setGuestIds] = useState([]);       // 客串角色（最多 2）
    const [injectChat, setInjectChat] = useState(true); // 是否注入最近聊天记录
    const [kw, setKw] = useState(["", "", ""]);
    const [starting, setStarting] = useState(false);

    // 选做梦人：若把某人设成做梦人，就从客串里剔除
    const pickDreamer = id => { setCharId(prev => prev === id ? "" : id); setGuestIds(prev => prev.filter(x => x !== id)); };
    const toggleGuest = id => setGuestIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) { props.toast && props.toast("最多带 2 个客串角色"); return prev; }
      return prev.concat(id);
    });

    const start = async () => {
      if (!charId) { props.toast && props.toast("先挑一个人，进 Ta 的梦"); return; }
      setStarting(true);
      try {
        const c = props.characters.find(x => x.id === charId);
        const uName = (props.profile && props.profile.name) || "我";
        const rels = props.rels || {};
        const guests = guestIds.map(gid => {
          const g = props.characters.find(x => x.id === gid);
          if (!g) return null;
          const r = rels[c.id + "->" + g.id];                 // 做梦人对客串的看法（有向）
          const relText = r && r.label ? (r.label + (r.note ? "（" + r.note + "）" : "")) : "";
          return { id: g.id, name: g.name, persona: g.persona || "", relText: relText, voiceRef: injectChat ? recentChatSnippet(g.id, uName, g.name) : "" };
        }).filter(Boolean);
        const session = {
          id: "dm_" + Date.now(),
          charId: c.id, charName: c.name, charPersona: c.persona || "",
          keywords: kw.map(x => x.trim()).filter(Boolean),
          guests: guests, injectChat: injectChat,
          voiceRef: injectChat ? recentChatSnippet(c.id, uName, c.name) : "",
          scenes: [], status: "dreaming", ending: "",
          createdTs: Date.now(), lastTs: Date.now()
        };
        props.onCreate(session); // 第一幕在 DreamView 首次进入时生成
      } catch (e) { props.toast && props.toast("没能进梦：" + (e.message || "重试")); setStarting(false); }
    };

    const label = { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: t.sub, marginBottom: 8, letterSpacing: .3 };

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "编织一场梦", en: "New", onBack: props.onCancel }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-32" },
        h("div", { style: label }, "进谁的梦"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 } },
          props.characters.map(c => {
            const on = charId === c.id;
            return h("button", { key: c.id, onClick: () => pickDreamer(c.id), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, background: on ? ACCENT : t.bg2, border: "1px solid " + (on ? ACCENT : t.line), borderRadius: 999, padding: "8px 15px" } }, c.name);
          })),
        // 客串角色：选了做梦人才出现；梦里会带上这些人（含做梦人对 Ta 的看法）
        charId ? h("div", { style: label }, "梦里还会梦见谁（选 0~2 个，可不选）") : null,
        charId ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 } },
          props.characters.filter(c => c.id !== charId).map(c => {
            const on = guestIds.includes(c.id);
            return h("button", { key: c.id, onClick: () => toggleGuest(c.id), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, background: on ? "#8478a0" : t.bg2, border: "1px solid " + (on ? "#8478a0" : t.line), borderRadius: 999, padding: "8px 15px" } }, c.name);
          })) : null,
        // 注入最近聊天记录开关
        h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 13px", background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, marginBottom: 22, cursor: "pointer" } },
          h("div", null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "注入最近的聊天记录"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, "把 Ta" + (guestIds.length ? "和客串角色" : "") + "最近的聊天当语气/近况参考，梦更贴近当下")),
          h("input", { type: "checkbox", checked: injectChat, onChange: e => setInjectChat(e.target.checked), style: { width: 20, height: 20, flexShrink: 0, accentColor: ACCENT } })),
        h("div", { style: label }, "递三个关键词（可留空，让梦自由生长）"),
        h("div", { style: { display: "flex", flexDirection: "column", gap: 9, marginBottom: 8 } },
          [0, 1, 2].map(i => h("input", {
            key: i, value: kw[i], onChange: e => setKw(prev => { const n = prev.slice(); n[i] = e.target.value; return n; }),
            placeholder: "关键词 " + (i + 1),
            style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, padding: "11px 13px", width: "100%", outline: "none" }
          }))),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, lineHeight: 1.7, marginBottom: 4 } },
          "梦是 Ta 的，你只是闯进来的客人。每一幕都有三条路，别选错——错的那条会让梦碎，把你惊醒赶出去。")
      ),
      h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 20px calc(10px + env(safe-area-inset-bottom))", background: "linear-gradient(to top," + t.bg + " 78%,transparent)" } },
        h("button", { onClick: start, disabled: starting, className: "w-full active:opacity-80",
          style: { fontFamily: F_BODY, fontSize: 14.5, fontWeight: 700, color: "#fff", background: starting ? t.fog : ACCENT, borderRadius: 12, padding: "13px 0" } },
          starting ? "推开梦的门…" : "进入梦境")));
  }

  // ============================================================
  // 梦境正文
  // ============================================================
  function DreamView(props) {
    const t = useTheme();
    const s = props.session;
    const [busy, setBusy] = useState(false);
    const [phaseMsg, setPhaseMsg] = useState("");
    const feedRef = useRef(null);
    const dtp = typeof useTtsPlayer === "function" ? useTtsPlayer() : null; // 幕文朗读（懒合成）
    const kicked = useRef(false); // 防重复触发首幕生成

    const scenes = s.scenes || [];
    const cur = scenes.length ? scenes[scenes.length - 1] : null;
    const dreaming = s.status === "dreaming";
    const awaitingPick = dreaming && cur && cur.chosen == null;

    useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [scenes.length, busy, phaseMsg, s.status]);

    // 首次进入且还没有第一幕 → 生成开场
    useEffect(() => {
      if (dreaming && scenes.length === 0 && !kicked.current) {
        kicked.current = true;
        genFirst();
      }
    }, []); // eslint-disable-line

    async function genFirst() {
      setBusy(true); setPhaseMsg("梦正在成形…");
      try {
        const first = await weaveFirst(props.active, s, props.worldbook, uName());
        props.onPatch({ scenes: [first] });
      } catch (e) { props.toast && props.toast(e.message || "重试"); }
      setBusy(false); setPhaseMsg("");
    }

    function uName() { return (props.profile && props.profile.name) || "我"; }

    async function pick(idx) {
      if (busy || !awaitingPick) return;
      const chosen = cur.options[idx];
      // 记下选择
      const marked = scenes.slice();
      marked[marked.length - 1] = Object.assign({}, cur, { chosen: idx });
      const sess2 = Object.assign({}, s, { scenes: marked });

      if (chosen.kind === "resist") {
        // 梦碎
        setBusy(true); setPhaseMsg("有什么裂开了…");
        try {
          const r = await weaveShatter(props.active, sess2, props.worldbook, uName(), chosen.text);
          props.onPatch({ scenes: marked, status: "broken", ending: r.collapse, whyWrong: r.why, wrongText: chosen.text, endCot: r.cot || null });
        } catch (e) {
          props.onPatch({ scenes: marked, status: "broken", ending: "梦在你眼前碎成光斑，你猛地醒来，心还在跳。", whyWrong: "", wrongText: chosen.text });
        }
        setBusy(false); setPhaseMsg("");
        return;
      }
      // 顺应且这一幕已到梦核边缘（final）→ 抵达梦核，圆满收束（第三种结局）
      if (cur.final) {
        setBusy(true); setPhaseMsg("梦走到了最深处…");
        try {
          const r = await weaveEnding(props.active, sess2, props.worldbook, uName(), chosen.text);
          props.onPatch({ scenes: marked, status: "fulfilled", ending: r.arrive, dreamCore: r.core, endCot: r.cot || null });
        } catch (e) {
          props.onPatch({ scenes: marked, status: "fulfilled", ending: "梦走到了最深处，然后温柔地合上。你缓缓醒来，胸口还留着余温。", dreamCore: "" });
        }
        setBusy(false); setPhaseMsg(""); return;
      }
      // 顺应 → 续写下一幕
      setBusy(true); setPhaseMsg("梦在往深处走…");
      try {
        const next = await weaveNext(props.active, sess2, props.worldbook, uName());
        props.onPatch({ scenes: marked.concat([next]) });
      } catch (e) {
        // 续写失败：把选择保留，让用户重试
        props.onPatch({ scenes: marked });
        props.toast && props.toast(e.message || "梦卡住了，再试一次");
      }
      setBusy(false); setPhaseMsg("");
    }

    async function retryNext() {
      if (busy) return;
      setBusy(true); setPhaseMsg("梦在往深处走…");
      try {
        const next = await weaveNext(props.active, s, props.worldbook, uName());
        props.onPatch({ scenes: scenes.concat([next]) });
      } catch (e) { props.toast && props.toast(e.message || "再试一次"); }
      setBusy(false); setPhaseMsg("");
    }

    const wakeUp = () => { if (window.confirm("主动醒来，离开这场梦？")) props.onPatch({ status: "left" }); };

    // 回档：退回到第 k 幕的决策点，清掉这之后的所有进展 + 结局，重新选
    const rewindTo = k => {
      if (busy) return;
      const later = scenes.length - 1 - k;
      const tail = later > 0 ? "，这之后的 " + later + " 幕会被抹去" : "";
      if (!window.confirm("回到第 " + (k + 1) + " 幕重新选" + tail + "？")) return;
      const kept = scenes.slice(0, k + 1).map((sc, i) => i === k ? Object.assign({}, sc, { chosen: null }) : sc);
      props.onPatch({ scenes: kept, status: "dreaming", ending: "", whyWrong: "", wrongText: "" });
    };

    // 上一幕已选好、但还没有下一幕（续写失败留下的中间态）
    const needRetry = dreaming && cur && cur.chosen != null;

    const wakeBtn = dreaming ? h("button", { onClick: wakeUp, className: "active:opacity-60",
      style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "醒来") : null;

    // 底部控制区（正常流式布局，不再 absolute 浮盖——否则最后一幕会被盖住刷不到底）
    const controls = dreaming ? h("div", { className: "shrink-0 px-5", style: { paddingTop: 8, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid " + t.line, background: t.bg } },
      busy
        ? h("div", { className: "w-full", style: { fontFamily: F_BODY, fontSize: 13.5, fontWeight: 600, color: t.sub, textAlign: "center", padding: "13px 0", background: t.bg2, border: "1px solid " + t.line, borderRadius: 12 } }, phaseMsg || "…")
        : awaitingPick
          ? h("div", { style: { display: "flex", flexDirection: "column", gap: 9 } },
            cur.options.map((op, i) => h("button", {
              key: i, onClick: () => pick(i), className: "w-full active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.5, textAlign: "left", color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "13px 15px" }
            }, op.text)))
          : needRetry
            ? h("button", { onClick: retryNext, className: "w-full active:opacity-80",
              style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: ACCENT, borderRadius: 12, padding: "13px 0" } }, "↻ 梦卡住了，继续做梦")
            : null) : null;

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: s.charName + " 的梦", en: "Dream", onBack: props.onBack, right: wakeBtn }),
      // 梦境流（flex-1 撑满剩余高度，底部控制区是同级 shrink-0，滚动能到底不被盖）
      h("div", { ref: feedRef, className: "flex-1 overflow-y-auto px-5", style: { paddingBottom: 24 } },
        scenes.map((sc, i) => {
          const decided = sc.chosen != null && sc.options && sc.options[sc.chosen];
          return h("div", { key: i, style: { marginBottom: 22 } },
            h("div", { style: { display: "flex", alignItems: "center", marginBottom: 8 } },
              h("span", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: t.fog } }, "第 " + (i + 1) + " 幕"),
              (dtp && typeof TtsDot === "function") ? h(TtsDot, { k: "dr" + i, text: sc.text, spk: props.characters.find(c => c.id === s.charId), tp: dtp }) : null),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.85, color: t.ink, whiteSpace: "pre-wrap" } }, sc.text),
            (sc.cot && typeof CotReveal === "function") ? h(CotReveal, { cot: sc.cot }) : null,
            // 已做出的选择回显 + 回档
            decided
              ? h("div", { style: { marginTop: 12, paddingLeft: 12, borderLeft: "2px solid " + ACCENT },
                  onClick: () => rewindTo(i) },
                h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, color: ACCENT } }, "你选择了：" + sc.options[sc.chosen].text),
                h("button", { onClick: e => { e.stopPropagation(); rewindTo(i); }, className: "active:opacity-60",
                  style: { marginTop: 4, fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "↩ 从这里重选"))
              : null);
        }),
        // 抵达梦核（圆满收束）结局
        s.status === "fulfilled"
          ? h("div", { style: { marginTop: 4, marginBottom: 20 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#4f8a6a", marginBottom: 8 } }, "梦　核"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.85, color: t.ink, whiteSpace: "pre-wrap" } }, s.ending),
            (s.endCot && typeof CotReveal === "function") ? h(CotReveal, { cot: s.endCot }) : null,
            s.dreamCore
              ? h("div", { style: { marginTop: 14, padding: "12px 14px", background: "rgba(79,138,106,0.08)", border: "1px solid rgba(79,138,106,0.28)", borderRadius: 12 } },
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: "#4f8a6a", marginBottom: 6 } }, "这场梦其实是关于"),
                h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.ink } }, s.dreamCore))
              : null,
            h("div", { style: { marginTop: 16, textAlign: "center", fontFamily: F_DISPLAY, fontSize: 14, fontStyle: "italic", color: t.fog } }, "你走到了梦的尽头，它温柔地合上。"),
            scenes.length ? h("button", { onClick: () => rewindTo(scenes.length - 1), className: "w-full active:opacity-80",
              style: { marginTop: 16, fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: ACCENT, borderRadius: 12, padding: "12px 0" } }, "↩ 回到刚才的决策点，走另一条路") : null)
          // 梦碎 / 醒来 结局
          : s.status === "broken"
          ? h("div", { style: { marginTop: 4, marginBottom: 20 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#a24a4a", marginBottom: 8 } }, "梦　碎"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.85, color: t.ink, whiteSpace: "pre-wrap" } }, s.ending),
            (s.endCot && typeof CotReveal === "function") ? h(CotReveal, { cot: s.endCot }) : null,
            // 为什么这个选项是错的
            s.whyWrong
              ? h("div", { style: { marginTop: 14, padding: "12px 14px", background: "rgba(162,74,74,0.07)", border: "1px solid rgba(162,74,74,0.25)", borderRadius: 12 } },
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: "#a24a4a", marginBottom: 6 } }, "为什么这条路走不通"),
                s.wrongText ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 6, fontStyle: "italic" } }, "「" + s.wrongText + "」") : null,
                h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.ink } }, s.whyWrong))
              : null,
            h("div", { style: { marginTop: 16, textAlign: "center", fontFamily: F_DISPLAY, fontSize: 14, fontStyle: "italic", color: t.fog } }, "你被赶出了这场梦。"),
            // 梦碎后回到那个决策点重来
            scenes.length ? h("button", { onClick: () => rewindTo(scenes.length - 1), className: "w-full active:opacity-80",
              style: { marginTop: 16, fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: ACCENT, borderRadius: 12, padding: "12px 0" } }, "↩ 回到刚才的决策点重选") : null)
          : s.status === "left"
            ? h("div", { style: { marginTop: 8, marginBottom: 24, textAlign: "center" } },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, fontStyle: "italic", color: t.fog, marginBottom: 14 } }, "你选择了醒来，梦轻轻合上。"),
              scenes.length ? h("button", { onClick: () => rewindTo(scenes.length - 1), className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 12.5, color: ACCENT } }, "↩ 回到最后的决策点重进梦") : null)
            : null),
      controls);
  }

  window.Dream = Dream;
})();
