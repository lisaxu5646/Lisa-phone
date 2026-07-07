// ============================================================
// 番茄钟 · 同频陪伴（pomodoro）—— 独立小 app
// 玩法：选一个角色一起专注 → 进沉浸计时页（角色头像/背景 + 轮流冒出几句陪你的话 + 倒计时）。
//   想中途退出 → 得输入「只有你俩才懂的暗号」；提示按人设+聊天记录给；输错框会抖+甩你一句。
//   结束 → 专注统计卡（状态/时长/逃跑尝试/密码错误）+ 角色手写批注。
// 【最省 API】：按下开始时【只调一次】callAI，一次性拿全所有文案——
//   轮流陪伴语 lines、守候语 stay、退出暗号 password、暗号提示 hint、挽留 taunt、输错 wrongPass、
//   以及三种结局批注（doneClean 一次没跑就坚持完 / doneTried 想跑过但坚持完 / gaveUp 输对暗号溜了）。
//   结束时按实际结局【本地挑一条】现成批注，不再调 API。没配 API 时用兜底文案照样能玩。
// 存 x_pomodoro_saves（随云同步）。
// ============================================================
(function () {
  const AC = () => (typeof ANTI_CLICHE !== "undefined" ? ANTI_CLICHE + "\n\n" : "");
  const loadSaves = () => loadJSON("x_pomodoro_saves", []);
  const saveSaves = l => saveJSON("x_pomodoro_saves", l);
  const uid = () => "pf_" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const pad2 = n => String(n).padStart(2, "0");
  const fmtClock = s => pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
  const fmtDate = ts => { const d = new Date(ts); return d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
  const normPass = s => String(s || "").trim().toLowerCase().replace(/[\s，。,.!！?？、"'“”·~～]/g, "");

  function recentChat(charId, uName, charName) {
    const msgs = loadJSON("x_chat:" + charId, []);
    if (!msgs.length) return "";
    return msgs.slice(-14).filter(m => m && (m.content || "").trim() && (m.role === "user" || m.role === "assistant"))
      .map(m => (m.role === "user" ? uName : charName) + "：" + String(m.content).replace(/\s+/g, " ").slice(0, 60)).join("\n");
  }

  function fallbackPack(task, min) {
    return {
      lines: ["就 " + min + " 分钟，陪我坐住。", "别晃了，专注。", "我盯着你呢，认真点。"],
      stay: "我就在这里，哪也不去。",
      password: "陪你",
      hint: "很简单，就是我一直在做的那件事——两个字。",
      taunt: "既然开始了，就得陪我到最后。除非…你记得只有我们才知道的暗号。",
      wrongPass: "错了，休想逃跑。",
      doneClean: "乖，坐满了。这才对。",
      doneTried: "才这么点时间就想跑，出息了。",
      gaveUp: "行，你走吧——反正你也坐不住。"
    };
  }

  async function genPack(active, ctx) {
    const { charName, persona, mood, uName, task, min, chatRef, worldbook } = ctx;
    const sys = AC() +
      "你是「" + charName + "」，正在【同频陪伴】" + uName + " 一起专注做一件事：「" + task + "」，说好一起坚持 " + min + " 分钟。全程用你自己的口吻、你俩的关系与相处方式，别客服腔、别八股、别报菜名。\n" +
      "【你的人设】" + (persona || "（暂无设定）").replace(/\s+/g, " ").slice(0, 400) + (mood ? "\n【你此刻心情】" + mood : "") +
      (chatRef ? "\n【你俩最近的聊天（取梗、口吻、只有你俩懂的东西，用来定暗号和提示）】\n" + chatRef : "") +
      (worldbook && worldbook.trim() ? "\n【世界书（仅参考）】\n" + worldbook.trim().slice(0, 300) : "") +
      "\n\n产出下面这些短文本（都要短、像真人随口说、带你的性格，一句一条，别一个腔调）：\n" +
      "· lines：3~5 句你在陪 Ta 专注时会随口说的话（调侃 Ta 坐不住 / 督促 / 陪伴 / 对这个任务和时长的吐槽，如『才一分钟？够看序言吗』），各不相同。\n" +
      "· stay：一句『我守在这、哪也不去』意思的陪伴话，你的口吻。\n" +
      "· password：一个【只有你俩才懂】的退出暗号——从你俩的聊天 / 共同记忆 / 私人梗里取一个【具体的词或短语】（2~6 字，别太长、别用『密码/退出/专注/暗号』这类通用词），Ta 得真想得起来才走得掉。\n" +
      "· hint：用你的口吻给这个暗号的提示，【绝对别直接说出暗号】，绕着说、带你俩的私人梗。\n" +
      "· taunt：Ta 想中途退出时你会说的一句挑衅又不舍的话。\n" +
      "· wrongPass：Ta 输错暗号时你甩的一句（短、你的口吻、可凶可撒娇）。\n" +
      "· doneClean：Ta 全程一次没想跑、坚持到最后，你给的一句批注（像手写小纸条，你的口吻）。\n" +
      "· doneTried：Ta 中途想跑过、但还是坚持到最后，你给的一句批注（可以损 Ta，但心里是满意的）。\n" +
      "· gaveUp：Ta 输对暗号提前溜了，你给的一句批注（无奈 / 嫌弃 / 口是心非）。\n" +
      "【输出】只输出 JSON，不要代码块：{\"lines\":[\"..\"],\"stay\":\"..\",\"password\":\"..\",\"hint\":\"..\",\"taunt\":\"..\",\"wrongPass\":\"..\",\"doneClean\":\"..\",\"doneTried\":\"..\",\"gaveUp\":\"..\"}";
    const raw = await callAI(active, sys, [{ role: "user", content: "开始。" }], { maxTokens: 2200 });
    const p = extractJSON(raw) || {};
    const fb = fallbackPack(task, min);
    const str = (v, d) => { const s = v != null ? String(v).trim() : ""; return s && s.toLowerCase() !== "null" ? s : d; };
    return {
      lines: Array.isArray(p.lines) && p.lines.filter(Boolean).length ? p.lines.filter(Boolean).map(x => String(x).trim()) : fb.lines,
      stay: str(p.stay, fb.stay), password: str(p.password, fb.password), hint: str(p.hint, fb.hint),
      taunt: str(p.taunt, fb.taunt), wrongPass: str(p.wrongPass, fb.wrongPass),
      doneClean: str(p.doneClean, fb.doneClean), doneTried: str(p.doneTried, fb.doneTried), gaveUp: str(p.gaveUp, fb.gaveUp)
    };
  }

  // 结局统计卡（结果页 + 往期回看共用）
  function ResultCard(t, rec, char, onClose) {
    const row = (k, v, danger) => h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px dashed " + t.line } },
      h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, k),
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: danger && v ? "#a8433a" : t.ink, fontWeight: 600 } }, v));
    return h("div", { onClick: onClose, style: { position: "absolute", inset: 0, zIndex: 60, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } },
      h("div", { onClick: e => e.stopPropagation(), style: { width: "100%", maxWidth: 340, background: t.bg2, borderRadius: 20, padding: "22px 22px 24px", animation: "fadeUp .2s ease both", maxHeight: "88%", overflowY: "auto" } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, letterSpacing: "0.1em", color: "#fff", background: t.ink, borderRadius: 6, padding: "4px 10px" } }, rec.status === "done" ? "专注完成" : "专注中断"),
          h("button", { onClick: onClose, className: "active:opacity-60", style: { background: "transparent", border: "none" } }, h(IX, { size: 20, color: t.fog }))),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 26, color: t.ink, lineHeight: 1.1 } }, rec.task),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 6, letterSpacing: "0.03em" } }, "日期：" + fmtDate(rec.ts)),
        h("div", { style: { background: t.bg, border: "1px solid " + t.line, borderRadius: 14, padding: "4px 16px", margin: "18px 0 20px" } },
          row("任务状态", rec.statusZh || (rec.status === "done" ? "圆满完成" : "中途离开")),
          row("设定时长", rec.minutes + " 分钟"),
          row("逃跑尝试", String(rec.escapes || 0), true),
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0" } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "密码错误"),
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: (rec.wrong ? "#a8433a" : t.ink), fontWeight: 600 } }, String(rec.wrong || 0)))),
        rec.annotation ? h("div", { style: { textAlign: "center", padding: "4px 6px" } },
          h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: t.ink } }, "“" + rec.annotation + "”"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginTop: 12, textAlign: "right" } }, "— " + (rec.charName || (char && char.name) || ""))) : null));
  }

  function Pomodoro(props) {
    const t = useTheme();
    const uName = (props.profile && props.profile.name) || "我";
    const chars = props.characters || [];
    const [view, setView] = useState("setup"); // setup | focus | result | archive
    const [saves, setSaves] = useState(loadSaves);
    const [detail, setDetail] = useState(null);

    const [charId, setCharId] = useState(chars[0] ? chars[0].id : "");
    const [task, setTask] = useState("一起看书");
    const [min, setMin] = useState(25);
    const [busy, setBusy] = useState(false);

    const [sess, setSess] = useState(null);
    const [left, setLeft] = useState(0);
    const [lineIdx, setLineIdx] = useState(0);
    const escRef = useRef({ escapes: 0, wrong: 0 });
    const [escOpen, setEscOpen] = useState(false);
    const [pass, setPass] = useState("");
    const [showHint, setShowHint] = useState(false);
    const [shake, setShake] = useState(false);
    const [wrongMsg, setWrongMsg] = useState("");
    const [result, setResult] = useState(null);
    const timerRef = useRef(null);

    const charOf = id => chars.find(c => c.id === id);
    const moodOf = id => { const mo = props.moods && props.moods[id]; return mo && mo.label ? String(mo.label) : ""; };

    const finish = status => {
      if (timerRef.current) clearInterval(timerRef.current);
      const s = sess; if (!s) return;
      const esc = escRef.current;
      let annotation, statusZh;
      if (status === "done") { statusZh = "圆满完成"; annotation = esc.escapes > 0 ? s.pack.doneTried : s.pack.doneClean; }
      else { statusZh = "中途离开"; annotation = s.pack.gaveUp; }
      const rec = { id: uid(), charId: s.char.id, charName: s.char.name, task: s.task, minutes: s.min, ts: Date.now(), status, statusZh, escapes: esc.escapes, wrong: esc.wrong, annotation };
      const next = [rec].concat(loadSaves()); saveSaves(next); setSaves(next);
      setResult({ rec, char: s.char }); setEscOpen(false); setPass(""); setShowHint(false); setView("result");
    };
    const finishRef = useRef(finish); finishRef.current = finish;

    useEffect(() => {
      if (view !== "focus" || !sess) return;
      timerRef.current = setInterval(() => { setLeft(l => { if (l <= 1) { clearInterval(timerRef.current); finishRef.current("done"); return 0; } return l - 1; }); }, 1000);
      const arr = [sess.pack.stay].concat(sess.pack.lines || []);
      const iv = setInterval(() => setLineIdx(i => (i + 1) % arr.length), 7000);
      return () => { clearInterval(timerRef.current); clearInterval(iv); };
    }, [view, sess && sess.startTs]);

    const start = async () => {
      const c = charOf(charId);
      if (!c) { props.toast && props.toast("先去『名录』选/建个角色陪你"); return; }
      if (!min || min < 1) { props.toast && props.toast("时长至少 1 分钟"); return; }
      setBusy(true);
      let pack;
      try {
        pack = props.active
          ? await genPack(props.active, { charName: c.name, persona: c.persona, mood: moodOf(c.id), uName, task: task.trim() || "专注", min, chatRef: recentChat(c.id, uName, c.name), worldbook: props.worldbook })
          : fallbackPack(task.trim() || "专注", min);
      } catch (e) { pack = fallbackPack(task.trim() || "专注", min); }
      escRef.current = { escapes: 0, wrong: 0 };
      setSess({ char: c, pack, min, task: task.trim() || "专注", startTs: Date.now() });
      setLeft(min * 60); setLineIdx(0); setBusy(false); setView("focus");
    };

    const openEsc = () => { escRef.current.escapes += 1; setEscOpen(true); setPass(""); setShowHint(false); setWrongMsg(""); };
    const trySubmit = () => {
      if (!sess) return;
      if (normPass(pass) && normPass(pass) === normPass(sess.pack.password)) { finish("left"); return; }
      escRef.current.wrong += 1;
      setWrongMsg(sess.pack.wrongPass || "密码错误，休想逃跑。");
      setShake(true); setTimeout(() => setShake(false), 480);
    };

    const styleTag = h("style", null, "@keyframes pf-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}");

    // ---- 结果页 ----
    if (view === "result" && result) {
      return h("div", { className: "h-full", style: { position: "relative", background: t.bg } },
        h("div", { className: "h-full flex flex-col items-center justify-center", style: { opacity: 0.25 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 60, color: t.ink } }, fmtClock(0))),
        ResultCard(t, result.rec, result.char, () => { setResult(null); setSess(null); setView("setup"); }));
    }

    // ---- 往期回看 ----
    if (view === "archive") {
      return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
        h("div", { className: "shrink-0 px-5 pt-5 pb-3 flex items-center gap-3" },
          h("button", { onClick: () => setView("setup"), className: "active:opacity-50", style: { background: "transparent", border: "none" } }, h(IArrow, { size: 19, color: t.ink })),
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink } }, "专注记录")),
        h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
          saves.length === 0
            ? h("div", { style: { textAlign: "center", padding: "60px 0", fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "还没有专注记录")
            : saves.map(r => h("button", { key: r.id, onClick: () => setDetail(r), className: "w-full text-left active:opacity-80",
                style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "13px 15px", marginBottom: 10, display: "block" } },
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 } },
                  h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, r.task),
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: r.status === "done" ? "#4f6d5a" : "#a8433a" } }, r.statusZh || (r.status === "done" ? "圆满完成" : "中途离开"))),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, fmtDate(r.ts) + " · " + r.charName + " · " + r.minutes + " 分钟" + (r.escapes ? " · 逃跑 " + r.escapes : ""))))),
        detail ? ResultCard(t, detail, charOf(detail.charId), () => setDetail(null)) : null);
    }

    // ---- 沉浸计时页 ----
    if (view === "focus" && sess) {
      const c = sess.char;
      const rot = [sess.pack.stay].concat(sess.pack.lines || []);
      const line = rot[lineIdx % rot.length] || sess.pack.stay;
      const bg = c.avatarImage
        ? { backgroundImage: "url(\"" + c.avatarImage + "\")", backgroundSize: "cover", backgroundPosition: "center" }
        : { background: "linear-gradient(160deg," + (c.color || "#3a3a3a") + ",#14140f)" };
      return h("div", { className: "h-full", style: { position: "relative", ...bg, overflow: "hidden" } },
        styleTag,
        h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,12,0.45),rgba(10,10,12,0.25) 40%,rgba(10,10,12,0.75))" } }),
        // X 退出
        h("button", { onClick: openEsc, className: "active:opacity-70", style: { position: "absolute", top: "calc(env(safe-area-inset-top) + 14px)", right: 18, width: 42, height: 42, borderRadius: 999, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 } }, h(IX, { size: 20, color: "#fff" })),
        // 轮流陪伴语
        h("div", { style: { position: "absolute", top: "calc(env(safe-area-inset-top) + 90px)", left: 24, right: 70, zIndex: 4 } },
          h("div", { style: { width: 34, height: 2, background: "rgba(255,255,255,0.85)", marginBottom: 16 } }),
          h("div", { key: lineIdx, style: { fontFamily: F_BODY, fontSize: 19, lineHeight: 1.55, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.6)", animation: "fadeUp .5s ease both" } }, line)),
        // 倒计时
        h("div", { style: { position: "absolute", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 40px)", textAlign: "center", zIndex: 4 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 78, letterSpacing: "0.02em", color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.6)", lineHeight: 1 } }, fmtClock(left)),
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, letterSpacing: "0.2em", color: "rgba(255,255,255,0.7)", marginTop: 10 } }, c.name + " · " + sess.task)),
        // 退出暗号弹层
        escOpen ? h("div", { style: { position: "absolute", inset: 0, zIndex: 20, background: "rgba(10,10,12,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } },
          h("div", { style: { width: "100%", maxWidth: 340, background: "#f6f4ef", borderRadius: 20, padding: "24px 22px", animation: shake ? "pf-shake .48s" : "fadeUp .2s ease both" } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 24, color: "#1b1a17", textAlign: "center", fontWeight: 600 } }, "想半途而废？"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: "#4b493f", lineHeight: 1.7, textAlign: "center", marginTop: 12 } }, sess.pack.taunt),
            h("input", { value: pass, onChange: e => { setPass(e.target.value); setWrongMsg(""); }, placeholder: "输入暗号退出…", onKeyDown: e => { if (e.key === "Enter") trySubmit(); },
              style: { width: "100%", textAlign: "center", fontFamily: F_BODY, fontSize: 15, color: "#1b1a17", background: "#fff", border: "1px solid " + (wrongMsg ? "#c25a4a" : "#ddd8cd"), borderRadius: 12, padding: "13px 14px", outline: "none", marginTop: 20 } }),
            wrongMsg ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: "#a8433a", fontWeight: 600, textAlign: "center", marginTop: 12 } }, wrongMsg) : null,
            h("button", { onClick: () => setShowHint(true), className: "active:opacity-60", style: { display: "block", margin: "14px auto 0", background: "transparent", border: "none", fontFamily: F_BODY, fontSize: 12.5, color: "#96938a", textDecoration: "underline" } }, "[ 获取提示 ]"),
            showHint ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: "#4b493f", lineHeight: 1.6, textAlign: "center", marginTop: 10, fontStyle: "italic" } }, "“" + sess.pack.hint + "”") : null,
            h("button", { onClick: trySubmit, className: "w-full active:opacity-85", style: { marginTop: 18, background: "#1b1a17", color: "#f6f4ef", border: "none", borderRadius: 12, padding: "14px 0", fontFamily: F_BODY, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" } }, "SUBMIT"),
            h("button", { onClick: () => setEscOpen(false), className: "w-full active:opacity-60", style: { marginTop: 12, background: "transparent", border: "none", fontFamily: F_BODY, fontSize: 12.5, color: "#96938a" } }, "算了，我继续专注"))) : null);
    }

    // ---- 落地 / setup ----
    const cur = charOf(charId);
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h("div", { className: "shrink-0 px-5 pt-5 pb-2 flex items-center justify-between" },
        h("button", { onClick: props.onBack, className: "active:opacity-50 flex items-center gap-2", style: { background: "transparent", border: "none" } },
          h(IArrow, { size: 18, color: t.ink }), h("span", { style: { fontFamily: F_BODY, fontSize: 12, letterSpacing: "0.16em", color: t.ink } }, "BACK")),
        h("button", { onClick: () => setView("archive"), className: "active:opacity-70 flex items-center gap-2", style: { border: "1px solid " + t.line, borderRadius: 999, padding: "7px 14px", background: t.bg2 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 12, letterSpacing: "0.14em", color: t.ink } }, "ARCHIVE"),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: "#f6f4ef", background: t.ink, borderRadius: 999, minWidth: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" } }, saves.length))),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8 flex flex-col" },
        h("div", { style: { textAlign: "center", marginTop: 6 } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 34, color: t.ink, letterSpacing: "0.04em" } }, "同频陪伴"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, letterSpacing: "0.34em", color: t.fog, marginTop: 6 } }, "SYNCHRONIZED FOCUS")),
        // 大预览时钟
        h("div", { style: { textAlign: "center", margin: "34px 0 8px" } },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 84, lineHeight: 1, color: t.ink } }, fmtClock((Number(min) || 0) * 60))),
        // 卡片
        h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 22, padding: "20px 20px 22px", marginTop: 18 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.16em", color: t.fog, textAlign: "center" } }, "TIME REMAINING"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.1em", color: t.fog, textAlign: "center", marginTop: 3 } }, "CURRENT FOCUS / 当前任务"),
          // 陪你专注的人
          chars.length ? h("div", { style: { display: "flex", gap: 8, overflowX: "auto", padding: "16px 0 4px", justifyContent: chars.length <= 4 ? "center" : "flex-start" } },
            chars.map(c => { const on = charId === c.id;
              return h("button", { key: c.id, onClick: () => setCharId(c.id), className: "active:opacity-70", style: { flexShrink: 0, textAlign: "center", background: "transparent", border: "none" } },
                h("div", { style: { padding: 2, borderRadius: 14, border: "2px solid " + (on ? t.ink : "transparent") } }, h(Avatar, { character: c, size: 44, radius: 11 })),
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: on ? t.ink : t.fog, marginTop: 4, maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.name)); }))
            : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, textAlign: "center", padding: "16px 0" } }, "先去『名录』建个角色陪你专注"),
          h("input", { value: task, onChange: e => setTask(e.target.value), placeholder: "当前任务，如 一起看书", maxLength: 20,
            style: { width: "100%", textAlign: "center", fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, background: "transparent", border: "none", outline: "none", padding: "8px 0" } }),
          h("div", { style: { borderTop: "1px dashed " + t.line, margin: "6px 0 16px" } }),
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: t.bg, border: "1px dashed " + t.line, borderRadius: 14, padding: "14px 16px" } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub } }, "设定时长"),
            h("input", { value: String(min), onChange: e => setMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 3)), inputMode: "numeric",
              style: { width: 56, textAlign: "center", fontFamily: F_DISPLAY, fontSize: 22, fontWeight: 700, color: t.ink, background: "transparent", border: "none", borderBottom: "2px solid " + t.ink, outline: "none", padding: "2px 0" } }),
            h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub } }, "分钟")),
          h("div", { style: { display: "flex", gap: 7, justifyContent: "center", marginTop: 12 } },
            [15, 25, 45, 60].map(p => h("button", { key: p, onClick: () => setMin(p), className: "active:opacity-70",
              style: { fontFamily: F_BODY, fontSize: 12, color: Number(min) === p ? "#fff" : t.sub, background: Number(min) === p ? t.ink : "transparent", border: "1px solid " + (Number(min) === p ? t.ink : t.line), borderRadius: 999, padding: "5px 13px" } }, p + "′")))),
        // 开始
        h("div", { style: { display: "flex", justifyContent: "center", marginTop: 30 } },
          h("button", { onClick: start, disabled: busy || !cur, className: "active:opacity-85 disabled:opacity-40",
            style: { width: 76, height: 76, borderRadius: 999, background: t.ink, border: "none", display: "flex", alignItems: "center", justifyContent: "center" } },
            busy ? h("div", { className: "flex gap-1" }, [0, 1, 2].map(i => h("span", { key: i, className: "w-1.5 h-1.5 rounded-full animate-pulse", style: { background: "#f6f4ef", animationDelay: i * 0.15 + "s" } })))
              : h("div", { style: { width: 0, height: 0, borderStyle: "solid", borderWidth: "13px 0 13px 22px", borderColor: "transparent transparent transparent #f6f4ef", marginLeft: 5 } }))),
        busy ? h("div", { style: { textAlign: "center", fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 14 } }, cur ? cur.name + " 正在准备陪你…" : "") : null));
  }

  window.Pomodoro = Pomodoro;
})();
