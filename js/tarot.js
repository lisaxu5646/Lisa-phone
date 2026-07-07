// ============================================================
// 塔罗（tarot）—— 抽牌 + 角色声音解牌，独立小 app
// 四种玩法（都靠全局 callAI + ANTI_CLICHE，存 localStorage x_tarot_saves 随云同步）：
//   · reading  角色为你解牌：你问一件事，选一个角色，Ta 用自己的口吻按牌面为你解读
//   · relation 关系占卜：为「你和某角色」抽牌，牌面暗暗被真实好感/关系上色，不露数字
//   · daily    每日一牌：一天只【一张】牌（全体共用，当天固定），各角色解读同一张给你当日签（可一次生成全部角色）
//   · forchar  给角色算一卦：替某角色抽 Ta 此刻的近况/心结/走向，旁白式解读，可转发给 Ta
// 78 张莱德-韦特牌（22 大阿卡纳 + 56 小阿卡纳），每张牌都是【本地随机】抽出，模型只解读不挑牌。
// ============================================================
(function () {
  const ACCENT = "#4a3f6b";      // 塔罗主色（深紫）
  const GOLD = "#b89150";        // 烫金点缀
  const AC = () => (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "");
  const NAC = () => (typeof NARRATIVE_ANTI_CLICHE !== "undefined" ? NARRATIVE_ANTI_CLICHE + "\n\n" : "");
  // 忠于牌面、别为讨好而美化
  const HONEST = "【忠于牌面】牌是随机抽出的、无法更改。别为了讨好或安慰就把凶牌、逆位往好里圆——该警示就警示、该沉就沉，正位逆位要解出真差别，像一次正经的占卜，不是心灵鸡汤。";

  // ---- 牌堆 ----
  const MAJORS = ["愚者", "魔术师", "女祭司", "皇后", "皇帝", "教皇", "恋人", "战车", "力量", "隐者", "命运之轮", "正义", "倒吊人", "死神", "节制", "恶魔", "高塔", "星星", "月亮", "太阳", "审判", "世界"];
  const SUITS = ["权杖", "圣杯", "宝剑", "星币"];
  const RANKS = ["王牌", "二", "三", "四", "五", "六", "七", "八", "九", "十", "侍从", "骑士", "王后", "国王"];
  function buildDeck() {
    const d = MAJORS.map(n => ({ name: n, major: true }));
    SUITS.forEach(s => RANKS.forEach(r => d.push({ name: s + r, major: false })));
    return d; // 78 张
  }
  const DECK = buildDeck();
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // 抽 n 张互不相同的牌，各自随机正/逆位（纯本地随机，模型完全不参与选牌）
  function draw(n) {
    return shuffle(DECK).slice(0, n).map(c => ({ name: c.name, major: c.major, rev: Math.random() < 0.34 }));
  }
  const cardLabel = c => c.name + "（" + (c.rev ? "逆位" : "正位") + "）";
  function fmtDate(ts) { const d = new Date(ts); return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  // 一次占卜里可被搜索命中的所有文字（角色名/问题/牌名/每日各角色/收束）
  function sessionText(s) {
    const parts = [s.charName || "", s.question || "", s.summary || ""];
    if (s.card) parts.push(s.card.name);
    (s.cards || []).forEach(c => c && parts.push(c.name));
    (s.entries || []).forEach(e => e && parts.push(e.charName || ""));
    return parts.join(" ").toLowerCase();
  }

  // ---- 好感度 → 语气档（不给模型数字，只给氛围词，占卜结果暗暗被它上色）----
  function affBand(a) {
    if (a == null || isNaN(a)) return "";
    if (a >= 80) return "极亲密、几乎交付了真心";
    if (a >= 60) return "亲近、信任在生长";
    if (a >= 40) return "有好感但仍有分寸";
    if (a >= 22) return "还疏淡、在观望";
    return "冷淡、甚至带着戒备";
  }

  // 角色最近聊天一小段，作近况/语气参考
  function recentChat(charId, uName, charName) {
    const msgs = loadJSON("x_chat:" + charId, []);
    if (!msgs.length) return "";
    return msgs.slice(-10)
      .filter(m => m && (m.content || "").trim() && (m.role === "user" || m.role === "assistant"))
      .map(m => (m.role === "user" ? uName : charName) + "：" + String(m.content).replace(/\s+/g, " ").slice(0, 70))
      .join("\n");
  }

  // ---- 四种玩法 ----
  const MODES = {
    reading: {
      zh: "角色为你解牌", en: "A Reading For You", icon: "✦",
      blurb: "问一件心里的事，让一个角色为你摊开三张牌、以 Ta 的口吻解读",
      spread: ["此刻的处境", "眼前的阻碍", "给你的指引"],
      needChar: true, needQ: true, qHint: "你想问的事（如：这段关系会往哪走 / 该不该辞职…）"
    },
    relation: {
      zh: "关系占卜", en: "You & Them", icon: "♡",
      blurb: "为「你和 Ta」抽牌——牌面会照着你们此刻真实的远近显影",
      spread: ["你眼中的 Ta", "Ta 眼中的你", "你们的走向"],
      needChar: true
    },
    daily: {
      zh: "每日一牌", en: "Card of the Day", icon: "☀",
      blurb: "今天翻【一张】牌，各角色都解读这同一张、给你当日签（可一次生成全部角色，同一天固定不变）",
      spread: ["今日"],
      needChar: true, daily: true
    },
    forchar: {
      zh: "给角色算一卦", en: "A Reading For Them", icon: "◈",
      blurb: "替某个角色抽 Ta 此刻的近况与心结，旁白替 Ta 摊开命运，可转发给 Ta",
      spread: ["Ta 的近况", "藏在心里的结", "接下来"],
      needChar: true
    }
  };

  function loadSaves() { return loadJSON("x_tarot_saves", []); }
  function saveSaves(l) { saveJSON("x_tarot_saves", l); }
  const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  // 今天的那一张牌：一天只抽一张，全体角色共用；当天固定不变（存 x_tarot_dayCard）
  function todayCard() {
    const tk = todayKey();
    const stored = loadJSON("x_tarot_dayCard", null);
    if (stored && stored.dayKey === tk && stored.card) return stored.card;
    const card = draw(1)[0];
    saveJSON("x_tarot_dayCard", { dayKey: tk, card: card });
    return card;
  }

  // ============================================================
  // 模型：解一副牌（reading / relation / forchar）
  // 返回 {reads:[{pos,text}], summary, charThought}
  // ============================================================
  async function readSpread(active, ctx) {
    const { mode, cards, spread, charName, charPersona, uName, question, relText, band, voiceRef, mood, worldbook } = ctx;
    const cardList = cards.map((c, i) => (i + 1) + "、【" + spread[i] + "】" + cardLabel(c)).join("\n");
    let voice, view, thoughtAsk;
    if (mode === "reading") {
      voice = "你就是「" + charName + "」本人，正坐在 " + uName + " 对面替 Ta 摊牌解读。全程用第一人称、你自己的口吻和性格说话，像真的在跟 " + uName + " 讲，别当中立的解牌机器。你对 " + uName + " 的态度（" + (band || "说不清的距离") + "）会自然渗进你怎么解、语气软还是硬、点到为止还是掏心窝。";
      view = "这是 " + uName + " 问的事：「" + (question || "我最近该注意什么") + "」。顺着这个问题解。";
      thoughtAsk = "charThought：抛开解牌的口吻，说一句你（" + charName + "）此刻【私心里】对这几张牌的真实反应（第一人称，如替 Ta 捏把汗／松口气／不是滋味／想多留 Ta 一会儿）。";
    } else if (mode === "relation") {
      voice = "你是替 " + uName + " 与「" + charName + "」摊牌的占者，声音安静、有点神秘，不代入角色本人。";
      view = "这一卦是关于 " + uName + " 和 " + charName + " 之间的关系。" +
        (relText ? "已知的关系：" + relText + "。" : "") +
        "他们此刻真实的远近是：" + (band || "尚未明朗") + "——【不要】把这句话或任何分数直接说出来，而是让它悄悄决定牌面的暖度、亲疏和走向的明暗。";
      thoughtAsk = "charThought：切换成「" + charName + "」本人的口吻，说一句 Ta 看到这几张关于自己和 " + uName + " 的牌时、心里真实的一句反应（第一人称）。";
    } else { // forchar
      voice = "你是替「" + charName + "」摊牌的旁白/占者，用第三人称讲 Ta，声音冷静、有洞察，不代入 Ta 本人也不对 " + uName + " 说话。";
      view = "这一卦算的是 " + charName + " 自己此刻的命理，照着 Ta 的人设与近况来解，别牵扯 " + uName + " 的问题。";
      thoughtAsk = "charThought：切换成「" + charName + "」本人的口吻，说一句 Ta 若看到替自己算的这一卦、心里真实的一句反应（第一人称）。";
    }

    const sys = AC() + NAC() + HONEST + "\n\n" + voice + "\n\n" +
      "【角色资料】「" + charName + "」：" + (charPersona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 800) +
      (mood ? "\n\n【Ta 此刻的心情：" + mood + "】顺带透一点即可，别喧宾夺主、牌义才是主角。" : "") +
      (voiceRef ? "\n\n【Ta 近期的语气 / 近况，仅参考】\n" + voiceRef : "") +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim().slice(0, 500) : "") +
      "\n\n" + view +
      "\n\n【摊开的牌】\n" + cardList +
      "\n\n【怎么解】\n· 逐张解：每张牌结合它所在的位置、正位或逆位的含义来讲，别背牌义词典，要落到具体的处境/情绪/建议上，每张 40~90 字。\n" +
      "· 正位、逆位要真的解出差别，别把逆位也当正位讲。\n" +
      "· summary（40~110 字）：把几张牌连成一句话的走向或一句真心的提醒。\n" +
      "· " + thoughtAsk + "（20~50 字）。\n" +
      "【输出】只输出 JSON：{\"reads\":[{\"pos\":\"位置名\",\"text\":\"这张牌的解读\"}...],\"summary\":\"收束\",\"charThought\":\"角色本人的一句反应\"}。别加解释、别加代码块。";
    const raw = await callAI(active, sys, [{ role: "user", content: "开始解牌。" }], { maxTokens: 3500 });
    const p = extractJSON(raw) || {};
    let reads = Array.isArray(p.reads) ? p.reads.filter(r => r && r.text).map((r, i) => ({ pos: r.pos || spread[i] || "", text: String(r.text).trim() })) : [];
    if (!reads.length) reads = [{ pos: spread[0] || "", text: String(raw || "牌面模糊，重试。").trim() }];
    return { reads: reads, summary: String(p.summary || "").trim(), charThought: String(p.charThought || "").trim() };
  }

  // ============================================================
  // 模型：每日一牌 —— 今天【同一张牌】，多个角色各自解读；一次调用返回每人一句当日签
  // 注入很克制（只给此刻心情一词 + 很短的近况），避免喧宾夺主把解读搞乱。返回按传入顺序对齐 [{text}]
  // ============================================================
  async function readDailyForCard(active, card, list, uName, worldbook) {
    const block = list.map((it, i) => (i + 1) + "、「" + it.name + "」\n  人设：" + (it.persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 260) + (it.mood ? "\n  此刻心情：" + it.mood : "") + (it.voiceRef ? "\n  近况一瞥：" + it.voiceRef.replace(/\n/g, "；").slice(0, 90) : "")).join("\n\n");
    const sys = AC() + NAC() + HONEST + "\n\n" +
      "今天的塔罗牌是【同一张】：" + cardLabel(card) + "。请【分别以下面每位角色本人的口吻】，就【这同一张牌】给 " + uName + " 递一句今天的当日签——短，像随口说的一两句，结合这张牌（含正/逆位）与各自人设" + (list.some(it => it.mood) ? "（有此刻心情就顺带透一点，但别喧宾夺主，牌义才是主角）" : "") + "，别混淆、别串味、别把几个人写成同一个腔调、也别千篇一律。\n\n" +
      "【要解读这张牌的角色】\n" + block +
      "\n\n【输出】只输出 JSON，readings 数组和上面角色顺序【一一对应、数量一致】：{\"readings\":[{\"name\":\"角色名\",\"text\":\"这位角色对今天这张牌的当日签\"}...]}。别加解释、别加代码块。";
    const raw = await callAI(active, sys, [{ role: "user", content: "开始发签。" }], { maxTokens: 4000 });
    const p = extractJSON(raw) || {};
    const arr = Array.isArray(p.readings) ? p.readings : [];
    // 优先按 name 对齐，兜底按顺序
    return list.map((it, i) => {
      const byName = arr.find(r => r && r.name && String(r.name).trim() === it.name);
      const r = byName || arr[i];
      return { text: r && r.text ? String(r.text).trim() : "今天的牌一时看不真切，改天再抽。" };
    });
  }

  // ============================================================
  // 主组件
  // ============================================================
  function Tarot(props) {
    const t = useTheme();
    const [saves, setSaves] = useState(loadSaves);
    const [view, setView] = useState("home"); // home | mode:<key> | s:<id>
    const [histQ, setHistQ] = useState("");       // 历史搜索
    const [histType, setHistType] = useState("all"); // 历史类型筛选
    const [histExp, setHistExp] = useState({});   // 各类别是否已展开全部
    const lpTimer = useRef(null), lpFired = useRef(false);

    const persist = list => { setSaves(list); saveSaves(list); };
    const delSession = id => { if (window.confirm("撕掉这次占卜？")) { persist(loadSaves().filter(s => s.id !== id)); if (view === "s:" + id) setView("home"); } };
    const startLP = id => { lpFired.current = false; lpTimer.current = setTimeout(() => { lpFired.current = true; delSession(id); }, 550); };
    const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };

    if (view.indexOf("mode:") === 0) {
      return h(Setup, {
        modeKey: view.slice(5), characters: props.characters, profile: props.profile, rels: props.rels,
        affinities: props.affinities, moods: props.moods, worldbook: props.worldbook, active: props.active, toast: props.toast,
        onCancel: () => setView("home"),
        onDone: session => { persist([session].concat(loadSaves().filter(s => s.id !== session.id))); setView("s:" + session.id); }
      });
    }
    if (view.indexOf("s:") === 0) {
      const s = saves.find(x => x.id === view.slice(2));
      if (!s) { setView("home"); return null; }
      return h(SessionView, { session: s, characters: props.characters, onForwardToChat: props.onForwardToChat, toast: props.toast, onBack: () => { setSaves(loadSaves()); setView("home"); } });
    }

    // ---- 落地页：四个玩法 + 历史（按类别收纳 + 日期）----
    const sorted = saves.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const byMode = {}; sorted.forEach(s => { (byMode[s.mode] = byMode[s.mode] || []).push(s); });

    const histLine = s => {
      const m = MODES[s.mode] || {};
      const subt = s.mode === "daily"
        ? (s.card ? s.card.name : "每日一牌") + " · " + ((s.entries || []).length) + " 人解读"
        : (s.mode === "reading" && s.question ? "问：" + s.question : s.charName);
      return h("div", {
        key: s.id,
        onClick: () => { if (lpFired.current) { lpFired.current = false; return; } setView("s:" + s.id); },
        onContextMenu: e => { e.preventDefault(); delSession(s.id); },
        onTouchStart: () => startLP(s.id), onTouchEnd: cancelLP, onTouchMove: cancelLP, onTouchCancel: cancelLP,
        onMouseDown: () => startLP(s.id), onMouseUp: cancelLP, onMouseLeave: cancelLP,
        className: "active:opacity-70",
        style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "11px 14px", cursor: "pointer" }
      },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, subt),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, flexShrink: 0 } }, fmtDate(s.ts))),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          (s.mode === "daily" ? (s.card ? [cardLabel(s.card)] : []) : (s.cards || []).map(c => c.name)).join(" · ")));
    };

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "塔罗", en: "Tarot", onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        h("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 } },
          Object.keys(MODES).map(k => {
            const m = MODES[k];
            return h("button", {
              key: k, onClick: () => { if (!props.characters.length) { props.toast && props.toast("先去『名录』建个角色"); return; } setView("mode:" + k); },
              className: "w-full active:opacity-80", style: { textAlign: "left", background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 13 }
            },
              h("div", { style: { width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: ACCENT, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 } }, m.icon),
              h("div", { style: { minWidth: 0 } },
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, m.zh),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 3, lineHeight: 1.5 } }, m.blurb)));
          })),
        // ---- 历史：搜索 + 类型筛选 + 折叠（条数多也随时找得到）----
        saves.length ? (function () {
          const qlc = histQ.trim().toLowerCase();
          const active = !!qlc || histType !== "all";              // 有搜索或选了具体类型 → 平铺筛选结果
          const matchSess = s => (histType === "all" || s.mode === histType) && (!qlc || sessionText(s).indexOf(qlc) >= 0);
          const chip = (k, label, cnt) => { const on = histType === k; return h("button", { key: k, onClick: () => setHistType(k), className: "active:opacity-70",
            style: { fontFamily: F_BODY, fontSize: 12, color: on ? "#fff" : t.sub, background: on ? ACCENT : t.bg2, border: "1px solid " + (on ? ACCENT : t.line), borderRadius: 999, padding: "5px 12px", whiteSpace: "nowrap" } }, label + (cnt != null ? " " + cnt : "")); };
          return h("div", null,
            // 搜索框
            h("div", { style: { position: "relative", marginBottom: 10 } },
              h("span", { style: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.fog } }, "🔍"),
              h("input", { value: histQ, onChange: e => setHistQ(e.target.value), placeholder: "搜角色 / 问题 / 牌名…",
                style: { width: "100%", fontFamily: F_BODY, fontSize: 13.5, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "9px 32px 9px 32px", outline: "none" } }),
              qlc ? h("button", { onClick: () => setHistQ(""), className: "active:opacity-60", style: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: t.fog, lineHeight: 1 } }, "×") : null),
            // 类型筛选 chips（横滑）
            h("div", { style: { display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, marginBottom: 14 } },
              [chip("all", "全部", saves.length)].concat(Object.keys(MODES).filter(k => (byMode[k] || []).length).map(k => chip(k, MODES[k].icon + " " + MODES[k].zh, byMode[k].length)))),
            // 列表
            active
              ? (function () { const list = sorted.filter(matchSess);
                  return list.length
                    ? h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, list.map(histLine))
                    : h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "24px 0" } }, "没找到相关占卜"); })()
              : Object.keys(MODES).filter(k => (byMode[k] || []).length).map(k => {
                  const arr = byMode[k], exp = !!histExp[k], shown = exp ? arr : arr.slice(0, 3);
                  return h("div", { key: "h" + k, style: { marginBottom: 18 } },
                    h("div", { style: { display: "flex", alignItems: "center", gap: 7, marginBottom: 9 } },
                      h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: GOLD } }, MODES[k].icon),
                      h("span", { style: { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: t.sub, letterSpacing: .3 } }, MODES[k].zh),
                      h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "· " + arr.length)),
                    h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, shown.map(histLine)),
                    arr.length > 3 ? h("button", { onClick: () => setHistExp(p => ({ ...p, [k]: !exp })), className: "active:opacity-60",
                      style: { marginTop: 8, fontFamily: F_BODY, fontSize: 11.5, color: ACCENT } }, exp ? "收起" : "展开全部 " + arr.length + " 条 ▾") : null);
                }),
            h("div", { style: { marginTop: 10, textAlign: "center", fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "长按一条可撕掉"));
        })() : null
      ));
  }

  // ============================================================
  // 发起：选角色（+问题）→ 抽牌 → 解牌
  // ============================================================
  function Setup(props) {
    const t = useTheme();
    const m = MODES[props.modeKey];
    const [charId, setCharId] = useState("");
    const [dailyAll, setDailyAll] = useState(false); // 每日一牌：一次抽全部角色
    const [q, setQ] = useState("");
    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState("");

    const uName = (props.profile && props.profile.name) || "我";
    const isDailyAll = m.daily && dailyAll;

    const moodOf = id => { const mo = props.moods && props.moods[id]; return mo && mo.label ? String(mo.label) : ""; };

    const go = async () => {
      if (!isDailyAll && !charId) { props.toast && props.toast("先选一个角色"); return; }
      if (m.needQ && !q.trim()) { props.toast && props.toast("写下你想问的事"); return; }
      const rels = props.rels || {};

      // 每日一牌：一天只抽【一张】牌（全体共用），各角色解读【同一张】。
      // 同一天已抽的角色直接取旧解读；新角色（含点「全部角色」补齐没解过的人）追加进同一天的会话。
      if (m.daily) {
        const tk = todayKey();
        const card = todayCard(); // 今天这张牌，抽一次后当天固定
        const existing = loadSaves().find(s => s.mode === "daily" && s.dayKey === tk);
        const c0 = props.characters.find(x => x.id === charId);
        const wantChars = isDailyAll ? props.characters : (c0 ? [c0] : []);
        if (!wantChars.length) { props.toast && props.toast("先去『名录』建个角色"); return; }
        const have = {}; (existing && existing.entries || []).forEach(e => { have[e.charId] = true; });
        const toGen = wantChars.filter(x => !have[x.id]);
        if (!toGen.length && existing) { props.onDone(existing); return; } // 想看的人都解过了 → 直接看
        setBusy(true); setPhase(existing ? "解读今天这张牌…" : "正在翻开今天的牌…");
        try {
          const list = toGen.map(x => ({ id: x.id, name: x.name, persona: x.persona || "", mood: moodOf(x.id), voiceRef: recentChat(x.id, uName, x.name) }));
          const outs = await readDailyForCard(props.active, card, list, uName, props.worldbook);
          const newEntries = toGen.map((x, i) => ({ charId: x.id, charName: x.name, text: outs[i] ? outs[i].text : "" }));
          const merged = (existing && existing.entries || []).concat(newEntries);
          props.onDone({ id: "tr_daily_" + tk, mode: "daily", dayKey: tk, card: card, entries: merged, all: isDailyAll || !!(existing && existing.all), ts: Date.now() });
        } catch (e) { props.toast && props.toast("牌没摊开：" + (e.message || "重试")); setBusy(false); setPhase(""); }
        return;
      }

      const c = props.characters.find(x => x.id === charId);
      setBusy(true); setPhase("正在洗牌…");
      try {
        const cards = draw(m.spread.length);
        setPhase("牌已摊开，" + c.name + "正在解读…");
        const r1 = rels[c.id + "->me"], r2 = rels["me->" + c.id];
        const relText = [r2 && r2.label ? "你把 Ta 当作：" + r2.label : "", r1 && r1.label ? "Ta 把你当作：" + r1.label : ""].filter(Boolean).join("；");
        const aff = props.affinities ? props.affinities[c.id] : null;
        const out = await readSpread(props.active, {
          mode: props.modeKey, cards: cards, spread: m.spread,
          charName: c.name, charPersona: c.persona || "", uName: uName,
          question: q.trim(), relText: relText,
          band: (props.modeKey === "relation" || props.modeKey === "reading") ? affBand(aff) : "",
          voiceRef: recentChat(c.id, uName, c.name), mood: moodOf(c.id), worldbook: props.worldbook
        });
        props.onDone({
          id: "tr_" + Date.now(), mode: props.modeKey, charId: c.id, charName: c.name,
          question: q.trim(), spread: m.spread, cards: cards, reads: out.reads, summary: out.summary, charThought: out.charThought, ts: Date.now()
        });
      } catch (e) { props.toast && props.toast("牌没摊开：" + (e.message || "重试")); setBusy(false); setPhase(""); }
    };

    const label = { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: t.sub, marginBottom: 8, letterSpacing: .3 };

    if (busy) return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: m.zh, en: m.en, onBack: props.onCancel }),
      h("div", { className: "flex-1 flex flex-col items-center justify-center px-8" },
        h("div", { style: { fontSize: 40, color: ACCENT, marginBottom: 18 } }, m.icon),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink, textAlign: "center" } }, phase || "…")));

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: m.zh, en: m.en, onBack: props.onCancel }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-32" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, lineHeight: 1.7, marginBottom: 20 } }, m.blurb + "。"),
        // 每日一牌：一次抽全部角色
        m.daily ? h("button", { onClick: () => setDailyAll(v => !v), className: "w-full active:opacity-80",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 13px", background: isDailyAll ? "rgba(74,63,107,0.08)" : t.bg2, border: "1px solid " + (isDailyAll ? ACCENT : t.line), borderRadius: 11, marginBottom: 16 } },
          h("div", { style: { textAlign: "left" } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "让全部角色都解读"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, "所有人解读今天【同一张】牌，一次生成全部（省次数），进去挨个看")),
          h("div", { style: { width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: "1px solid " + (isDailyAll ? ACCENT : t.line), background: isDailyAll ? ACCENT : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 } }, isDailyAll ? "✓" : "")) : null,
        isDailyAll ? null : h("div", { style: label }, props.modeKey === "forchar" ? "替谁算" : props.modeKey === "relation" ? "算你和谁" : "请谁替你解牌"),
        isDailyAll ? null : h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 } },
          props.characters.map(c => {
            const on = charId === c.id;
            return h("button", { key: c.id, onClick: () => setCharId(prev => prev === c.id ? "" : c.id), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13, color: on ? "#fff" : t.ink, background: on ? ACCENT : t.bg2, border: "1px solid " + (on ? ACCENT : t.line), borderRadius: 999, padding: "8px 15px" } }, c.name);
          })),
        m.needQ ? h("div", { style: label }, "你想问的事") : null,
        m.needQ ? h("textarea", { value: q, onChange: e => setQ(e.target.value), rows: 3, placeholder: m.qHint,
          style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.6, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, padding: "11px 13px", width: "100%", outline: "none", resize: "none", marginBottom: 8 } }) : null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, lineHeight: 1.7 } },
          m.daily ? "今天只有【一张】牌，所有人解读同一张。" : "会摊开 " + m.spread.length + " 张牌：" + m.spread.join(" · ") + "。",
          h("br"), "牌是随机抽出的，模型只解读、不挑牌。")
      ),
      h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 20px calc(10px + env(safe-area-inset-bottom))", background: "linear-gradient(to top," + t.bg + " 78%,transparent)" } },
        h("button", { onClick: go, className: "w-full active:opacity-80",
          style: { fontFamily: F_BODY, fontSize: 14.5, fontWeight: 700, color: "#fff", background: ACCENT, borderRadius: 12, padding: "13px 0" } }, "洗牌 · 摊开")));
  }

  // ============================================================
  // 一次占卜的正文
  // ============================================================
  function SessionView(props) {
    const t = useTheme();
    const s = props.session;
    const m = MODES[s.mode] || {};
    const [fwd, setFwd] = useState(false);

    // 一张牌片
    const cardTile = (c, pos, i, small) => h("div", { key: "c" + i, style: { flex: small ? "0 0 auto" : "1 1 0", width: small ? 74 : "auto", minWidth: small ? 74 : 88, maxWidth: small ? 74 : 130 } },
      h("div", { style: { position: "relative", aspectRatio: "2/3.4", borderRadius: 11, background: "linear-gradient(160deg," + ACCENT + ",#241f38)", border: "1px solid rgba(184,145,80,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8, overflow: "hidden" } },
        h("div", { style: { position: "absolute", top: 6, left: 8, fontFamily: "'Archivo',sans-serif", fontSize: 9, letterSpacing: 1, color: "rgba(184,145,80,0.85)" } }, c.major ? "ARCANA" : ""),
        h("div", { style: { fontSize: small ? 17 : 22, color: GOLD, marginBottom: 8, transform: c.rev ? "rotate(180deg)" : "none" } }, m.icon || "✦"),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: small ? 13 : 15, color: "#f4efe4", textAlign: "center", lineHeight: 1.25 } }, c.name),
        h("div", { style: { marginTop: 6, fontFamily: F_BODY, fontSize: small ? 9 : 10, color: c.rev ? "#e0a3a3" : "rgba(244,239,228,0.7)", border: "1px solid rgba(184,145,80,0.4)", borderRadius: 999, padding: "1px 8px" } }, c.rev ? "逆位" : "正位")),
      pos ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, textAlign: "center", marginTop: 6 } }, pos) : null);

    // ---- 每日一牌：今天【一张】牌，各角色解读同一张 ----
    if (s.mode === "daily") {
      const entries = s.entries || [];
      const dc = s.card || (entries[0] && entries[0].card); // 兼容旧数据（旧版每人各一张时取第一张）
      return h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: m.zh, en: m.en, onBack: props.onBack }),
        h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 14, textAlign: "center" } }, fmtDate(s.ts) + " · 今天的牌"),
          // 今天这一张牌（全体共用）
          dc ? h("div", { style: { display: "flex", justifyContent: "center", marginBottom: 8 } }, cardTile(dc, "", 0, false)) : null,
          dc ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 22 } }, cardLabel(dc)) : null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: 700, color: t.sub, marginBottom: 12, letterSpacing: .3 } }, "各人怎么看这张牌"),
          entries.map((e, i) => h("div", { key: i, style: { marginBottom: 15, paddingBottom: 15, borderBottom: i < entries.length - 1 ? "1px solid " + t.line : "none" } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink, marginBottom: 3 } }, e.charName),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.8, color: t.ink } }, e.text)))));
    }

    // ---- reading / relation / forchar ----
    const cards = s.cards || [];
    const subject = s.mode === "forchar" ? "为 " + s.charName + " 而算" : s.mode === "relation" ? "你 与 " + s.charName : s.charName + " 为你解牌";
    const doForward = async () => {
      if (fwd || !props.onForwardToChat) return;
      setFwd(true);
      try { await props.onForwardToChat(s); } finally { setFwd(false); }
    };

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: m.zh || "占卜", en: m.en, onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
        // 抬头
        h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: GOLD, fontWeight: 700 } }, m.icon),
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, subject)),
        s.mode === "reading" && s.question ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, fontStyle: "italic", marginBottom: 16 } }, "「" + s.question + "」") : h("div", { style: { height: 12 } }),
        // 牌阵
        h("div", { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 } },
          cards.map((c, i) => cardTile(c, (s.spread || [])[i] || "", i))),
        // 逐张解读
        (s.reads || []).map((r, i) => h("div", { key: "r" + i, style: { marginBottom: 16 } },
          h("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, color: ACCENT, background: "rgba(74,63,107,0.1)", borderRadius: 6, padding: "1px 8px" } }, r.pos || (s.spread || [])[i] || ("第" + (i + 1) + "张")),
            cards[i] ? h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, cardLabel(cards[i])) : null),
          h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.8, color: t.ink, whiteSpace: "pre-wrap" } }, r.text))),
        // 收束
        s.summary ? h("div", { style: { marginTop: 8, padding: "14px 16px", background: "rgba(74,63,107,0.06)", border: "1px solid rgba(74,63,107,0.22)", borderRadius: 13 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: ACCENT, marginBottom: 6 } }, "牌面的话"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.8, color: t.ink } }, s.summary)) : null,
        // 角色本人对这几张牌的想法
        s.charThought ? h("div", { style: { marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: t.bg2, border: "1px solid " + t.line, borderRadius: 13 } },
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: GOLD, flexShrink: 0 } }, s.charName + "："),
          h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.75, color: t.ink, fontStyle: "italic" } }, s.charThought)) : null,
        // 给角色算一卦：转发给 Ta
        s.mode === "forchar" && props.onForwardToChat ? h("button", { onClick: doForward, disabled: fwd, className: "w-full active:opacity-80",
          style: { marginTop: 18, fontFamily: F_BODY, fontSize: 13.5, fontWeight: 700, color: "#fff", background: fwd ? t.fog : ACCENT, borderRadius: 12, padding: "12px 0" } }, fwd ? "正在转发…" : "把这一卦转发给 " + s.charName) : null));
  }

  window.Tarot = Tarot;
})();
