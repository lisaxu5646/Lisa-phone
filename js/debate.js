// ============================================================
// 辩论（debate）—— 擂台式，不是聊天框
// · 自定义题目 + 选 1~3 个角色（1 人=1v1，2~3 人=多人自由辩论）
// · 认真辩论（维持人设认真论辩）⇄ 放飞模式（允许按人设跑题发散）
// · 立场按人设自动站队；我 1v1 可选边/随机先手，多人一定最后发言
// · 一轮 = 所有角色各发言一次 + 我（最后）+ 场下观众 7~10 条弹幕
// · 观众 = 没上场的自建角色 + 随机路人，能互相 cue、点评某角色整体表现
// · 随时自动存档，从落地页重回；结束后系统判定胜负+判词，角色各自发表感言
// · 记忆不互通：可注入最近聊天当语气参考，但结束后什么都不写回记忆库
// 存 localStorage x_debate_saves（随云同步）；模型走全局 callAI + ANTI_CLICHE。
// ============================================================
(function () {
  const SIDE_COLORS = ["#c25a4a", "#3f6d8c", "#5a7a52", "#8a6d3b"];
  const ME_COLOR = "#6d5a78";
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const AC = () => (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "");

  function loadSaves() { return loadJSON("x_debate_saves", []); }
  function saveSaves(list) { saveJSON("x_debate_saves", list); }

  // 把角色最近的聊天抓一小段，仅当语气/近况参考（结束后不写回）
  function recentChatSnippet(charId, uName, charName) {
    const msgs = loadJSON("x_chat:" + charId, []);
    if (!msgs.length) return "";
    return msgs.slice(-12)
      .filter(m => m && (m.content || "").trim() && (m.role === "user" || m.role === "assistant"))
      .map(m => (m.role === "user" ? uName : charName) + "：" + String(m.content).replace(/\s+/g, " ").slice(0, 80))
      .join("\n");
  }

  // 全场实录（喂判定用），带回合与立场
  function fullTranscript(session, uName) {
    const lines = [];
    (session.rounds || []).forEach((r, ri2) => {
      lines.push("〔第" + (ri2 + 1) + "轮〕");
      (r.turns || []).forEach(tn => { if (!tn.skipped) lines.push(tn.name + "（" + (tn.stance || "—") + "）：" + tn.text); });
    });
    return lines.join("\n").slice(-8000);
  }
  // 已完成的前几轮实录（喂本轮批量生成用；当前这轮我刚发的言另作 myText 传，不含在内）
  function prevTranscript(session) {
    const rs = (session.rounds || []).slice(0, -1);
    const take = rs.slice(-3);
    const lines = [];
    take.forEach((r, k) => {
      lines.push("〔第" + (rs.length - take.length + k + 1) + "轮〕");
      (r.turns || []).forEach(tn => { if (!tn.skipped) lines.push(tn.name + "：" + tn.text); });
    });
    return lines.join("\n").slice(-3200);
  }

  // ---- 模型：按人设给每个角色分配立场 + 给我几个可选立场 ----
  async function assignStances(active, worldbook, topic, chars, isFree) {
    const roster = chars.map((c, i) => "角色" + (i + 1) + "「" + c.name + "」的人设：" + (c.persona || "（无设定）").slice(0, 400)).join("\n\n");
    const sys = AC() +
      "下面有一道辩题和几个人物。请【严格根据每个人的人设】判断 Ta 在这道题上最可能真心站的立场——性格、经历、价值观决定态度，别随便分正反。\n\n" +
      "【辩题】" + topic +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim().slice(0, 800) : "") +
      "\n\n" + roster +
      "\n\n【输出】只输出 JSON：{\"stances\":[{\"name\":\"角色名\",\"stance\":\"一句话概括Ta的立场\"}],\"myOptions\":[\"我方可选立场1\",\"我方可选立场2\"]}。" +
      "stances 每个角色一条；myOptions 给我 2~3 个可选立场（要包含和场上主要立场对立的那一个），短。别加解释。";
    // 放宽 token：思考型模型思考也吃额度，给太紧会把立场串写一半就停（输出免费）
    const raw = await callAI(active, sys, [{ role: "user", content: "分配立场。" }], { maxTokens: 4000 });
    const p = extractJSON(raw) || {};
    const out = {};
    (Array.isArray(p.stances) ? p.stances : []).forEach(s => { if (s && s.name) out[s.name] = String(s.stance || "").trim(); });
    const myOpts = (Array.isArray(p.myOptions) ? p.myOptions : []).map(x => String(x).trim()).filter(Boolean);
    return { byName: out, myOptions: myOpts.length ? myOpts : ["支持", "反对"] };
  }

  // ---- 模型：一轮一次调用 —— 同时生成【所有角色发言(按序)】+【场下观众弹幕】 ----
  //   我(用户)本轮已先发言，这里让台上角色依次接话、彼此也能对线，再刷观众席。
  //   按次计费 → 一轮一发省钱；输出免费 + 思考型模型 → maxTokens 给足，避免长发言被截断。
  //   为防「一次扮太多变笨」：每个角色单独成块列清人设/立场，强命令保持各自独立口吻、别串味别雷同。
  async function genRound(active, meta, uName, worldbook, o) {
    const casual = meta.mode === "free";
    const chars = o.chars; // 按发言顺序
    const rosterBlocks = chars.map(function (c, i) {
      return "【第" + (i + 1) + "位 · " + c.name + "】\n· 立场：" + (c.stance || "自行把握") + "\n· 人设：" + (c.persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 500) +
        (c.injection ? "\n· （Ta 和 " + uName + " 最近的聊天，仅用来拿捏关系/近况/语气，别照搬别复述）\n" + c.injection : "");
    }).join("\n\n");
    const benchBlock = (o.bench || []).map(function (c) { return "· " + c.name + "（" + (c.persona || "").replace(/\s+/g, " ").slice(0, 90) + "）"; }).join("\n");
    const sys = AC() +
      "这是一场辩论。你要在这一次里【同时扮演台上这几个角色，按给定顺序依次发言】，然后再生成场下观众席的弹幕。\n" +
      "⚠最重要：每个角色是不同的人，必须各自保持独立的立场、口吻、脾气、用词习惯——想象他们在抢麦互怼，别把他们写成一个腔调、别串味、别互相客气到失真。后发言的人要能接住前面的人和 " + uName + " 刚说的话。\n\n" +
      "【辩题】" + meta.topic +
      (casual
        ? "\n【放飞模式】各角色不必死守辩论规矩：可顺着自己性格跑题、抬杠、翻旧账、拿场上某人开玩笑、突然感性或耍无赖、把话题往自己在意处带——只要像 Ta 这个人。但别彻底离题。"
        : "\n【认真辩论】各角色维持人设的同时认真论辩：亮论点给理由，针对 " + uName + " 和彼此的话正面反驳或追问，讲逻辑也讲立场底气。别人身攻击、别空喊口号。") +
      (worldbook && worldbook.trim() ? "\n\n【世界书】\n" + worldbook.trim().slice(0, 700) : "") +
      "\n\n【台上角色（就按这个顺序发言）】\n" + rosterBlocks +
      "\n\n【" + uName + "（你们的对手，本轮已先开口）刚说】\n" + (o.myText ? o.myText : "（" + uName + " 这一轮跳过没说话，你们自己往下推进/开场）") +
      (o.transcript ? "\n\n【前几轮实录】\n" + o.transcript : "") +
      (benchBlock ? "\n\n【观众里有这些熟人（认识台上的人，弹幕要带各自偏袒/私人恩怨，用本名署名、贴人设）】\n" + benchBlock : "") +
      "\n\n【本次任务】\n" +
      "1）让上面每个角色各发一段言（顺序同上，共 " + chars.length + " 段），充分展开别水，2~6 句，口语带脾气，可点名回应某人。\n" +
      "2）再生成正好 " + o.count + " 条观众弹幕：有人揪某句吐槽/叫好，有人 @别的观众 接话吵起来，有人跳出本轮点评台上某人【整体表现】；熟人用本名带立场，其余起有网感的昵称，每条一句话短而毒。\n\n" +
      "【输出】只输出 JSON：{\"turns\":[{\"name\":\"角色名\",\"say\":\"发言\",\"at\":\"主要回应谁(没有留空)\"}],\"crowd\":[{\"name\":\"昵称或熟人本名\",\"text\":\"弹幕\",\"known\":true或false}]}。turns 顺序同上、每个角色一条；crowd 正好 " + o.count + " 条。别加旁白别 markdown。";
    // 慷慨给 token：多角色长发言 + 思考型模型思考也吃 token
    const budget = Math.min(20000, 4000 + chars.length * 2200 + o.count * 220);
    const raw = await callAI(active, sys, [{ role: "user", content: "开始：先按序各角色发言，再刷 " + o.count + " 条观众弹幕。" }], { maxTokens: budget });
    const p = extractJSON(raw) || {};
    const rawTurns = Array.isArray(p.turns) ? p.turns : [];
    // 回填到角色（先按名字匹配，匹配不上就按顺序兜底）
    const turns = chars.map(function (c, i) {
      let hit = rawTurns.find(function (x) { return x && x.name && String(x.name).trim() === c.name; });
      if (!hit) hit = rawTurns[i];
      const text = hit && hit.say ? String(hit.say).trim() : (hit && hit.text ? String(hit.text).trim() : "……");
      return { name: c.name, id: c.id, stance: c.stance, color: c.color, text: text || "……", at: hit && hit.at ? String(hit.at).trim() : "" };
    });
    let crowd = Array.isArray(p.crowd) ? p.crowd : [];
    crowd = crowd.map(function (c) { return { name: String((c && c.name) || "路人").trim().slice(0, 16), text: String((c && c.text) || "").trim(), known: !!(c && c.known) }; }).filter(function (c) { return c.text; }).slice(0, o.count);
    return { turns: turns, crowd: crowd };
  }

  // ---- 模型：结束结算 —— 一次调用出【胜负判定 + 各角色赛后感言】（省一次 API；玩家不生成感言）----
  async function genResult(active, session, uName) {
    const chars = session.parts.filter(p => p.kind === "char");
    const charRoster = chars.map(c => "「" + c.name + "」（立场：" + (c.stance || "—") + "；人设：" + (c.persona || "").replace(/\s+/g, " ").slice(0, 120) + "）").join("\n");
    const sys = AC() +
      "你是这场辩论的裁判兼主持。辩题：「" + session.topic + "」。参赛各方及立场：" + session.parts.map(p => p.name + "（" + (p.stance || "—") + "）").join("；") + "。\n" +
      (session.mode === "free"
        ? "本场是放飞局，胜负标准就按这一条来评：「" + (session.winCond || "谁整体最出彩谁赢") + "」，别用常规辩论对错来评。"
        : "按正规辩论评判：论点是否成立、论据是否扎实、有没有有效反驳对方、逻辑与说服力、临场应对，看谁整体更胜一筹。") +
      "\n\n【全程实录】\n" + fullTranscript(session, uName) +
      "\n\n【要一次做两件事】\n" +
      "1) 判出唯一胜者（可以是台上任何一方，包括玩家「" + uName + "」）+ 写判词：具体点到谁的哪些发言、对着评判标准说，别和稀泥。\n" +
      "2) 然后台上【每个角色】各发一句赛后感言，完全按各自人设反应赢/输（得意/谦逊/意犹未尽/不服/找补/摆烂…别一个腔调）。⚠只给下面这些角色写，【绝对不要】给玩家「" + uName + "」写感言。\n\n【台上角色】\n" + charRoster +
      "\n\n【输出】只输出 JSON：{\"winner\":\"胜者名字\",\"reason\":\"判词2~4句\",\"closings\":[{\"name\":\"角色名\",\"text\":\"感言1~3句\"}]}。closings 只含上面这些角色、每人一条。";
    // 放宽 token：判词 + 多角色感言一次出，思考型模型别写一半被截断（输出免费）
    const raw = await callAI(active, sys, [{ role: "user", content: "宣布结果，并让各角色各说一句赛后感言（别写玩家的）。" }], { maxTokens: Math.min(12000, 3500 + chars.length * 900) });
    const p = extractJSON(raw) || {};
    const charNames = chars.map(c => c.name);
    const closings = (Array.isArray(p.closings) ? p.closings : [])
      .map(c => ({ name: String((c && c.name) || "").trim(), text: String((c && c.text) || "").trim() }))
      .filter(c => c.text && c.name !== uName && charNames.indexOf(c.name) >= 0);
    return { winner: String(p.winner || "").trim() || "平局", reason: String(p.reason || raw || "").trim(), closings: closings };
  }

  // ============================================================
  // 顶层：落地页（存档列表 + 发起）
  // ============================================================
  function Debate(props) {
    const t = useTheme();
    const [saves, setSaves] = useState(loadSaves);
    const [view, setView] = useState("home"); // "home" | "setup" | <sessionId>
    const persist = list => { setSaves(list); saveSaves(list); };
    const patchSession = (id, patch) => {
      const list = loadSaves().map(s => s.id === id ? Object.assign({}, s, typeof patch === "function" ? patch(s) : patch) : s);
      persist(list);
    };
    const delSession = id => { if (window.confirm("删除这场辩论存档？")) { persist(loadSaves().filter(s => s.id !== id)); if (view === id) setView("home"); } };
    // 长按删除（onContextMenu 在手机上不触发，得自己起计时器）
    const lpTimer = useRef(null), lpFired = useRef(false);
    const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };
    const startLP = id => { lpFired.current = false; cancelLP(); lpTimer.current = setTimeout(() => { lpFired.current = true; delSession(id); }, 500); };

    if (view === "setup") {
      return h(Setup, {
        active: props.active, characters: props.characters, profile: props.profile, worldbook: props.worldbook, toast: props.toast,
        onCancel: () => setView("home"),
        onCreate: session => { persist([session].concat(loadSaves())); setView(session.id); }
      });
    }
    if (view !== "home") {
      const s = saves.find(x => x.id === view);
      if (!s) { setView("home"); return null; }
      return h(Arena, {
        session: s, active: props.active, characters: props.characters, profile: props.profile, worldbook: props.worldbook, toast: props.toast,
        onBack: () => { setSaves(loadSaves()); setView("home"); },
        onPatch: patch => patchSession(s.id, patch)
      });
    }

    // 落地页
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "辩论", en: "Debate", onBack: props.onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
        h("button", {
          onClick: () => { if (!props.characters.length) { props.toast && props.toast("先去『群像』建个角色"); return; } setView("setup"); },
          className: "w-full py-3 mb-5 active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 14, borderRadius: 11, border: "1px dashed " + t.line, color: t.sub, background: t.bg2 }
        }, "＋ 发起一场辩论"),
        saves.length === 0
          ? h("div", { style: { textAlign: "center", color: t.fog, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.8, paddingTop: 40, whiteSpace: "pre-line" } }, "还没有辩论。\n出个题、拉一两个角色上台，\n认真辩或者放飞都行。")
          : h("div", { style: { display: "flex", flexDirection: "column", gap: 11 } },
            saves.slice().sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)).map(s => {
              const names = s.parts.filter(p => p.kind === "char").map(p => p.name).join(" · ");
              const ended = s.status === "ended";
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
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, letterSpacing: .5, padding: "1px 7px", borderRadius: 6, color: "#fff", background: s.mode === "free" ? "#8a6d3b" : t.tint } }, s.mode === "free" ? "放飞" : "认真"),
                  ended ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 6, color: "#fff", background: t.accent } }, "已判定") : h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "第 " + ((s.rounds || []).length || 1) + " 轮进行中")),
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.35, color: t.ink, marginBottom: 4 } }, s.topic),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                  names, ended && s.verdict ? "　·　胜者 " + s.verdict.winner : "")
              );
            })),
        saves.length > 0 ? h("div", { style: { marginTop: 16, textAlign: "center", fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "长按可删除存档") : null
      ));
  }

  // ============================================================
  // 发起设置
  // ============================================================
  function Setup(props) {
    const t = useTheme();
    const [topic, setTopic] = useState("");
    const [picked, setPicked] = useState([]); // charId[]
    const [mode, setMode] = useState("serious"); // serious | free
    const [winCond, setWinCond] = useState("");
    const [inject, setInject] = useState(false);
    const [starting, setStarting] = useState(false);

    const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : (p.length >= 3 ? (props.toast && props.toast("最多选 3 个角色"), p) : p.concat(id)));

    const start = async () => {
      if (!topic.trim()) { props.toast && props.toast("先填辩题"); return; }
      if (!picked.length) { props.toast && props.toast("至少选 1 个角色上台"); return; }
      setStarting(true);
      try {
        const chars = picked.map(id => props.characters.find(c => c.id === id)).filter(Boolean);
        const uName = (props.profile && props.profile.name) || "我";
        const assigned = await assignStances(props.active, props.worldbook, topic.trim(), chars, mode === "free");
        // 参赛者结构（含我）
        const parts = chars.map((c, i) => ({
          kind: "char", id: c.id, name: c.name, persona: c.persona || "",
          stance: assigned.byName[c.name] || "自行把握", color: SIDE_COLORS[i % SIDE_COLORS.length],
          injection: inject ? recentChatSnippet(c.id, uName, c.name) : ""
        }));
        const me = { kind: "me", id: "__me__", name: uName, stance: "", color: ME_COLOR };
        // 我固定每轮第一个发言；角色发言顺序：多人=乱序，1v1=就那一个。parts 里我排最前（台上榜也我在先）
        const order = shuffle(chars).map(c => ({ kind: "char", id: c.id }));
        const session = {
          id: "db_" + Date.now(), topic: topic.trim(), mode: mode,
          winCond: mode === "free" ? (winCond.trim() || "") : "",
          parts: [me].concat(parts), order: order, myOptions: assigned.myOptions, mySet: false,
          rounds: [{ turns: [], audience: [], myDone: false, gen: false }],
          status: "ongoing", verdict: null, closings: [], createdTs: Date.now(), lastTs: Date.now()
        };
        props.onCreate(session);
      } catch (e) { props.toast && props.toast("开场失败：" + (e.message || "重试")); setStarting(false); }
    };

    const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, padding: "11px 13px", width: "100%", outline: "none" };
    const label = { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: t.sub, marginBottom: 8, letterSpacing: .3 };

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "发起辩论", en: "New", onBack: props.onCancel }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-32" },
        // 题目
        h("div", { style: label }, "辩题"),
        h("textarea", { value: topic, onChange: e => setTopic(e.target.value), placeholder: "例：该不该为爱情放弃事业 / 咖啡还是茶 / 先有鸡还是先有蛋…", rows: 2, style: Object.assign({}, field, { resize: "none", marginBottom: 20 }) }),
        // 选角色
        h("div", { style: label }, "上台的角色（选 1 个=和你 1v1；2~3 个=多人自由辩论）"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 } },
          props.characters.length === 0 ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "还没有角色") :
            props.characters.map(c => {
              const on = picked.includes(c.id);
              return h("button", { key: c.id, onClick: () => toggle(c.id), className: "active:opacity-70",
                style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 11px 6px 6px", borderRadius: 999, border: "1.5px solid " + (on ? t.accent : t.line), background: on ? t.accent + "18" : t.bg2 } },
                h(Avatar, { character: c, size: 22, radius: 999 }),
                h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: on ? t.accent : t.ink, fontWeight: on ? 700 : 400 } }, c.name));
            })),
        // 模式
        h("div", { style: label }, "模式"),
        h("div", { style: { display: "flex", gap: 8, marginBottom: mode === "free" ? 14 : 20 } },
          [["serious", "认真辩论", "维持人设，正经论辩"], ["free", "放飞模式", "允许按人设跑题发散"]].map(m =>
            h("button", { key: m[0], onClick: () => setMode(m[0]), className: "active:opacity-70 flex-1",
              style: { textAlign: "left", padding: "11px 13px", borderRadius: 11, border: "1.5px solid " + (mode === m[0] ? t.accent : t.line), background: mode === m[0] ? t.accent + "12" : t.bg2 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, fontWeight: 700, color: mode === m[0] ? t.accent : t.ink } }, m[1]),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, m[2])))),
        // 放飞：获胜条件（可自定；留空则结算时系统临场定，不额外花 API）
        mode === "free" ? h("div", { style: { marginBottom: 20 } },
          h("div", { style: label }, "获胜条件（可自定，留空=判定时系统临场定）"),
          h("textarea", { value: winCond, onChange: e => setWinCond(e.target.value), placeholder: "例：谁先把对方逗笑 / 谁成功把话题带跑偏…（不填也行，结算时系统会定标准）", rows: 2, style: Object.assign({}, field, { resize: "none" }) })) : null,
        // 注入聊天
        h("button", { onClick: () => setInject(v => !v), className: "active:opacity-70",
          style: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid " + t.line, background: t.bg2, marginBottom: 4 } },
          h("div", { style: { width: 38, height: 22, borderRadius: 999, background: inject ? t.accent : t.line, position: "relative", transition: "background .15s", flexShrink: 0 } },
            h("div", { style: { width: 18, height: 18, borderRadius: 999, background: "#fff", position: "absolute", top: 2, left: inject ? 18 : 2, transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" } })),
          h("div", { style: { textAlign: "left" } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "注入你俩最近的聊天"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 1 } }, "只当语气/近况参考，辩论结束后不写回记忆"))),
      ),
      // 底部开始
      h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(to top," + t.bg + " 70%,transparent)" } },
        h("button", { onClick: start, disabled: starting, className: "w-full active:opacity-80",
          style: { fontFamily: F_BODY, fontSize: 15, fontWeight: 700, color: "#fff", background: starting ? t.fog : t.accent, borderRadius: 13, padding: "13px 0" } },
          starting ? "正在安排立场…" : "开始辩论")));
  }

  // ============================================================
  // 擂台
  // ============================================================
  function Arena(props) {
    const t = useTheme();
    const s = props.session;
    const uName = (props.profile && props.profile.name) || "我";
    // 我在擂台上的头像：用真实资料卡头像，没有再退回底色首字
    const meAv = { name: uName, avatarImage: props.profile && props.profile.avatarImage, avatarEmoji: props.profile && props.profile.avatarEmoji, color: (props.profile && props.profile.color) || ME_COLOR };
    const [busy, setBusy] = useState(false);
    const [phaseMsg, setPhaseMsg] = useState("");
    const [draft, setDraft] = useState("");
    const feedRef = useRef(null);
    const curRound = () => (s.rounds[s.rounds.length - 1] || { turns: [], audience: [] });

    useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [s.rounds, busy, phaseMsg]);

    // 保存补丁：始终基于最新 session 做，避免闭包过期
    const patch = obj => props.onPatch(prev => Object.assign({}, prev, typeof obj === "function" ? obj(prev) : obj, { lastTs: Date.now() }));

    // 每轮阶段：我先发言(myDone) → 一次批量生成全部角色+观众(gen) → 下一轮
    const roundMyDone = r => !!(r && (r.myDone || (r.turns || []).some(x => x.who === "me")));
    const roundGen = r => !!(r && (r.gen || (r.audience && r.audience.length) || (r.turns || []).some(x => x.who === "char")));
    const cr = curRound();
    const myTurnNow = s.mySet && !roundMyDone(cr);   // 该我(固定先手)发言
    const needGen = roundMyDone(cr) && !roundGen(cr); // 我说完/跳过了，等这一次批量生成（失败可重试）
    const roundDone = roundMyDone(cr) && roundGen(cr);
    const roundNo = s.rounds.length;

    // 一次调用批量生成【全部角色发言(按序) + 观众弹幕】
    const runGen = async (myText, skip) => {
      setBusy(true); setPhaseMsg("台上依次接话、场下开始起哄…");
      try {
        const charParts = s.parts.filter(p => p.kind === "char");
        const onIds = charParts.map(c => c.id);
        const bench = props.characters.filter(c => !onIds.includes(c.id)).slice(0, 6).map(c => ({ name: c.name, persona: c.persona || "" }));
        const orderedChars = (s.order || []).map(o => charParts.find(c => c.id === o.id)).filter(Boolean);
        const count = ri(7, 10);
        const r = await genRound(props.active, { mode: s.mode, topic: s.topic }, uName, props.worldbook, {
          chars: orderedChars.map(c => ({ name: c.name, id: c.id, persona: c.persona, stance: c.stance, color: c.color, injection: c.injection })),
          myText: skip ? "" : myText, transcript: prevTranscript(s), bench: bench, count: count
        });
        patch(prev => {
          const rounds = prev.rounds.slice();
          const last = Object.assign({}, rounds[rounds.length - 1]);
          last.turns = last.turns.concat(r.turns.map(tn => ({ who: "char", id: tn.id, name: tn.name, stance: tn.stance, color: tn.color, text: tn.text, at: tn.at })));
          last.audience = r.crowd;
          last.gen = true;
          rounds[rounds.length - 1] = last;
          return { rounds: rounds };
        });
      } catch (e) { props.toast && props.toast("生成失败：" + (e.message || "重试")); }
      setBusy(false); setPhaseMsg("");
    };

    // 我先发言（或跳过）→ 立刻触发本轮批量生成
    const submitRound = async skip => {
      const myText = skip ? "" : draft.trim();
      if (!skip && !myText) { props.toast && props.toast("说点什么，或点跳过"); return; }
      const mePart = s.parts.find(p => p.kind === "me");
      patch(prev => {
        const rounds = prev.rounds.slice();
        const last = Object.assign({}, rounds[rounds.length - 1]);
        last.turns = last.turns.concat([{ who: "me", id: "__me__", name: uName, stance: mePart.stance, color: ME_COLOR, skipped: skip, text: skip ? "（跳过了这一回合）" : myText }]);
        last.myDone = true;
        rounds[rounds.length - 1] = last;
        return { rounds: rounds };
      });
      setDraft("");
      await runGen(myText, skip);
    };

    // 生成失败后的重试：找回本轮我说的话再跑一次
    const retryGen = () => { const t2 = (cr.turns || []).find(x => x.who === "me"); runGen(t2 && !t2.skipped ? t2.text : "", !!(t2 && t2.skipped)); };

    const nextRound = () => patch(prev => ({ rounds: (prev.rounds || []).concat([{ turns: [], audience: [], myDone: false, gen: false }]) }));

    // 我的立场未定 → 先选边
    const setMySide = st => patch(prev => {
      const parts = prev.parts.map(p => p.kind === "me" ? Object.assign({}, p, { stance: st }) : p);
      return { parts: parts, mySet: true };
    });

    // 结束判定
    const endDebate = async () => {
      if (!window.confirm("结束辩论并由系统判定胜负？")) return;
      setBusy(true); setPhaseMsg("裁判合议、选手准备感言…");
      try {
        // 判定 + 各角色感言合并成一次调用（省一次 API）
        const r = await genResult(props.active, s, uName);
        patch({ status: "ended", verdict: { winner: r.winner, reason: r.reason }, closings: r.closings });
      } catch (e) { props.toast && props.toast("判定失败：" + (e.message || "重试")); }
      setBusy(false); setPhaseMsg("");
    };

    // ---------- 渲染：结束态 ----------
    const ended = s.status === "ended";

    // 顶部擂台条
    const stage = h("div", { style: { padding: "10px 14px 12px", background: t.bg2, borderBottom: "1px solid " + t.line } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.3, color: t.ink, textAlign: "center", marginBottom: 9 } }, "「" + s.topic + "」"),
      h("div", { style: { display: "flex", justifyContent: "center", alignItems: "flex-start", flexWrap: "wrap", gap: 4 } },
        s.parts.map((p, i) => h(React.Fragment, { key: p.kind === "me" ? "me" : p.id },
          i > 0 ? h("span", { style: { fontFamily: F_DISPLAY, fontSize: 11, color: t.fog, alignSelf: "center", margin: "0 3px" } }, s.parts.length === 2 ? "VS" : "·") : null,
          h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: 74 } },
            p.kind === "char"
              ? h(Avatar, { character: props.characters.find(c => c.id === p.id) || { name: p.name }, size: 30, radius: 999 })
              : h(Avatar, { character: meAv, size: 30, radius: 999 }),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.ink, marginTop: 3, maxWidth: 74, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.kind === "me" ? uName : p.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 8.5, lineHeight: 1.3, color: "#fff", background: p.color, borderRadius: 5, padding: "2px 5px", marginTop: 3, maxWidth: 74, textAlign: "center", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" } }, p.stance || (p.kind === "me" ? "待定" : "—"))))))
    );

    // 发言卡
    const turnCard = (tn, k) => tn.skipped
      ? h("div", { key: k, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11, color: t.fog, padding: "4px 0" } }, "—— " + tn.name + " 跳过了这一回合 ——")
      : h("div", { key: k, style: { background: t.bg2, borderRadius: 12, borderLeft: "3px solid " + tn.color, padding: "9px 12px", marginBottom: 9 } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
          tn.who === "char" ? h(Avatar, { character: props.characters.find(c => c.id === tn.id) || { name: tn.name }, size: 18, radius: 999 })
            : h(Avatar, { character: meAv, size: 18, radius: 999 }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, fontWeight: 700, color: tn.color } }, tn.name),
          tn.at ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog } }, "→ " + tn.at) : null),
        h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, color: t.ink, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", WebkitOverflowScrolling: "touch" } }, tn.text));

    // 观众席块
    const audienceBlock = (crowd, k) => h("div", { key: "aud" + k, style: { background: "#2b2a27", borderRadius: 12, padding: "10px 12px", margin: "4px 0 12px" } },
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: "#c9c4b6", marginBottom: 7 } }, "观众席 · 弹幕"),
      crowd.map((c, i) => h("div", { key: i, style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.7, color: "#ece8df", marginBottom: 2 } },
        h("span", { style: { color: c.known ? "#e8a598" : "#8fb0c9", fontWeight: 600 } }, "@" + c.name + "："), c.text)));

    return h("div", { className: "h-full flex flex-col" },
      // 头
      h("div", { className: "shrink-0", style: { background: t.bg } },
        h("div", { className: "flex items-center justify-between px-4 pt-4 pb-2" },
          h("button", { onClick: props.onBack, className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
          h("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: 700, color: "#fff", background: s.mode === "free" ? "#8a6d3b" : t.tint, padding: "2px 9px", borderRadius: 7 } }, s.mode === "free" ? "放飞" : "认真"),
            !ended ? h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub } }, "第 " + roundNo + " 轮") : h("span", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: 700, color: "#fff", background: t.accent, padding: "2px 9px", borderRadius: 7 } }, "已结束"))),
        stage),
      // 正文
      h("div", { ref: feedRef, className: "flex-1 overflow-y-auto px-4 pt-3", style: { paddingBottom: ended ? 24 : 150 } },
        (s.rounds || []).map((r, ri2) => h("div", { key: ri2 },
          h("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "6px 0 10px" } },
            h("div", { style: { flex: 1, height: 1, background: t.line } }),
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 12, color: t.fog } }, "第 " + (ri2 + 1) + " 轮"),
            h("div", { style: { flex: 1, height: 1, background: t.line } })),
          (r.turns || []).map(turnCard),
          (r.audience && r.audience.length) ? audienceBlock(r.audience, ri2) : null)),
        busy ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "10px 0" } }, phaseMsg || "…") : null,
        // 结束态：判定 + 感言
        ended && s.verdict ? h("div", { style: { marginTop: 8 } },
          h("div", { style: { background: t.bg2, border: "1.5px solid " + t.accent, borderRadius: 14, padding: "14px 16px", marginBottom: 14 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: t.accent, marginBottom: 6 } }, "⚖ 裁判判定"),
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginBottom: 7 } }, "胜者：" + s.verdict.winner),
            h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.sub, whiteSpace: "pre-wrap" } }, s.verdict.reason)),
          (s.closings && s.closings.some(c => c.name !== uName)) ? h("div", null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: t.fog, marginBottom: 9 } }, "赛后感言"),
            s.closings.filter(c => c.name !== uName).map((c, i) => {
              const cp = s.parts.find(p => p.name === c.name && p.kind === "char");
              return h("div", { key: i, style: { display: "flex", gap: 8, marginBottom: 10 } },
                cp ? h(Avatar, { character: props.characters.find(x => x.id === cp.id) || { name: c.name }, size: 26, radius: 999 }) : h("div", { style: { width: 26 } }),
                h("div", { style: { flex: 1 } },
                  h("div", { style: { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: cp ? cp.color : t.ink, marginBottom: 2 } }, c.name),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, color: t.ink } }, c.text)));
            })) : null) : null),
      // 底部操作
      ended ? null : h("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", background: "linear-gradient(to top," + t.bg + " 78%,transparent)" } },
        busy
          ? h("button", { disabled: true, className: "w-full", style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.fog, borderRadius: 11, padding: "12px 0" } }, phaseMsg || "生成中…")
          // 我的立场未定 → 先选边
          : !s.mySet ? h("div", null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 7, textAlign: "center" } }, "选你的立场（你每轮固定第一个发言）"),
            h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" } },
              (s.myOptions || ["支持", "反对"]).map((op, i) => h("button", { key: i, onClick: () => setMySide(op), className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 12.5, color: "#fff", background: ME_COLOR, borderRadius: 999, padding: "8px 15px" } }, op)),
              h("button", { onClick: () => { const v = window.prompt("自定义你的立场"); if (v && v.trim()) setMySide(v.trim()); }, className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "8px 15px" } }, "自定义")))
          // 我先发言（含跳过）
          : myTurnNow ? h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
            h("textarea", { value: draft, onChange: e => setDraft(e.target.value), placeholder: roundNo === 1 ? "你先开场，抛出你的观点…" : "轮到你先说，接着往下辩…", rows: 2,
              style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "10px 12px", resize: "none", outline: "none" } }),
            h("div", { style: { display: "flex", gap: 8 } },
              h("button", { onClick: () => submitRound(true), className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, background: t.bg2, border: "1px solid " + t.line, borderRadius: 11, padding: "10px 16px" } }, "跳过本回合"),
              h("button", { onClick: () => submitRound(false), className: "flex-1 active:opacity-80",
                style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: ME_COLOR, borderRadius: 11, padding: "10px 0" } }, "发言，让他们回应")))
          // 生成失败兜底：重试
          : needGen ? h("div", { style: { display: "flex", gap: 8 } },
            h("button", { onClick: endDebate, className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13, color: t.accent, background: t.bg2, border: "1px solid " + t.accent, borderRadius: 11, padding: "11px 14px" } }, "⚖ 结束判定"),
            h("button", { onClick: retryGen, className: "flex-1 active:opacity-80",
              style: { fontFamily: F_BODY, fontSize: 14, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 11, padding: "11px 0" } }, "↻ 重新生成本轮回应"))
          // 本轮已完成 → 结束 / 下一轮
          : h("div", { style: { display: "flex", gap: 8 } },
            h("button", { onClick: endDebate, className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 13, color: t.accent, background: t.bg2, border: "1px solid " + t.accent, borderRadius: 11, padding: "11px 14px" } }, "⚖ 结束判定"),
            h("button", { onClick: nextRound, className: "flex-1 active:opacity-80",
              style: { fontFamily: F_BODY, fontSize: 14.5, fontWeight: 700, color: "#fff", background: t.ink, borderRadius: 11, padding: "11px 0" } }, "下一轮 →"))));
  }

  window.Debate = Debate;
})();
