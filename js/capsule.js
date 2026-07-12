// ============================================================
// 时光胶囊（capsule）—— 给未来写信，独立小 app（眠尔机借鉴，自己重写）
//   · 给某个角色写：到期 TA 才收到拆开，读信后写一封回信（一次 API，走主力池）
//   · 给未来的自己写：到期自己拆，角色不参与
//   · 反向：你给 TA 埋胶囊时，TA 有时也悄悄埋一颗给你（内容当场生成封存，到期才能看）
//   · 到期主屏图标红点（window.capsuleDueCount）；封存中内容全锁（自己写的也不给看，反悔删掉可以）
// 数据 x_capsules，随云同步。
// ============================================================
(function () {
  const ACCENT = "#5a6d8a";
  const load = () => { const v = loadJSON("x_capsules", []); return Array.isArray(v) ? v : []; };
  const save = list => saveJSON("x_capsules", list);
  window.capsuleDueCount = function () { try { const now = Date.now(); return load().filter(c => !c.opened && c.openTs <= now).length; } catch (e) { return 0; } };
  const fmtD = ts => { const d = new Date(ts); return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日"; };
  const leftTxt = ts => { const ms = ts - Date.now(); if (ms <= 0) return "可拆封"; const dd = Math.ceil(ms / 86400000); return dd > 1 ? "还有 " + dd + " 天" : "不到 1 天"; };
  const uid = () => "cap_" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

  function CapsuleApp(props) {
    const t = useTheme();
    const [list, setList] = useState(load);
    const [view, setView] = useState(null);      // null=列表 | "compose" | capsuleId(详情)
    const [busy, setBusy] = useState(null);      // 正在生成回信的 capsuleId
    const persist = l => { setList(l); save(l); };
    const chars = props.characters || [];
    const uName = (props.profile && props.profile.name) || "我";
    const charOf = id => chars.find(c => c.id === id);

    // 反向胶囊：你埋给 TA 时，TA 有时（约四成）也悄悄埋一颗——内容以 TA 此刻的心境当场写好、封存到同一天
    const maybeBuryBack = async (char, openTs) => {
      if (!props.active || Math.random() > 0.45) return;
      try {
        const sys = buildBundle(props.ctxFor(char)) +
          "\n\n【任务】" + uName + " 刚埋下一颗写给你的时光胶囊（内容保密），约定 " + fmtD(openTs) + " 才能拆。你心里一动，决定也悄悄埋一颗给 Ta——写下你【此刻】想对「拆开信的那天的 Ta」说的话（2-6 句，第一人称，贴你的人设与此刻心情，可以有没说出口过的话；别客套、别落款）。只输出 JSON：{\"letter\":\"信的正文\"}";
        const raw = await callAI(props.apiFor ? props.apiFor(char.id) : props.active, sys, [{ role: "user", content: "写吧。" }], { maxTokens: 1200 }); // 反向埋胶囊=TA 亲笔，跟随专线（v48.37）
        const d = extractJSON(raw);
        if (!d || !d.letter) return;
        const entry = { id: uid(), dir: "fromChar", charId: char.id, charName: char.name, text: String(d.letter).trim(), createdTs: Date.now(), openTs, opened: false, reply: null };
        setList(prev => { const n = [entry, ...prev]; save(n); return n; });
        props.toast && props.toast(char.name + " 好像也悄悄埋了一颗…到期才能拆");
      } catch (e) {/* 静默：反向失败不影响正向 */}
    };
    const bury = (target, text, openTs) => {
      const c = target === "self" ? null : charOf(target);
      const entry = { id: uid(), dir: c ? "toChar" : "toSelf", charId: c ? c.id : null, charName: c ? c.name : null, text, createdTs: Date.now(), openTs, opened: false, reply: null };
      persist([entry, ...list]);
      setView(null);
      props.toast && props.toast("已封存 · " + fmtD(openTs) + " 开启");
      if (c) maybeBuryBack(c, openTs);
    };
    // 拆封：给角色的 → TA 读信写回信；TA 埋的/给自己的 → 直接揭开
    const openCap = async cap => {
      if (cap.openTs > Date.now()) return;
      const upd = patch => setList(prev => { const n = prev.map(x => x.id === cap.id ? { ...x, ...patch } : x); save(n); return n; });
      upd({ opened: true, openedTs: Date.now() });
      setView(cap.id);
      if (cap.dir === "toChar" && props.active && !cap.reply) {
        const c = charOf(cap.charId);
        if (!c) return;
        setBusy(cap.id);
        try {
          const sys = buildBundle(props.ctxFor(c)) +
            "\n\n【任务】" + uName + " 在 " + fmtD(cap.createdTs) + " 埋了一颗时光胶囊给你，约定今天才能拆。你刚拆开，读到 Ta 当时写的信：\n「" + cap.text + "」\n\n以你此刻的人设、心情和你们这段时间的经历，给 Ta 写一封回信（2-6 句，第一人称）：回应信里的话、对照「那时」和「现在」的变化，动真格的，别客套别复述原文。只输出 JSON：{\"reply\":\"回信正文\"}";
          const raw = await callAI(props.apiFor ? props.apiFor(c.id) : props.active, sys, [{ role: "user", content: "拆开了，回信吧。" }], { maxTokens: 1400 }); // 胶囊回信=TA 亲笔，跟随专线（v48.37）
          const d = extractJSON(raw);
          if (d && d.reply) upd({ reply: String(d.reply).trim() });
        } catch (e) { props.toast && props.toast("回信没等到：" + (e.message || "重试")); }
        finally { setBusy(null); }
      }
    };
    const delCap = id => { if (window.confirm("删掉这颗胶囊？删了不可恢复。")) { persist(list.filter(x => x.id !== id)); setView(null); } };

    // ---- 详情 ----
    if (view && view !== "compose") {
      const cap = list.find(x => x.id === view);
      if (!cap) { setView(null); return null; }
      const who = cap.dir === "toSelf" ? "写给未来的自己" : cap.dir === "toChar" ? "写给 " + cap.charName : cap.charName + " 埋给你的";
      return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
        h(Head, { zh: "时光胶囊", en: "Capsule", onBack: () => setView(null), right: h("button", { onClick: () => delCap(cap.id), className: "active:opacity-50" }, h(ITrash, { size: 18, color: t.fog })) }),
        h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 12 } }, who + " · 埋于 " + fmtD(cap.createdTs) + " · 拆于 " + fmtD(cap.openedTs || cap.openTs)),
          h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "18px 17px", marginBottom: 16 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 10, letterSpacing: "0.15em", color: t.fog, marginBottom: 10 } }, cap.dir === "fromChar" ? "TA 当时写下的" : "当时写下的"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.9, color: t.ink, whiteSpace: "pre-wrap" } }, cap.text)),
          cap.dir === "toChar" ? (
            cap.reply
              ? h("div", { style: { background: "rgba(90,109,138,0.07)", border: "1px solid " + ACCENT + "44", borderRadius: 16, padding: "18px 17px" } },
                  h("div", { style: { fontFamily: F_BODY, fontSize: 10, letterSpacing: "0.15em", color: ACCENT, marginBottom: 10 } }, (cap.charName || "TA") + " 的回信"),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.9, color: t.ink, whiteSpace: "pre-wrap" } }, cap.reply))
              : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "14px 0" } },
                  busy === cap.id ? "TA 正在读信、写回信…" : h("button", { onClick: () => openCap({ ...cap, opened: false }), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: "#fff", background: ACCENT, border: "none", borderRadius: 999, padding: "8px 18px" } }, "让 TA 读信回信"))
          ) : null));
    }
    // ---- 写一颗（compose）----
    if (view === "compose") return h(CapsuleCompose, { t, chars, onBack: () => setView(null), onBury: bury });
    // ---- 列表 ----
    const now = Date.now();
    const due = list.filter(c => !c.opened && c.openTs <= now);
    const sealed = list.filter(c => !c.opened && c.openTs > now).sort((a, b) => a.openTs - b.openTs);
    const done = list.filter(c => c.opened);
    const row = (cap, kind) => {
      const who = cap.dir === "toSelf" ? "给未来的自己" : cap.dir === "toChar" ? "给 " + cap.charName : cap.charName + " 埋的";
      return h("button", { key: cap.id, onClick: () => kind === "due" ? openCap(cap) : (kind === "done" ? setView(cap.id) : null), className: "w-full text-left active:opacity-70",
        style: { display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, marginBottom: 9, background: t.bg2, border: kind === "due" ? "1.5px solid #b89150" : "1px solid " + t.line, opacity: kind === "sealed" ? 0.85 : 1 } },
        h("span", { style: { fontSize: 20 } }, kind === "sealed" ? "🔒" : kind === "due" ? "⏳" : "💌"),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, who),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } },
            kind === "sealed" ? "埋于 " + fmtD(cap.createdTs) + " · " + fmtD(cap.openTs) + " 开启 · " + leftTxt(cap.openTs)
            : kind === "due" ? "埋于 " + fmtD(cap.createdTs) + " · 到日子了，点开拆封"
            : "拆于 " + fmtD(cap.openedTs || cap.openTs))),
        kind === "due" ? h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: "#b89150", fontWeight: 700, flexShrink: 0 } }, "拆封") : null);
    };
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, { zh: "时光胶囊", en: "Capsule", onBack: props.onBack, right: h("button", { onClick: () => setView("compose"), className: "active:opacity-50" }, h(IPlus, { size: 20, color: t.ink })) }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
        list.length === 0 ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", padding: "60px 20px", lineHeight: 2 } }, "还没有胶囊。\n点右上角 ＋ 给未来的 TA——或未来的自己——写点什么。") : null,
        due.length ? h("div", { style: { marginBottom: 14 } }, due.map(c => row(c, "due"))) : null,
        sealed.length ? h("div", { style: { marginBottom: 14 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.1em", color: t.fog, marginBottom: 8 } }, "封存中 · 到期前谁也看不到"),
          sealed.map(c => row(c, "sealed"))) : null,
        done.length ? h("div", null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.1em", color: t.fog, marginBottom: 8 } }, "已拆开"),
          done.map(c => row(c, "done"))) : null));
  }

  function CapsuleCompose({ t, chars, onBack, onBury }) {
    const [target, setTarget] = useState("self");
    const [text, setText] = useState("");
    const [preset, setPreset] = useState(30);   // 天数；-1=自定义
    const [customDate, setCustomDate] = useState("");
    const openTs = preset === -1
      ? (customDate ? new Date(customDate + "T09:00:00").getTime() : 0)
      : Date.now() + preset * 86400000;
    const ok = text.trim() && openTs > Date.now();
    const chip = (on, label, fn) => h("button", { key: label, onClick: fn, className: "active:opacity-70",
      style: { fontFamily: F_BODY, fontSize: 12, padding: "6px 13px", borderRadius: 999, background: on ? "#5a6d8a" : t.bg2, color: on ? "#fff" : t.sub, border: "1px solid " + (on ? "#5a6d8a" : t.line) } }, label);
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, { zh: "埋一颗胶囊", en: "Seal", onBack }),
      h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, margin: "4px 0 8px" } }, "写给谁"),
        h("div", { className: "flex flex-wrap", style: { gap: 7, marginBottom: 16 } },
          chip(target === "self", "未来的自己", () => setTarget("self")),
          chars.map(c => chip(target === c.id, c.remark || c.name, () => setTarget(c.id)))),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 8 } }, "什么时候开启"),
        h("div", { className: "flex flex-wrap", style: { gap: 7, marginBottom: preset === -1 ? 10 : 16 } },
          [[7, "1 周后"], [30, "1 个月后"], [90, "3 个月后"], [365, "1 年后"], [-1, "选日子"]].map(p => chip(preset === p[0], p[1], () => setPreset(p[0])))),
        preset === -1 ? h("input", { type: "date", value: customDate, onChange: e => setCustomDate(e.target.value),
          style: { width: "100%", outline: "none", padding: "10px 12px", borderRadius: 12, fontFamily: F_BODY, fontSize: 14, background: t.bg2, color: t.ink, border: "1px solid " + t.line, marginBottom: 16 } }) : null,
        h("textarea", { value: text, onChange: e => setText(e.target.value), rows: 9,
          placeholder: target === "self" ? "写给拆开这封信那天的自己……" : "写给拆开这封信那天的 TA……（封存后 TA 到期才看得到，你自己也不能偷看）",
          style: { width: "100%", outline: "none", resize: "vertical", padding: "13px 14px", borderRadius: 14, fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.85, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 8, lineHeight: 1.6 } }, "封存后内容上锁、只能整颗删除；到期主屏会亮红点。给角色埋的话，TA 有时也会悄悄埋一颗给你。"),
        h("button", { onClick: () => ok && onBury(target, text.trim(), openTs), disabled: !ok, className: "w-full active:opacity-80 disabled:opacity-40",
          style: { marginTop: 16, fontFamily: F_DISPLAY, fontSize: 15, color: "#fff", background: "#5a6d8a", border: "none", borderRadius: 14, padding: "14px 0" } }, "封存 🕰")));
  }
  window.CapsuleApp = CapsuleApp;
})();
