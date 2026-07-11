// ============================================================
// CAST + form
// ============================================================
function Cast({
  characters,
  onBack,
  onEdit,
  onAdd,
  onOpenChar
}) {
  const t = useTheme();
  return /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col"
  }, /*#__PURE__*/React.createElement(Head, {
    zh: "名录",
    en: "Guest List",
    onBack: onBack,
    right: /*#__PURE__*/React.createElement("button", {
      onClick: onAdd,
      className: "active:opacity-50"
    }, /*#__PURE__*/React.createElement(IPlus, {
      size: 20,
      color: t.ink
    }))
  }), h("div", {
    className: "flex-1 overflow-y-auto px-5 pb-8 pt-1"
  }, characters.length === 0 ? h(Empty, {
    text: "名录中还没有角色",
    sub: "点右上角 + 录入第一位"
  }) : characters.map((c, i) => h("button", {
    key: c.id,
    onClick: () => onOpenChar(c),
    className: "w-full block active:opacity-95",
    style: { position: "relative", height: 108, marginBottom: 18, textAlign: "left" }
  },
    // 信封主体（开口朝右）
    h("div", { style: { position: "absolute", inset: 0, borderRadius: 16, background: "linear-gradient(135deg,#f7f3ec 0%,#ece5d8 100%)", border: "1px solid " + t.line, boxShadow: "0 5px 16px rgba(0,0,0,0.07)", overflow: "hidden" } },
      // 左上编号（挪到竖排右侧，避免叠字）
      h("div", { style: { position: "absolute", left: 40, top: 14 } }, h(Eyebrow, null, "No." + String(i + 1).padStart(2, "0"))),
      // 左侧竖排 INVITE（竖向居中，短词不超出卡片高度）
      h("div", { style: { position: "absolute", left: 15, top: 0, bottom: 0, display: "flex", alignItems: "center" } },
        h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9, letterSpacing: "0.3em", color: t.fog, writingMode: "vertical-rl", transform: "rotate(180deg)" } }, "INVITE")),
      // 右侧朝右开口的封盖（V 形）
      h("svg", { width: 80, height: "100%", viewBox: "0 0 80 108", preserveAspectRatio: "none", style: { position: "absolute", right: 0, top: 0 } },
        h("path", { d: "M0 0 L80 54 L0 108 Z", fill: "rgba(120,100,70,0.05)" }),
        h("path", { d: "M2 2 L78 54 L2 106", fill: "none", stroke: t.line, strokeWidth: 1.3 }))),
    // 从右开口探出的角色名片
    h("div", { style: { position: "absolute", right: 12, top: 12, bottom: 12, width: "60%", background: "#fff", borderRadius: 12, border: "1px solid " + t.line, boxShadow: "-9px 0 22px rgba(0,0,0,0.10)", display: "flex", alignItems: "center", gap: 12, padding: "0 14px" } },
      h(Avatar, { character: c, size: 58, radius: 13 }),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 19, lineHeight: 1.1, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.name),
        h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 3 } }, c.tagline || c.persona || "暂无设定"))),
    // 编辑铅笔（阻止冒泡，不触发打开）
    h("span", { onClick: e => { e.stopPropagation(); onEdit(c); }, className: "active:opacity-50", style: { position: "absolute", right: 13, top: 7, padding: 5, zIndex: 3 } }, h(IPencil, { size: 14, color: t.fog }))))));
}
function CastForm({
  initial,
  onBack,
  onSave,
  onDelete
}) {
  const t = useTheme();
  const [name, setName] = useState(initial && initial.name || "");
  const [tagline, setTagline] = useState(initial && initial.tagline || "");
  const [emoji, setEmoji] = useState(initial && initial.avatarEmoji || "");
  const [color, setColor] = useState(initial && initial.color || AV_COLORS[0]);
  const [persona, setPersona] = useState(initial && initial.persona || "");
  const [avatarImage, setAvatarImage] = useState(initial && initial.avatarImage || null);
  const [tz, setTz] = useState(initial && initial.tz != null ? String(initial.tz) : "");
  const [appearance, setAppearance] = useState(initial && initial.appearance || "");
  const [refPhoto, setRefPhoto] = useState(initial && initial.refPhoto || null);
  const [birthday, setBirthday] = useState(initial && initial.birthday || "");
  const [voiceId, setVoiceId] = useState(initial && initial.voiceId || "");
  const save = () => {
    if (!name.trim()) return;
    onSave(Object.assign({}, initial || {}, {
      id: initial && initial.id || "char_" + Date.now(),
      name: name.trim(),
      tagline: tagline.trim(),
      avatarEmoji: emoji.trim().slice(0, 2),
      color,
      persona: persona.trim(),
      avatarImage,
      tz: tz,
      appearance: appearance.trim(),
      refPhoto: refPhoto,
      birthday: birthday.trim(),
      voiceId: voiceId.trim(),
      remark: initial && initial.remark || ""
    }));
  };
  const TZ_OPTS = [
    ["-10", "檀香山"], ["-9", "安克雷奇"], ["-8", "洛杉矶 / 温哥华"], ["-7", "丹佛"], ["-6", "芝加哥 / 墨西哥城"],
    ["-5", "纽约 / 多伦多"], ["-4", "圣地亚哥"], ["-3", "圣保罗 / 布宜诺斯艾利斯"], ["-1", "亚速尔"], ["0", "伦敦 / 里斯本"],
    ["+1", "巴黎 / 柏林 / 罗马"], ["+2", "开罗 / 雅典"], ["+3", "莫斯科 / 伊斯坦布尔"], ["+3.5", "德黑兰"], ["+4", "迪拜 / 阿布扎比"],
    ["+4.5", "喀布尔"], ["+5", "卡拉奇"], ["+5.5", "新德里 / 孟买"], ["+6", "达卡"], ["+7", "曼谷 / 河内 / 雅加达"],
    ["+8", "北京 / 香港 / 新加坡 / 台北"], ["+9", "东京 / 首尔"], ["+9.5", "阿德莱德"], ["+10", "悉尼 / 墨尔本"], ["+11", "所罗门群岛"],
    ["+12", "奥克兰 / 斐济"], ["+13", "汤加"]
  ];
  return /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col"
  }, /*#__PURE__*/React.createElement(Head, {
    zh: initial ? "编辑档案" : "新建档案",
    en: "Dossier",
    onBack: onBack,
    right: /*#__PURE__*/React.createElement("button", {
      onClick: save,
      style: {
        fontFamily: "'Archivo',sans-serif",
        fontSize: 12,
        letterSpacing: "0.1em",
        color: t.ink
      }
    }, "SAVE")
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto px-6 pb-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-5 pt-2"
  }, /*#__PURE__*/React.createElement(AvatarPicker, {
    character: {
      name,
      avatarEmoji: emoji,
      color,
      avatarImage
    },
    size: 76,
    radius: 16,
    onPick: setAvatarImage,
    onClear: () => setAvatarImage(null)
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "姓名",
    className: "w-full bg-transparent outline-none",
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 24,
      color: t.ink
    }
  }), /*#__PURE__*/React.createElement("input", {
    value: tagline,
    onChange: e => setTagline(e.target.value),
    placeholder: "一句话标签",
    className: "w-full bg-transparent outline-none mt-1",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.fog
    }
  }))), /*#__PURE__*/React.createElement(LineField, {
    zh: "底色",
    en: "Fallback"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, AV_COLORS.map(c => /*#__PURE__*/React.createElement("button", {
    key: c,
    onClick: () => setColor(c),
    style: {
      width: 26,
      height: 26,
      borderRadius: 6,
      background: c,
      outline: color === c ? `2px solid ${t.ink}` : "none",
      outlineOffset: 2
    }
  })))), /*#__PURE__*/React.createElement(LineField, {
    zh: "时区",
    en: "Timezone"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("select", {
    value: tz,
    onChange: e => setTz(e.target.value),
    className: "w-full outline-none",
    style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: "transparent", padding: "6px 0", border: "none" }
  }, /*#__PURE__*/React.createElement("option", { value: "" }, "跟随系统（默认）"), TZ_OPTS.map(o => /*#__PURE__*/React.createElement("option", { key: o[0], value: o[0] }, "UTC" + (o[0][0] === "-" ? o[0] : "+" + o[0].replace("+", "")) + " · " + o[1]))), /*#__PURE__*/React.createElement("div", {
    style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 }
  }, "开时间感知后，Ta 会按自己所在时区报时间（可搞异地恋）。日程仍按你本地日期。"))), /*#__PURE__*/React.createElement(LineField, {
    zh: "生日",
    en: "Birthday"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    value: birthday,
    onChange: e => setBirthday(e.target.value),
    placeholder: "如 3-15 或 1998-3-15（可留空）",
    className: "w-full bg-transparent outline-none",
    style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, padding: "6px 0" }
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 }
  }, "到生日当天/临近，Ta 会自己惦记着；填了世界书/人设里的设定也行。"))), /*#__PURE__*/React.createElement(LineField, {
    zh: "人设",
    en: "Persona"
  }, /*#__PURE__*/React.createElement(LineArea, {
    value: persona,
    onChange: e => setPersona(e.target.value),
    rows: 12,
    placeholder: "粘贴性格、说话风格、背景、当前关系阶段……"
  })), h(LineField, { zh: "外貌 · 发自拍用", en: "Appearance" },
    h("div", null,
      h("div", { className: "flex items-center gap-3 mb-2" },
        h(AvatarPicker, { character: { name, avatarImage: refPhoto, color }, size: 56, radius: 12, onPick: setRefPhoto, onClear: () => setRefPhoto(null) }),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.5 } }, "传张参考照(可选)固定长相；接了图像 API 后，TA 聊天里会偶尔发自拍")),
      h(LineArea, { value: appearance, onChange: e => setAppearance(e.target.value), rows: 5, placeholder: "长相/发型/身材/气质/常穿风格……越具体，自拍越像本人。" }))),
  h(LineField, { zh: "音色 · 语音消息用", en: "Voice" },
    h("div", null,
      h("div", { className: "flex flex-wrap gap-1.5 mb-2" }, (typeof TTS_VOICES !== "undefined" ? TTS_VOICES : []).map(v =>
        h("button", { key: v.id, onClick: () => setVoiceId(voiceId === v.id ? "" : v.id), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, padding: "4px 10px", borderRadius: 999, background: voiceId === v.id ? t.ink : t.bg2, color: voiceId === v.id ? t.bg2 : t.sub, border: "1px solid " + t.line } }, v.name))),
      h("input", { value: voiceId, onChange: e => setVoiceId(e.target.value), placeholder: "或直接填 voice_id（含克隆音色）", className: "w-full outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 12.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 5, lineHeight: 1.5 } }, "接了语音 API（设置 · 语音 TTS）并选了音色后，TA 的语音消息就能点开真听。不选=这个角色不发声。"))),
  initial && /*#__PURE__*/React.createElement("button", {
    onClick: () => onDelete(initial.id),
    className: "mt-8 w-full flex items-center justify-center gap-2 py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 12,
      color: t.fog
    }
  }, /*#__PURE__*/React.createElement(ITrash, {
    size: 14
  }), " 删除这位角色")));
}

// ============================================================
// TIES (directed)
// ============================================================
const REL_PRESETS = ["恋人", "暧昧", "朋友", "挚友", "家人", "兄妹", "同事", "上下级", "师生", "对手", "陌生人", "前任", "单向暗恋", "青梅竹马"];
function Ties({
  characters,
  rels,
  profile,
  onBack,
  onSave
}) {
  const t = useTheme();
  const [comp, setComp] = useState(null); // composer state | null
  const [view, setView] = useState(null); // null=角色列表 / participant id=该角色关系详情
  const me = profile.name || "我";
  const nameOf = id => id === "me" ? me : (characters.find(c => c.id === id) || {}).name || "?";
  const charOf = id => id === "me" ? null : characters.find(c => c.id === id);
  const edge = (from, to) => rels[from + "->" + to];

  // ---- reconstruct relationship cards from directed edges ----
  const canon = (x, y) => x === "me" ? [x, y] : y === "me" ? [y, x] : x < y ? [x, y] : [y, x];
  const exists = id => id === "me" || characters.some(c => c.id === id);
  const seen = {};
  const cards = [];
  Object.keys(rels).forEach(k => {
    const [f, g] = k.split("->");
    const [a, b] = canon(f, g);
    const pk = a + "|" + b;
    if (seen[pk] || !exists(a) || !exists(b)) return;
    seen[pk] = 1;
    cards.push({ a, b });
  });

  // ---- open composer ----
  const openNew = () => setComp({
    edit: false, tab: "me", meChar: characters[0] ? characters[0].id : "",
    pair: characters.length >= 2 ? [characters[0].id, characters[1].id] : [],
    label: "", dir: "double", single: "fwd", split: false, note: "", noteFwd: "", noteBwd: ""
  });
  const openEdit = (a, b) => {
    const fwd = edge(a, b), bwd = edge(b, a);
    const both = !!fwd && !!bwd;
    const only = fwd ? "fwd" : "bwd";
    const s = both && ((fwd.note || "") !== (bwd.note || ""));
    setComp({
      edit: true, orig: { a, b },
      tab: a === "me" ? "me" : "chars",
      meChar: a === "me" ? b : (characters[0] ? characters[0].id : ""),
      pair: a === "me" ? [characters[0] ? characters[0].id : "", ""] : [a, b],
      label: (fwd || bwd || {}).label || "",
      dir: both ? "double" : "single",
      single: both ? "fwd" : only,
      split: s,
      note: (fwd || bwd || {}).note || "",
      noteFwd: (fwd || {}).note || "",
      noteBwd: (bwd || {}).note || ""
    });
  };

  // resolve idA / idB from composer
  const idsOf = c => c.tab === "me" ? { A: "me", B: c.meChar } : { A: c.pair[0], B: c.pair[1] };
  const validComp = c => {
    const { A, B } = idsOf(c);
    return A && B && A !== B && c.label.trim();
  };
  const doSave = () => {
    const c = comp;
    if (!validComp(c)) return;
    const { A, B } = idsOf(c);
    // if editing and the identity of the pair changed, clear old edges first
    if (c.edit && c.orig && !((c.orig.a === A && c.orig.b === B) || (c.orig.a === B && c.orig.b === A))) {
      onSave(c.orig.a + "->" + c.orig.b, "", "");
      onSave(c.orig.b + "->" + c.orig.a, "", "");
    }
    const lb = c.label.trim();
    if (c.dir === "double") {
      onSave(A + "->" + B, lb, c.split ? c.noteFwd : c.note);
      onSave(B + "->" + A, lb, c.split ? c.noteBwd : c.note);
    } else {
      const fwd = c.single === "fwd";
      onSave((fwd ? A : B) + "->" + (fwd ? B : A), lb, c.note);
      onSave((fwd ? B : A) + "->" + (fwd ? A : B), "", ""); // clear opposite
    }
    setComp(null);
  };
  const doDelete = () => {
    const c = comp;
    if (c.edit && c.orig) {
      onSave(c.orig.a + "->" + c.orig.b, "", "");
      onSave(c.orig.b + "->" + c.orig.a, "", "");
    }
    setComp(null);
  };

  // ---- card renderer ----
  const Chip = ({ id }) => {
    const ch = charOf(id);
    return h("div", { className: "flex items-center gap-1.5" },
      id === "me"
        ? h("div", { style: { width: 24, height: 24, borderRadius: 7, background: profile.color || t.tint, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_BODY, fontSize: 11, color: "#fff" } }, me.slice(0, 1))
        : h(Avatar, { character: ch, size: 24, radius: 7 }),
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, nameOf(id)));
  };
  const Card = ({ a, b }) => {
    const fwd = edge(a, b), bwd = edge(b, a);
    const both = !!fwd && !!bwd;
    const arrow = both ? "⇄" : fwd ? "→" : "←";
    let labelText, noteText;
    if (both) {
      const same = (fwd.label || "") === (bwd.label || "");
      labelText = same ? fwd.label : fwd.label + " · " + bwd.label;
      noteText = (fwd.note || "") === (bwd.note || "") ? fwd.note : [fwd.note, bwd.note].filter(Boolean).join("　／　");
    } else {
      const e = fwd || bwd;
      labelText = e.label; noteText = e.note;
    }
    return h("button", {
      onClick: () => openEdit(a, b),
      className: "w-full text-left active:opacity-70 mb-2.5",
      style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "14px 16px" }
    },
      h("div", { className: "flex items-center gap-2 mb-2" },
        h(Chip, { id: a }),
        h("span", { style: { fontFamily: F_BODY, fontSize: 15, color: t.fog } }, arrow),
        h(Chip, { id: b })),
      h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 17, color: t.ink } }, labelText || "未命名"),
      noteText && h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.5, color: t.sub, marginTop: 4 } }, noteText));
  };

  // ---- 每个参与者（我 + 各角色）的关系伙伴 ----
  const participants = [{ id: "me" }, ...characters.map(c => ({ id: c.id }))];
  const partnersOf = id => cards.filter(c => c.a === id || c.b === id);

  // ---- 角色列表行 ----
  const RosterRow = ({ id }) => {
    const ch = charOf(id);
    const n = partnersOf(id).length;
    return h("button", {
      onClick: () => setView(id),
      className: "w-full text-left active:opacity-70 mb-2.5 flex items-center gap-3",
      style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "12px 14px" }
    },
      id === "me"
        ? h("div", { style: { width: 40, height: 40, borderRadius: 11, background: profile.color || t.tint, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_BODY, fontSize: 16, color: "#fff", flexShrink: 0 } }, me.slice(0, 1))
        : h(Avatar, { character: ch, size: 40, radius: 11 }),
      h("div", { className: "flex-1 min-w-0" },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, id === "me" ? me + "（我）" : nameOf(id)),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: n ? t.sub : t.fog, marginTop: 2 } }, n ? n + " 段关系" : "还没有关系")),
      h("span", { style: { fontFamily: F_BODY, fontSize: 16, color: t.fog } }, "›"));
  };

  // ---- 详情页某一条（从 selfId 视角看伙伴）----
  const DetailRow = ({ selfId, card }) => {
    const other = card.a === selfId ? card.b : card.a;
    const out = edge(selfId, other), inc = edge(other, selfId);
    const both = !!out && !!inc;
    const arrow = both ? "⇄" : out ? "→" : "←";
    let labelText, noteText;
    if (both) {
      const same = (out.label || "") === (inc.label || "");
      labelText = same ? out.label : out.label + " · " + inc.label;
      noteText = (out.note || "") === (inc.note || "") ? out.note : [out.note, inc.note].filter(Boolean).join("　／　");
    } else {
      const e = out || inc;
      labelText = e.label; noteText = e.note;
    }
    return h("button", {
      onClick: () => openEdit(card.a, card.b),
      className: "w-full text-left active:opacity-70 mb-2.5",
      style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "14px 16px" }
    },
      h("div", { className: "flex items-center gap-2 mb-2" },
        h("span", { style: { fontFamily: F_BODY, fontSize: 15, color: t.fog } }, arrow),
        h(Chip, { id: other })),
      h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 17, color: t.ink } }, labelText || "未命名"),
      noteText && h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.5, color: t.sub, marginTop: 4 } }, noteText));
  };

  // ---- 详情视图 ----
  if (view !== null) {
    const mine = partnersOf(view);
    return h("div", { className: "h-full flex flex-col" },
      h(Head, {
        zh: view === "me" ? me : nameOf(view), en: "Ties · " + mine.length, onBack: () => setView(null),
        right: h("button", { onClick: openNew, className: "active:opacity-50" }, h(IPlus, { size: 20, color: t.ink }))
      }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
        mine.length === 0
          ? h("div", { className: "pt-6" },
              h(Empty, { text: "还没有关系", sub: "点右上「＋」为 TA 新增一段关系" }))
          : h(Fragment, null,
              h("div", { className: "pt-2 mb-3" }, h(Eyebrow, null, mine.length + " 段关系")),
              mine.map(c => h(DetailRow, { key: c.a + "|" + c.b, selfId: view, card: c })))),
      comp && h(RelComposer, {
        comp, setComp, characters, profile, me, nameOf,
        valid: validComp(comp), onSave: doSave, onDelete: doDelete, onClose: () => setComp(null)
      }));
  }

  // ---- 角色列表视图（默认）----
  return h("div", { className: "h-full flex flex-col" },
    h(Head, {
      zh: "关系", en: "Ties / Directory", onBack: onBack,
      right: characters.length > 0 && h("button", { onClick: openNew, className: "active:opacity-50" }, h(IPlus, { size: 20, color: t.ink }))
    }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      characters.length === 0
        ? h(Empty, { text: "还没有角色", sub: "先去名录录入" })
        : h(Fragment, null,
            h("div", { className: "pt-2 mb-3" }, h(Eyebrow, null, "点角色查看 TA 的关系")),
            participants.map(p => h(RosterRow, { key: p.id, id: p.id })))),
    comp && h(RelComposer, {
      comp, setComp, characters, profile, me, nameOf,
      valid: validComp(comp), onSave: doSave, onDelete: doDelete, onClose: () => setComp(null)
    }));
}

function RelComposer({ comp, setComp, characters, profile, me, nameOf, valid, onSave, onDelete, onClose }) {
  const t = useTheme();
  const c = comp;
  const set = patch => setComp({ ...c, ...patch });
  const A = c.tab === "me" ? "me" : c.pair[0];
  const B = c.tab === "me" ? c.meChar : c.pair[1];
  const nA = A ? nameOf(A) : "…", nB = B ? nameOf(B) : "…";

  const seg = (val, cur, onClick, txt) => h("button", {
    onClick, style: {
      flex: 1, fontFamily: F_BODY, fontSize: 13, padding: "9px 0", borderRadius: 12,
      background: val === cur ? t.ink : "transparent", color: val === cur ? t.bg2 : t.sub,
      border: "1px solid " + (val === cur ? t.ink : t.line), transition: "all .15s"
    }
  }, txt);

  const pickCard = (id, selected, onClick) => {
    const ch = characters.find(x => x.id === id);
    return h("button", {
      key: id, onClick, className: "flex items-center gap-2.5 active:opacity-70",
      style: {
        padding: "10px 12px", borderRadius: 14, textAlign: "left",
        background: selected ? "rgba(63,109,140,0.10)" : t.bg2,
        border: "1px solid " + (selected ? t.tint : t.line)
      }
    },
      h(Avatar, { character: ch, size: 32, radius: 9 }),
      h("span", { className: "flex-1", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, ch ? ch.name : "?"),
      selected && h(ICheck, { size: 15, color: t.tint }));
  };
  const togglePair = id => {
    const p = c.pair.filter(Boolean);
    if (p.includes(id)) set({ pair: p.filter(x => x !== id) });
    else if (p.length < 2) set({ pair: [...p, id] });
    else set({ pair: [p[1], id] });
  };

  const descBox = (val, onChange, ph) => h("div", null,
    h("textarea", {
      value: val, onChange: e => onChange(e.target.value.slice(0, 500)), rows: 3, maxLength: 500,
      placeholder: ph, className: "w-full bg-transparent outline-none resize-none",
      style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, color: t.ink, borderBottom: "1px solid " + t.line, paddingBottom: 8 }
    }),
    h("div", { className: "text-right", style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 3 } }, (val || "").length + "/500"));

  return h(Sheet, { onClose, tall: true },
    // header
    h("div", { className: "flex items-center justify-between mb-5" },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 21, color: t.ink } }, c.edit ? "编辑关系" : "新增关系"),
      h("div", { className: "flex items-center gap-3" },
        c.edit && h("button", { onClick: onDelete, className: "active:opacity-50" }, h(ITrash, { size: 18, color: t.fog })),
        h("button", { onClick: onSave, disabled: !valid, className: "active:opacity-50", style: { opacity: valid ? 1 : 0.35 } }, h(ICheck, { size: 20, color: t.ink })))),

    // tab: 我和角色 / 角色之间
    h("div", { className: "flex gap-2 mb-5" },
      seg("me", c.tab, () => set({ tab: "me" }), "我和角色"),
      seg("chars", c.tab, () => set({ tab: "chars" }), "角色之间")),

    // participants
    h(Eyebrow, { style: { marginBottom: 10 } }, c.tab === "me" ? "选择角色" : "选择两位角色"),
    h("div", { className: "grid grid-cols-2 gap-2 mb-5" },
      c.tab === "me"
        ? characters.map(ch => pickCard(ch.id, c.meChar === ch.id, () => set({ meChar: ch.id })))
        : characters.map(ch => pickCard(ch.id, c.pair.includes(ch.id), () => togglePair(ch.id)))),

    // 关系名称
    h(Eyebrow, { style: { marginBottom: 8 } }, "关系名称"),
    h("input", {
      value: c.label, onChange: e => set({ label: e.target.value }),
      placeholder: "青梅竹马、前任、互相试探",
      className: "w-full bg-transparent outline-none pb-2",
      style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink, borderBottom: "1px solid " + t.line }
    }),
    h("div", { className: "flex flex-wrap gap-1.5 mt-3 mb-5" }, REL_PRESETS.map(p => h("button", {
      key: p, onClick: () => set({ label: p }),
      style: { fontFamily: F_BODY, fontSize: 11, padding: "4px 10px", borderRadius: 999, border: "1px solid " + t.line, color: t.sub }
    }, p))),

    // 关系方向
    h(Eyebrow, { style: { marginBottom: 8 } }, "关系方向"),
    h("div", { className: "flex gap-2 mb-4" },
      seg("double", c.dir, () => set({ dir: "double" }), "双向"),
      seg("single", c.dir, () => set({ dir: "single" }), "单向")),

    // 单向：谁对谁
    c.dir === "single" && h(Fragment, null,
      h(Eyebrow, { style: { marginBottom: 8 } }, "单向是谁对谁"),
      h("div", { className: "flex gap-2 mb-4" },
        seg("fwd", c.single, () => set({ single: "fwd" }), nA + " → " + nB),
        seg("bwd", c.single, () => set({ single: "bwd" }), nB + " → " + nA))),

    // 双向：是否分别描述
    c.dir === "double" && h("button", {
      onClick: () => set({ split: !c.split }),
      className: "flex items-center justify-between w-full mb-3 active:opacity-70"
    },
      h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub } }, "两个方向分别描述"),
      h("div", { style: { width: 40, height: 23, borderRadius: 999, padding: 2, background: c.split ? t.ink : t.line, transition: "background .2s" } },
        h("div", { style: { width: 19, height: 19, borderRadius: 999, background: "#fff", transform: c.split ? "translateX(17px)" : "translateX(0)", transition: "transform .2s" } }))),

    // 关系描述
    h(Eyebrow, { style: { marginBottom: 8 } }, "关系描述"),
    (c.dir === "double" && c.split)
      ? h(Fragment, null,
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 4 } }, nA + " 眼中的 " + nB),
          descBox(c.noteFwd, v => set({ noteFwd: v }), "写清楚这段关系的背景、张力和禁忌。"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, margin: "12px 0 4px" } }, nB + " 眼中的 " + nA),
          descBox(c.noteBwd, v => set({ noteBwd: v }), "写清楚这段关系的背景、张力和禁忌。"))
      : descBox(c.note, v => set({ note: v }), "写清楚这段关系的背景、张力和禁忌。"));
}

// ============================================================
// LIFESTYLE + LORE
// ============================================================
// ============================================================
// 行程 Lifestyle —— 仿日记大图 + swipe 换角色 + 周 timeline + 每日时间线（偏差红框/碎碎念回看）
// ============================================================
function schedDayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function schedParseKey(k) { const a = String(k).split("-").map(Number); return new Date(a[0], a[1] - 1, a[2]); }
const SCHED_DOW_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SCHED_DOW_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function schedDateParts(k) {
  const d = schedParseKey(k), dow = d.getDay();
  return { date: d, md: (d.getMonth() + 1) + "月" + d.getDate() + "日", dowEn: SCHED_DOW_EN[dow], dowZh: SCHED_DOW_ZH[dow], dateNum: String(d.getDate()).padStart(2, "0") };
}
function schedWeek(today) {
  const d = new Date(today), dow = (d.getDay() + 6) % 7; // 周一=0
  const mon = new Date(d); mon.setDate(d.getDate() - dow); mon.setHours(0, 0, 0, 0);
  const tk = schedDayKey(new Date()); // 相对「真实今天」判定过去/今天/未来
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i);
    const key = schedDayKey(dd);
    return { key, date: dd, dowL: SCHED_DOW_EN[dd.getDay()][0], dateNum: String(dd.getDate()).padStart(2, "0"), isToday: key === tk, isPast: key < tk, isFuture: key > tk };
  });
}
function schedActIcon(type) { return { coffee: GCoffee, work: GBrief, create: GPen, meal: GMeal, rest: GMoon, sleep: GMoon, social: GChat, out: GWalk }[type] || GBrief; }
// 角色本地时区 - 我本地 的分钟差（char.tz 如 "+8"/"-5"/"+5.5"/""跟随系统）。异地恋用。
function schedTzShiftMin(char) {
  const raw = char && char.tz != null ? String(char.tz) : "";
  if (raw === "") return 0;
  const co = parseFloat(raw);
  if (isNaN(co)) return 0;
  const myOff = -new Date().getTimezoneOffset() / 60;
  return Math.round((co - myOff) * 60);
}
function pad2(n) { return String(n).padStart(2, "0"); }
// 把角色本地日程转成「我这边的时间轴」：每段算出我这边对应时刻(_myMin/_myLabel)，保留角色当地时间(_charTime)；
// 有时差就按我这边时间重新排序（框架=我的时间，内容=角色的日程）。
function schedDisplaySeqs(char, seqs) {
  const shift = schedTzShiftMin(char);
  const arr = (seqs || []).map(s => {
    const m = /(\d{1,2}):(\d{2})/.exec(s.time || "");
    const cm = m ? (+m[1]) * 60 + (+m[2]) : null;
    const my = cm == null ? null : (((cm - shift) % 1440) + 1440) % 1440;
    return Object.assign({}, s, { _charTime: s.time || "", _myMin: my, _myLabel: my == null ? (s.time || "") : pad2(Math.floor(my / 60)) + ":" + pad2(my % 60), _shifted: shift !== 0 });
  });
  if (shift !== 0) arr.sort((a, b) => (a._myMin == null ? 99999 : a._myMin) - (b._myMin == null ? 99999 : b._myMin));
  return arr;
}
function schedCurrentSeqIdx(seqs, isToday) {
  if (!isToday) return -1;
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  let idx = -1, prev = -1;
  // 单调化时间：**只有真正跨过午夜**（深夜→凌晨、回退超过 12h）才 +24h，保证末尾的「00:20 睡觉」排在最后。
  // 关键修复：模型偶尔给的【小幅乱序】（如 14:00 后冒出 13:30）绝不当跨天——否则会把乱序之后的整串时段误推到「明天」，
  // 导致 tm 永远 > cur、该灰的灰不掉、聊天顶栏 live 还错显「还没开始今天的安排」。
  // 若 seq 带了 _myMin（已换算成我这边时间），就用它比对。
  (seqs || []).forEach((s, i) => {
    let tm;
    if (s._myMin != null) tm = s._myMin;
    else { const m = /(\d{1,2}):(\d{2})/.exec(s.time || ""); if (!m) return; tm = (+m[1]) * 60 + (+m[2]); }
    if (prev >= 0 && tm < prev && (prev - tm) > 720) tm += 1440; // 只在深夜→凌晨这种真跨天时进位
    if (tm > prev) prev = tm;                                    // 只在前进时更新 prev，别被小幅乱序带偏
    if (tm <= cur) idx = i;
  });
  return idx;
}

// —— 单日时间线（打开即生成，失败退回）——
function LifeDay({ char, dayKey, plan, busy, onGen, onBack }) {
  const t = useTheme();
  const dp = schedDateParts(dayKey);
  const isToday = dayKey === schedDayKey(new Date());
  const [openMurmur, setOpenMurmur] = useState(false);
  useEffect(() => {
    if (plan) return;
    let alive = true;
    Promise.resolve(onGen(char, dayKey)).then(ok => { if (alive && ok === false) onBack(); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [dayKey]);
  const head = h("div", { className: "shrink-0 flex items-center justify-between px-6 pt-5 pb-3" },
    h("button", { onClick: onBack, className: "flex items-center gap-2 active:opacity-50" },
      h(IArrow, { size: 19, color: t.ink }),
      h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.15em", color: t.ink } }, "BACK")),
    h("div", { className: "text-right" },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, dp.dowEn + ", " + dp.dateNum),
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, dp.md + " " + dp.dowZh),
      // 兜底刷新：模型偶尔给乱序时间导致灰不掉/进度错乱——一键按「此刻」重推这天
      plan && !busy ? h("button", { onClick: () => onGen(char, dayKey), className: "active:opacity-60", style: { marginTop: 5, fontFamily: F_BODY, fontSize: 10.5, color: t.fog, border: "1px solid " + t.line, borderRadius: 999, padding: "2px 10px" } }, "🔄 重新推演") : null));
  if (busy || !plan) return h("div", { className: "h-full flex flex-col", style: { background: t.bg } }, head, h("div", { className: "flex-1 flex items-center justify-center" }, h(Spinner, { label: "正在推演 " + char.name + " 的这天…" })));
  // 异地：把角色本地日程换算到我这边的时间轴并重排（框架=我的时间）
  const seqs = schedDisplaySeqs(char, plan.seqs || []);
  const tzShifted = seqs.length && seqs[0]._shifted;
  const curIdx = schedCurrentSeqIdx(seqs, isToday);
  const murmurs = plan.murmurs || [];
  const seqState = i => !isToday ? "done" : i < curIdx ? "done" : i === curIdx ? "current" : "future";
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } }, head,
    h("div", { className: "flex-1 overflow-y-auto px-5 pb-10" },
      // 碎碎念回看入口
      murmurs.length > 0 && h("button", { onClick: () => setOpenMurmur(true), className: "w-full flex items-center gap-2 mb-4 mt-1 px-4 py-2.5 active:opacity-70", style: { border: "1px solid " + t.line, borderRadius: 999 } },
        h(GChat, { size: 15, color: t.accent }),
        h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, "实时碎碎念 · " + murmurs.length + " 条"),
        h(IChevR, { size: 14, color: t.fog, style: { marginLeft: "auto" } })),
      tzShifted && h("div", { className: "mb-3", style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.5, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "7px 11px" } }, "TA 在别的时区，日程按 TA 当地作息推演，时间已换算到你这边（框架＝你的时间）。左侧是你这边时刻，「当地」是 TA 那边时刻。"),
      seqs.length === 0 ? h("div", { className: "text-center", style: { paddingTop: 40, fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "这天没有记录")
        : h("div", { style: { position: "relative", paddingLeft: 22, animation: "fadeUp .3s ease both" } },
            h("div", { style: { position: "absolute", left: 5, top: 8, bottom: 8, width: 0, borderLeft: "1.5px dashed " + t.line } }),
            seqs.map((s, i) => {
              const st = seqState(i), dev = st === "future" ? null : s.deviation;
              const done = st === "done", cur = st === "current";
              const Ico = schedActIcon(s.type);
              return h("div", { key: i, style: { position: "relative", marginBottom: 14, opacity: 1 } },
                h("span", { style: { position: "absolute", left: -22, top: 20, width: 11, height: 11, borderRadius: 999, background: cur || dev ? t.accent : done ? t.fog : t.line, border: "2px solid " + t.bg, boxShadow: cur ? "0 0 0 3px rgba(194,90,74,0.2)" : "none" } }),
                h("div", { style: { position: "relative", background: cur ? "#fff" : t.bg2, borderRadius: 16, padding: "16px 16px 15px", border: "1px solid " + (dev ? t.accent : t.line), boxShadow: cur ? "0 4px 18px rgba(194,90,74,0.13)" : "none" } },
                  // 活动图标（右上角圆）
                  h("div", { style: { position: "absolute", top: -14, right: 14, width: 46, height: 46, borderRadius: 999, background: dev ? t.accent : t.bg, border: "1px solid " + (dev ? t.accent : t.line), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: dev ? "0 3px 12px rgba(194,90,74,0.35)" : "none" } }, h(Ico, { size: 21, color: dev ? "#fff" : done ? t.fog : t.ink })),
                  h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.18em", color: t.fog, marginBottom: 8 } }, "SEQ-" + String(s.seq).padStart(2, "0")),
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 21, lineHeight: 1.25, color: done ? t.fog : t.ink, fontWeight: cur ? 700 : 400, textDecoration: dev ? "line-through" : "none", paddingRight: 40 } }, s.title),
                  dev && h("div", { style: { marginTop: 12, fontFamily: F_BODY, fontSize: 14, lineHeight: 1.6, color: t.accent, fontWeight: 500 } }, "［DEVIATION］ " + (dev.reason || "")),
                  (dev && dev.plan) && h("div", { style: { marginTop: 4, fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "原计划：" + dev.plan),
                  (dev && dev.actual ? h("div", { className: "flex items-center gap-1.5", style: { marginTop: 10 } }, h(GWalk, { size: 13, color: t.fog }), h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, dev.actual))
                    : s.location && h("div", { className: "flex items-center gap-1.5", style: { marginTop: 10 } }, h(GWalk, { size: 13, color: t.fog }), h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, s.location))),
                  s.time && h("div", { style: { position: "absolute", top: 16, right: 66, textAlign: "right" } },
                    h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, color: t.fog } }, s._myLabel || s.time),
                    s._shifted && h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9, color: t.fog, opacity: 0.7, marginTop: 1 } }, "当地 " + s._charTime))));
            }))),
    openMurmur && h(Sheet, { onClose: () => setOpenMurmur(false), tall: true },
      h(Eyebrow, { style: { marginBottom: 4 } }, "实时碎碎念 · MURMURS"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 14 } }, char.name + " 这天的即时念头，可回看"),
      murmurs.map((m, i) => h("div", { key: i, className: "flex gap-3 py-3", style: { borderTop: i ? "1px solid " + t.line : "none" } },
        h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, color: t.accent, width: 44, flexShrink: 0, paddingTop: 2 } }, m.time || ""),
        h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.7, color: t.ink } }, m.text)))));
}

function Lifestyle({ characters, schedules, selId, busyKey, onBack, onSel, onGenDay }) {
  const t = useTheme();
  const [view, setView] = useState("browser"); // browser | brief | day | index
  const [dayKey, setDayKey] = useState(null);
  const [weekOff, setWeekOff] = useState(0); // 0=本周, -1=上周…
  const tp = useRef(null);
  const idx = Math.max(0, characters.findIndex(c => c.id === selId));
  const char = characters[idx] || characters[0];
  if (!char) return h("div", { className: "h-full flex flex-col" }, h(Head, { zh: "行程", en: "Lifestyle", onBack }), h(Empty, { text: "还没有角色", sub: "先去名录录入一位" }));
  const todayKey = schedDayKey(new Date());
  const plans = schedules[char.id] || {};
  const todayPlan = plans[todayKey];
  const go = dir => { const ni = idx + dir; if (ni >= 0 && ni < characters.length) onSel(characters[ni].id); };
  const openDay = key => { setDayKey(key); setView("day"); };
  const onTS = e => { const p = e.touches[0]; tp.current = { x: p.clientX, y: p.clientY }; };
  const onTE = e => { if (!tp.current) return; const p = e.changedTouches[0]; const dx = p.clientX - tp.current.x, dy = p.clientY - tp.current.y; tp.current = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); };

  if (view === "day" && dayKey) return h(LifeDay, { char, dayKey, plan: plans[dayKey], busy: busyKey === char.id + "|" + dayKey, onGen: onGenDay, onBack: () => setView("brief") });

  if (view === "index") return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "名册", en: "Roster · 选择角色", onBack: () => setView("browser") }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-10 pt-1" }, characters.map(c => {
      const p = schedules[c.id] || {}; const tp2 = p[todayKey]; const cur = c.id === char.id;
      return h("div", { key: c.id, onClick: () => { onSel(c.id); setView("browser"); }, className: "flex items-center gap-4 py-4 active:opacity-70", style: { borderBottom: "1px solid " + t.line } },
        h(Avatar, { character: c, size: 52, radius: 15 }),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { className: "flex items-center gap-2" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink } }, c.name),
            cur && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 8, letterSpacing: "0.14em", padding: "2px 6px", borderRadius: 999, border: "1px solid " + t.line, color: t.fog } }, "当前")),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, tp2 ? (tp2.seqs || []).length + " 项 · " + (tp2.load || "") : "今日待生成")),
        h(IChevR, { size: 16, color: t.fog }));
    })));

  // —— brief：选中角色的日程（周条 + 今日简报 + 上一周历史）——
  if (view === "brief") {
    const base = new Date(Date.now() + weekOff * 7 * 86400000);
    const week = schedWeek(base);
    const dev0 = todayPlan && (todayPlan.seqs || []).map(s => s.deviation).find(Boolean);
    const weekLabel = weekOff === 0 ? "本周" : weekOff === -1 ? "上一周" : Math.abs(weekOff) + " 周前";
    const bandBg = char.avatarImage
      ? `linear-gradient(180deg, rgba(10,9,8,0.05) 0%, rgba(10,9,8,0.35) 60%, rgba(10,9,8,0.78) 100%), center 25%/cover no-repeat url(${char.avatarImage})`
      : `linear-gradient(180deg, ${char.color || "#3a3730"} 0%, #6b6459 100%)`;
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h("div", { className: "shrink-0 relative", style: { height: 190, background: bandBg, color: "#efe9df" } },
        h("div", { className: "flex items-start justify-between px-6 pt-6" },
          h("button", { onClick: () => setView("browser"), className: "flex items-center gap-2 active:opacity-60" },
            h("span", { className: "flex items-center justify-center", style: { width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(239,233,223,0.4)" } }, h(IArrow, { size: 16, color: "#efe9df" })),
            h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.18em" } }, "ROSTER")),
          h("div", { className: "text-right" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17 } }, char.name, h("span", { style: { opacity: 0.6 } }, "  // " + String(idx + 1).padStart(2, "0"))),
            h("div", { className: "flex items-center justify-end gap-1.5", style: { marginTop: 2 } },
              h("span", { style: { width: 6, height: 6, borderRadius: 999, background: "#c25a4a" } }),
              h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10.5, letterSpacing: "0.16em", opacity: 0.85 } }, "LIVE SYNC"))))),
      h("div", { className: "flex-1 overflow-y-auto", style: { marginTop: -26, position: "relative", zIndex: 2 } },
        // 周条 + 周切换
        h("div", { className: "mx-4 p-4", style: { background: "#fff", borderRadius: 22, border: "1px solid " + t.line, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" } },
          h("div", { className: "flex items-center justify-between mb-3 px-1" },
            h("button", { onClick: () => setWeekOff(weekOff - 1), className: "active:opacity-50 p-1" }, h(IArrow, { size: 16, color: t.fog })),
            h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.16em", color: t.sub } }, weekLabel.toUpperCase ? weekLabel : weekLabel),
            h("button", { onClick: () => weekOff < 0 && setWeekOff(weekOff + 1), disabled: weekOff >= 0, className: "active:opacity-50 disabled:opacity-25 p-1", style: { transform: "scaleX(-1)" } }, h(IArrow, { size: 16, color: t.fog }))),
          h("div", { className: "flex justify-between", style: { position: "relative" } },
            h("div", { style: { position: "absolute", left: 8, right: 8, top: 30, height: 1, background: t.line } }),
            week.map(d => h("button", { key: d.key, disabled: d.isFuture, onClick: () => !d.isFuture && openDay(d.key), className: "flex flex-col items-center gap-2 active:opacity-60 disabled:opacity-100", style: { flex: 1, position: "relative", zIndex: 1 } },
              h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.1em", color: d.isToday ? t.ink : t.fog } }, d.dowL),
              h("span", { style: { width: d.isToday ? 15 : 11, height: d.isToday ? 15 : 11, borderRadius: 999, background: d.isToday ? "#fff" : d.isFuture ? "transparent" : (plans[d.key] ? "#c25a4a" : t.line), border: d.isToday ? "2px solid " + t.ink : d.isFuture ? "1.5px solid " + t.line : "none", display: "flex", alignItems: "center", justifyContent: "center" } }, d.isToday ? h("span", { style: { width: 5, height: 5, borderRadius: 999, background: t.ink } }) : null),
              h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: d.isToday ? 20 : 17, color: d.isToday ? t.ink : d.isFuture ? t.line : t.fog } }, d.dateNum))))),
        // 简报（仅本周显示今日简报；历史周提示点某天）
        weekOff < 0
          ? h("div", { className: "px-6 pt-8 pb-10 text-center", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, lineHeight: 1.8 } }, "「" + weekLabel + "」的历史。\n点某一天，查看 " + char.name + " 那天实际过成了什么样。")
          : h("div", { className: "px-6 pt-8 pb-10" },
            h("div", { style: { position: "relative" } },
              h("div", { style: { position: "absolute", left: -2, top: -14, fontFamily: F_DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 92, color: t.line, opacity: 0.5, pointerEvents: "none", letterSpacing: "-0.02em" } }, "LOG."),
              h("div", { style: { position: "relative" } },
                h(Eyebrow, { style: { marginBottom: 6 } }, "TODAY'S BRIEF"),
                h("div", { className: "flex items-center justify-between" },
                  h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 46, color: t.ink, lineHeight: 1 } }, schedDateParts(todayKey).dowEn + ", " + schedDateParts(todayKey).dateNum),
                  todayPlan && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.1em", color: t.ink, border: "1px solid " + t.ink, borderRadius: 999, padding: "7px 15px" } }, todayPlan.load || "NORMAL")))),
            !todayPlan
              ? h("button", { onClick: () => openDay(todayKey), className: "w-full mt-8 py-4 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13.5, color: t.sub, border: "1px dashed " + t.line, borderRadius: 14 } }, (busyKey ? "正在生成今日行程…" : "点此查看/生成今日行程") + " →")
              : h("div", null,
                h("div", { className: "flex gap-12 mt-8" },
                  h("div", null,
                    h(Eyebrow, { style: { marginBottom: 8 } }, "EVENTS"),
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 30, color: t.ink } }, String((todayPlan.seqs || []).length).padStart(2, "0"), h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, " 项"))),
                  h("div", null,
                    h(Eyebrow, { style: { marginBottom: 8 } }, "EST. TIME"),
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 30, color: t.ink } }, todayPlan.estTime != null ? todayPlan.estTime : "—", h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, " H")))),
                dev0 && h("div", { className: "mt-8 pl-4", style: { borderLeft: "3px solid " + t.accent } },
                  h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.14em", color: t.accent, marginBottom: 8 } }, "✳ DEVIATION DETECTED"),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.7, color: t.ink } }, (dev0.plan ? "原计划：" + dev0.plan + "。" : "") + (dev0.reason ? "变更原因：" + dev0.reason : ""))),
                h("button", { onClick: () => openDay(todayKey), className: "w-full mt-9 flex items-center justify-between px-5 py-4 active:opacity-70", style: { background: t.ink, color: t.bg2, borderRadius: 16 } },
                  h("div", { className: "text-left" },
                    h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.16em" } }, "OPEN TIMELINE"),
                    h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.7 } }, "查看今日时间线")),
                  h("span", { className: "flex items-center justify-center", style: { width: 36, height: 36, borderRadius: 999, background: t.bg2 } }, h(IChevR, { size: 18, color: t.ink })))))));
  }

  // —— browser（默认）：仿日记大图 · swipe + 箭头 + 圆点换角色，点进去看日程 ——
  const bg = char.avatarImage
    ? `linear-gradient(180deg, rgba(10,9,8,0.1) 0%, rgba(10,9,8,0.45) 55%, #0c0b0a 94%), center 22%/cover no-repeat url(${char.avatarImage})`
    : `linear-gradient(180deg, ${char.color || "#3a3730"} 0%, #0c0b0a 84%)`;
  return h("div", { className: "h-full flex flex-col", style: { background: "#0c0b0a", color: "#efe9df", touchAction: "pan-y" }, onTouchStart: onTS, onTouchEnd: onTE },
    h("div", { className: "flex-1 min-h-0 flex flex-col relative", style: { background: bg } },
      h("div", { className: "shrink-0 flex items-start justify-between px-6 pt-6" },
        h("button", { onClick: onBack, className: "flex items-center gap-2 active:opacity-60" },
          h("span", { className: "flex items-center justify-center", style: { width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(239,233,223,0.4)" } }, h(IArrow, { size: 18, color: "#efe9df" })),
          h("div", null,
            h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.15em" } }, "ROSTER"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.6 } }, "返回桌面"))),
        h("button", { onClick: () => setView("index"), className: "text-right active:opacity-60" },
          h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.15em" } }, "INDEX"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.6 } }, "名册定位"))),
      h("div", { className: "flex-1" }),
      h("div", { className: "shrink-0 px-6 pb-7" },
        h("div", { className: "flex items-baseline gap-3 mb-1" },
          h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 26, opacity: 0.5 } }, "No." + String(idx + 1).padStart(2, "0")),
          h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.2em", opacity: 0.6 } }, "SCHEDULE OBJECT · 行程对象")),
        h("div", { className: "flex items-end gap-3" },
          h("span", { style: { fontFamily: F_DISPLAY, fontWeight: 500, fontSize: 68, lineHeight: 0.95 } }, char.name),
          char.remark && h("span", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 24, opacity: 0.7, paddingBottom: 8 } }, char.remark)),
        h("div", { style: { height: 1, background: "rgba(239,233,223,0.35)", margin: "20px 0" } }),
        h("div", { className: "flex items-end justify-between" },
          h("div", { className: "flex gap-10" },
            h("div", null,
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.2em", opacity: 0.55 } }, "TODAY 今日"),
              h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 30 } }, todayPlan ? (todayPlan.seqs || []).length + " 项" : "—")),
            h("div", null,
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.2em", opacity: 0.55 } }, "LOAD 负荷"),
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 15, marginTop: 8 } }, todayPlan ? (todayPlan.load || "NORMAL") : "待生成"))),
          h("button", { onClick: () => { setWeekOff(0); setView("brief"); }, className: "flex items-center gap-3 active:opacity-70", style: { background: "rgba(239,233,223,0.12)", border: "1px solid rgba(239,233,223,0.3)", borderRadius: 999, padding: "10px 12px 10px 18px" } },
            h("div", { className: "text-left" },
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.16em" } }, "OPEN SCHEDULE"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.7 } }, "查看日程")),
            h("span", { className: "flex items-center justify-center", style: { width: 38, height: 38, borderRadius: 999, background: "#efe9df" } }, h(IChevR, { size: 18, color: "#0c0b0a" })))),
        characters.length > 1 && h("div", { className: "flex items-center justify-center gap-6", style: { marginTop: 18 } },
          h("button", { onClick: () => go(-1), disabled: idx === 0, className: "active:opacity-50", style: { opacity: idx === 0 ? 0.2 : 0.7, padding: 6 } }, h(IArrow, { size: 20, color: "#efe9df" })),
          h("div", { className: "flex gap-1.5" }, characters.map((c, i) => h("span", { key: c.id, style: { width: i === idx ? 16 : 5, height: 5, borderRadius: 999, background: "#efe9df", opacity: i === idx ? 0.9 : 0.35, transition: "width .2s" } }))),
          h("button", { onClick: () => go(1), disabled: idx === characters.length - 1, className: "active:opacity-50", style: { opacity: idx === characters.length - 1 ? 0.2 : 0.7, padding: 6, transform: "scaleX(-1)" } }, h(IArrow, { size: 20, color: "#efe9df" }))))));
}
// 世界书 · 书架：一本本立在木架板上的书，分全局通用 + 各角色个人一层层往下滑；点书开编辑
const LORE_COVERS = ["#7c5c4e", "#4e6a7c", "#5f7c4e", "#7c4e5f", "#584e7c", "#4e7c6a", "#7c6f3f", "#6b5b73"];
const loreHashN = s => { let n = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0; return Math.abs(n); };
function WorldBook({ entries, characters, onBack, onSave, onDelete }) {
  const t = useTheme();
  const [editing, setEditing] = useState(null); // null | {__new, charIds} | entry
  const list = entries || [];
  const global = list.filter(e => !e.charIds || e.charIds.length === 0);
  const openNew = charIds => setEditing({ __new: true, charIds: charIds || [] });
  // 一本书 = 竖直书封，封面色按 id 取，白字标题夹紧，底部标记常驻/关键词/停用
  const book = e => {
    const off = e.enabled === false;
    const cover = off ? "#9a9a9a" : LORE_COVERS[loreHashN(e.id || e.title) % LORE_COVERS.length];
    return h("button", { key: e.id, onClick: () => setEditing(e), className: "active:opacity-80 shrink-0",
      style: { width: 68, height: 96, borderRadius: "3px 6px 6px 3px", background: cover, borderLeft: "5px solid rgba(0,0,0,.22)", boxShadow: "0 3px 6px rgba(0,0,0,.22)", padding: "8px 7px 7px", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden", opacity: off ? 0.55 : 1 } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 11, lineHeight: 1.25, color: "#fff", textAlign: "left", textShadow: "0 1px 2px rgba(0,0,0,.3)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" } }, e.title || "无题"),
      h("div", { style: { display: "flex", alignItems: "center", gap: 4, minHeight: 8 } },
        e.alwaysOn ? h("span", { title: "常驻", style: { width: 7, height: 7, borderRadius: 9, background: "#f2c14e", boxShadow: "0 0 0 1px rgba(0,0,0,.15)" } }) : (e.keyword ? h("span", { style: { fontSize: 8, color: "rgba(255,255,255,.9)" } }, "🔑") : null),
        e.scope && (e.scope.diary || e.scope.debate || e.scope.subjects || e.scope.lifestyle) ? h("span", { style: { width: 5, height: 5, borderRadius: 9, background: "rgba(255,255,255,.65)" } }) : null));
  };
  // ＋ 占位书：虚线书封，点了在这一层新建
  const addBook = charIds => h("button", { key: "__add", onClick: () => openNew(charIds), className: "active:opacity-60 shrink-0",
    style: { width: 68, height: 96, borderRadius: "3px 6px 6px 3px", background: "transparent", border: "1.5px dashed " + t.line, display: "flex", alignItems: "center", justifyContent: "center", color: t.fog, fontSize: 26, fontWeight: 300 } }, "＋");
  // 一层架子：标题 + 一排立着的书 + 底下的木隔板
  const shelf = (key, title, arr, newCharIds) => h("div", { key: key, style: { marginBottom: 26 } },
    h("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 } },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, title),
      h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, arr.length + " 本")),
    h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, rowGap: 18, paddingBottom: 9 } },
      arr.map(book).concat([addBook(newCharIds)])),
    h("div", { style: { height: 7, borderRadius: 3, background: "linear-gradient(#c9a07e,#a8825f)", boxShadow: "0 3px 5px -2px rgba(0,0,0,.35)" } }));
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "世界书", en: "Lore · " + list.length + " 本", onBack: onBack,
      right: h("button", { onClick: () => openNew([]), className: "active:opacity-50" }, h(IPlus, { size: 20, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8", style: { paddingTop: 4 } },
      shelf("__global", "全局通用 · GLOBAL", global, []),
      characters.map(c => shelf(c.id, (c.remark || c.name) + " · 个人", list.filter(e => (e.charIds || []).includes(c.id)), [c.id]))),
    editing && h(WorldBookEntrySheet, {
      entry: editing.__new ? { charIds: editing.charIds } : editing, characters: characters, onClose: () => setEditing(null),
      onSave: data => { onSave(data); setEditing(null); },
      onDelete: editing.__new ? null : () => { onDelete(editing.id); setEditing(null); }
    }));
}
function WorldBookEntrySheet({ entry, characters, onClose, onSave, onDelete }) {
  const t = useTheme();
  const [f, setF] = useState(() => Object.assign({ title: "", keyword: "", category: "默认", charIds: [], payload: "", regex: false, enabled: true, alwaysOn: false, ensemble: false, priority: 3, scope: { chat: true, subjects: false, debate: false, lifestyle: false, diary: false } }, entry || {}));
  const set = p => setF(x => Object.assign({}, x, p));
  const toggleChar = id => setF(x => { const has = (x.charIds || []).includes(id); return Object.assign({}, x, { charIds: has ? x.charIds.filter(i => i !== id) : [...(x.charIds || []), id] }); });
  const setScope = k => setF(x => Object.assign({}, x, { scope: Object.assign({ chat: true }, x.scope, { [k]: !(x.scope && x.scope[k]) }) }));
  const save = () => { if (!(f.payload || "").trim()) { return; } onSave(Object.assign({}, f, { id: entry && entry.id ? entry.id : "le_" + Date.now() + "_" + Math.floor(Math.random() * 1000), ts: Date.now() })); };
  const field = { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "10px 12px", width: "100%", outline: "none" };
  const lbl = s => h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, fontWeight: 700, color: t.sub, margin: "14px 0 6px", letterSpacing: .3 } }, s);
  const toggle = (label, sub, val, onT) => h("div", { className: "flex items-center justify-between", style: { padding: "10px 0" } },
    h("div", { style: { flex: 1, paddingRight: 10 } }, h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, label), sub ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, lineHeight: 1.4 } }, sub) : null),
    h("button", { onClick: onT, className: "active:opacity-70 shrink-0", style: { width: 46, height: 27, borderRadius: 999, background: val ? t.ink : t.line, position: "relative" } }, h("span", { style: { position: "absolute", top: 3, left: val ? 22 : 3, width: 21, height: 21, borderRadius: 999, background: "#fff" } })));
  const SCOPES = [["chat", "聊天"], ["subjects", "查手机"], ["debate", "辩论"], ["lifestyle", "行程"], ["diary", "日记"]];
  return h(Sheet, { onClose: onClose, tall: true },
    h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 21, color: t.ink } }, entry ? "编辑词条" : "新建词条"),
      onDelete ? h("button", { onClick: onDelete, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, "删除") : null),
    lbl("词条名称"),
    h("input", { value: f.title, onChange: e => set({ title: e.target.value }), placeholder: "Title…", style: field }),
    lbl("触发关键词（留空+常驻=永远注入；填了则聊到才注入）"),
    h("input", { value: f.keyword, onChange: e => set({ keyword: e.target.value }), placeholder: "多个用逗号隔开", style: field }),
    lbl("绑定角色（不选＝全局通用，所有角色可见）"),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7 } }, (characters || []).map(c => { const on = (f.charIds || []).includes(c.id); return h("button", { key: c.id, onClick: () => toggleChar(c.id), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.sub, background: on ? t.ink : "transparent", border: "1px solid " + (on ? t.ink : t.line), borderRadius: 999, padding: "5px 12px" } }, c.remark || c.name); })),
    lbl("注入内容 · PAYLOAD"),
    h("textarea", { value: f.payload, onChange: e => set({ payload: e.target.value }), rows: 5, placeholder: "这条要注入给模型的设定 / 背景 / 规则…", style: Object.assign({}, field, { resize: "vertical", minHeight: 110, lineHeight: 1.6 }) }),
    h("div", { style: { height: 8 } }),
    toggle("启用", "关掉则该词条不参与注入", f.enabled !== false, () => set({ enabled: f.enabled === false })),
    toggle("常驻模式", "无视关键词，对话时强制注入", !!f.alwaysOn, () => set({ alwaysOn: !f.alwaysOn })),
    toggle("正则模式", "把关键词当正则表达式匹配", !!f.regex, () => set({ regex: !f.regex })),
    toggle("群像注入", "让该词条出现在群像剧情选书列表", !!f.ensemble, () => set({ ensemble: !f.ensemble })),
    h("div", { className: "flex items-center justify-between", style: { padding: "12px 0" } },
      h("span", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, "注入优先级"),
      h("div", { className: "flex items-center", style: { gap: 8 } }, [1, 2, 3, 4, 5].map(n => h("button", { key: n, onClick: () => set({ priority: n }), className: "active:opacity-70", style: { width: 30, height: 30, borderRadius: 999, fontFamily: F_DISPLAY, fontSize: 13, color: (f.priority || 3) === n ? "#fff" : t.sub, background: (f.priority || 3) === n ? t.ink : "transparent", border: "1px solid " + ((f.priority || 3) === n ? t.ink : t.line) } }, n)))),
    lbl("适用范围（这条参与哪些功能的注入）"),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7 } }, SCOPES.map(([k, label]) => { const on = k === "chat" ? (f.scope ? f.scope.chat !== false : true) : !!(f.scope && f.scope[k]); return h("button", { key: k, onClick: () => setScope(k), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? "#fff" : t.sub, background: on ? t.tint : "transparent", border: "1px solid " + (on ? t.tint : t.line), borderRadius: 999, padding: "5px 12px" } }, label); })),
    h("button", { onClick: save, className: "w-full active:opacity-80", style: { marginTop: 20, fontFamily: F_BODY, fontSize: 14.5, fontWeight: 700, color: t.bg2, background: t.ink, borderRadius: 12, padding: "12px" } }, "保存"));
}
// ============================================================
// FORUM —— 仿贴吧/推特：底部四 tab（主页/搜索/私信/我）
//  主页 = 吐槽/日常/求助/匿名 + 关注 切换；顶部刷新键在当前版块生成 NPC 帖
//  搜索 = 随机刷到四版块之外的吧（据全局聊天）；私信 = NPC 私信；我 = 我的主页
//  帖子只有一份，版块是筛选视图；评论懒加载（含楼中楼，回复者随机 NPC/角色）
// ============================================================
const FORUM_BOARDS = ["吐槽吧", "日常吧", "求助吧", "匿名吧"];
const FORUM_AV_EMOJI = ["🐧", "🐸", "🐱", "🦊", "🐰", "🐻", "🐨", "🦁", "🐯", "🐙", "🦈", "🌵", "🍥", "🌙", "⚡", "🎭", "👾", "🤖", "🍔", "🧋", "🪐", "🎧", "📎", "🧃", "🦖", "🫧", "🌻", "🍒", "🐳", "🦉"];
function forumHash(str) { let h = 2166136261; str = String(str || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function fmtNum(n) { n = Number(n) || 0; if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "万"; return String(n); }
function forumAge(ts) { if (!ts) return "新人"; const d = Math.floor((Date.now() - ts) / 86400000); if (d < 30) return "吧龄 " + Math.max(d, 1) + " 天"; const mo = Math.floor(d / 30); if (mo < 12) return "吧龄 " + mo + " 个月"; return "吧龄 " + (d / 365).toFixed(1) + " 年"; }
function NpcAvatar({ seed, size }) { const hh = forumHash(seed); const emo = FORUM_AV_EMOJI[hh % FORUM_AV_EMOJI.length]; return React.createElement("div", { style: { width: size, height: size, borderRadius: size / 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.5), background: `linear-gradient(135deg,hsl(${hh % 360},58%,60%),hsl(${(hh * 7) % 360},58%,48%))` } }, emo); }
function Forum({
  characters, profile, posts, comments, follows, pms, groups, gen, forumMe, charMetaOf, forumOff,
  onBack, onGenBoard, onGenSearch, onLoadComments, onMoreComments, onReplyFloor, onReplySub,
  onPostMine, onGenCharPost, onToggleFollow, onForwardToChat, onForwardToGroup,
  onRefreshPMs, onSendPM, onMarkPMRead, onEditMe, onEnsureCharMeta, onToggleForumChar
}) {
  const t = useTheme();
  const [nav, setNav] = useState("home");           // home | search | pm | me
  const [tab, setTab] = useState("吐槽吧");           // 主页版块 或 "关注"
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);            // 打开的帖子
  const [profileId, setProfileId] = useState(null);  // 角色主页 charId（"me" 走 nav）
  const [pmId, setPmId] = useState(null);            // 打开的私信会话
  const [pmText, setPmText] = useState("");
  const [fwd, setFwd] = useState(null);              // 转发中的帖子
  const [composer, setComposer] = useState(false);   // 我发帖
  const [cbBoard, setCbBoard] = useState("日常吧");
  const [cbTitle, setCbTitle] = useState("");
  const [cbBody, setCbBody] = useState("");
  const [rTxt, setRtxt] = useState("");
  const [replyTo, setReplyTo] = useState(null);      // {floorId,name} 楼中楼目标
  const [liked, setLiked] = useState(() => new Set());
  const [editMe, setEditMe] = useState(false);
  const [emHandle, setEmHandle] = useState("");
  const [emBio, setEmBio] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState(false);
  const PAGE = 20;
  const charOf = id => (characters || []).find(c => c.id === id);
  const cmts = comments || {};
  const flw = follows || [];
  const unreadPM = (pms || []).filter(x => x.unread).length;
  const activeChars = (characters || []).filter(c => !(forumOff || []).includes(c.id)); // 在逛论坛的角色
  const meChar = { name: (forumMe && forumMe.handle) || profile.name || "我", avatarImage: profile.avatarImage, color: profile.color || "#7a6cf0" };
  useEffect(() => { if (profileId && profileId !== "me" && onEnsureCharMeta) { const c = charOf(profileId); if (c) onEnsureCharMeta(c); } }, [profileId]);
  const tag = txt => h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 999, border: `1px solid ${t.line}`, color: t.fog } }, txt);
  const chip = (b, sel, on) => h("button", { key: b, onClick: on, className: "px-3 py-1.5 active:opacity-70 whitespace-nowrap", style: { borderRadius: 999, background: sel ? t.ink : "transparent", color: sel ? t.bg2 : t.sub, fontFamily: F_BODY, fontSize: 12.5, border: sel ? "none" : `1px solid ${t.line}` } }, b);
  const toggleLike = id => setLiked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const avatarFor = (a, size, anon) => anon ? h(NpcAvatar, { seed: a.authorName, size: size }) : (a.authorType === "character" ? h(Avatar, { character: charOf(a.authorId) || { name: a.authorName, color: "#8a8a8a" }, size: size, radius: size / 2 }) : (a.authorType === "me" ? h(Avatar, { character: meChar, size: size, radius: size / 2 }) : h(NpcAvatar, { seed: a.authorHandle || a.authorName, size: size })));
  const nameOf = a => a.anon ? a.authorName : (a.authorType === "character" && charOf(a.authorId) ? charOf(a.authorId).name : (a.authorType === "me" ? meChar.name : a.authorName));
  const goProfile = id => { setProfileId(id); setOpen(null); };
  // 角色（非匿名）头像可点进主页；NPC/匿名/我 头像不可点
  const avatarBtn = (a, size, anon) => (a.authorType === "character" && !anon && charOf(a.authorId)) ? h("div", { onClick: e => { e.stopPropagation(); goProfile(a.authorId); }, className: "cursor-pointer active:opacity-70", style: { flexShrink: 0 } }, avatarFor(a, size, anon)) : avatarFor(a, size, anon);

  // ---- 帖子底部操作条 ----
  function actBar(p) {
    const isL = liked.has(p.id);
    const bs = { fontFamily: F_BODY, fontSize: 12 };
    return h("div", { className: "flex items-center gap-5 mt-2.5", style: { color: t.fog } },
      h("button", { onClick: e => { e.stopPropagation(); setOpen(p); onLoadComments(p); }, className: "flex items-center gap-1.5 active:opacity-60", style: bs }, h(GMsg, { size: 15, color: t.fog }), h("span", null, fmtNum(p.replyCount || 0))),
      h("div", { className: "flex items-center gap-1.5", style: bs }, h(IRepeat, { size: 15, color: t.fog }), h("span", null, fmtNum(p.rtCount || 0))),
      h("button", { onClick: e => { e.stopPropagation(); toggleLike(p.id); }, className: "flex items-center gap-1.5 active:opacity-60", style: { ...bs, color: isL ? "#e0245e" : t.fog } }, h(IHeart, { size: 15, color: isL ? "#e0245e" : t.fog, filled: isL }), h("span", null, fmtNum((p.likeCount || 0) + (isL ? 1 : 0)))),
      h("div", { className: "flex items-center gap-1.5", style: bs }, h(IBars, { size: 15, color: t.fog }), h("span", null, fmtNum(p.viewCount || 0))),
      h("button", { onClick: e => { e.stopPropagation(); setFwd(p); }, className: "flex items-center active:opacity-60 ml-auto", style: bs }, h(ISend, { size: 15, color: t.fog })));
  }

  // ---- 帖子行（推特式）----
  function postRow(p, showBoard) {
    return h("div", { key: p.id, role: "button", onClick: () => { setOpen(p); onLoadComments(p); }, className: "w-full text-left px-4 py-3.5 active:opacity-80 cursor-pointer", style: { borderBottom: `1px solid ${t.line}` } },
      h("div", { className: "flex gap-3" },
        avatarBtn(p, 42, p.anon),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { className: "flex items-center gap-1.5 flex-wrap" },
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, nameOf(p)),
            !p.anon && h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "@" + (p.authorHandle || p.authorName)),
            h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "· " + timeAgo(p.ts)),
            showBoard && tag(p.board)),
          p.title && h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.35, color: t.ink, marginTop: 3 } }, p.title),
          p.body && h("div", { className: "line-clamp-4", style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.55, color: t.sub, marginTop: 2, whiteSpace: "pre-wrap" } }, p.body),
          actBar(p))));
  }

  // ---- 楼层（含楼中楼 + 回复按钮 + 赞）----
  function floorRow(post, cm, i) {
    const c = cm.authorType === "character" ? charOf(cm.authorId) : null;
    const isL = liked.has(cm.id);
    const nm = cm.authorType === "me" ? meChar.name : (c ? c.name : cm.authorName);
    return h("div", { key: cm.id || i, className: "px-4 py-3", style: { borderTop: i > 0 ? `1px solid ${t.line}` : "none" } },
      h("div", { className: "flex gap-2.5" },
        avatarBtn(cm, 34),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { className: "flex items-center gap-1.5" },
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 13.5, color: cm.authorType === "me" ? t.accent : (c ? t.tint : t.ink) } }, nm),
            !cm.anon && h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "@" + (cm.authorHandle || cm.authorName)),
            h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, (cm.floor || i + 2) + " 楼")),
          h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, color: t.sub, marginTop: 2 } }, cm.content),
          ((cm.replies || []).length > 0 || (gen && gen.forumReplyMe === cm.id)) && h("div", { className: "mt-2 px-2.5 py-1.5", style: { borderRadius: 8, background: t.bg2 } },
            (cm.replies || []).map((r, j) => h("div", { key: j, style: { padding: "3px 0" } },
              h("span", { style: { fontFamily: F_DISPLAY, fontSize: 12, color: r.authorType === "me" ? t.accent : (r.authorType === "character" ? t.tint : t.ink) } }, (r.authorType === "me" ? meChar.name : r.authorName)),
              r.isOp && h("span", { style: { fontFamily: F_BODY, fontSize: 9.5, color: t.bg2, background: t.tint, borderRadius: 4, padding: "0 4px", marginLeft: 4 } }, "楼主"),
              h("span", { style: { fontFamily: F_DISPLAY, fontSize: 12, color: r.authorType === "me" ? t.accent : (r.authorType === "character" ? t.tint : t.ink) } }, "："),
              h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, r.content))),
            (gen && gen.forumReplyMe === cm.id) && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, padding: "3px 0" } }, "楼里的人正在回你…")),
          h("div", { className: "flex items-center gap-4 mt-1.5" },
            h("button", { onClick: () => setReplyTo({ floorId: cm.id, name: nm }), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "回复"),
            h("button", { onClick: () => toggleLike(cm.id), className: "flex items-center gap-1 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: isL ? "#e0245e" : t.fog } }, h(IHeart, { size: 13, color: isL ? "#e0245e" : t.fog, filled: isL }), h("span", null, fmtNum((cm.likeCount || 0) + (isL ? 1 : 0))))))));
  }

  const sendReply = () => {
    if (!rTxt.trim()) return;
    if (replyTo) onReplySub(open, replyTo.floorId, rTxt.trim()); else onReplyFloor(open, rTxt.trim());
    setRtxt(""); setReplyTo(null);
  };

  // ---- 帖子详情 ----
  function detail() {
    const p = open;
    const list = cmts[p.id] || [];
    const loadingC = gen && gen.forumC === p.id;
    const moreC = gen && gen.forumMore === p.id;
    const c = (!p.anon && p.authorType === "character") ? charOf(p.authorId) : null;
    return h("div", { className: "flex-1 flex flex-col min-h-0" },
      h("div", { className: "flex-1 overflow-y-auto" },
        h("div", { className: "px-4 pt-4 pb-3", style: { borderBottom: `1px solid ${t.line}` } },
          h("div", { className: "flex gap-3" },
            avatarBtn(p, 44, p.anon),
            h("button", { onClick: () => { if (c) { setProfileId(c.id); setOpen(null); } }, className: "text-left flex-1 min-w-0 " + (c ? "active:opacity-60" : ""), style: { display: "block" } },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, nameOf(p), c && " ›"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, (p.anon ? "匿名" : "@" + (p.authorHandle || p.authorName)) + " · " + timeAgo(p.ts)))),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, lineHeight: 1.3, color: t.ink, marginTop: 10 } }, p.title),
          h("div", { style: { fontFamily: F_BODY, fontSize: 15, lineHeight: 1.7, color: t.sub, marginTop: 8, whiteSpace: "pre-wrap" } }, p.body),
          h("div", { className: "mt-3" }, tag(p.board)),
          actBar(p),
          c && h("button", { onClick: () => onToggleFollow(c.id), className: "mt-3 px-3.5 py-1.5 active:opacity-70", style: { borderRadius: 999, border: `1px solid ${t.line}`, background: flw.includes(c.id) ? t.ink : "transparent", fontFamily: F_BODY, fontSize: 12, color: flw.includes(c.id) ? t.bg2 : t.ink } }, flw.includes(c.id) ? "已关注" : "关注 TA")),
        h("div", { className: "px-4 pt-3 pb-1 flex items-center justify-between" },
          h(Eyebrow, null, "全部回复 · " + (p.replyCount || 0)),
          h("button", { onClick: () => onMoreComments(p), disabled: moreC, className: "active:opacity-60 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, moreC ? "生成中…" : "↻ 更多回复")),
        loadingC && h(Spinner, { label: "楼里的人正在赶来…" }),
        !loadingC && list.length === 0 && h(Empty, { text: "还没有楼层", sub: "点上面「更多回复」让大家来" }),
        list.map((cm, i) => floorRow(p, cm, i))),
      h("div", { className: "shrink-0 px-3 py-2.5", style: { borderTop: `1px solid ${t.line}` } },
        replyTo && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, padding: "0 4px 4px" } }, "回复 " + replyTo.name + " · ", h("button", { onClick: () => setReplyTo(null), style: { color: t.accent } }, "取消")),
        h("div", { className: "flex gap-2" },
          h("input", { value: rTxt, onChange: e => setRtxt(e.target.value), onKeyDown: e => e.key === "Enter" && sendReply(), placeholder: replyTo ? "回复 " + replyTo.name + "…" : "发布你的回复", className: "flex-1 outline-none px-3.5 py-2 rounded-full", style: { fontFamily: F_BODY, fontSize: 13, background: t.bg2, color: t.ink, border: `1px solid ${t.line}` } }),
          h("button", { onClick: sendReply, className: "px-4 rounded-full active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12 } }, "发送"))));
  }

  // ---- 角色/我 主页 ----
  function profileView(isMe) {
    const c = isMe ? null : charOf(profileId);
    if (!isMe && !c) return null;
    const meta = isMe ? { handle: (forumMe && forumMe.handle) || profile.name || "我", bio: (forumMe && forumMe.bio) || "", joinTs: forumMe && forumMe.joinTs, following: activeChars.length, followers: (forumMe && forumMe.followers) || 0 } : (charMetaOf ? charMetaOf(c) : { handle: c.name, bio: c.motto || "", joinTs: 0, following: 0, followers: 0 });
    const av = h(Avatar, { character: isMe ? meChar : c, size: 62, radius: 31 });
    const mine = (posts || []).filter(p => (isMe ? p.authorType === "me" : (p.authorId === profileId && p.authorType === "character")) && !p.anon).sort((a, b) => b.ts - a.ts);
    return h("div", { className: "flex-1 overflow-y-auto" },
      h("div", { className: "px-4 pt-5 pb-4", style: { borderBottom: `1px solid ${t.line}` } },
        h("div", { className: "flex items-start gap-3" },
          av,
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink } }, isMe ? meChar.name : c.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, "@" + meta.handle)),
          isMe
            ? h("button", { onClick: () => { setEmHandle(meta.handle); setEmBio(meta.bio); setEditMe(true); }, className: "px-3.5 py-1.5 active:opacity-70", style: { borderRadius: 999, border: `1px solid ${t.line}`, fontFamily: F_BODY, fontSize: 12, color: t.ink } }, "编辑资料")
            : h("button", { onClick: () => onToggleFollow(c.id), className: "px-3.5 py-1.5 active:opacity-70", style: { borderRadius: 999, background: flw.includes(c.id) ? t.ink : "transparent", border: `1px solid ${t.line}`, fontFamily: F_BODY, fontSize: 12, color: flw.includes(c.id) ? t.bg2 : t.ink } }, flw.includes(c.id) ? "已关注" : "关注")),
        meta.bio && h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.sub, marginTop: 10, lineHeight: 1.5 } }, meta.bio),
        h("div", { className: "flex items-center gap-4 mt-3" },
          h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, forumAge(meta.joinTs)),
          isMe
            ? h("button", { onClick: () => setFollowListOpen(true), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, h("b", null, fmtNum(meta.following)), h("span", { style: { color: t.fog } }, " 关注 ›"))
            : h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, h("b", null, fmtNum(meta.following)), h("span", { style: { color: t.fog } }, " 关注")),
          h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, h("b", null, fmtNum(meta.followers)), h("span", { style: { color: t.fog } }, " 粉丝"))),
        !isMe && h("button", { onClick: () => onGenCharPost(c, "日常吧"), disabled: gen && gen.forum === "char_" + c.id, className: "mt-3 px-3.5 py-1.5 active:opacity-70 disabled:opacity-40", style: { borderRadius: 999, border: `1px solid ${t.line}`, fontFamily: F_BODY, fontSize: 12, color: t.ink } }, gen && gen.forum === "char_" + c.id ? "发帖中…" : "＋ 让 TA 发一条")),
      mine.length === 0 && h(Empty, { text: isMe ? "你还没发过帖" : "TA 还没有公开发帖", sub: "匿名吧的帖子不会显示在这里" }),
      mine.map(p => postRow(p, true)));
  }

  // ---- 私信列表 / 会话 ----
  function pmList() {
    return h("div", { className: "flex-1 overflow-y-auto" },
      h("div", { className: "px-4" }, h("button", { onClick: onRefreshPMs, disabled: gen && gen.forumPM === "refresh", className: "w-full my-4 py-2.5 active:opacity-70 disabled:opacity-40", style: { borderRadius: 8, background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12.5 } }, gen && gen.forumPM === "refresh" ? "刷新中…" : "↻ 刷新 · 看看有没有人私信我")),
      (pms || []).length === 0 && h(Empty, { text: "还没有私信", sub: "点上面刷新，说不定有网友（或喷子）来找你" }),
      (pms || []).map(th => {
        const last = th.messages[th.messages.length - 1];
        return h("button", { key: th.id, onClick: () => { setPmId(th.id); onMarkPMRead(th.id); }, className: "w-full text-left px-4 py-3.5 flex items-center gap-3 active:opacity-70", style: { borderBottom: `1px solid ${t.line}` } },
          h(NpcAvatar, { seed: th.npcName, size: 42 }),
          h("div", { className: "flex-1 min-w-0" },
            h("div", { className: "flex items-center gap-1.5" }, h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, th.npcName), th.attitude === "troll" && tag("杠"), th.unread && h("span", { style: { width: 7, height: 7, borderRadius: 999, background: t.accent } })),
            h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, (last.from === "me" ? "我：" : "") + last.text)));
      }));
  }
  function pmThread() {
    const th = (pms || []).find(x => x.id === pmId);
    if (!th) return null;
    const sending = gen && gen.forumPM === th.id;
    const send = () => { if (pmText.trim()) { onSendPM(th.id, pmText.trim()); setPmText(""); } };
    return h("div", { className: "flex-1 flex flex-col min-h-0" },
      h("div", { className: "flex-1 overflow-y-auto px-5 py-4 space-y-2.5" },
        th.messages.map((m, i) => h("div", { key: i, className: "flex " + (m.from === "me" ? "justify-end" : "justify-start") },
          h("div", { style: { maxWidth: "76%", padding: "8px 12px", borderRadius: 14, fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.5, background: m.from === "me" ? t.accent : t.bg2, color: m.from === "me" ? "#fff" : t.ink, border: m.from === "me" ? "none" : `1px solid ${t.line}` } }, m.text))),
        sending && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, paddingLeft: 4 } }, th.npcName + " 正在打字…")),
      h("div", { className: "shrink-0 px-4 py-3 flex gap-2", style: { borderTop: `1px solid ${t.line}` } },
        h("input", { value: pmText, onChange: e => setPmText(e.target.value), onKeyDown: e => e.key === "Enter" && send(), placeholder: "回 " + th.npcName + "…", className: "flex-1 outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 13, background: t.bg2, color: t.ink, border: `1px solid ${t.line}` } }),
        h("button", { onClick: send, disabled: sending, className: "px-4 rounded-lg active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12 } }, "发送")));
  }

  // ---- 主页版块列表 ----
  function homeFeed() {
    let arr = (posts || []).filter(p => FORUM_BOARDS.includes(p.board));
    if (tab === "关注") arr = arr.filter(p => p.authorType === "character" && !p.anon && flw.includes(p.authorId));
    else arr = arr.filter(p => p.board === tab);
    arr = arr.slice().sort((a, b) => b.ts - a.ts);
    const shown = arr.slice(0, page * PAGE);
    return h("div", { className: "flex-1 overflow-y-auto" },
      tab === "关注" && flw.length === 0 && h(Empty, { text: "还没有关注任何角色", sub: "点进帖子或角色主页「关注 TA」" }),
      tab === "关注" && flw.length > 0 && shown.length === 0 && h(Empty, { text: "关注的角色还没发过公开帖", sub: "" }),
      tab !== "关注" && shown.length === 0 && !(gen && gen.forum === tab) && h(Empty, { text: "「" + tab + "」还没有帖子", sub: "点右上角刷新键让网友发帖" }),
      gen && gen.forum === tab && shown.length === 0 && h(Spinner, { label: "网友正在冒泡…" }),
      shown.map(p => postRow(p, false)),
      arr.length > shown.length && h("button", { onClick: () => setPage(page + 1), className: "w-full py-3 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, "加载更多 (" + (arr.length - shown.length) + ")"));
  }

  // ---- 搜索：四版块之外的吧 ----
  function searchView() {
    const arr = (posts || []).filter(p => !FORUM_BOARDS.includes(p.board)).sort((a, b) => b.ts - a.ts);
    const busy = gen && gen.forumSearch;
    const go = () => onGenSearch(searchQ.trim());
    return h("div", { className: "flex-1 overflow-y-auto" },
      h("div", { className: "px-4 py-3 flex gap-2", style: { borderBottom: `1px solid ${t.line}` } },
        h("input", { value: searchQ, onChange: e => setSearchQ(e.target.value), onKeyDown: e => e.key === "Enter" && go(), placeholder: "搜个吧 / 话题（留空随机刷）", className: "flex-1 outline-none px-3.5 py-2 rounded-full", style: { fontFamily: F_BODY, fontSize: 13, background: t.bg2, color: t.ink, border: `1px solid ${t.line}` } }),
        h("button", { onClick: go, disabled: busy, className: "px-4 rounded-full active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12 } }, busy ? "…" : "刷")),
      busy && arr.length === 0 && h(Spinner, { label: "正在逛别的吧…" }),
      !busy && arr.length === 0 && h(Empty, { text: "还没逛到别的吧", sub: "搜个话题，或留空直接点「刷」随机逛" }),
      arr.map(p => postRow(p, true)));
  }

  // ---- 主体分派 ----
  const inSub = open || (profileId && profileId !== "me") || pmId;
  let title = "论坛", bodyEl, backFn = null, rightEl = null;
  if (open) { title = "帖子"; bodyEl = detail(); backFn = () => { setOpen(null); setReplyTo(null); }; }
  else if (profileId && profileId !== "me") { title = "主页"; bodyEl = profileView(false); backFn = () => setProfileId(null); }
  else if (pmId) { title = ((pms || []).find(x => x.id === pmId) || {}).npcName || "私信"; bodyEl = pmThread(); backFn = () => setPmId(null); }
  else if (nav === "search") { title = "搜索"; bodyEl = searchView(); rightEl = h("button", { onClick: () => onGenSearch(searchQ.trim()), className: "active:opacity-50" }, h(IRefresh, { size: 19, color: t.ink })); }
  else if (nav === "pm") { title = "私信"; bodyEl = pmList(); }
  else if (nav === "me") { title = "我"; bodyEl = profileView(true); }
  else { title = "论坛"; bodyEl = homeFeed(); rightEl = h("button", { onClick: () => onGenBoard(tab), disabled: gen && gen.forum === tab, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 19, color: t.ink })); }

  return h("div", { className: "h-full flex flex-col" },
    h("div", { className: "shrink-0 px-4 pt-4 pb-2 flex items-center gap-3", style: { borderBottom: (inSub || nav === "home") ? "none" : `1px solid ${t.line}` } },
      h("button", { onClick: backFn || onBack, className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
      h("span", { className: "flex-1", style: { fontFamily: F_DISPLAY, fontSize: 19, color: t.ink } }, title),
      h("div", { className: "flex items-center gap-3.5" }, (!inSub) && h("button", { onClick: () => setSettingsOpen(true), className: "active:opacity-50" }, h(GConfig, { size: 18, color: t.ink })), rightEl)),
    (!inSub && nav === "home") && h("div", { className: "shrink-0 flex gap-1.5 px-4 pb-2 overflow-x-auto", style: { borderBottom: `1px solid ${t.line}` } }, [...FORUM_BOARDS, "关注"].map(b => chip(b, tab === b, () => { setTab(b); setPage(1); }))),
    bodyEl,
    (!inSub) && h("div", { className: "shrink-0 flex", style: { borderTop: `1px solid ${t.line}` } },
      [["home", IHome, "主页"], ["search", ISearch, "搜索"], ["pm", IMail, "私信"], ["me", GUser, "我"]].map(nx => { const Ic = nx[1]; return h("button", { key: nx[0], onClick: () => setNav(nx[0]), className: "flex-1 py-2 flex flex-col items-center gap-1 active:opacity-60 relative", style: { color: nav === nx[0] ? t.ink : t.fog } },
        h(Ic, { size: 20, color: nav === nx[0] ? t.ink : t.fog }),
        h("span", { style: { fontFamily: F_BODY, fontSize: 9.5 } }, nx[2]),
        nx[0] === "pm" && unreadPM > 0 && h("span", { style: { position: "absolute", top: 2, right: "50%", marginRight: -22, minWidth: 14, height: 14, padding: "0 3px", borderRadius: 999, background: t.accent, color: "#fff", fontSize: 8.5, fontFamily: F_BODY, display: "flex", alignItems: "center", justifyContent: "center" } }, unreadPM)); })),
    // 悬浮发帖按钮（主页/搜索）
    (!inSub && (nav === "home" || nav === "search")) && h("button", { onClick: () => setComposer(true), className: "active:opacity-80", style: { position: "absolute", right: 18, bottom: 64, width: 52, height: 52, borderRadius: 999, background: t.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(0,0,0,0.25)", zIndex: 30 } }, h(IPlus, { size: 24, color: "#fff" })),
    // 转发 picker
    fwd && h(Sheet, { onClose: () => setFwd(null) },
      h(Eyebrow, { style: { marginBottom: 10 } }, "转发「" + (fwd.title || "").slice(0, 14) + "」到"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 8 } }, "私聊"),
      h("div", { className: "space-y-1 max-h-44 overflow-y-auto mb-3" }, (characters || []).map(c => h("button", { key: c.id, onClick: () => { onForwardToChat(fwd, c); setFwd(null); }, className: "w-full flex items-center gap-3 py-2 active:opacity-60" }, h(Avatar, { character: c, size: 32, radius: 8 }), h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.remark || c.name)))),
      (groups || []).length > 0 && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 8 } }, "群聊"),
      h("div", { className: "space-y-1 max-h-40 overflow-y-auto" }, (groups || []).map(g => h("button", { key: g.id, onClick: () => { onForwardToGroup(fwd, g.id); setFwd(null); }, className: "w-full flex items-center gap-3 py-2 active:opacity-60" }, h("div", { style: { width: 32, height: 32, borderRadius: 8, background: t.bg2, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 } }, "👥"), h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, g.name))))),
    // 我发帖 composer
    composer && h(Sheet, { onClose: () => setComposer(false), tall: true },
      h(Eyebrow, { style: { marginBottom: 10 } }, "发帖"),
      h("div", { className: "flex gap-1.5 mb-3 flex-wrap" }, FORUM_BOARDS.map(b => chip(b, cbBoard === b, () => setCbBoard(b)))),
      h("input", { value: cbTitle, onChange: e => setCbTitle(e.target.value), placeholder: "标题", className: "w-full outline-none px-3.5 py-2.5 rounded-lg mb-2", style: { fontFamily: F_DISPLAY, fontSize: 15, background: t.bg2, color: t.ink, border: `1px solid ${t.line}` } }),
      h("textarea", { value: cbBody, onChange: e => setCbBody(e.target.value), placeholder: "正文…", className: "w-full outline-none px-3.5 py-2.5 rounded-lg", style: { fontFamily: F_BODY, fontSize: 14, minHeight: 120, background: t.bg2, color: t.ink, border: `1px solid ${t.line}`, resize: "none" } }),
      h("button", { onClick: () => { if (cbTitle.trim()) { onPostMine(cbBoard, cbTitle.trim(), cbBody.trim()); setCbTitle(""); setCbBody(""); setComposer(false); setNav("home"); setTab(cbBoard); } }, className: "w-full mt-3 py-2.5 active:opacity-70", style: { borderRadius: 8, background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13 } }, "发布")),
    // 编辑我的资料
    editMe && h(Sheet, { onClose: () => setEditMe(false) },
      h(Eyebrow, { style: { marginBottom: 10 } }, "编辑我的贴吧资料"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 4 } }, "贴吧 id"),
      h("input", { value: emHandle, onChange: e => setEmHandle(e.target.value), placeholder: "你的网名", className: "w-full outline-none px-3.5 py-2.5 rounded-lg mb-3", style: { fontFamily: F_BODY, fontSize: 14, background: t.bg2, color: t.ink, border: `1px solid ${t.line}` } }),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 4 } }, "签名"),
      h("textarea", { value: emBio, onChange: e => setEmBio(e.target.value), placeholder: "一句话签名…", className: "w-full outline-none px-3.5 py-2.5 rounded-lg", style: { fontFamily: F_BODY, fontSize: 14, minHeight: 80, background: t.bg2, color: t.ink, border: `1px solid ${t.line}`, resize: "none" } }),
      h("button", { onClick: () => { onEditMe({ handle: emHandle.trim() || meChar.name, bio: emBio.trim() }); setEditMe(false); }, className: "w-full mt-3 py-2.5 active:opacity-70", style: { borderRadius: 8, background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13 } }, "保存")),
    // 谁在逛论坛
    settingsOpen && h(Sheet, { onClose: () => setSettingsOpen(false) },
      h(Eyebrow, { style: { marginBottom: 6 } }, "哪些角色在逛论坛"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10, lineHeight: 1.5 } }, "关掉的角色不会在评论/回复里冒泡，也不会在论坛发帖"),
      (characters || []).length === 0 && h(Empty, { text: "还没有角色", sub: "" }),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" }, (characters || []).map(c => { const on = !(forumOff || []).includes(c.id); return h("button", { key: c.id, onClick: () => onToggleForumChar(c.id), className: "w-full flex items-center gap-3 py-2 active:opacity-70" }, h(Avatar, { character: c, size: 36, radius: 18 }), h("span", { className: "flex-1 text-left", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name), h("div", { style: { width: 44, height: 26, borderRadius: 999, background: on ? t.ink : t.line, position: "relative", flexShrink: 0 } }, h("div", { style: { position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff" } }))); }))),
    // 我关注的（=在逛论坛的角色）目录，点进各自主页
    followListOpen && h(Sheet, { onClose: () => setFollowListOpen(false) },
      h(Eyebrow, { style: { marginBottom: 6 } }, "在论坛的角色"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10, lineHeight: 1.5 } }, "点一个进 Ta 的主页"),
      activeChars.length === 0 && h(Empty, { text: "还没有角色在逛论坛", sub: "去右上角齿轮打开角色" }),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" }, activeChars.map(c => h("button", { key: c.id, onClick: () => { setFollowListOpen(false); goProfile(c.id); }, className: "w-full flex items-center gap-3 py-2 active:opacity-70" }, h(Avatar, { character: c, size: 36, radius: 18 }), h("div", { className: "flex-1 text-left min-w-0" }, h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, c.name), h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "@" + ((charMetaOf ? charMetaOf(c) : {}).handle || c.name))), h(IChevR, { size: 16, color: t.fog }))))));
}

// ============================================================
// SHOP + WALLET
// ============================================================
// ============================================================
// SHOP —— 独立购物 App（首页商品流 / 购物车 / 我的订单）
// 分类横滑；点分类后按右上角刷新生成该类商品；+ 加入购物车；
// 购物车多选结算：代付 / 购买 / 送礼 / 亲属卡；我的：待发货(倒计时)→待收货(使用/转赠)
// ============================================================
const SHOP_CATS = [
  { key: "recommend", zh: "推荐" },
  { key: "food", zh: "外卖" },
  { key: "fashion", zh: "服饰" },
  { key: "beauty", zh: "美妆" },
  { key: "digital", zh: "数码" },
  { key: "furniture", zh: "家具" },
  { key: "adult", zh: "情趣" }
];
function shopFmtLeft(ms) {
  if (ms <= 0) return "即将送达";
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), hr = Math.floor(m / 60);
  if (hr > 0) return hr + "小时" + (m % 60) + "分";
  return m > 0 ? m + "分" + (s % 60) + "秒" : (s % 60) + "秒";
}
function Shop({ wallet, cart, orders, inventory, characters, groups, kinshipCards, feed, busy, onBack, onGen, onAddCart, onRemoveCart, onCheckout, onReceiveUse, onReceiveGift, toast }) {
  const t = useTheme();
  const [nav, setNav] = useState("home"); // home | cart | my
  const [cat, setCat] = useState("recommend");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState([]); // 选中的购物车 uid
  const [sheet, setSheet] = useState(null); // "actions" | "gift" | "paylater" | "kinship" | {kind:"regift",orderId}
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const cards = Array.isArray(kinshipCards) ? kinshipCards : [];
  const list = (feed && feed[cat]) || [];
  const cartItems = cart || [];
  const selItems = cartItems.filter(x => sel.includes(x.uid));
  const selTotal = Math.round(selItems.reduce((s, x) => s + (Number(x.price) || 0), 0) * 100) / 100;
  const shipping = (orders || []).filter(o => o.status === "shipping");
  const receiving = (orders || []).filter(o => o.status === "receiving");
  const charById = id => (characters || []).find(c => c.id === id);
  const toggleSel = uid => setSel(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid]);
  const doGen = (append) => onGen(cat, search, append);

  // ---------- 顶栏（搜索 + 刷新）----------
  const topBar = h("div", { className: "shrink-0 px-4 pt-4 pb-2 flex items-center gap-3", style: { background: t.bg2, borderBottom: "1px solid " + t.line } },
    h("button", { onClick: onBack, className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
    h("div", { className: "flex-1 flex items-center gap-2 px-4 h-9", style: { background: t.bg, border: "1px solid " + t.line, borderRadius: 999 } },
      h(ISearch, { size: 15, color: t.fog }),
      h("input", {
        value: search, onChange: e => setSearch(e.target.value),
        onKeyDown: e => { if (e.key === "Enter") doGen(false); },
        placeholder: "搜索宝贝…",
        className: "flex-1 bg-transparent outline-none",
        style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink }
      })),
    h("button", { onClick: () => doGen(false), disabled: busy, className: "active:opacity-50 disabled:opacity-40" },
      busy ? h(IPulse, { size: 20, color: t.tint }) : h(IRefresh, { size: 20, color: t.ink })));

  // ---------- 分类横滑 ----------
  const catRow = h("div", { className: "shrink-0 flex gap-5 px-5 py-3 overflow-x-auto", style: { background: t.bg2, borderBottom: "1px solid " + t.line, WebkitOverflowScrolling: "touch" } },
    SHOP_CATS.map(c => h("button", {
      key: c.key, onClick: () => setCat(c.key),
      className: "shrink-0 pb-1 active:opacity-60",
      style: { borderBottom: cat === c.key ? "2px solid " + t.ink : "2px solid transparent" }
    }, h("span", { style: { fontFamily: F_DISPLAY, fontSize: cat === c.key ? 18 : 16, color: cat === c.key ? t.ink : t.fog, whiteSpace: "nowrap" } }, c.zh))));

  // ---------- 首页：商品流 ----------
  const homeView = h("div", { className: "flex-1 flex flex-col min-h-0" }, topBar, catRow,
    h("div", { className: "flex-1 overflow-y-auto px-3 py-3", style: { background: t.bg } },
      list.length === 0
        ? h("div", { className: "text-center", style: { paddingTop: 80 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.9, color: t.fog } }, busy ? "正在为你挑好物…" : "这个分类还没有商品。\n点右上角刷新，看看有什么。"),
            !busy && h("button", { onClick: () => doGen(false), className: "mt-4 px-5 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, border: "1px solid " + t.ink, borderRadius: 999, color: t.ink } }, "刷新商品"))
        : h("div", null,
            h("div", { className: "grid grid-cols-2 gap-3" }, list.map(it => h("div", { key: it.uid, style: { background: t.bg2, borderRadius: 14, overflow: "hidden", border: "1px solid " + t.line } },
              h("div", { className: "flex items-center justify-center", style: { height: 120, background: t.bg } },
                h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 15, color: t.fog, padding: "0 12px", textAlign: "center" } }, it.name)),
              h("div", { className: "p-2.5" },
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink, lineHeight: 1.25, minHeight: 36 } }, it.name),
                it.desc && h("div", { className: "mt-1.5 inline-block px-2 py-0.5", style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, background: t.bg, borderRadius: 5 } }, it.desc),
                h("div", { className: "flex items-end justify-between mt-2" },
                  h("div", { className: "min-w-0" },
                    h("span", { style: { fontFamily: F_DISPLAY, fontSize: 12, color: t.accent } }, "¥"),
                    h("span", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.accent } }, it.price),
                    it.sales && h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 1 } }, it.sales)),
                  h("button", { onClick: () => { onAddCart(it); toast("已加入购物车"); }, className: "shrink-0 active:scale-90", style: { width: 30, height: 30, borderRadius: 999, border: "1.5px solid " + t.ink, color: t.ink, fontSize: 20, lineHeight: "26px", display: "flex", alignItems: "center", justifyContent: "center" } }, h(IPlus, { size: 16, color: t.ink }))))))),
            h("button", { onClick: () => doGen(true), disabled: busy, className: "w-full mt-4 mb-2 py-3 active:opacity-70 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 12.5, letterSpacing: "0.1em", color: t.fog } }, busy ? "加载中…" : "继续看 ↓"))));

  // ---------- 购物车 ----------
  const cartView = h("div", { className: "flex-1 flex flex-col min-h-0" },
    h(Head, { zh: "购物车", en: "Cart", onBack: onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-5 py-2", style: { background: t.bg } },
      cartItems.length === 0
        ? h("div", { className: "text-center", style: { paddingTop: 80, fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "购物车是空的")
        : cartItems.map(it => {
            const on = sel.includes(it.uid);
            return h("div", { key: it.uid, className: "flex items-center gap-3 py-3.5", style: { borderBottom: "1px solid " + t.line } },
              h("button", { onClick: () => toggleSel(it.uid), className: "shrink-0 active:opacity-60", style: { width: 22, height: 22, borderRadius: 999, border: "1.5px solid " + (on ? t.tint : t.line), background: on ? t.tint : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, on && h(ICheck, { size: 13, color: "#fff" })),
              h("div", { className: "flex items-center justify-center shrink-0", style: { width: 52, height: 52, borderRadius: 10, background: t.bg2 } }, h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 11, color: t.fog } }, "ITEM")),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, it.name),
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.accent, marginTop: 3 } }, "¥" + it.price)),
              h("button", { onClick: () => { onRemoveCart(it.uid); setSel(p => p.filter(x => x !== it.uid)); }, className: "shrink-0 active:opacity-50 p-1" }, h(ITrash, { size: 16, color: t.fog })));
          })),
    cartItems.length > 0 && h("div", { className: "shrink-0 px-5 py-3 flex items-center gap-3", style: { background: t.bg2, borderTop: "1px solid " + t.line } },
      h("button", { onClick: () => setSel(sel.length === cartItems.length ? [] : cartItems.map(x => x.uid)), className: "active:opacity-60 flex items-center gap-2" },
        h("span", { style: { width: 20, height: 20, borderRadius: 999, border: "1.5px solid " + (sel.length === cartItems.length && cartItems.length ? t.tint : t.line), background: sel.length === cartItems.length && cartItems.length ? t.tint : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, sel.length === cartItems.length && cartItems.length ? h(ICheck, { size: 12, color: "#fff" }) : null),
        h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, "全选")),
      h("div", { className: "flex-1 text-right" },
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "合计 "),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.accent } }, "¥" + selTotal)),
      h("button", { onClick: () => { if (!selItems.length) { toast("请先选择商品"); return; } setSheet("actions"); }, className: "px-6 py-2.5 active:opacity-80", style: { fontFamily: F_DISPLAY, fontSize: 15, background: selItems.length ? t.ink : t.line, color: t.bg2, borderRadius: 999 } }, "结算(" + selItems.length + ")")));

  // ---------- 我的（订单）----------
  const myView = h("div", { className: "flex-1 flex flex-col min-h-0" },
    h(Head, { zh: "我的", en: "Orders", onBack: onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-5 py-3", style: { background: t.bg } },
      // 待发货
      h(Eyebrow, { style: { marginBottom: 8 } }, "待发货 · " + shipping.length),
      shipping.length === 0
        ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginBottom: 18 } }, "暂无待发货")
        : h("div", { className: "space-y-2", style: { marginBottom: 18 } }, shipping.map(o => {
            const left = o.arriveTs - now;
            return h("div", { key: o.id, className: "p-3.5", style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line } },
              h("div", { className: "flex items-center justify-between" },
                h("div", { className: "min-w-0 flex-1" },
                  h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, o.name),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, (o.price ? "¥" + o.price : "") + (o.price && o.payLabel ? " · " : "") + (o.payLabel || (o.price ? "" : "礼物")))),
                h("div", { className: "text-right shrink-0 ml-3" },
                  h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog } }, "还有"),
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.tint } }, shopFmtLeft(left)))));
          })),
      // 待收货
      h(Eyebrow, { style: { marginBottom: 8 } }, "待收货 · " + receiving.length),
      receiving.length === 0
        ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, marginBottom: 18 } }, "暂无待收货")
        : h("div", { className: "space-y-2", style: { marginBottom: 18 } }, receiving.map(o => h("div", { key: o.id, className: "p-3.5", style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line } },
            h("div", { className: "flex items-center justify-between mb-2.5" },
              h("div", { className: "min-w-0 flex-1" },
                h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, o.name),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: "#3f8a54", marginTop: 2 } }, "已送达" + (o.fromCharId ? " · " + (charById(o.fromCharId) ? charById(o.fromCharId).name : "") + " 送的" : ""))),
              o.price ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.accent } }, "¥" + o.price) : null),
            h("div", { className: "flex gap-2" },
              h("button", { onClick: () => onReceiveUse(o.id), className: "flex-1 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, background: t.ink, color: t.bg2, borderRadius: 8 } }, "使用"),
              h("button", { onClick: () => { if (!(characters || []).length) { toast("还没有角色可转赠"); return; } setSheet({ kind: "regift", orderId: o.id }); }, className: "flex-1 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, border: "1px solid " + t.ink, color: t.ink, borderRadius: 8 } }, "转赠"))))),
      // 我的物品
      h(Eyebrow, { style: { marginBottom: 8 } }, "我的物品 · " + (inventory || []).length),
      (inventory || []).length === 0
        ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, paddingBottom: 20 } }, "还没有已入库的物品")
        : h("div", { style: { paddingBottom: 24 } }, (inventory || []).map((it, i) => {
            const giver = it.fromCharId ? charById(it.fromCharId) : null;
            const sub = (giver ? (giver.name + " 送") : "购买") + (it.addedTs ? " · " + new Date(it.addedTs).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "");
            return h("div", { key: it.id || i, className: "flex items-center justify-between py-3", style: { borderBottom: "1px solid " + t.line } },
              h("div", { className: "min-w-0" },
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, it.name, it.qty > 1 ? h("span", { style: { fontSize: 11, color: t.fog } }, " ×" + it.qty) : null),
                sub && h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, sub)),
              giver && h(Avatar, { character: giver, size: 26, radius: 7 }));
          }))));

  // ---------- 底部 tab ----------
  const bottomNav = h("div", { className: "shrink-0 flex", style: { borderTop: "1px solid " + t.line, background: t.bg2 } },
    [["home", "首页", GShop], ["cart", "购物车", GBag], ["my", "我的", GUser]].map(([k, zh, G]) => h("button", {
      key: k, onClick: () => setNav(k), className: "flex-1 py-2.5 flex flex-col items-center gap-1 active:opacity-60 relative"
    },
      h(G, { size: 21, color: nav === k ? t.ink : t.fog }),
      h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: nav === k ? t.ink : t.fog } }, zh),
      k === "cart" && cartItems.length > 0 && h("span", { style: { position: "absolute", top: 4, right: "50%", marginRight: -18, background: t.accent, color: "#fff", fontFamily: F_BODY, fontSize: 9, borderRadius: 999, padding: "0 5px", lineHeight: "15px" } }, String(cartItems.length)))));

  // ---------- 结算动作 / 对象选择 Sheet ----------
  const chip = (label, onClick, primary) => h("button", { onClick, className: "w-full py-3 active:opacity-75", style: { fontFamily: F_DISPLAY, fontSize: 16, borderRadius: 12, marginBottom: 10, background: primary ? t.ink : t.bg2, color: primary ? t.bg2 : t.ink, border: primary ? "none" : "1px solid " + t.line } }, label);
  let sheetEl = null;
  if (sheet === "actions") {
    sheetEl = h(Sheet, { onClose: () => setSheet(null) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "结算 " + selItems.length + " 件 · 合计 ¥" + selTotal),
      chip("购买（用我的余额 ¥" + wallet + "）", () => { setSheet(null); onCheckout(sel, "buy"); setSel([]); }, true),
      chip("送礼（付款后送给角色）", () => setSheet("gift")),
      chip("代付（请角色/群帮我付）", () => setSheet("paylater")),
      cards.length > 0 && chip("用亲属卡付（刷角色的钱）", () => setSheet("kinship")));
  } else if (sheet === "gift") {
    sheetEl = h(Sheet, { onClose: () => setSheet(null) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "送给谁"),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" }, (characters || []).map(c => h("button", { key: c.id, onClick: () => { setSheet(null); onCheckout(sel, "gift", { type: "char", id: c.id }); setSel([]); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
        h(Avatar, { character: c, size: 38, radius: 9 }),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.remark || c.name)))));
  } else if (sheet === "paylater") {
    sheetEl = h(Sheet, { onClose: () => setSheet(null) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "请谁帮我付"),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" },
        (characters || []).map(c => h("button", { key: c.id, onClick: () => { setSheet(null); onCheckout(sel, "paylater", { type: "char", id: c.id }); setSel([]); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
          h(Avatar, { character: c, size: 38, radius: 9 }),
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.remark || c.name))),
        (groups || []).map(g => h("button", { key: g.id, onClick: () => { setSheet(null); onCheckout(sel, "paylater", { type: "group", id: g.id }); setSel([]); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
          h("div", { className: "flex items-center justify-center", style: { width: 38, height: 38, borderRadius: 9, background: t.bg2 } }, h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog } }, "群")),
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, g.name, h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, " · 群聊"))))));
  } else if (sheet === "kinship") {
    sheetEl = h(Sheet, { onClose: () => setSheet(null) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "用谁的亲属卡"),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" }, cards.map(cd => {
        const c = charById(cd.charId) || {}; const remaining = (cd.limit || 0) - (cd.used || 0);
        return h("button", { key: cd.charId, onClick: () => { setSheet(null); onCheckout(sel, "kinship", { type: "char", id: cd.charId }); setSel([]); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
          h(Avatar, { character: c, size: 38, radius: 9 }),
          h("div", { className: "flex-1 text-left" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.name || "亲属卡"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: remaining >= selTotal ? t.fog : t.accent } }, "剩余额度 ¥" + remaining)));
      })));
  } else if (sheet && sheet.kind === "regift") {
    sheetEl = h(Sheet, { onClose: () => setSheet(null) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "转赠给谁"),
      h("div", { className: "space-y-1 max-h-80 overflow-y-auto" }, (characters || []).map(c => h("button", { key: c.id, onClick: () => { const oid = sheet.orderId; setSheet(null); onReceiveGift(oid, c.id); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
        h(Avatar, { character: c, size: 38, radius: 9 }),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.remark || c.name)))));
  }

  return h("div", { className: "h-full flex flex-col" },
    nav === "home" ? homeView : nav === "cart" ? cartView : myView,
    bottomNav,
    sheetEl);
}

// ---- 亲属卡账单（每卡流水 + 角色评论 + 申请加额度）----
function KinshipBill({ card, character, onBack, onRaise }) {
  const t = useTheme();
  const [asking, setAsking] = useState(false);
  const [amt, setAmt] = useState("");
  if (!card) return h("div", { className: "h-full flex flex-col" }, h(Head, { zh: "亲属卡", en: "Kinship", onBack }), h("div", { className: "flex-1 flex items-center justify-center", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "卡片不存在"));
  const c = character || {};
  const remaining = Math.round(((card.limit || 0) - (card.used || 0)) * 100) / 100;
  const ledger = card.ledger || [];
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h("div", { className: "shrink-0 px-4 pt-5 pb-3 flex items-center gap-3", style: { background: t.bg2, borderBottom: "1px solid " + t.line } },
      h("button", { onClick: onBack, className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, (c.name || "") + " 的亲属卡")),
    h("div", { className: "flex-1 overflow-y-auto" },
      // 卡面
      h("div", { className: "m-5 p-5", style: { borderRadius: 18, color: "#fff", background: "linear-gradient(135deg," + (c.color || "#6b7a8f") + "," + (c.color || "#3a4652") + ")" } },
        h("div", { className: "flex items-center justify-between mb-6" },
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.14em", opacity: 0.85 } }, "亲属卡 · KINSHIP"),
          h("span", { style: { fontFamily: F_BODY, fontSize: 12, opacity: 0.9 } }, c.name || "")),
        h("div", { className: "flex items-end justify-between" },
          h("div", null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 10, opacity: 0.75, marginBottom: 2 } }, "剩余额度"),
            h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 30, lineHeight: 1 } }, "¥" + remaining)),
          h("div", { className: "text-right", style: { fontFamily: F_BODY, fontSize: 10.5, opacity: 0.8 } }, "已用 ¥" + (card.used || 0), h("br"), "总额度 ¥" + (card.limit || 0)))),
      card.note && h("div", { className: "mx-5 -mt-1 mb-2", style: { fontFamily: F_BODY, fontSize: 12, fontStyle: "italic", color: t.sub } }, "「" + card.note + "」"),
      // 申请加额度
      h("div", { className: "px-5 mb-3" },
        !asking
          ? h("button", { onClick: () => setAsking(true), className: "w-full py-2.5 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, border: "1px solid " + t.ink, borderRadius: 999, color: t.ink } }, "申请加额度")
          : h("div", { className: "p-4", style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 8 } }, "想让 " + (c.name || "TA") + " 加多少额度（可留空让 TA 看着给）"),
              h("div", { className: "flex items-center gap-2" },
                h("input", { value: amt, onChange: e => setAmt(e.target.value), type: "number", inputMode: "decimal", placeholder: "金额", autoFocus: true, className: "flex-1 outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 15, color: t.ink, background: "#fff", border: "1px solid " + t.line } }),
                h("button", { onClick: () => { onRaise(amt); setAsking(false); setAmt(""); }, className: "px-4 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: t.ink, color: t.bg2, borderRadius: 8 } }, "申请"),
                h("button", { onClick: () => { setAsking(false); setAmt(""); }, className: "px-3 py-2 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "取消")))),
      // 账单
      h("div", { className: "px-5 pb-10" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.14em", color: t.fog, marginBottom: 10 } }, "刷卡账单 · STATEMENT"),
        ledger.length === 0
          ? h("div", { className: "text-center mt-6", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, "还没有刷过这张卡。\n去购物 App 结算时选「用亲属卡付」。")
          : ledger.map(l => h("div", { key: l.id, className: "py-3.5", style: { borderBottom: "1px solid " + t.line } },
              h("div", { className: "flex items-center justify-between" },
                h("div", { className: "min-w-0 flex-1" },
                  h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, l.item),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, fmtStamp(l.ts))),
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "-¥" + l.amount)),
              l.comment && h("div", { className: "mt-2 flex items-start gap-2", style: { background: t.bg2, borderRadius: 10, padding: "8px 10px" } },
                h(Avatar, { character: c, size: 22, radius: 6 }),
                h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, lineHeight: 1.5 } }, l.comment)))))));
}

// ============================================================
// US (couple)
// ============================================================
// 情侣空间·问答小本预置题库（60 条，五类+深题+日常温度）。
// id 是稳定主键：已答记录靠它对齐；以后只往后加题、不改/不复用旧 id。
const COUPLE_QA_BANK = [
  { id: "q01", cat: "回忆", q: "你还记得第一次见到我时，脑子里冒出的第一个念头吗？" },
  { id: "q02", cat: "回忆", q: "我们相处到现在，哪个瞬间你偷偷记了很久？" },
  { id: "q03", cat: "回忆", q: "有没有哪次我以为很普通的对话，其实被你放在心上？" },
  { id: "q04", cat: "回忆", q: "第一次觉得「就是这个人了」是什么时候？" },
  { id: "q05", cat: "回忆", q: "我做过最让你意外的一件事是什么？" },
  { id: "q06", cat: "回忆", q: "你印象里我笑得最好看的一次是在做什么？" },
  { id: "q07", cat: "回忆", q: "有没有哪句我随口说的话，你到现在还记得？" },
  { id: "q08", cat: "回忆", q: "我们之间第一次有点心动的时刻，你觉得是哪次？" },
  { id: "q09", cat: "假设", q: "如果明天可以一起去任何地方，你想去哪？" },
  { id: "q10", cat: "假设", q: "如果我们能养一只宠物，你想养什么、叫什么名字？" },
  { id: "q11", cat: "假设", q: "如果周末只能一起做一件事，你选什么？" },
  { id: "q12", cat: "假设", q: "如果能回到我们刚认识的那天，你想做点什么不一样的？" },
  { id: "q13", cat: "假设", q: "如果给我们的关系拍一部电影，你觉得是什么类型？" },
  { id: "q14", cat: "假设", q: "如果有一整天什么都不用管，你想怎么和我度过？" },
  { id: "q15", cat: "假设", q: "如果我们住在一起，你最想要哪个房间是我们俩的专属角落？" },
  { id: "q16", cat: "假设", q: "如果能送我一样买不到的东西，你想送什么？" },
  { id: "q17", cat: "关系", q: "你觉得我们最像的地方是什么？" },
  { id: "q18", cat: "关系", q: "我哪个小习惯让你觉得「很我」？" },
  { id: "q19", cat: "关系", q: "你觉得我们之间谁更粘人一点？" },
  { id: "q20", cat: "关系", q: "我做的哪件小事，最容易让你心软？" },
  { id: "q21", cat: "关系", q: "你觉得我们的关系里最珍贵的是什么？" },
  { id: "q22", cat: "关系", q: "有没有什么是你只在我面前才会有的样子？" },
  { id: "q23", cat: "关系", q: "你觉得我最了解你的哪一面？又有哪面还没让我看到？" },
  { id: "q24", cat: "关系", q: "我们吵架的时候，你其实心里在想什么？" },
  { id: "q25", cat: "关系", q: "你希望我们十年后是什么样子？" },
  { id: "q26", cat: "关系", q: "我身上哪一点，是你一开始没注意、后来越来越喜欢的？" },
  { id: "q27", cat: "私密", q: "睡前最后一个念头，最近常常是什么？" },
  { id: "q28", cat: "私密", q: "有没有什么话，想对我说却一直没说出口？" },
  { id: "q29", cat: "私密", q: "你最近一次因为我偷偷高兴，是为了什么？" },
  { id: "q30", cat: "私密", q: "有没有哪个瞬间，你突然很想抱住我？" },
  { id: "q31", cat: "私密", q: "你会在什么时候特别想我？" },
  { id: "q32", cat: "私密", q: "有什么是你从没告诉过别人、却想让我知道的？" },
  { id: "q33", cat: "私密", q: "你觉得自己在我面前，最放松的是什么时候？" },
  { id: "q34", cat: "私密", q: "我不在的时候，你会做什么和我有关的小事吗？" },
  { id: "q35", cat: "私密", q: "你有没有偷偷幻想过我们以后的某个画面？是什么样的？" },
  { id: "q36", cat: "轻松", q: "我做的哪件蠢事让你笑到现在？" },
  { id: "q37", cat: "轻松", q: "如果用一种食物形容我，你觉得我是什么？" },
  { id: "q38", cat: "轻松", q: "我有没有什么口头禅是你已经被传染了的？" },
  { id: "q39", cat: "轻松", q: "你觉得我睡着的样子怎么样，能打几分？" },
  { id: "q40", cat: "轻松", q: "如果给我起个只有你能叫的外号，你想叫我什么？" },
  { id: "q41", cat: "轻松", q: "我最近让你无语的一个瞬间是什么？" },
  { id: "q42", cat: "轻松", q: "你觉得我们俩谁做饭更能吃、谁更能睡？" },
  { id: "q43", cat: "轻松", q: "如果我们组队打游戏，你觉得谁会先坑对方？" },
  { id: "q44", cat: "轻松", q: "我有没有哪个表情或动作，你觉得特别好笑又特别可爱？" },
  { id: "q45", cat: "轻松", q: "假如我突然变成一只动物，你猜会是什么？" },
  { id: "q46", cat: "走心", q: "你害怕失去我吗？这种感觉是什么时候开始的？" },
  { id: "q47", cat: "走心", q: "在我面前，你有没有过想逞强、其实很累的时候？" },
  { id: "q48", cat: "走心", q: "你觉得我给你带来的最大的变化是什么？" },
  { id: "q49", cat: "走心", q: "有没有哪个瞬间，你觉得「有这个人真好」？" },
  { id: "q50", cat: "走心", q: "你愿意让我看到你最不堪、最脆弱的那一面吗？" },
  { id: "q51", cat: "走心", q: "我们之间，你最想守护住的是什么？" },
  { id: "q52", cat: "走心", q: "如果有一天我们必须分开一阵子，你会怎么熬过去？" },
  { id: "q53", cat: "走心", q: "你觉得我们之间，还有什么是彼此没说透的？" },
  { id: "q54", cat: "走心", q: "什么样的时刻，会让你特别确定「我们是认真的」？" },
  { id: "q55", cat: "走心", q: "你有没有想过，我们最后会变成什么样子？" },
  { id: "q56", cat: "日常", q: "今天有没有哪个瞬间突然想到我？" },
  { id: "q57", cat: "日常", q: "最近有什么开心的小事想第一个告诉我？" },
  { id: "q58", cat: "日常", q: "这一周你最累的是什么？有没有想让我抱抱？" },
  { id: "q59", cat: "日常", q: "如果现在我在你身边，你最想做的第一件事是什么？" },
  { id: "q60", cat: "日常", q: "今天的你，想被我用哪种方式宠一下？" }
];

// 字符串稳定哈希（自定义题给个稳定 id，用于已答判重）
const qhash = s => { let x = 0; for (let i = 0; i < s.length; i++) { x = (x * 31 + s.charCodeAt(i)) | 0; } return (x >>> 0).toString(36); };
// 情侣空间·问答小本：翻页书 —— 封面(可改标题)/翻页看过往(编辑·reroll·删除)/翻新题作答
function CoupleQABook({ partner, bank, customQ, entries, title, onAnswer, onEdit, onRemove, onReroll, onSaveTitle, gen, onBack }) {
  const t = useTheme();
  const mine = (entries || []).filter(e => e.characterId === partner.id).slice().sort((a, b) => a.answeredAt - b.answeredAt);
  const answered = new Set(mine.map(e => e.qid));
  const fullBank = bank.concat((customQ || []).map(q => ({ id: "cx_" + qhash(q), cat: "自定义", q: q })));
  const pool = fullBank.filter(b => !answered.has(b.id));
  const bookTitle = title || "关于我们";
  const [mode, setMode] = useState("cover"); // cover / pages / draw
  const [pageIdx, setPageIdx] = useState(0);
  const [cur, setCur] = useState(null);
  const [ans, setAns] = useState("");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleVal, setTitleVal] = useState(bookTitle);
  const swipeRef = useRef({ x: 0, y: 0 });
  const draw = () => { if (pool.length) { setCur(pool[Math.floor(Math.random() * pool.length)]); setAns(""); } else setCur(null); };
  const submit = async () => {
    if (!cur || !ans.trim() || gen) return;
    const ok = await onAnswer(partner, { qid: cur.id, question: cur.q, myAnswer: ans.trim(), source: "题库" });
    if (ok) { setCur(null); setAns(""); setPageIdx(9999); setMode("pages"); }
  };

  // —— 翻一张新题作答 ——
  if (mode === "draw") {
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "翻一张题", en: partner.name, onBack: () => { setCur(null); setAns(""); setMode("cover"); } }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 4, marginBottom: 14 } }, "已答 " + mine.length + " / " + fullBank.length + " 题。"),
        cur ? h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "14px 16px", animation: "fadeUp .3s ease both" } },
          h(Eyebrow, { style: { marginBottom: 8 } }, cur.cat),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.5, color: t.ink, marginBottom: 12 } }, cur.q),
          h("textarea", { value: ans, onChange: e => setAns(e.target.value), placeholder: "写下你的答案…", rows: 3, style: { width: "100%", outline: "none", resize: "none", padding: "10px 12px", borderRadius: 12, fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
          h("div", { className: "flex items-center gap-2 mt-3" },
            h("button", { onClick: draw, disabled: gen, className: "active:opacity-60 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "换一题"),
            h("button", { onClick: submit, disabled: !ans.trim() || gen, className: "ml-auto active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "8px 18px", borderRadius: 10 } }, gen ? partner.name + " 作答中…" : "提交 · 等 TA 答"))) : h("button", { onClick: draw, disabled: !pool.length, className: "w-full active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 15, padding: "13px 0", borderRadius: 14 } }, pool.length ? "翻一张新题" : "题库都答完啦")));
  }

  // —— 翻页看过往（编辑 / reroll / 删除）——
  if (mode === "pages") {
    const has = mine.length > 0;
    const idx = Math.max(0, Math.min(pageIdx, mine.length - 1));
    const e = has ? mine[idx] : null;
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: bookTitle, en: has ? (idx + 1) + " / " + mine.length : "", onBack: () => setMode("cover") }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8", style: { touchAction: "pan-y" }, onTouchStart: ev => { const tt = ev.touches[0]; swipeRef.current = { x: tt.clientX, y: tt.clientY }; }, onTouchEnd: ev => { const tt = ev.changedTouches[0]; const dx = tt.clientX - swipeRef.current.x, dy = tt.clientY - swipeRef.current.y; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) setPageIdx(Math.min(mine.length - 1, idx + 1)); else setPageIdx(Math.max(0, idx - 1)); } } },
        !has ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, marginTop: 10 } }, "还没有答过的题。") : h("div", { key: e.id, style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "16px 18px", animation: "fadeUp .3s ease both" } },
          h(Eyebrow, { style: { marginBottom: 8 } }, "第 " + (idx + 1) + " 题"),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, lineHeight: 1.5, color: t.ink, marginBottom: 12 } }, e.question),
          h("div", { style: { marginBottom: 10 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint, marginBottom: 3 } }, "我"),
            editId === e.id ? h("div", null,
              h("textarea", { value: editText, onChange: ev => setEditText(ev.target.value), rows: 3, style: { width: "100%", outline: "none", resize: "none", padding: "9px 11px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
              h("div", { className: "flex gap-2 mt-2" },
                h("button", { onClick: () => { onEdit(e.id, editText); setEditId(null); }, className: "active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 12.5, padding: "6px 14px", borderRadius: 8 } }, "保存"),
                h("button", { onClick: () => setEditId(null), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, "取消"))) : h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, color: t.sub, whiteSpace: "pre-wrap" } }, e.myAnswer || "（没写）")),
          h("div", null,
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.accent, marginBottom: 3 } }, partner.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, color: t.ink, whiteSpace: "pre-wrap" } }, gen ? "…" : (e.charAnswer || "…"))),
          h("div", { className: "flex items-center justify-between", style: { marginTop: 12, borderTop: "1px solid " + t.line, paddingTop: 10 } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog } }, timeAgo(e.answeredAt)),
            h("div", { className: "flex items-center gap-3" },
              h("button", { onClick: () => { setEditId(e.id); setEditText(e.myAnswer || ""); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, "编辑"),
              h("button", { onClick: () => onReroll(partner, e), disabled: gen, className: "active:opacity-60 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, gen ? "…" : "重答"),
              h("button", { onClick: () => { onRemove(e.id); setPageIdx(i => Math.max(0, i - (idx === mine.length - 1 ? 1 : 0))); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: "#c26" } }, "删除")))),
        has ? h("div", { className: "flex items-center justify-between", style: { marginTop: 16 } },
          h("button", { onClick: () => setPageIdx(Math.max(0, idx - 1)), disabled: idx === 0, className: "active:opacity-60 disabled:opacity-30", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "‹ 上一题"),
          h("button", { onClick: () => { draw(); setMode("draw"); }, className: "active:opacity-70 flex flex-col items-center", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.tint } }, "＋ 新题", h("span", { style: { fontSize: 9, color: t.fog, marginTop: 1 } }, "← 左右滑翻页 →")),
          h("button", { onClick: () => setPageIdx(Math.min(mine.length - 1, idx + 1)), disabled: idx >= mine.length - 1, className: "active:opacity-60 disabled:opacity-30", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, "下一题 ›")) : null));
  }

  // —— 书封面（默认）——
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "问答小本", en: "Q&A · " + partner.name, onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("div", { style: { position: "relative", marginTop: 18, borderRadius: 16, padding: "34px 24px 26px", background: "linear-gradient(135deg,#c98a9e,#9f5c72)", boxShadow: "0 12px 34px rgba(120,70,90,0.3)", minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "space-between" } },
        h("div", { style: { position: "absolute", left: 12, top: 14, bottom: 14, width: 4, borderRadius: 999, background: "rgba(255,255,255,0.25)" } }),
        h("div", { style: { paddingLeft: 14 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, letterSpacing: "0.22em", color: "rgba(255,255,255,0.7)", marginBottom: 12 } }, "OUR Q&A"),
          titleEditing ? h("div", null,
            h("input", { value: titleVal, onChange: e => setTitleVal(e.target.value), style: { width: "100%", outline: "none", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, padding: "6px 10px", fontFamily: F_DISPLAY, fontSize: 24, color: "#fff" } }),
            h("div", { className: "flex gap-2 mt-2" },
              h("button", { onClick: () => { onSaveTitle(partner.id, (titleVal || "").trim() || "关于我们"); setTitleEditing(false); }, className: "active:opacity-80", style: { background: "#fff", color: "#9f5c72", fontFamily: F_DISPLAY, fontSize: 12.5, padding: "5px 14px", borderRadius: 8 } }, "保存"),
              h("button", { onClick: () => { setTitleVal(bookTitle); setTitleEditing(false); }, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: "rgba(255,255,255,0.8)" } }, "取消"))) : h("button", { onClick: () => { setTitleVal(bookTitle); setTitleEditing(true); }, className: "text-left active:opacity-80 flex items-baseline gap-2" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 30, color: "#fff", lineHeight: 1.2 } }, bookTitle),
            h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: "rgba(255,255,255,0.55)", flexShrink: 0 } }, "✎"))),
        h("div", { style: { paddingLeft: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between" } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: "rgba(255,255,255,0.85)" } }, "已答 " + mine.length + " / " + fullBank.length + " 题"),
          h("button", { onClick: () => { draw(); setMode("draw"); }, className: "active:opacity-80", style: { width: 46, height: 46, borderRadius: 999, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.22)" } }, h(IPlus, { size: 23, color: "#9f5c72" })))),
      mine.length ? h("button", { onClick: () => { setPageIdx(0); setMode("pages"); }, className: "w-full active:opacity-70", style: { marginTop: 16, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 15, padding: "12px 0", borderRadius: 14 } }, "翻开看过往（" + mine.length + "）") : h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", marginTop: 16 } }, "还没答过题——点封面右下角 ＋ 翻第一张"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, textAlign: "center", marginTop: 14, lineHeight: 1.6 } }, "想加只属于你俩的专属题？设置 → 「问答」→ 选 " + partner.name)));
}

// 情侣空间·同频测试（纯娱乐不动好感）：AI 按记忆出 5 题→我选→TA 盲猜我的选择+理由→默契分+TA 感想，整局存档
function CoupleSyncTest({ partner, records, onStart, onSubmit, onRemove, gen, onBack }) {
  const t = useTheme();
  const mine = (records || []).filter(r => r.characterId === partner.id);
  const draft = mine.find(r => r.status === "quiz");
  const done = mine.filter(r => r.status === "done");
  const [view, setView] = useState(null);   // null=首页 / 'quiz'=作答中 / 某局id=看结果
  const [picks, setPicks] = useState({});   // 作答选择 {题idx: 选项idx}
  const scoreTag = (s, n) => { const r = n ? s / n : 0; return r >= 1 ? "心有灵犀" : r >= 0.8 ? "同频共振" : r >= 0.6 ? "还算合拍" : r >= 0.4 ? "偶尔跑频" : "平行世界"; };
  const fmtD = ts => { const d = new Date(ts); return (d.getMonth() + 1) + "月" + d.getDate() + "日"; };

  // —— 作答中 ——
  if (view === "quiz" && draft) {
    const allPicked = draft.qs.every((x, i) => picks[i] != null);
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "同频测试", en: "作答中", onBack: () => setView(null) }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.7, marginTop: 6, marginBottom: 12 } }, "凭直觉选，答案暂时不给 " + partner.name + " 看——你提交后 TA 才开始猜。"),
        draft.qs.map((x, i) => h("div", { key: i, style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "13px 15px", marginBottom: 12 } },
          h(Eyebrow, { style: { marginBottom: 6 } }, "第 " + (i + 1) + " 题"),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, lineHeight: 1.5, color: t.ink, marginBottom: 10 } }, x.q),
          x.opts.map((o, j) => h("button", { key: j, onClick: () => setPicks(p => ({ ...p, [i]: j })), className: "w-full text-left active:opacity-70", style: { display: "block", padding: "9px 12px", borderRadius: 11, marginBottom: 6, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.5, background: picks[i] === j ? t.ink : t.bg, color: picks[i] === j ? t.bg2 : t.ink, border: "1px solid " + (picks[i] === j ? t.ink : t.line) } }, "ABCD"[j] + ". " + o)))),
        h("button", { onClick: async () => { if (!allPicked || gen) return; const ok = await onSubmit(partner, draft, draft.qs.map((x, i) => picks[i])); if (ok) { setView(draft.id); setPicks({}); } }, disabled: !allPicked || gen, className: "w-full active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 15, padding: "13px 0", borderRadius: 14 } }, gen ? partner.name + " 正在猜你的选择…" : allPicked ? "提交 · 让 TA 猜" : "还有题没选"),
        h("button", { onClick: () => { onRemove(draft.id); setPicks({}); setView(null); }, disabled: gen, className: "w-full active:opacity-60 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "12px 0 0" } }, "放弃这局")));
  }

  // —— 看某局结果 ——
  const rec = view && view !== "quiz" ? done.find(r => r.id === view) : null;
  if (rec) {
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "同频测试", en: fmtD(rec.doneAt || rec.ts), onBack: () => setView(null) }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
        h("div", { style: { textAlign: "center", padding: "22px 0 18px" } },
          h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 44, color: t.accent, lineHeight: 1 } }, rec.score + " / " + rec.qs.length),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink, marginTop: 8 } }, scoreTag(rec.score, rec.qs.length)),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 4 } }, "纯娱乐 · 不影响好感")),
        rec.qs.map((x, i) => { const hit = x.my === x.ta; return h("div", { key: i, style: { background: t.bg2, border: "1px solid " + (hit ? "#bcd8bc" : t.line), borderRadius: 16, padding: "13px 15px", marginBottom: 12 } },
          h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
            h(Eyebrow, null, "第 " + (i + 1) + " 题"),
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 12, color: hit ? "#4a8a4a" : t.accent } }, hit ? "✓ 猜中" : "✗ 没猜中")),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, lineHeight: 1.5, color: t.ink, marginBottom: 9 } }, x.q),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, lineHeight: 1.7, color: t.sub } },
            h("div", null, h("span", { style: { color: t.tint } }, "我选："), x.opts[x.my] != null ? x.opts[x.my] : "—"),
            h("div", null, h("span", { style: { color: t.accent } }, "TA 猜："), x.opts[x.ta] != null ? x.opts[x.ta] : "—"),
            x.reason ? h("div", { style: { marginTop: 5, paddingTop: 6, borderTop: "1px dashed " + t.line, color: t.fog } }, "“" + x.reason + "”") : null)); }),
        rec.remark ? h("div", { style: { background: "linear-gradient(135deg,#fdf0f3,#f6ecf8)", border: "1px solid #eed4dc", borderRadius: 16, padding: "14px 16px", marginBottom: 12 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: "#b0708a", marginBottom: 5 } }, partner.name + " 的感想"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, color: t.ink, whiteSpace: "pre-wrap" } }, rec.remark)) : null,
        h("button", { onClick: () => { onRemove(rec.id); setView(null); }, className: "w-full active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: "#c26", padding: "8px 0" } }, "删除这局存档")));
  }

  // —— 首页：介绍 + 开始 + 往期存档 ——
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "同频测试", en: "Sync · " + partner.name, onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("div", { style: { position: "relative", marginTop: 18, borderRadius: 16, padding: "26px 22px", background: "linear-gradient(135deg,#8fb6c9,#6e86b5)", boxShadow: "0 12px 34px rgba(80,100,140,0.28)" } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, letterSpacing: "0.22em", color: "rgba(255,255,255,0.7)", marginBottom: 10 } }, "SYNC TEST"),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 26, color: "#fff", lineHeight: 1.3 } }, "TA 有多懂你？"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.8, color: "rgba(255,255,255,0.85)", marginTop: 10 } }, partner.name + " 会按你们的记忆出 5 道关于你的题。你先答，TA 再认真猜你选了什么——比比默契。纯娱乐，不影响好感。"),
        h("button", { onClick: async () => { if (gen) return; if (draft) { setPicks({}); setView("quiz"); return; } const ok = await onStart(partner); if (ok) { setPicks({}); setView("quiz"); } }, disabled: gen, className: "active:opacity-80 disabled:opacity-60", style: { marginTop: 16, background: "#fff", color: "#5b73a3", fontFamily: F_DISPLAY, fontSize: 14.5, padding: "10px 22px", borderRadius: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.18)" } }, gen ? partner.name + " 出题中…" : draft ? "继续上次的作答" : "开始一局")),
      done.length ? h("div", { style: { marginTop: 18 } },
        h(Eyebrow, { style: { marginBottom: 10 } }, "往期 · " + done.length + " 局"),
        done.map(r => h("button", { key: r.id, onClick: () => setView(r.id), className: "w-full text-left active:opacity-70", style: { display: "flex", alignItems: "center", justifyContent: "space-between", background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "12px 15px", marginBottom: 8 } },
          h("div", null,
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, scoreTag(r.score, r.qs.length)),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, fmtD(r.doneAt || r.ts))),
          h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 20, color: t.accent } }, r.score + "/" + r.qs.length)))) : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, textAlign: "center", marginTop: 20 } }, "还没玩过——点上面开始第一局。")));
}

// 情侣空间·交换日记（v47.77 借 LNChat）：一本两人轮流写的本子——我随时写一页，TA 三天内挑个时候
// 按【TA 回复当天】的处境回一页（呼应我写的+没说出口的潜台词）。头部带日期/天气/心情的仪式感
function CoupleExDiary({ partner, entries, onAdd, onRead, onBack }) {
  const t = useTheme();
  const mine = (entries || []).filter(e => e.characterId === partner.id).slice().sort((a, b) => b.ts - a.ts);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");
  const [moodW, setMoodW] = useState("");
  useEffect(() => { onRead && onRead(partner.id); }, []);
  const pending = mine.find(e => e.author === "user" && !e.replied);
  const fmtD = ds => { const p = String(ds || "").split("-"); return p.length === 3 ? p[0] + " 年 " + parseInt(p[1], 10) + " 月 " + parseInt(p[2], 10) + " 日" : ds; };
  const page = e => {
    const isMe = e.author === "user";
    return h("div", { key: e.id, style: { background: isMe ? t.bg2 : "linear-gradient(150deg,#fdf3ee,#f7ebf0)", border: "1px solid " + (isMe ? t.line : "#eed6d2"), borderRadius: 16, padding: "14px 16px", marginBottom: 14 } },
      h("div", { style: { borderBottom: "1px dashed " + t.line, paddingBottom: 8, marginBottom: 10 } },
        h("div", { className: "flex items-center justify-between" },
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 13.5, color: t.ink } }, fmtD(e.date)),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: isMe ? t.tint : "#b0708a" } }, isMe ? "我写的" : partner.name + " 写的")),
        (e.weather || e.mood) ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 3 } }, (e.weather ? "天气：" + e.weather : "") + (e.weather && e.mood ? " · " : "") + (e.mood ? "心情：" + e.mood : "")) : null),
      h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 13.5, lineHeight: 1.9, color: t.ink, whiteSpace: "pre-wrap" } }, e.content),
      isMe && !e.replied ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 8, fontStyle: "italic" } }, "本子在 TA 那边 · 这几天会回你一页") : null);
  };
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "交换日记", en: "Diary · " + partner.name, onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.7, marginTop: 4, marginBottom: 12 } }, "一本只有你俩看的本子：想写就写一页，TA 会在三天内找个时候回一页——写 TA 那天的事、和没说出口的话。"),
      writing ? h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "13px 15px", marginBottom: 14 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13.5, color: t.ink, marginBottom: 8 } }, fmtD(new Date().getFullYear() + "-" + (new Date().getMonth() + 1) + "-" + new Date().getDate())),
        h("textarea", { value: body, onChange: e => setBody(e.target.value), placeholder: "写点什么给 TA 看…", rows: 6, style: { width: "100%", outline: "none", resize: "none", padding: "10px 12px", borderRadius: 12, fontFamily: "'Noto Serif SC',serif", fontSize: 13.5, lineHeight: 1.8, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
        h("input", { value: moodW, onChange: e => setMoodW(e.target.value), placeholder: "此刻心情（可空，如：有点想你）", style: { width: "100%", outline: "none", marginTop: 8, padding: "9px 12px", borderRadius: 10, fontFamily: F_BODY, fontSize: 12.5, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { className: "flex gap-2", style: { marginTop: 10 } },
          h("button", { onClick: () => { if (body.trim()) { onAdd(partner, body, moodW); setBody(""); setMoodW(""); setWriting(false); } }, disabled: !body.trim(), className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 13.5, padding: "9px 20px", borderRadius: 10 } }, "合上本子"),
          h("button", { onClick: () => setWriting(false), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, "取消")))
      : h("button", { onClick: () => setWriting(true), className: "w-full active:opacity-70", style: { marginBottom: 14, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14.5, padding: "12px 0", borderRadius: 14 } }, pending ? "再写一页（TA 还没回上一页）" : "✎ 写一页"),
      mine.length ? mine.map(page) : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", marginTop: 24 } }, "本子还是空的——写下第一页吧。")));
}

// 情侣空间·双向便签墙（悄悄话串）：我贴→TA 自动回；TA 的要点一下才看得到，再点开全屏留言互动
// 便签纸张样式：纯色 / 横线 / 格纹 / 圆点 / 带粉角，可爱多样
const COUPLE_NOTE_STYLES = [
  { bg: "#fdf0a8", ink: "#5c5324", pat: "plain" },
  { bg: "#ffd7d7", ink: "#5c2c2c", pat: "plain" },
  { bg: "#d4f3d4", ink: "#264a26", pat: "lined" },
  { bg: "#d6e6ff", ink: "#26375c", pat: "grid" },
  { bg: "#f2d9ff", ink: "#4a265c", pat: "dots" },
  { bg: "#ffffff", ink: "#3a3327", pat: "grid", corner: "#ffb3c6" },
  { bg: "#fff4e0", ink: "#5c4424", pat: "lined", corner: "#ffcf9e" },
  { bg: "#e8f7f0", ink: "#255049", pat: "dots" }
];
const noteStyleOf = n => COUPLE_NOTE_STYLES[(n.style || 0) % COUPLE_NOTE_STYLES.length];
const notePaper = st => {
  const s = { background: st.bg, color: st.ink };
  if (st.pat === "grid") { s.backgroundImage = "linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px)"; s.backgroundSize = "15px 15px"; }
  else if (st.pat === "lined") { s.backgroundImage = "repeating-linear-gradient(rgba(0,0,0,0.05) 0 1px,transparent 1px 22px)"; }
  else if (st.pat === "dots") { s.backgroundImage = "radial-gradient(rgba(0,0,0,0.07) 1.2px,transparent 1.4px)"; s.backgroundSize = "14px 14px"; }
  return s;
};
const noteCorner = st => st.corner ? h("div", { style: { position: "absolute", top: 0, left: 0, width: 0, height: 0, borderTop: "18px solid " + st.corner, borderRight: "18px solid transparent", borderTopLeftRadius: 4 } }) : null;
function CoupleNotes({ partner, notes, onAdd, onAddReply, onRemove, onGen, gen, onBack }) {
  const t = useTheme();
  const mine = (notes || []).filter(n => n.characterId === partner.id);
  const [draft, setDraft] = useState("");
  const [style, setStyle] = useState(0);
  const [revealed, setRevealed] = useState(() => { try { return JSON.parse(localStorage.getItem("x_coupleNoteSeen") || "{}"); } catch (e) { return {}; } });
  const revealNote = id => setRevealed(p => { const n = { ...p, [id]: true }; try { localStorage.setItem("x_coupleNoteSeen", JSON.stringify(n)); } catch (e) { } return n; });
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState("");
  const md = ts => { const d = new Date(ts); return (d.getMonth() + 1) + "." + d.getDate(); };
  const threadText = n => [(n.authorId === "user" ? "我" : partner.name) + "：" + n.content].concat((n.replies || []).map(r => (r.authorId === "user" ? "我" : partner.name) + "：" + r.content)).join("\n");
  const post = () => { if (draft.trim()) { onAdd(partner, draft, style); setDraft(""); } };

  // —— 全屏悄悄话：一整张拉长便签，一来一回写成 text（不是聊天气泡）——
  if (open) {
    const n = mine.find(x => x.id === open);
    if (n) {
      const st = noteStyleOf(n);
      const msgs = [{ authorId: n.authorId, content: n.content }].concat(n.replies || []);
      const send = () => { if (reply.trim() && !gen) { onAddReply(partner, n.id, reply.trim(), threadText(n)); setReply(""); } };
      return h("div", { className: "h-full flex flex-col", style: { background: st.bg } },
        h(Head, { zh: "悄悄话", en: partner.name, onBack: () => { setOpen(null); setReply(""); } }),
        h("div", { className: "flex-1 overflow-y-auto px-6 py-5" },
          h("div", { style: Object.assign({}, notePaper(st), { position: "relative", borderRadius: 8, padding: "20px 18px 22px", boxShadow: "0 3px 16px rgba(0,0,0,0.1)", minHeight: 220 }) },
            noteCorner(st),
            msgs.map((m, i) => { const meMsg = m.authorId === "user"; return h("div", { key: i, style: { marginBottom: 15 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: "rgba(0,0,0,0.4)", marginBottom: 2 } }, meMsg ? "我" : partner.name),
              h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.75, color: st.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", paddingLeft: meMsg ? 10 : 0, borderLeft: meMsg ? "2px solid rgba(0,0,0,0.12)" : "none" } }, m.content)); }),
            gen ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: "rgba(0,0,0,0.4)", fontStyle: "italic" } }, partner.name + " 正在写…") : null)),
        h("div", { className: "shrink-0 px-4 py-3 flex items-center gap-2", style: { borderTop: "1px solid rgba(0,0,0,0.08)" } },
          h("input", { value: reply, onChange: e => setReply(e.target.value), onKeyDown: e => { if (e.key === "Enter") send(); }, placeholder: "在这张便签上续写一句…", style: { flex: 1, outline: "none", padding: "9px 12px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, background: "rgba(255,255,255,0.7)", color: st.ink, border: "1px solid rgba(0,0,0,0.12)" } }),
          h("button", { onClick: send, disabled: !reply.trim() || gen, className: "active:opacity-70 disabled:opacity-40", style: { background: st.ink, color: st.bg, fontFamily: F_DISPLAY, fontSize: 13.5, padding: "9px 16px", borderRadius: 10 } }, "写上去")));
    }
  }

  // —— 便签墙卡片：一行一条，只把「最初的话」放正中间；续写只在点进去的页面里 ——
  const card = (n, i) => {
    const st = noteStyleOf(n);
    const isMe = n.authorId === "user";
    const hasHis = n.authorId === partner.id || (n.replies || []).some(r => r.authorId === partner.id);
    const covered = hasHis && !revealed[n.id];
    const replyN = (n.replies || []).length;
    const onCard = () => { if (covered) revealNote(n.id); else setOpen(n.id); };
    return h("div", { key: n.id, onClick: onCard, className: "active:opacity-90", style: Object.assign({}, notePaper(st), { position: "relative", borderRadius: 8, padding: "26px 22px 12px", transform: "rotate(" + (i % 2 ? 0.5 : -0.5) + "deg)", boxShadow: "0 5px 16px rgba(0,0,0,0.13)", animation: "fadeUp .3s ease both", cursor: "pointer", minHeight: 128, display: "flex", flexDirection: "column" }) },
      h("div", { style: { position: "absolute", top: -8, left: "50%", width: 60, height: 18, transform: "translateX(-50%) rotate(" + (i % 2 ? 3.5 : -3.5) + "deg)", background: "rgba(255,255,255,0.5)", borderLeft: "1px solid rgba(0,0,0,0.05)", borderRight: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" } }),
      noteCorner(st),
      h("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "8px 0" } },
        covered ? null : h("div", { style: { fontFamily: F_BODY, fontSize: 16.5, lineHeight: 1.7, color: st.ink, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, n.content)),
      h("div", { className: "flex items-center justify-between", style: { marginTop: 4 } },
        h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: "rgba(0,0,0,0.42)" } }, (isMe ? "我" : partner.name) + " · " + md(n.createdAt) + (replyN ? " · " + (replyN + 1) + " 来回" : "")),
        h("button", { onClick: e => { e.stopPropagation(); onRemove(n.id); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 16, color: "rgba(0,0,0,0.3)", lineHeight: 1, paddingLeft: 6 } }, "×")));
  };

  // —— 便签墙 ——
  const draftSt = COUPLE_NOTE_STYLES[style % COUPLE_NOTE_STYLES.length];
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "便签墙", en: "Notes · " + partner.name, onBack,
      right: h("button", { onClick: () => onGen(partner), disabled: gen, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 18, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "12px 14px", marginTop: 6, marginBottom: 8 } },
        h("textarea", { value: draft, onChange: e => setDraft(e.target.value), placeholder: "贴一张给 " + partner.name + " 的便签，TA 会悄悄回你…", rows: 2, maxLength: 60, style: Object.assign({}, notePaper(draftSt), { width: "100%", outline: "none", resize: "none", padding: "10px 12px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.5, border: "1px solid " + t.line }) }),
        h("div", { className: "flex flex-wrap items-center gap-2 mt-3" }, COUPLE_NOTE_STYLES.map((st, i) => h("button", { key: i, onClick: () => setStyle(i), className: "active:opacity-70", style: Object.assign({}, notePaper(st), { position: "relative", width: 24, height: 24, borderRadius: 6, border: style === i ? "2px solid " + t.ink : "1px solid " + t.line }) }, st.corner ? h("div", { style: { position: "absolute", top: 0, left: 0, width: 0, height: 0, borderTop: "8px solid " + st.corner, borderRight: "8px solid transparent" } }) : null))),
        h("button", { onClick: post, disabled: !draft.trim(), className: "w-full active:opacity-70 disabled:opacity-40", style: { marginTop: 10, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 13.5, padding: "9px 0", borderRadius: 10 } }, "贴上去")),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 14 } }, "点右上角刷新让 " + partner.name + " 主动贴。TA 的便签要点一下才看得到，再点开可以一起续写。"),
      gen && !open && h(Spinner, { label: partner.name + " 正在写…" }),
      mine.length === 0 && !gen && h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "还没有便签，贴一张，或让 TA 先贴。"),
      h("div", { className: "space-y-4" }, mine.map(card))));
}

// 情侣空间·心情打卡：心情格子选择 + 专属日历(含年) + 我和 TA 都选 + 统计瓶子
const COUPLE_MOODS = [
  { key: "relax", label: "轻松", emoji: "😌", color: "#bcd3f0", ink: "#5b7fb0" },
  { key: "surprise", label: "惊喜", emoji: "🤩", color: "#bfe3c6", ink: "#4f9d6a" },
  { key: "gloomy", label: "郁闷", emoji: "😔", color: "#ece1b0", ink: "#a99436" },
  { key: "sad", label: "难过", emoji: "😢", color: "#c3e0b0", ink: "#6f9b57" },
  { key: "happy", label: "开心", emoji: "😄", color: "#f2cfd2", ink: "#d16b86" },
  { key: "irritated", label: "烦躁", emoji: "😣", color: "#eea3a3", ink: "#c65a5a" },
  { key: "proud", label: "骄傲", emoji: "😎", color: "#f2c88f", ink: "#c98a3e" },
  { key: "cozy", label: "舒畅", emoji: "🥰", color: "#f2c0c8", ink: "#d16f8a" },
  { key: "amazed", label: "惊讶", emoji: "😲", color: "#f0dc8f", ink: "#c2a53c" }
];
const moodBy = k => COUPLE_MOODS.find(m => m.key === k);
// 手绘感心情圆脸（替换系统 emoji，风格照用户「心情罐头」参考图：柔和圆脸 + 简单表情）
function MoodGlyph({ mood, size }) {
  const m = moodBy(mood) || COUPLE_MOODS[0];
  const s = size || 24;
  const ink = m.ink || "#7a6a55";
  const sk = { fill: "none", stroke: ink, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  const thin = Object.assign({}, sk, { strokeWidth: 1.3 });
  const dot = (cx, cy) => h("circle", { cx: cx, cy: cy == null ? 10.3 : cy, r: 1.45, fill: ink });
  const arcEye = cx => h("path", Object.assign({ d: "M" + (cx - 1.7) + " 10.8 Q" + cx + " 8.9 " + (cx + 1.7) + " 10.8" }, sk));
  const starEye = cx => h("path", Object.assign({ d: "M" + cx + " 8.4 L" + cx + " 12 M" + (cx - 1.6) + " 10.2 L" + (cx + 1.6) + " 10.2" }, thin));
  let eyes, mouth, extra = null;
  switch (mood) {
    case "happy": eyes = [dot(8.6), dot(15.4)]; mouth = h("path", Object.assign({ d: "M8 13.6 Q12 18.4 16 13.6" }, sk)); break;
    case "relax": eyes = [arcEye(8.6), arcEye(15.4)]; mouth = h("path", Object.assign({ d: "M9.2 14.4 Q12 16.4 14.8 14.4" }, sk)); break;
    case "cozy": eyes = [arcEye(8.6), arcEye(15.4)]; mouth = h("path", Object.assign({ d: "M9 14.4 Q12 16.9 15 14.4" }, sk)); extra = [h("circle", { cx: 6.6, cy: 13.6, r: 1.5, fill: "#ff9db0", opacity: 0.5 }), h("circle", { cx: 17.4, cy: 13.6, r: 1.5, fill: "#ff9db0", opacity: 0.5 })]; break;
    case "surprise": eyes = [starEye(8.6), starEye(15.4)]; mouth = h("path", Object.assign({ d: "M8.4 14 Q12 18 15.6 14" }, sk)); break;
    case "proud": eyes = [h("rect", { x: 6.3, y: 9, width: 4.5, height: 3, rx: 1.3, fill: ink }), h("rect", { x: 13.2, y: 9, width: 4.5, height: 3, rx: 1.3, fill: ink }), h("path", Object.assign({ d: "M10.8 10.2 L13.2 10.2" }, thin))]; mouth = h("path", Object.assign({ d: "M9 14.4 Q12.8 16.9 15.4 13.8" }, sk)); break;
    case "amazed": eyes = [dot(8.6, 10), dot(15.4, 10)]; mouth = h("ellipse", { cx: 12, cy: 15.2, rx: 1.9, ry: 2.4, fill: ink }); break;
    case "gloomy": eyes = [dot(8.6, 10.7), dot(15.4, 10.7)]; mouth = h("path", Object.assign({ d: "M9 15.7 Q12 14.5 15 15.7" }, sk)); break;
    case "sad": eyes = [dot(8.6, 10.7), dot(15.4, 10.7)]; mouth = h("path", Object.assign({ d: "M9 16 Q12 13.8 15 16" }, sk)); extra = [h("path", { d: "M8 12.4 q-1.1 2.1 0 2.9 q1.1 -0.8 0 -2.9", fill: "#8fc3e8" })]; break;
    case "irritated": eyes = [dot(8.6, 11), dot(15.4, 11), h("path", Object.assign({ d: "M6.8 8.6 L10 9.8" }, thin)), h("path", Object.assign({ d: "M17.2 8.6 L14 9.8" }, thin))]; mouth = h("path", Object.assign({ d: "M8.6 15 q1.7 -1.5 3.4 0 q1.7 1.5 3.4 0" }, sk)); break;
    default: eyes = [dot(8.6), dot(15.4)]; mouth = h("path", Object.assign({ d: "M9 14.5 Q12 16.5 15 14.5" }, sk));
  }
  const base = h("circle", { cx: 12, cy: 12, r: 10.6, fill: m.color, stroke: ink, strokeWidth: 1.4, strokeOpacity: 0.5 });
  const kids = [base].concat(eyes, [mouth], extra || []).filter(Boolean).map((el, i) => React.cloneElement(el, { key: i }));
  return h("svg", { width: s, height: s, viewBox: "0 0 24 24", style: { display: "block", overflow: "visible" } }, kids);
}
function CoupleMood({ partner, me, pa, moods, onCheckin, gen, onBack }) {
  const t = useTheme();
  const mine = (moods || []).filter(m => m.characterId === partner.id && m.date);
  const byDate = {}; mine.forEach(m => { byDate[m.date] = m; });
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [pickDay, setPickDay] = useState(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const dk = (y, m, d) => y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const todayKey = dk(now.getFullYear(), now.getMonth(), now.getDate());
  const emo = k => { const mm = moodBy(k); return mm ? mm.emoji : ""; };
  const glyph = (k, sz) => h(MoodGlyph, { mood: k, size: sz });
  const nav = delta => setYm(p => { let m = p.m + delta, y = p.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y: y, m: m }; });
  const monthPrefix = ym.y + "-" + String(ym.m + 1).padStart(2, "0") + "-";
  const monthEntries = mine.filter(m => m.date.indexOf(monthPrefix) === 0);
  const allKeys = [];
  monthEntries.forEach(m => { if (m.myMood) allKeys.push(m.myMood); if (m.charMood) allKeys.push(m.charMood); });
  const topOf = arr => { const f = {}; arr.forEach(k => f[k] = (f[k] || 0) + 1); const k = Object.keys(f).sort((a, b) => f[b] - f[a])[0]; return k ? { k: k, n: f[k] } : null; };
  const myTop = topOf(monthEntries.map(m => m.myMood).filter(Boolean));
  const charTop = topOf(monthEntries.map(m => m.charMood).filter(Boolean));
  const cells = calCells(ym.y, ym.m);
  const weeks = Math.max(1, Math.ceil(cells.length / 7));
  const jarLine = "#8f8f8f";
  const person = (who, top) => h("div", { className: "flex-1 flex flex-col items-center", style: { borderLeft: who === "char" ? "1px solid " + t.line : "none", padding: "4px 6px" } },
    h(Avatar, { character: who === "me" ? (me || { name: "我", color: t.accent }) : (pa || partner), size: 50, radius: 999 }),
    top ? h("div", { style: { marginTop: 8, lineHeight: 1 } }, glyph(top.k, 36)) : h("div", { style: { fontSize: 24, marginTop: 8, opacity: 0.25 } }, "—"),
    top ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: "#c02a52", marginTop: 4 } }, "×" + top.n) : h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4 } }, "还没打卡"));
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "心情日历", en: "Mood · " + partner.name, onBack,
      right: h("button", { onClick: () => setStatsOpen(true), className: "active:opacity-50" }, h(IBars, { size: 18, color: t.ink })) }),
    h("div", { className: "flex-1 flex flex-col px-5 pb-4 min-h-0" },
      h("div", { className: "flex items-center justify-center gap-5 shrink-0", style: { marginTop: 6, marginBottom: 10 } },
        h("button", { onClick: () => nav(-1), className: "active:opacity-50", style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.fog } }, "‹"),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, ym.y + " 年 " + (ym.m + 1) + " 月"),
        h("button", { onClick: () => nav(1), className: "active:opacity-50", style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.fog } }, "›")),
      h("div", { className: "shrink-0", style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 5 } }, CAL_DOW.map((w, i) => h("div", { key: i, style: { textAlign: "center", fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, w))),
      h("div", { className: "flex-1 min-h-0", style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: "repeat(" + weeks + ",1fr)", gap: 4 } },
        cells.map((d, i) => {
          if (d === null) return h("div", { key: i });
          const key = dk(ym.y, ym.m, d);
          const en = byDate[key];
          const isToday = key === todayKey;
          const has = en && (en.myMood || en.charMood);
          return h("button", { key: i, onClick: () => setPickDay(key), className: "active:opacity-70", style: { borderRadius: 12, background: has && moodBy(en.myMood) ? moodBy(en.myMood).color : (isToday ? t.bg2 : "transparent"), border: isToday ? "1.5px solid " + t.ink : "1px solid " + t.line, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "5px 2px", overflow: "hidden", minHeight: 42 } },
            h("span", { style: { fontFamily: F_BODY, fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? t.ink : t.sub } }, d),
            has ? h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 1, marginTop: 3 } }, en.myMood ? glyph(en.myMood, 18) : null, en.charMood ? glyph(en.charMood, 18) : null) : null);
        })),
      h("button", { onClick: () => setPickDay(todayKey), className: "shrink-0 active:opacity-70", style: { marginTop: 12, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 15, padding: "12px 0", borderRadius: 14 } }, byDate[todayKey] ? "今天已打卡 · 看 / 改" : "今日打卡 ＋💗")),
    pickDay && h(Sheet, { onClose: () => setPickDay(null) }, (() => {
      const isToday = pickDay === todayKey;
      const en = byDate[pickDay];
      const parts = pickDay.split("-");
      return h("div", null,
        h(Eyebrow, { style: { marginBottom: 12 } }, (+parts[1]) + "月" + (+parts[2]) + "日" + (isToday ? " · 今天" : "")),
        isToday ? h("div", { style: { marginBottom: 16 } },
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 8 } }, "选一个今天的心情，TA 也会为今天选一个"),
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 } },
            COUPLE_MOODS.map(mm => h("button", { key: mm.key, onClick: () => onCheckin(partner, mm.key), className: "active:opacity-70 flex flex-col items-center", style: { padding: "10px 0", borderRadius: 14, background: en && en.myMood === mm.key ? mm.color : t.bg2, border: "1px solid " + (en && en.myMood === mm.key ? t.ink : t.line) } },
              glyph(mm.key, 32),
              h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.ink, marginTop: 4 } }, mm.label))))) : null,
        en ? h("div", { className: "space-y-3" },
          h("div", { className: "flex items-center gap-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "12px 14px" } },
            h("div", { style: { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: t.fog } }, en.myMood ? glyph(en.myMood, 30) : "—"),
            h("div", null,
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint } }, "我"),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, en.myMood ? moodBy(en.myMood).label : "还没选"))),
          h("div", { className: "flex items-center gap-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "12px 14px" } },
            h("div", { style: { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: t.fog } }, gen && isToday && !en.charMood ? "⏳" : (en.charMood ? glyph(en.charMood, 30) : "—")),
            h("div", { className: "flex-1 min-w-0" },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.accent } }, partner.name),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, en.charMood ? moodBy(en.charMood).label : (gen && isToday ? "选心情中…" : "还没选")),
              en.charText ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginTop: 3 } }, "“" + en.charText + "”") : null))) : h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, isToday ? "" : "这天没有打卡记录。"));
    })()),
    statsOpen && h(Sheet, { onClose: () => setStatsOpen(false), tall: true },
      h(Eyebrow, { style: { marginBottom: 14 } }, ym.y + " 年 " + (ym.m + 1) + " 月 · 心情罐头"),
      h("div", { style: { position: "relative", width: 250, height: 252, margin: "0 auto 4px" } },
        h("div", { style: { position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 132, height: 22, borderRadius: 7, border: "3px solid " + jarLine, background: t.bg2, zIndex: 2 } }),
        h("div", { style: { position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", width: 234, height: 234, borderRadius: "16px 16px 52px 52px", border: "3px solid " + jarLine, background: "linear-gradient(180deg,rgba(255,255,255,0.35),rgba(0,0,0,0.03))", display: "flex", flexWrap: "wrap", alignContent: "flex-end", justifyContent: "center", padding: "14px 10px 12px", overflow: "hidden" } },
          allKeys.length ? allKeys.map((k, i) => { const rot = ((i * 37) % 46) - 23; const mx = ((i * 53) % 9) - 4; const my = ((i * 29) % 8) - 5; return h("span", { key: i, style: { lineHeight: 1, display: "inline-block", transform: "rotate(" + rot + "deg)", margin: my + "px " + mx + "px" } }, glyph(k, 25)); }) : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, margin: "auto", textAlign: "center", lineHeight: 1.8, whiteSpace: "pre-line" } }, "这个月还没有心情，\n去打卡吧～"))),
      h(Eyebrow, { style: { marginTop: 18, marginBottom: 10 } }, "本月最多心情"),
      h("div", { className: "flex", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 18, padding: "16px 10px" } },
        person("me", myTop), person("char", charTop)),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, textAlign: "center", marginTop: 14 } }, "收集了我们点点滴滴的情绪")));
}

// 情侣空间·我们的日子：纪念日倒计时(倒数中) + 恋爱时间轴(时光轴，起点/里程碑/感慨)，二合一，都带年份
function CoupleDays({ partner, since, events, annivs, onAdd, onRemove, onGen, onAddAnniv, onRemoveAnniv, gen, onBack }) {
  const t = useTheme();
  const mine = (events || []).filter(e => e.characterId === partner.id).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt);
  const annivInfo = (mo, dy) => { const now = new Date(); now.setHours(0, 0, 0, 0); let y = now.getFullYear(); let target = new Date(y, mo - 1, dy); target.setHours(0, 0, 0, 0); if (target < now) { y++; target = new Date(y, mo - 1, dy); } return { days: Math.round((target - now) / 86400000), y: y }; };
  const anns = (annivs || []).filter(a => a.characterId === partner.id).slice().sort((a, b) => annivInfo(a.month, a.day).days - annivInfo(b.month, b.day).days);
  const [addMode, setAddMode] = useState(null);
  const [date, setDate] = useState(""); const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [an, setAn] = useState(""); const [mo, setMo] = useState(""); const [dy, setDy] = useState(""); const [yearly, setYearly] = useState(true); const [link, setLink] = useState(true);
  const md = s => { const p = (s || "").split("-"); return p.length === 3 ? p[0] + "年" + (+p[1]) + "月" + (+p[2]) + "日" : s; };
  const startDate = since ? (function () { const d = new Date(since); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })() : null;
  const submitMile = () => { if (date && title.trim()) { onAdd(partner, date, title, content); setDate(""); setTitle(""); setContent(""); setAddMode(null); } };
  const submitAnn = () => { if (an.trim() && mo && dy) { onAddAnniv(partner, an, mo, dy, yearly, link); setAn(""); setMo(""); setDy(""); setAddMode(null); } };
  const toggle = (on, set, label) => h("button", { onClick: () => set(v => !v), className: "active:opacity-70 flex items-center gap-1.5", style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? t.ink : t.fog } }, h("span", { style: { width: 15, height: 15, borderRadius: 4, background: on ? t.ink : "transparent", border: "1px solid " + (on ? t.ink : t.line), color: t.bg2, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" } }, on ? "✓" : ""), label);
  const dash = { flex: 1, background: t.bg2, border: "1px dashed " + t.line, borderRadius: 12, padding: "9px 0", fontFamily: F_BODY, fontSize: 13, color: t.tint };
  const inp = { width: "100%", outline: "none", padding: "9px 11px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line };
  const node = (ev, isStart) => h("div", { key: ev ? ev.id : "start", className: "flex gap-3" },
    h("div", { style: { flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" } },
      h("div", { style: { width: 11, height: 11, borderRadius: 999, background: isStart ? t.accent : (ev.byCharacter ? "#c58f8f" : t.ink), marginTop: 4 } }),
      isStart ? null : h("div", { style: { flex: 1, width: 2, background: t.line, marginTop: 2 } })),
    h("div", { style: { flex: 1, paddingBottom: 18 } },
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, isStart ? "起点 · " + md(startDate) : md(ev.date)),
      isStart ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, marginTop: 2 } }, "和 " + partner.name + " 在一起") : h(Fragment, null,
        h("div", { className: "flex items-center gap-2", style: { marginTop: 2 } },
          ev.byCharacter ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: "#b06e6e", border: "1px solid #e3c3c3", borderRadius: 999, padding: "1px 7px" } }, "TA 的感慨") : null,
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, ev.title)),
        ev.content ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, lineHeight: 1.6, color: t.sub, marginTop: 3, whiteSpace: "pre-wrap" } }, ev.content) : null,
        h("button", { onClick: () => onRemove(ev.id), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4 } }, "删除"))));
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "我们的日子", en: "Our Days · " + partner.name, onBack,
      right: h("button", { onClick: () => onGen(partner), disabled: gen, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 18, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("div", { className: "flex gap-2", style: { margin: "8px 0 4px" } },
        h("button", { onClick: () => setAddMode(m => m === "mile" ? null : "mile"), className: "active:opacity-70", style: dash }, addMode === "mile" ? "收起" : "＋ 里程碑"),
        h("button", { onClick: () => setAddMode(m => m === "anniv" ? null : "anniv"), className: "active:opacity-70", style: dash }, addMode === "anniv" ? "收起" : "＋ 纪念日")),
      addMode === "mile" ? h("div", { className: "space-y-2", style: { marginTop: 8, marginBottom: 6 } },
        h("input", { type: "date", value: date, onChange: e => setDate(e.target.value), style: inp }),
        h("input", { value: title, onChange: e => setTitle(e.target.value), placeholder: "标题，如 第一次一起看海", style: inp }),
        h("textarea", { value: content, onChange: e => setContent(e.target.value), rows: 2, placeholder: "想记住的细节（选填）", style: Object.assign({}, inp, { resize: "none", lineHeight: 1.5 }) }),
        h("button", { onClick: submitMile, disabled: !date || !title.trim(), className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "8px 20px", borderRadius: 10 } }, "记下来")) : null,
      addMode === "anniv" ? h("div", { className: "space-y-2", style: { marginTop: 8, marginBottom: 6 } },
        h("input", { value: an, onChange: e => setAn(e.target.value), placeholder: "纪念日名称，如 在一起一周年", style: inp }),
        h("div", { className: "flex gap-2 items-center" },
          h("input", { type: "number", value: mo, onChange: e => setMo(e.target.value), placeholder: "月", className: "text-center", style: Object.assign({}, inp, { width: 56 }) }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "月"),
          h("input", { type: "number", value: dy, onChange: e => setDy(e.target.value), placeholder: "日", className: "text-center", style: Object.assign({}, inp, { width: 56 }) }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "日")),
        h("div", { className: "flex items-center gap-5", style: { paddingTop: 2 } }, toggle(yearly, setYearly, "每年重复"), toggle(link, setLink, "加进日历")),
        h("button", { onClick: submitAnn, disabled: !an.trim() || !mo || !dy, className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "8px 20px", borderRadius: 10 } }, "加")) : null,
      anns.length ? h(Eyebrow, { style: { marginTop: 16, marginBottom: 8 } }, "倒数中") : null,
      h("div", { className: "space-y-2.5", style: { marginBottom: anns.length ? 6 : 0 } },
        anns.map(a => { const info = annivInfo(a.month, a.day); return h("div", { key: a.id, className: "flex items-center gap-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "13px 15px" } },
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, a.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, info.y + "年" + a.month + "月" + a.day + "日" + (a.yearlyRepeat ? " · 每年" : ""))),
          h("div", { style: { textAlign: "right" } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, fontStyle: "italic", color: info.days === 0 ? t.accent : t.ink, lineHeight: 1 } }, info.days === 0 ? "今天" : info.days),
            info.days === 0 ? null : h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 2 } }, "天后")),
          h("button", { onClick: () => onRemoveAnniv(a.id), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 15, color: t.fog, paddingLeft: 4 } }, "×")); })),
      h(Eyebrow, { style: { marginTop: anns.length ? 16 : 10, marginBottom: 10 } }, "时光轴"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 10 } }, "右上角让 " + partner.name + " 写一条此刻的感慨。"),
      gen && h(Spinner, { label: partner.name + " 正在写…" }),
      h("div", null, mine.map(ev => node(ev, false)), startDate ? node(null, true) : null)));
}

// 情侣空间·纪念日倒计时：加/删，可选联动主页日历
function CoupleAnniv({ partner, list, onAdd, onRemove, onBack }) {
  const t = useTheme();
  const daysTo = (mo, dy) => { const now = new Date(); now.setHours(0, 0, 0, 0); const y = now.getFullYear(); let target = new Date(y, mo - 1, dy); target.setHours(0, 0, 0, 0); if (target < now) target = new Date(y + 1, mo - 1, dy); return Math.round((target - now) / 86400000); };
  const mine = (list || []).filter(a => a.characterId === partner.id).slice().sort((a, b) => daysTo(a.month, a.day) - daysTo(b.month, b.day));
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [mo, setMo] = useState("");
  const [dy, setDy] = useState("");
  const [yearly, setYearly] = useState(true);
  const [link, setLink] = useState(true);
  const submit = () => { if (name.trim() && mo && dy) { onAdd(partner, name, mo, dy, yearly, link); setName(""); setMo(""); setDy(""); setShowAdd(false); } };
  const toggle = (on, set, label) => h("button", { onClick: () => set(v => !v), className: "active:opacity-70 flex items-center gap-1.5", style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? t.ink : t.fog } }, h("span", { style: { width: 15, height: 15, borderRadius: 4, background: on ? t.ink : "transparent", border: "1px solid " + (on ? t.ink : t.line), color: t.bg2, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" } }, on ? "✓" : ""), label);
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "纪念日", en: "Anniversary · " + partner.name, onBack,
      right: h("button", { onClick: () => setShowAdd(v => !v), className: "active:opacity-50" }, h(IPlus, { size: 19, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      showAdd ? h("div", { className: "space-y-2", style: { marginTop: 6, marginBottom: 16 } },
        h("input", { value: name, onChange: e => setName(e.target.value), placeholder: "纪念日名称，如 在一起一周年", className: "w-full outline-none px-3 py-2.5 rounded-lg", style: { fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { className: "flex gap-2 items-center" },
          h("input", { type: "number", value: mo, onChange: e => setMo(e.target.value), placeholder: "月", className: "w-14 outline-none px-2 py-2 rounded-lg text-center", style: { fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "月"),
          h("input", { type: "number", value: dy, onChange: e => setDy(e.target.value), placeholder: "日", className: "w-14 outline-none px-2 py-2 rounded-lg text-center", style: { fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "日")),
        h("div", { className: "flex items-center gap-5", style: { paddingTop: 2 } }, toggle(yearly, setYearly, "每年重复"), toggle(link, setLink, "加进日历")),
        h("button", { onClick: submit, disabled: !name.trim() || !mo || !dy, className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "8px 20px", borderRadius: 10 } }, "加")) : null,
      mine.length === 0 && !showAdd ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, marginTop: 8 } }, "还没有纪念日，点右上角 ＋ 添加。") : null,
      h("div", { className: "space-y-3" },
        mine.map(a => { const d = daysTo(a.month, a.day); return h("div", { key: a.id, className: "flex items-center gap-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "14px 16px" } },
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, a.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, a.month + "月" + a.day + "日" + (a.yearlyRepeat ? " · 每年" : ""))),
          h("div", { style: { textAlign: "right" } },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, fontStyle: "italic", color: d === 0 ? t.accent : t.ink, lineHeight: 1 } }, d === 0 ? "今天" : d),
            d === 0 ? null : h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 2 } }, "天后")),
          h("button", { onClick: () => onRemove(a.id), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 15, color: t.fog, paddingLeft: 4 } }, "×")); }))));
}

// 情书信纸字体（iOS 系统中文字体，零成本；非 iOS 走 fallback）+ 纸张样式
const LETTER_FONTS = [
  { key: "auto", label: "🎲 智能 / 随机" },
  { key: "serif", label: "宋体信笺", css: "'Noto Serif SC','Songti SC',serif" },
  { key: "kai", label: "楷体手写", css: "'Kaiti SC','STKaiti','KaiTi',serif" },
  { key: "round", label: "圆体可爱", css: "'Yuanti SC','PingFang SC',sans-serif" },
  { key: "sans", label: "现代简洁", css: "'PingFang SC',system-ui,sans-serif" }
];
const letterFontCss = key => { const f = LETTER_FONTS.find(x => x.key === key && x.css); return f ? f.css : LETTER_FONTS[1].css; };
const LETTER_PAPERS = [
  { key: "cream", label: "米白", bg: "#faf6ee", ink: "#413a2e", line: "#ece2d0" },
  { key: "kraft", label: "牛皮", bg: "#e9ddc6", ink: "#4a3f2c", line: "#d6c7a8" },
  { key: "pink", label: "樱粉", bg: "#fdeef1", ink: "#5a3a44", line: "#f4d6de" },
  { key: "blue", label: "天蓝", bg: "#eef4fb", ink: "#33455a", line: "#d7e4f2" },
  { key: "mint", label: "薄荷", bg: "#eef7f0", ink: "#2f4a3a", line: "#d5ebda" }
];
const letterPaper = key => LETTER_PAPERS.find(p => p.key === key) || LETTER_PAPERS[0];

// 情书设置内容（放进 Sheet）：自动写 / 频率 / 信纸字体 / 纸张样式
function CoupleLetterSettings({ partner, cfg, onSave }) {
  const t = useTheme();
  const c = Object.assign({ auto: false, freqDays: 7, freqRandom: true, font: "auto", paper: "auto" }, cfg || {});
  const set = patch => onSave(partner.id, Object.assign({}, c, patch));
  return h("div", null,
    h(Eyebrow, { style: { marginBottom: 14 } }, "情书设置 · " + partner.name),
    h("div", { className: "flex items-center justify-between", style: { marginBottom: 16 } },
      h("div", null,
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "自动写情书"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2 } }, "开启后，进来时 TA 会不定期写（前台生效）")),
      h("button", { onClick: () => set({ auto: !c.auto }), className: "active:opacity-70", style: { width: 46, height: 27, borderRadius: 999, background: c.auto ? t.ink : t.line, position: "relative", flexShrink: 0 } },
        h("span", { style: { position: "absolute", top: 3, left: c.auto ? 22 : 3, width: 21, height: 21, borderRadius: 999, background: "#fff", transition: "left .2s" } }))),
    h("div", { style: { marginBottom: 16 } },
      h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 7 } }, "生成频率（天 / 篇）"),
      h("div", { className: "flex items-center gap-3" },
        h("input", { type: "number", value: c.freqDays, onChange: e => set({ freqDays: Math.max(1, +e.target.value || 7) }), className: "w-20 outline-none px-3 py-2 rounded-lg text-center", style: { fontFamily: F_BODY, fontSize: 14, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("button", { onClick: () => set({ freqRandom: !c.freqRandom }), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: c.freqRandom ? t.ink : t.fog } }, (c.freqRandom ? "✓ " : "○ ") + "随机波动"))),
    h("div", { style: { marginBottom: 16 } },
      h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 7 } }, "信纸字体"),
      h("div", { className: "flex gap-2 flex-wrap" },
        LETTER_FONTS.map(f => h("button", { key: f.key, onClick: () => set({ font: f.key }), className: "active:opacity-70", style: { padding: "6px 12px", borderRadius: 999, fontFamily: f.css || F_BODY, fontSize: 13, background: c.font === f.key ? t.ink : t.bg2, color: c.font === f.key ? t.bg2 : t.sub, border: "1px solid " + (c.font === f.key ? t.ink : t.line) } }, f.label)))),
    h("div", null,
      h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 7 } }, "纸张样式"),
      h("div", { className: "flex gap-3 flex-wrap" },
        h("button", { onClick: () => set({ paper: "auto" }), className: "active:opacity-80 flex flex-col items-center", style: { gap: 4 } },
          h("div", { style: { width: 40, height: 40, borderRadius: 10, background: "conic-gradient(#faf6ee,#e9ddc6,#fdeef1,#eef4fb,#eef7f0,#faf6ee)", border: c.paper === "auto" ? "2px solid " + t.ink : "1px solid " + t.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 } }, "🎲"),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: c.paper === "auto" ? t.ink : t.fog } }, "随机")),
        LETTER_PAPERS.map(pp => h("button", { key: pp.key, onClick: () => set({ paper: pp.key }), className: "active:opacity-80 flex flex-col items-center", style: { gap: 4 } },
          h("div", { style: { width: 40, height: 40, borderRadius: 10, background: pp.bg, border: c.paper === pp.key ? "2px solid " + t.ink : "1px solid " + t.line } }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: c.paper === pp.key ? t.ink : t.fog } }, pp.label))))));
}

// 情侣空间·情书：信封列表 + 我也能写(标「我写的」) + 信纸字体/纸张 + 信下双向回复(角色多气泡)
function CoupleLetters({ partner, letters, cfg, onGen, onAddMy, onReply, onRead, onRemove, onSaveCfg, gen, onBack }) {
  const t = useTheme();
  const mine = (letters || []).filter(l => l.characterId === partner.id);
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cBody, setCBody] = useState("");
  const [cPaper, setCPaper] = useState((cfg && cfg.paper && cfg.paper !== "auto") ? cfg.paper : "cream");
  const [cFont, setCFont] = useState((cfg && cfg.font && cfg.font !== "auto") ? cfg.font : "kai");
  const [reply, setReply] = useState("");
  // 自动写情书：进来时若开了自动、且距 TA 上封已超设定频率，就触发一次（前台生效）
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!cfg || !cfg.auto || gen) return;
    const freq = Math.max(1, cfg.freqDays || 7);
    const lastChar = mine.filter(l => l.authorId !== "user").sort((a, b) => b.createdAt - a.createdAt)[0];
    const days = lastChar ? (Date.now() - lastChar.createdAt) / 86400000 : 999;
    const threshold = cfg.freqRandom ? freq * (0.7 + Math.random() * 0.6) : freq;
    if (days >= threshold) onGen(partner);
    // eslint-disable-next-line
  }, []);
  const md = ts => { const d = new Date(ts); return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate(); };
  const threadText = l => ["【" + (l.title || "无题") + "】\n" + l.body].concat((l.replies || []).map(r => (r.authorId === "user" ? "我：" : partner.name + "：") + r.content)).join("\n");
  const doCompose = () => { if (cBody.trim()) { onAddMy(partner, cTitle, cBody, { paper: cPaper, font: cFont }); setCTitle(""); setCBody(""); setCompose(false); } };
  const mdParts = ts => { const d = new Date(ts); return { md: (d.getMonth() + 1) + "." + d.getDate(), y: d.getFullYear() }; };

  // —— 阅读一封信（信纸样式 + 信下回复串）——
  if (open) {
    const l = mine.find(x => x.id === open);
    if (l) {
      const pp = letterPaper(l.paper);
      const fc = letterFontCss(l.font);
      const mineL = l.authorId === "user";
      const send = () => { if (reply.trim() && !gen) { onReply(partner, l.id, reply.trim(), threadText(l)); setReply(""); } };
      return h("div", { className: "h-full flex flex-col", style: { background: pp.bg } },
        h(Head, { zh: "情书", en: mineL ? "我写的" : partner.name, onBack: () => { setOpen(null); setReply(""); } }),
        h("div", { className: "flex-1 overflow-y-auto px-7 py-5" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 23, color: pp.ink, lineHeight: 1.4 } }, l.title || "给你的信"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: pp.ink, opacity: 0.6, marginTop: 6, marginBottom: 18 } }, md(l.createdAt) + " · " + (mineL ? "我" : partner.name)),
          h("div", { style: { fontFamily: fc, fontSize: 15, lineHeight: "31px", color: pp.ink, whiteSpace: "pre-wrap", backgroundImage: "repeating-linear-gradient(transparent 0 30px," + pp.line + " 30px 31px)" } }, l.body),
          (l.replies || []).length ? h("div", { style: { borderTop: "1px solid " + pp.line, marginTop: 24, paddingTop: 18 } },
            (l.replies || []).map((r, i) => { const me = r.authorId === "user"; return h("div", { key: i, style: { marginBottom: 16 } },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: pp.ink, opacity: 0.5, marginBottom: 4 } }, me ? "我" : partner.name),
              h("div", { style: { fontFamily: fc, fontSize: 14.5, lineHeight: 1.95, color: pp.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", paddingLeft: me ? 14 : 0, borderLeft: me ? "2px solid " + pp.line : "none" } }, r.content)); })) : null,
          gen ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: pp.ink, opacity: 0.55, marginTop: 12 } }, partner.name + " 正在回信…") : null),
        h("div", { className: "shrink-0 px-4 py-3 flex items-center gap-2", style: { borderTop: "1px solid " + pp.line } },
          h("input", { value: reply, onChange: e => setReply(e.target.value), onKeyDown: e => { if (e.key === "Enter") send(); }, placeholder: "在信下回复…", style: { flex: 1, outline: "none", padding: "9px 12px", borderRadius: 999, fontFamily: F_BODY, fontSize: 13.5, background: "rgba(255,255,255,0.7)", color: pp.ink, border: "1px solid " + pp.line } }),
          h("button", { onClick: send, disabled: !reply.trim() || gen, className: "active:opacity-70 disabled:opacity-40", style: { background: pp.ink, color: pp.bg, fontFamily: F_DISPLAY, fontSize: 13.5, padding: "9px 16px", borderRadius: 999 } }, "回复")));
    }
  }

  // —— 信封卡片：真信封外观 + 中间蜡封，点蜡封开信 ——
  const envelope = l => {
    const mineL = l.authorId === "user";
    const unread = !l.isRead && !mineL;
    const bodyGrad = mineL ? "linear-gradient(135deg,#e9edfb,#dce4f6)" : "linear-gradient(135deg,#fbe6ed,#f6d0de)";
    const sealColor = mineL ? "#6f80c8" : "#d8547e";
    const inkC = mineL ? "#3a4270" : "#7a3a52";
    const subC = mineL ? "rgba(58,66,112,0.7)" : "rgba(122,58,82,0.72)";
    const doOpen = () => { if (!l.isRead) onRead(l.id); setOpen(l.id); };
    return h("div", { onClick: doOpen, className: "relative w-full active:opacity-95", style: { height: 122, borderRadius: 12, background: bodyGrad, boxShadow: "0 5px 16px rgba(180,140,160,0.2)", overflow: "hidden", cursor: "pointer" } },
      h("div", { style: { position: "absolute", top: 0, left: 0, right: 0, height: 68, background: "rgba(255,255,255,0.26)", clipPath: "polygon(0 0,100% 0,50% 100%)" } }),
      h("div", { style: { position: "absolute", top: 0, left: 0, bottom: 0, width: "50%", background: "rgba(0,0,0,0.03)", clipPath: "polygon(0 0,100% 50%,0 100%)" } }),
      h("div", { style: { position: "absolute", top: 0, right: 0, bottom: 0, width: "50%", background: "rgba(0,0,0,0.03)", clipPath: "polygon(100% 0,0 50%,100% 100%)" } }),
      h("div", { style: { position: "absolute", top: 34, left: "50%", transform: "translateX(-50%)", width: 46, height: 46, borderRadius: 999, background: "radial-gradient(circle at 35% 30%," + sealColor + "e6," + sealColor + ")", boxShadow: "0 3px 8px rgba(0,0,0,0.25),inset 0 1px 2px rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 } },
        h(IHeart, { size: 20, color: "rgba(255,255,255,0.92)", filled: true })),
      h("div", { style: { position: "absolute", left: 16, right: 16, bottom: 12, zIndex: 2 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: inkC, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l.title || "给你的信"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: subC, marginTop: 2 } }, (mineL ? "我写的" : partner.name + " 写的") + (unread ? " · 未读" : ""))),
      h("button", { onClick: e => { e.stopPropagation(); onRemove(l.id); }, className: "absolute active:opacity-60", style: { top: 7, right: 10, fontFamily: F_BODY, fontSize: 15, color: subC, zIndex: 3 } }, "×"),
      unread ? h("span", { className: "absolute", style: { top: 11, left: 12, width: 8, height: 8, borderRadius: 999, background: "#e0524a", zIndex: 3 } }) : null);
  };
  const sorted = mine.slice().sort((a, b) => b.createdAt - a.createdAt);
  const timelineRow = (l, i) => { const dp = mdParts(l.createdAt); return h("div", { key: l.id, className: "flex gap-3", style: { animation: "fadeUp .3s ease both" } },
    h("div", { style: { flexShrink: 0, width: 40, display: "flex", flexDirection: "column", alignItems: "center" } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink, lineHeight: 1, marginTop: 2 } }, dp.md),
      h("div", { style: { fontFamily: F_BODY, fontSize: 8.5, color: t.fog, marginTop: 2 } }, dp.y),
      h("div", { style: { width: 9, height: 9, borderRadius: 999, background: l.authorId === "user" ? "#6f80c8" : "#e0528a", marginTop: 6 } }),
      i < sorted.length - 1 ? h("div", { style: { flex: 1, width: 2, background: t.line, marginTop: 2 } }) : null),
    h("div", { style: { flex: 1, minWidth: 0, paddingBottom: 18 } }, envelope(l))); };

  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "我们的情书", en: "Letters", onBack,
      right: h("div", { className: "flex items-center gap-2" },
        h("button", { onClick: () => setCompose(true), className: "active:opacity-50" }, h(IPlus, { size: 19, color: t.ink })),
        h("button", { onClick: () => setCfgOpen(true), className: "active:opacity-50" }, h(GConfig, { size: 18, color: t.ink }))) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      h("button", { onClick: () => onGen(partner), disabled: gen, className: "w-full active:opacity-70 disabled:opacity-40", style: { margin: "8px 0 16px", background: t.bg2, border: "1px dashed " + t.line, borderRadius: 12, padding: "10px 0", fontFamily: F_BODY, fontSize: 13, color: t.tint } }, gen ? partner.name + " 提笔中…" : "求 " + partner.name + " 写一封（距上封 ≥ 3 天）"),
      mine.length === 0 && !gen ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "还没有情书。求 TA 写一封，或点右上角 ＋ 自己写一封给 TA。") : null,
      h("div", null, sorted.map(timelineRow))),
    compose && h(Sheet, { onClose: () => setCompose(false), tall: true }, (() => {
      const pp = letterPaper(cPaper); const fc = letterFontCss(cFont);
      return h(Fragment, null,
        h(Eyebrow, { style: { marginBottom: 12 } }, "写给 " + partner.name + " 的信"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 6 } }, "选纸张"),
        h("div", { className: "flex gap-2.5 flex-wrap", style: { marginBottom: 12 } },
          LETTER_PAPERS.map(p => h("button", { key: p.key, onClick: () => setCPaper(p.key), className: "active:opacity-80 flex flex-col items-center", style: { gap: 3 } },
            h("div", { style: { width: 30, height: 30, borderRadius: 8, background: p.bg, border: cPaper === p.key ? "2px solid " + t.ink : "1px solid " + t.line } }),
            h("span", { style: { fontFamily: F_BODY, fontSize: 9, color: cPaper === p.key ? t.ink : t.fog } }, p.label)))),
        h("div", { className: "flex gap-2 flex-wrap", style: { marginBottom: 14 } },
          LETTER_FONTS.filter(f => f.css).map(f => h("button", { key: f.key, onClick: () => setCFont(f.key), className: "active:opacity-70", style: { padding: "5px 11px", borderRadius: 999, fontFamily: f.css, fontSize: 12.5, background: cFont === f.key ? t.ink : t.bg2, color: cFont === f.key ? t.bg2 : t.sub, border: "1px solid " + (cFont === f.key ? t.ink : t.line) } }, f.label))),
        h("div", { style: { background: pp.bg, borderRadius: 14, padding: "18px 18px", boxShadow: "0 3px 14px rgba(0,0,0,0.09)" } },
          h("input", { value: cTitle, onChange: e => setCTitle(e.target.value), placeholder: "标题（选填）", style: { width: "100%", outline: "none", background: "transparent", fontFamily: F_DISPLAY, fontSize: 19, color: pp.ink, borderBottom: "1px solid " + pp.line, paddingBottom: 9, marginBottom: 12 } }),
          h("textarea", { value: cBody, onChange: e => setCBody(e.target.value), rows: 8, placeholder: "写下你想对 TA 说的话…（就在这张纸上写，效果所见即所得）", style: { width: "100%", outline: "none", resize: "none", background: "transparent", fontFamily: fc, fontSize: 15, lineHeight: 2, color: pp.ink } })),
        h("button", { onClick: doCompose, disabled: !cBody.trim(), className: "w-full active:opacity-70 disabled:opacity-40", style: { marginTop: 14, background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 15, padding: "12px 0", borderRadius: 12 } }, "寄给 TA（TA 会回信）"));
    })()),
    cfgOpen && h(Sheet, { onClose: () => setCfgOpen(false), tall: true },
      h(CoupleLetterSettings, { partner, cfg, onSave: onSaveCfg })));
}

function Us({ characters, couples, whispers, onBack, onInvite, onUnlink, onGenWhisper, onAddAnniversary, onSetSince, profile, coupleProfile, onSetCoupleImg, gen, coupleQA, onAnswerQA, onEditQA, onRemoveQA, onRerollQA, qaGen, coupleQATitle, onSaveQATitle, coupleQACustom, coupleNotes, onAddNote, onAddNoteReply, onRemoveNote, onGenNote, noteGen, coupleMood, onCheckinMood, moodGen, coupleTimeline, onAddTimeline, onRemoveTimeline, onGenTimeline, tlGen, coupleAnniv, onAddAnniv, onRemoveAnniv, coupleLetters, coupleLetterCfg, onGenLetter, onAddMyLetter, onReplyLetter, onReadLetter, onRemoveLetter, onSaveLetterCfg, letterGen, coupleSweet, onCheckinSweet, coupleSync, onSyncStart, onSyncSubmit, onSyncRemove, syncGen, coupleExDiary, onAddExDiary, onReadExDiary }) {
  const t = useTheme();
  const [view, setView] = useState(null); // null=名册 / charId=某段情侣详情
  const [sub, setSub] = useState(null); // 情侣空间子模块：null / 'qa'（后续加 timeline/mood/notes/letters）
  const [pick, setPick] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [annName, setAnnName] = useState("");
  const [annMo, setAnnMo] = useState("");
  const [annDay, setAnnDay] = useState("");
  const [sinceEdit, setSinceEdit] = useState(false);
  const [sinceVal, setSinceVal] = useState("");
  const [cpEdit, setCpEdit] = useState(false);
  const bgRef = useRef(null); const myAvRef = useRef(null); const chAvRef = useRef(null);
  const [unlinkChar, setUnlinkChar] = useState(null); // 待确认解除的角色
  const cp = couples || {};
  // 每段情侣「有没有你没看的东西」——用来在名册和功能格上点红点、指明是谁+哪个功能在提醒
  const noteSeen = (function () { try { return JSON.parse(localStorage.getItem("x_coupleNoteSeen") || "{}"); } catch (e) { return {}; } })();
  const unreadNotesFor = cid => (coupleNotes || []).some(n => n.characterId === cid && (n.authorId === cid || (n.replies || []).some(r => r.authorId === cid)) && !noteSeen[n.id]);
  const unreadLettersFor = cid => (coupleLetters || []).some(l => l.characterId === cid && !l.isRead);
  const unreadExDiaryFor = cid => (coupleExDiary || []).some(e => e.characterId === cid && e.author !== "user" && e.unread);
  const unreadTagsFor = cid => { const a = []; if (unreadNotesFor(cid)) a.push("悄悄话"); if (unreadLettersFor(cid)) a.push("情书"); if (unreadExDiaryFor(cid)) a.push("交换日记"); return a; };
  const entries = Object.keys(cp)
    .map(id => ({ char: characters.find(c => c.id === id), st: cp[id] }))
    .filter(e => e.char)
    .sort((a, b) => (b.st.status === "together" ? 1 : 0) - (a.st.status === "together" ? 1 : 0));
  const invitable = characters.filter(c => !cp[c.id]);
  const daysWith = since => since ? Math.max(1, Math.floor((Date.now() - since) / 86400000) + 1) : 1;

  const pickSheet = pick && h(Sheet, { onClose: () => setPick(false) },
    h(Eyebrow, { style: { marginBottom: 12 } }, "向谁发送情侣邀请"),
    invitable.length === 0
      ? h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, paddingBottom: 8 } }, "没有可邀请的对象了。")
      : h("div", { className: "space-y-1 max-h-72 overflow-y-auto" },
          invitable.map(c => h("button", { key: c.id, onClick: () => { setPick(false); onInvite(c); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
            h(Avatar, { character: c, size: 34, radius: 8 }),
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.name)))));

  // —— 单段情侣详情（仅 together 可进）——
  const partner = view ? characters.find(c => c.id === view) : null;
  // 情侣空间子模块：问答小本
  if (partner && cp[view] && cp[view].status === "together" && sub === "qa") {
    return h(CoupleQABook, { partner, bank: COUPLE_QA_BANK, customQ: (coupleQACustom || {})[partner.id] || [], entries: coupleQA, title: (coupleQATitle || {})[partner.id], onAnswer: onAnswerQA, onEdit: onEditQA, onRemove: onRemoveQA, onReroll: onRerollQA, onSaveTitle: onSaveQATitle, gen: qaGen, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：双向便签
  if (partner && cp[view] && cp[view].status === "together" && sub === "notes") {
    return h(CoupleNotes, { partner, notes: coupleNotes, onAdd: onAddNote, onAddReply: onAddNoteReply, onRemove: onRemoveNote, onGen: onGenNote, gen: noteGen, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：心情打卡
  if (partner && cp[view] && cp[view].status === "together" && sub === "mood") {
    const cpm = (coupleProfile || {})[partner.id] || {};
    const meM = cpm.myAvatar ? { name: (profile && profile.name) || "我", avatarImage: cpm.myAvatar } : { name: (profile && profile.name) || "我", avatarImage: profile && profile.avatarImage, color: (profile && profile.color) || t.accent };
    const paM = cpm.charAvatar ? { name: partner.name, avatarImage: cpm.charAvatar } : partner;
    return h(CoupleMood, { partner, me: meM, pa: paM, moods: coupleMood, onCheckin: onCheckinMood, gen: moodGen, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：我们的日子（时间轴 + 纪念日 二合一）
  if (partner && cp[view] && cp[view].status === "together" && (sub === "timeline" || sub === "anniv")) {
    return h(CoupleDays, { partner, since: cp[view].since, events: coupleTimeline, annivs: coupleAnniv, onAdd: onAddTimeline, onRemove: onRemoveTimeline, onGen: onGenTimeline, onAddAnniv: onAddAnniv, onRemoveAnniv: onRemoveAnniv, gen: tlGen, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：同频测试
  if (partner && cp[view] && cp[view].status === "together" && sub === "sync") {
    return h(CoupleSyncTest, { partner, records: coupleSync, onStart: onSyncStart, onSubmit: onSyncSubmit, onRemove: onSyncRemove, gen: syncGen, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：交换日记
  if (partner && cp[view] && cp[view].status === "together" && sub === "exdiary") {
    return h(CoupleExDiary, { partner, entries: coupleExDiary, onAdd: onAddExDiary, onRead: onReadExDiary, onBack: () => setSub(null) });
  }
  // 情侣空间子模块：情书
  if (partner && cp[view] && cp[view].status === "together" && sub === "letters") {
    return h(CoupleLetters, { partner, letters: coupleLetters, cfg: (coupleLetterCfg || {})[partner.id], onGen: onGenLetter, onAddMy: onAddMyLetter, onReply: onReplyLetter, onRead: onReadLetter, onRemove: onRemoveLetter, onSaveCfg: onSaveLetterCfg, gen: letterGen, onBack: () => setSub(null) });
  }
  if (partner && cp[view] && cp[view].status === "together") {
    const days = daysWith(cp[view].since);
    const cprof = (coupleProfile || {})[partner.id] || {};
    const sweet = (coupleSweet || {})[partner.id] || { value: 0, last: null };
    const todayK = (function () { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
    const sweetDone = sweet.last === todayK;
    const myChar = cprof.myAvatar ? { name: (profile && profile.name) || "我", avatarImage: cprof.myAvatar } : { name: (profile && profile.name) || "我", avatarImage: profile && profile.avatarImage, color: (profile && profile.color) || t.accent };
    const paChar = cprof.charAvatar ? { name: partner.name, avatarImage: cprof.charAvatar } : partner;
    // —— bento 拼贴素材：每格露一点自己的活内容（全本地算，零 API）——
    const bCid = partner.id;
    const bLetters = (coupleLetters || []).filter(l => l.characterId === bCid);
    const bUnread = bLetters.filter(l => !l.isRead).length;
    const bMood = (coupleMood || []).find(m => m.characterId === bCid && m.date === todayK);
    const bNote = (coupleNotes || []).filter(n => n.characterId === bCid)[0];
    const bQaN = (coupleQA || []).filter(e => e.characterId === bCid).length;
    const bSync = (coupleSync || []).filter(r => r.characterId === bCid && r.status === "done")[0];
    const bTlN = (coupleTimeline || []).filter(e => e.characterId === bCid).length;
    const bAnn = (coupleAnniv || []).filter(a => a.characterId === bCid).map(a => {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      let d = new Date(t0.getFullYear(), a.month - 1, a.day);
      if (d < t0) d = new Date(t0.getFullYear() + 1, a.month - 1, a.day);
      return { name: a.name, days: Math.round((d - t0) / 86400000) };
    }).sort((x, y) => x.days - y.days)[0];
    const bSyncTag = r => { const p = r.qs.length ? r.score / r.qs.length : 0; return p >= 1 ? "心有灵犀" : p >= 0.8 ? "同频共振" : p >= 0.6 ? "还算合拍" : p >= 0.4 ? "偶尔跑频" : "平行世界"; };
    const imgRow = (label, ref, field, has) => h("div", { className: "flex items-center justify-between", style: { marginBottom: 12 } },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, label),
      h("div", { className: "flex items-center gap-3" },
        has ? h("button", { onClick: () => onSetCoupleImg(partner.id, field, null), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "恢复默认") : null,
        h("button", { onClick: () => ref.current && ref.current.click(), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.tint } }, has ? "更换" : "上传")));
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "情侣空间", en: partner.name, onBack: () => setView(null),
        right: onSetCoupleImg ? h("button", { onClick: () => setCpEdit(true), className: "active:opacity-50", title: "自定义" }, h(IPencil, { size: 18, color: t.ink })) : null }),
      h("div", { className: "flex-1 overflow-y-auto pb-8" },
        h("div", { style: { position: "relative", height: 168, background: cprof.bg ? "center/cover no-repeat url(" + cprof.bg + ")" : "linear-gradient(135deg,#f3c6d3,#c8b0e0)" } },
          h("div", { style: { position: "absolute", left: 22, bottom: -28, display: "flex" } },
            h("div", { style: { borderRadius: 999, border: "3px solid " + t.bg, overflow: "hidden" } }, h(Avatar, { character: paChar, size: 66, radius: 999 })),
            h("div", { style: { marginLeft: -18, borderRadius: 999, border: "3px solid " + t.bg, overflow: "hidden" } }, h(Avatar, { character: myChar, size: 66, radius: 999 })))),
        h("div", { className: "px-6", style: { marginTop: 40 } },
          h("div", { className: "flex items-end justify-between" },
            h("div", { className: "min-w-0" },
              h("div", { className: "flex items-baseline gap-2" },
                h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "在一起"),
                h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 40, color: t.accent, lineHeight: 1 } }, days),
                h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.fog } }, "天")),
              h("div", { className: "flex items-center gap-2.5", style: { marginTop: 8 } },
                h("span", { className: "flex items-center gap-1", style: { background: "#ffe1ea", color: "#c02a52", borderRadius: 999, padding: "3px 12px" } },
                  h(IHeart, { size: 12, color: "#e0528a", filled: true }),
                  h("span", { style: { fontFamily: F_DISPLAY, fontSize: 13.5 } }, "甜蜜值 " + (Math.round((sweet.value || 0) * 10) / 10))),
                onSetSince ? h("button", { onClick: () => { const d = new Date(cp[view].since || Date.now()); setSinceVal(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")); setSinceEdit(v => !v); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11, color: t.tint } }, sinceEdit ? "收起" : "✎ 起始日") : null)),
            h("button", { onClick: () => onCheckinSweet(partner), disabled: sweetDone, className: "active:opacity-70 disabled:opacity-100", style: { background: sweetDone ? t.line : "#ffd0dc", color: sweetDone ? t.fog : "#c02a52", fontFamily: F_DISPLAY, fontSize: 14.5, padding: "9px 20px", borderRadius: 999, flexShrink: 0 } }, sweetDone ? "已打卡" : "❤️ 打卡")),
          sinceEdit ? h("div", { className: "flex items-center gap-2", style: { marginTop: 10 } },
            h("input", { type: "date", value: sinceVal, onChange: e => setSinceVal(e.target.value), className: "outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
            h("button", { onClick: () => { if (sinceVal) { onSetSince(partner.id, sinceVal); setSinceEdit(false); } }, className: "active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 13.5, padding: "8px 18px", borderRadius: 10 } }, "保存"),
            h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "第几天 / 时间轴起点跟着变")) : null,
          // —— bento 拼贴入口：不同形状大小，每格露一点活内容 ——
          (() => {
            const tile = (k, o) => h("button", { key: k, onClick: () => setSub(k), className: "active:opacity-70", style: { position: "relative", textAlign: "left", gridColumn: "span " + (o.w || 2), gridRow: o.tall ? "span 2" : undefined, background: o.bg, border: "1px solid " + o.bd, borderRadius: 18, padding: "11px 13px", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden", minHeight: 0, minWidth: 0 } },
              o.dot ? h("span", { style: { position: "absolute", top: 9, right: 11, width: 7, height: 7, borderRadius: 999, background: "#e0524a" } }) : null,
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: o.ink, flexShrink: 0 } }, o.e + " " + o.zh),
              o.body);
            const sub2 = (txt, c) => h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: c, marginTop: 2 } }, txt);
            return h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridAutoRows: 72, gap: 10, marginTop: 20 } },
              // 我们的日子（2x2 大格）：最近的纪念日倒计时
              tile("timeline", { w: 2, tall: true, e: "📅", zh: "我们的日子", bg: "linear-gradient(150deg,#fdeef2,#f6e0ec)", bd: "#f0d2de", ink: "#b0708a",
                body: h("div", null,
                  bAnn ? h(Fragment, null,
                    h("div", { className: "flex items-baseline gap-1" },
                      h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 34, lineHeight: 1, color: "#c65a7e" } }, bAnn.days === 0 ? "今天" : bAnn.days),
                      bAnn.days > 0 ? h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: "#b0708a" } }, "天") : null),
                    sub2("距「" + bAnn.name + "」", "#b0708a"))
                  : h(Fragment, null,
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: "#c65a7e", lineHeight: 1.3 } }, bTlN ? "记了 " + bTlN + " 个瞬间" : "从这里开始"),
                    sub2("时间轴 · 纪念日", "#b0708a"))) }),
              // 情书（2x1）
              tile("letters", { e: "💌", zh: "情书", bg: "#fdf6ec", bd: "#eee0c6", ink: "#b08d52", dot: bUnread > 0,
                body: h("div", null,
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: "#a5793a", lineHeight: 1.2 } }, bLetters.length ? bLetters.length + " 封" : "写给彼此"),
                  bUnread ? sub2(bUnread + " 封没拆", "#c65a4a") : null) }),
              // 心情日历（2x1）：今天俩人的心情脸
              tile("mood", { e: "🗓️", zh: "心情日历", bg: "#eef4fc", bd: "#d6e2f0", ink: "#6d88ad",
                body: bMood ? h("div", { className: "flex items-center gap-1.5" },
                    bMood.myMood ? h(MoodGlyph, { mood: bMood.myMood, size: 26 }) : null,
                    bMood.charMood ? h(MoodGlyph, { mood: bMood.charMood, size: 26 }) : null,
                    !bMood.charMood ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: "#6d88ad" } }, "等 TA…") : null)
                  : h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: "#5b7fb0" } }, "今天还没打卡") }),
              // 便签墙（4x1 长条）：最新一张
              tile("notes", { w: 4, e: "📝", zh: "便签墙", bg: "#f3f0fa", bd: "#ded7ee", ink: "#8a7ab0", dot: unreadNotesFor(bCid),
                body: h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: "#6f5f9a", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                  bNote ? (bNote.authorId === "user" ? "我：" : partner.name + "：") + String((bNote.replies || []).length ? bNote.replies[bNote.replies.length - 1].content : bNote.content).replace(/\s+/g, " ") : "贴一张只有你俩看的悄悄话") }),
              // 问答小本（2x1）
              tile("qa", { e: "📖", zh: "问答小本", bg: "#eef6ef", bd: "#d4e6d8", ink: "#6a9a74",
                body: h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: "#4f8a5e", lineHeight: 1.2 } }, bQaN ? "已答 " + bQaN + " 题" : "关于我们") }),
              // 同频测试（2x1）
              tile("sync", { e: "🎯", zh: "同频测试", bg: "#eef2f8", bd: "#d3ddec", ink: "#6d80a8",
                body: h("div", null,
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: "#5b73a3", lineHeight: 1.2 } }, bSync ? bSync.score + "/" + bSync.qs.length + " " + bSyncTag(bSync) : "TA 有多懂你"),
                  bSync ? sub2("上一局", "#6d80a8") : null) }),
              // 交换日记（2x1）
              (() => {
                const ex = (coupleExDiary || []).filter(e => e.characterId === bCid);
                const last = ex[0];
                const waiting = ex.some(e => e.author === "user" && !e.replied);
                return tile("exdiary", { e: "📔", zh: "交换日记", bg: "#fdf2ec", bd: "#eeddd0", ink: "#b08a66",
                  dot: unreadExDiaryFor(bCid),
                  body: h("div", null,
                    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: "#a5793a", lineHeight: 1.25 } }, !ex.length ? "写下第一页" : waiting ? "本子在 TA 那边" : last.author !== "user" ? "TA 回了一页" : "共 " + ex.length + " 页"),
                    ex.length ? sub2("你一页 我一页", "#b08a66") : null) });
              })());
          })(),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, textAlign: "center", marginTop: 14 } }, "只属于你俩的私密层。"))),
      cpEdit && h(Sheet, { onClose: () => setCpEdit(false), tall: true },
        h(Eyebrow, { style: { marginBottom: 16 } }, "自定义情侣空间"),
        imgRow("背景图", bgRef, "bg", !!cprof.bg),
        imgRow("我的头像", myAvRef, "myAvatar", !!cprof.myAvatar),
        imgRow("TA 的头像", chAvRef, "charAvatar", !!cprof.charAvatar),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4, lineHeight: 1.6 } }, "这里的头像只用于情侣空间，不影响角色原本的头像。图片会自动压缩。"),
        h("input", { ref: bgRef, type: "file", accept: "image/*", onChange: e => { const f = e.target.files && e.target.files[0]; if (f) onSetCoupleImg(partner.id, "bg", f); e.target.value = ""; }, style: { display: "none" } }),
        h("input", { ref: myAvRef, type: "file", accept: "image/*", onChange: e => { const f = e.target.files && e.target.files[0]; if (f) onSetCoupleImg(partner.id, "myAvatar", f); e.target.value = ""; }, style: { display: "none" } }),
        h("input", { ref: chAvRef, type: "file", accept: "image/*", onChange: e => { const f = e.target.files && e.target.files[0]; if (f) onSetCoupleImg(partner.id, "charAvatar", f); e.target.value = ""; }, style: { display: "none" } })),
      pickSheet);
  }

  // —— 名册视图（默认）——
  return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "情侣", en: "Us / Couple", onBack: onBack,
      right: characters.length > 0 && h("button", { onClick: () => setPick(true), className: "active:opacity-50" }, h(IHeart, { size: 19, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-8" },
      entries.length === 0
        ? h("div", { className: "pt-8" },
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.8, color: t.fog } }, "还没有情侣关系。点右上角 ♥ 选一位角色发送邀请——邀请会出现在你和 TA 的聊天里，TA 会依据关系与好感决定接不接受。"),
            characters.length > 0 && h("button", { onClick: () => setPick(true), className: "mt-4 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, borderBottom: "1.5px solid " + t.ink, paddingBottom: 2 } }, "♥ 发送情侣邀请"))
        : h(Fragment, null,
            h("div", { className: "pt-2 mb-3" }, h(Eyebrow, null, entries.length + " 段关系")),
            entries.map(e => {
              const tog = e.st.status === "together";
              const meChar = { name: (profile && profile.name) || "我", avatarImage: profile && profile.avatarImage, color: (profile && profile.color) || t.accent };
              const tags = tog ? unreadTagsFor(e.char.id) : [];
              return h("div", { key: e.char.id, className: "relative mb-3", style: { background: t.bg2, border: "1px solid " + (tags.length ? "#ee8aa2" : t.line), borderRadius: 20, padding: "20px 16px 18px", opacity: tog ? 1 : 0.75 } },
                tags.length ? h("span", { style: { position: "absolute", top: 12, left: 14, width: 9, height: 9, borderRadius: 999, background: "#e0524a" } }) : null,
                tog && onUnlink ? h("button", { onClick: ev => { ev.stopPropagation(); setUnlinkChar(e.char); }, className: "active:opacity-60", style: { position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 999, background: t.bg, border: "1px solid " + t.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 } }, "💔") : null,
                h("button", { onClick: () => tog && setView(e.char.id), className: "w-full active:opacity-80" },
                  h("div", { className: "flex items-center justify-center gap-3" },
                    h("div", { style: { borderRadius: 999, overflow: "hidden", border: "2px solid #f4c6d4" } }, h(Avatar, { character: meChar, size: 58, radius: 999 })),
                    h(IHeart, { size: 26, color: tog ? "#ee6a8a" : t.line, filled: true }),
                    h("div", { style: { borderRadius: 999, overflow: "hidden", border: "2px solid #f4c6d4" } }, h(Avatar, { character: e.char, size: 58, radius: 999 }))),
                  h("div", { style: { textAlign: "center", marginTop: 12, fontFamily: F_DISPLAY, fontSize: 16, color: tog ? "#d16a86" : t.fog } }, tog ? "与 " + e.char.name + " 恋爱中 · " + daysWith(e.st.since) + " 天" : "与 " + e.char.name + " · 邀请待回应…"),
                  tags.length ? h("div", { style: { textAlign: "center", marginTop: 5 } },
                    h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: "#c02a52", background: "#ffe1ea", borderRadius: 999, padding: "2px 11px" } }, "有新的" + tags.join("、") + " · 点进去看")) : null));
            }))),
    unlinkChar && onUnlink ? h(Sheet, { onClose: () => setUnlinkChar(null) },
      h(Eyebrow, { style: { marginBottom: 10 } }, "解除和 " + unlinkChar.name + " 的情侣关系"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.7, color: t.fog, marginBottom: 14 } }, "情侣空间的记录会全部保留（复合后还在）。解除会降低好感，且至少一周后、好感回到一定程度，TA 才可能同意复合。你想怎么解除？"),
      h("button", { onClick: () => { onUnlink(unlinkChar, "sudden"); setUnlinkChar(null); }, className: "w-full text-left active:opacity-70", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "13px 15px", marginBottom: 10 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "直接解除"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2 } }, "毫无预兆 · TA 会错愕地主动问你 · 好感 −5")),
      h("button", { onClick: () => { onUnlink(unlinkChar, "fight"); setUnlinkChar(null); }, className: "w-full text-left active:opacity-70", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "13px 15px", marginBottom: 10 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "带着情绪解除"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2 } }, "吵架 / 闹别扭时 · 按近期聊天+人设+心情扣 5~10 好感 · TA 会有情绪地回应")),
      h("button", { onClick: () => setUnlinkChar(null), className: "w-full active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, padding: "8px 0" } }, "算了，不解除")) : null,
    pickSheet);
}

// ============================================================
// CONFIG
// ============================================================
// 一起听（展示型）：自定义唱片封面 + 添加"正在听"的歌（歌名/歌手/封面）+ 歌单，不真放声音
function ListenTogether({ listen, characters, onBack, onSetDisc, onSetCover, onAddNetease, onAddLocal, onPlaySong, onRemoveSong, onSetPartner, apiBase, onSetApiBase, cookie, onSetCookie, onTestLogin, onAddNeteaseResult, onPlayResult, onAddResultToPlaylist, onCreatePlaylist, onDeletePlaylist, onRenamePlaylist, onAddToPlaylist, onRemoveFromPlaylist, onRenameSong, onGenCharPlaylist, onSetAutoComment, player, onTogglePlay, onStep, onSeek, onToggleFav, playMode, onCyclePlayMode, gen, genCharPl }) {
  const t = useTheme();
  const data = listen || {};
  const songs = data.songs || [];
  const playlists = data.playlists || [];
  const partner = (characters || []).find(c => c.id === data.partnerId) || null;
  // 当前歌可能在「全部」库 / 某歌单 / 临时播放的搜索结果(nowSong) 里 → 都能找到，别只在 songs 里找（否则会卡在 songs[0]）
  const resolveSong = id => {
    if (!id) return null;
    if (id === KEEPALIVE_ID) return KEEPALIVE_SONG;
    if (data.nowSong && data.nowSong.id === id) return data.nowSong;
    let s = songs.find(x => x.id === id); if (s) return s;
    for (const pl of playlists) { const f = (pl.songs || []).find(x => x.id === id); if (f) return f; }
    return null;
  };
  const nowId = (player && player.songId) || (songs[0] && songs[0].id) || null;
  const now = resolveSong(nowId) || songs[0] || null;
  const nowQueue = (data.nowQueue && data.nowQueue.length ? data.nowQueue : songs.map(s => s.id)).map(resolveSong).filter(Boolean);
  const idx = nowQueue.findIndex(s => s.id === nowId);
  const nowCover = (now && now.cover) || null;
  const discImg = data.disc || null;
  const playing = !!(player && player.playing);
  const dur = (player && player.dur) || 0, cur = (player && player.t) || 0;
  const frac = dur ? cur / dur : 0;
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const [nav, setNav] = useState(now ? "play" : "home"); // home | play | mine 底部三 tab
  const [addTab, setAddTab] = useState(apiBase ? "search" : "netease"); // search | netease | local
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [localFile, setLocalFile] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [apiEdit, setApiEdit] = useState(false);
  const [apiInput, setApiInput] = useState(apiBase || "");
  const [ckEdit, setCkEdit] = useState(false);
  const [ckInput, setCkInput] = useState(cookie || "");
  const [openPl, setOpenPl] = useState(null); // 展开的歌单 id
  const [plName, setPlName] = useState("");
  const [plCharPick, setPlCharPick] = useState(false); // 选角色生成歌单
  const [pickFor, setPickFor] = useState(null); // 待"加到歌单"的歌：{song, kind:'lib'|'result'}
  const [renameId, setRenameId] = useState(null); // 正在改名的歌 id
  const [renameText, setRenameText] = useState("");
  const [showQueue, setShowQueue] = useState(false); // 播放页展开当前队列
  const audioFileRef = useRef(null);
  const coverRef = useRef(null);

  const doSearch = async () => {
    if (!apiBase || !q.trim()) return;
    setSearching(true); setResults(null);
    try {
      const r = await fetch(apiBase + "/search?keywords=" + encodeURIComponent(q.trim()) + "&limit=18");
      const d = await r.json();
      const list = (d && d.result && d.result.songs) || [];
      setResults(list.map(s => ({ id: s.id, name: s.name, artist: ((s.artists || s.ar || []).map(a => a.name).filter(Boolean).join(" / ")), cover: (s.album || s.al || {}).picUrl || null })));
    } catch (e) { setResults([]); }
    finally { setSearching(false); }
  };
  const addNet = () => { if (link.trim()) { onAddNetease(link, title, artist); setLink(""); setTitle(""); setArtist(""); } };
  const addLoc = () => { if (localFile) { onAddLocal(localFile, title, artist); setLocalFile(null); setTitle(""); setArtist(""); } };
  const field = { fontFamily: F_BODY, fontSize: 13.5, background: t.bg, color: t.ink, border: "1px solid " + t.line, borderRadius: 8, padding: "9px 11px", width: "100%", outline: "none" };
  const tabBtn = (k, label) => h("button", { onClick: () => setAddTab(k), className: "flex-1 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, borderRadius: 8, background: addTab === k ? t.ink : t.bg, color: addTab === k ? t.bg2 : t.fog, border: "1px solid " + (addTab === k ? t.ink : t.line) } }, label);
  const ic = (kind, c, size) => { size = size || 22;
    const svg = (children, o) => h("svg", Object.assign({ width: size, height: size, viewBox: "0 0 24 24" }, o), children);
    const stroke = { fill: "none", stroke: c, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
    if (kind === "play") return svg(h("path", { d: "M8 5v14l11-7z", fill: c }));
    if (kind === "pause") return svg([h("rect", { key: 1, x: 6, y: 5, width: 4, height: 14, rx: 1, fill: c }), h("rect", { key: 2, x: 14, y: 5, width: 4, height: 14, rx: 1, fill: c })]);
    if (kind === "prev") return svg([h("rect", { key: 1, x: 6, y: 5, width: 2.4, height: 14, rx: 1, fill: c }), h("path", { key: 2, d: "M19 5v14l-10-7z", fill: c })]);
    if (kind === "next") return svg([h("path", { key: 1, d: "M5 5v14l10-7z", fill: c }), h("rect", { key: 2, x: 15.6, y: 5, width: 2.4, height: 14, rx: 1, fill: c })]);
    // 列表循环
    if (kind === "repeat") return svg([h("path", { key: 1, d: "M17 2l3 3-3 3", ...stroke }), h("path", { key: 2, d: "M20 5H8a4 4 0 0 0-4 4v1", ...stroke }), h("path", { key: 3, d: "M7 22l-3-3 3-3", ...stroke }), h("path", { key: 4, d: "M4 19h12a4 4 0 0 0 4-4v-1", ...stroke })]);
    // 单曲循环（循环+中间数字1）
    if (kind === "repeatone") return svg([h("path", { key: 1, d: "M17 2l3 3-3 3", ...stroke }), h("path", { key: 2, d: "M20 5H8a4 4 0 0 0-4 4v1", ...stroke }), h("path", { key: 3, d: "M7 22l-3-3 3-3", ...stroke }), h("path", { key: 4, d: "M4 19h12a4 4 0 0 0 4-4v-1", ...stroke }), h("text", { key: 5, x: 12, y: 15.5, fill: c, fontSize: 8, fontWeight: 700, textAnchor: "middle", fontFamily: "system-ui" }, "1")]);
    // 随机
    if (kind === "shuffle") return svg([h("path", { key: 1, d: "M16 3h5v5", ...stroke }), h("path", { key: 2, d: "M4 20L21 3", ...stroke }), h("path", { key: 3, d: "M21 16v5h-5", ...stroke }), h("path", { key: 4, d: "M15 15l6 6", ...stroke }), h("path", { key: 5, d: "M4 4l5 5", ...stroke })]);
    // 队列/列表
    if (kind === "list") return svg([h("path", { key: 1, d: "M4 6h11M4 12h11M4 18h7", ...stroke }), h("path", { key: 2, d: "M18 15l3 3-3 3", ...stroke, strokeWidth: 1.7 })]);
    // 云（网易云来源）
    if (kind === "cloud") return svg(h("path", { d: "M7 18h10a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8 9.5 4 4 0 0 0 7 18z", ...stroke }));
    // 音符（本地来源）
    if (kind === "note") return svg([h("path", { key: 1, d: "M9 18V6l10-2v12", ...stroke }), h("circle", { key: 2, cx: 6.5, cy: 18, r: 2.5, fill: c }), h("circle", { key: 3, cx: 16.5, cy: 16, r: 2.5, fill: c })]);
    // 搜索
    if (kind === "search") return svg([h("circle", { key: 1, cx: 11, cy: 11, r: 7, ...stroke }), h("path", { key: 2, d: "M20 20l-4-4", ...stroke })]);
    // 上传
    if (kind === "upload") return svg([h("path", { key: 1, d: "M12 16V4", ...stroke }), h("path", { key: 2, d: "M7 9l5-5 5 5", ...stroke }), h("path", { key: 3, d: "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2", ...stroke })]);
    if (kind === "close") return svg([h("path", { key: 1, d: "M6 6l12 12", ...stroke }), h("path", { key: 2, d: "M18 6L6 18", ...stroke })]);
    if (kind === "heart") return svg(h("path", { d: "M12 21s-7-4.35-9.5-8.5C1 9 3 5.5 6.5 5.5c2 0 3.2 1.2 5.5 3.5 2.3-2.3 3.5-3.5 5.5-3.5C21 5.5 23 9 21.5 12.5 19 16.65 12 21 12 21z", fill: c === "solid" ? "#e0576b" : "none", stroke: c === "solid" ? "#e0576b" : c, strokeWidth: 1.7 }));
    return svg(h("circle", { cx: 12, cy: 12, r: 8, fill: c }));
  };
  const cbtn = (child, onClick, o) => h("button", { onClick: onClick, className: "active:opacity-60 flex items-center justify-center shrink-0", style: Object.assign({ borderRadius: 999, background: (o && o.bg) || "transparent", width: (o && o.size) || 46, height: (o && o.size) || 46 }, o && o.style) }, child);
  // 歌曲行（列表用）。opts: {queue, inPlaylist(plId), canRename}
  const songRow = (s, opts) => { opts = opts || {}; const editing = renameId === s.id;
    return h("div", { key: s.id, className: "flex items-center gap-1.5", style: { background: s.id === nowId ? (t.accent || "#8a6d3b") + "14" : t.bg2, border: "1px solid " + (s.id === nowId ? (t.accent || "#8a6d3b") : t.line), borderRadius: 14, padding: "8px 10px" } },
      editing
        ? h("input", { value: renameText, onChange: e => setRenameText(e.target.value), onKeyDown: e => { if (e.key === "Enter") { onRenameSong(s.id, renameText); setRenameId(null); } }, style: Object.assign({ flex: 1, minWidth: 0 }, field) })
        : h("button", { onClick: () => onPlaySong(s.id, opts.queue), className: "flex items-center gap-3 flex-1 min-w-0 active:opacity-70", style: { textAlign: "left" } },
            h("div", { style: { flexShrink: 0, width: 42, height: 42, borderRadius: 8, background: s.cover ? "center/cover no-repeat url(" + s.cover + ")" : "linear-gradient(135deg,#cfc9bd,#a8a294)", display: "flex", alignItems: "center", justifyContent: "center" } }, s.cover ? null : ic(s.source === "netease" ? "cloud" : "note", "rgba(255,255,255,0.92)", 18)),
            h("div", { className: "flex-1 min-w-0" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, (s.id === nowId && playing ? "▶ " : "") + s.title),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.artist || (s.source === "netease" ? "网易云" : "本地")))),
      editing
        ? h("button", { onClick: () => { onRenameSong(s.id, renameText); setRenameId(null); }, className: "shrink-0 active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 12, padding: "6px 12px", borderRadius: 8 } }, "存")
        : null,
      !editing && opts.canRename ? h("button", { onClick: () => { setRenameId(s.id); setRenameText(s.title); }, className: "shrink-0 active:opacity-60", style: { fontSize: 12.5, color: t.fog, padding: "0 2px" } }, "✎") : null,
      !editing ? h("button", { onClick: () => setPickFor({ song: s }), className: "shrink-0 active:opacity-60", style: { fontSize: 17, color: t.fog, padding: "0 2px" } }, "＋") : null,
      !editing ? h("button", { onClick: () => onToggleFav(s.id), className: "shrink-0 active:opacity-60", style: { fontSize: 15, color: s.fav ? "#e0576b" : t.fog, padding: "0 2px" } }, s.fav ? "♥" : "♡") : null,
      !editing ? h("button", { onClick: () => opts.inPlaylist ? onRemoveFromPlaylist(opts.inPlaylist, s.id) : onRemoveSong(s.id), className: "shrink-0 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 15, color: t.fog, padding: "0 2px" } }, "×") : null); };
  // "加到歌单"选择层：从搜索结果 / 全部 / 歌单里点＋后弹出
  const addSong = (plId, isNew) => { const it = pickFor; if (!it) return; let id = plId; if (isNew) id = onCreatePlaylist("新歌单 " + ((playlists.length || 0) + 1), []); if (it.isResult) onAddResultToPlaylist(id, it.song); else onAddToPlaylist(id, it.song); setPickFor(null); };
  const pickerOverlay = pickFor ? h("div", { onClick: () => setPickFor(null), style: { position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end" } },
    h("div", { onClick: e => e.stopPropagation(), style: { width: "100%", background: t.bg, borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", maxHeight: "70%", overflowY: "auto" } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, marginBottom: 3 } }, "加到歌单"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "《" + (pickFor.song.title || pickFor.song.name || "") + "》"),
      h("button", { onClick: () => addSong(null, true), className: "w-full text-left active:opacity-70", style: { padding: "11px 6px", borderBottom: "1px solid " + t.line, fontFamily: F_BODY, fontSize: 14, color: t.tint } }, "＋ 新建一个歌单"),
      playlists.length ? playlists.map(pl => h("button", { key: pl.id, onClick: () => addSong(pl.id), className: "w-full flex items-center justify-between text-left active:opacity-70", style: { padding: "11px 6px", borderBottom: "1px solid " + t.line } },
        h("span", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, pl.name),
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, (pl.songs || []).length + " 首")))
        : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "10px 6px" } }, "还没有歌单，点上面新建一个"))) : null;

  // ============ 播放 tab ============
  const playTab = now ? h("div", { className: "flex flex-col items-center px-6 pb-6" },
    h("button", { onClick: () => coverRef.current && coverRef.current.click(), className: "active:opacity-90 relative", style: { width: 232, height: 232, borderRadius: 999, marginTop: 14, background: "radial-gradient(circle at 50% 50%, #2b2b30 0 61%, #17171b 62%)", boxShadow: "0 16px 44px rgba(0,0,0,0.34)", display: "flex", alignItems: "center", justifyContent: "center", animation: playing ? "wk-spin 9s linear infinite" : "none" } },
      h("div", { style: { width: 148, height: 148, borderRadius: 999, background: nowCover ? "center/cover no-repeat url(" + nowCover + ")" : discImg ? "center/cover no-repeat url(" + discImg + ")" : "linear-gradient(135deg,#e8b6c8,#f0d9a8)", boxShadow: "inset 0 0 0 5px rgba(0,0,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center" } },
        h("div", { style: { width: 18, height: 18, borderRadius: 999, background: t.bg, border: "3px solid rgba(0,0,0,0.35)" } }))),
    h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 8 } }, "点唱片换封面"),
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 24, color: t.ink, marginTop: 12, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, now.title),
    h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.fog, marginTop: 5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, now.artist || (now.source === "netease" ? "网易云" : "本地")),
    h("div", { className: "flex items-center justify-center gap-4", style: { marginTop: 14 } },
      cbtn(h("span", { style: { fontSize: 20, color: now.fav ? "#e0576b" : t.fog } }, now.fav ? "♥" : "♡"), () => onToggleFav(now.id), { bg: t.bg2 })),
    h("div", { className: "w-full", style: { maxWidth: 320 } },
      h("input", { type: "range", min: 0, max: 1000, value: Math.round(frac * 1000), onChange: e => onSeek(Number(e.target.value) / 1000), style: { width: "100%", marginTop: 14 } }),
      h("div", { className: "flex items-center justify-between" },
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, fmt(cur)),
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, dur ? fmt(dur) : "--:--"))),
    player && player.err ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.accent, marginTop: 2, textAlign: "center" } }, player.err) : null,
    h("div", { className: "flex items-center justify-center gap-3", style: { marginTop: 8 } },
      // 后退键左边：播放模式（列表循环 / 单曲循环 / 随机）
      cbtn(ic(({ order: "repeat", one: "repeatone", shuffle: "shuffle" })[playMode || "order"], (playMode && playMode !== "order") ? (t.accent || "#8a6d3b") : t.ink, 20), onCyclePlayMode, { size: 44, style: { background: (playMode && playMode !== "order") ? (t.accent || "#8a6d3b") + "22" : "transparent" } }),
      cbtn(ic("prev", t.ink, 24), () => onStep(-1), { size: 50 }),
      cbtn(player && player.loading ? h("span", { style: { color: t.bg2, fontSize: 13 } }, "…") : playing ? ic("pause", t.bg2, 30) : ic("play", t.bg2, 30), onTogglePlay, { bg: t.ink, size: 70 }),
      cbtn(ic("next", t.ink, 24), () => onStep(1), { size: 50 }),
      // 前进键右边：当前队列/歌单顺序
      cbtn(ic("list", showQueue ? (t.accent || "#8a6d3b") : t.ink, 20), () => setShowQueue(v => !v), { size: 44, style: { background: showQueue ? (t.accent || "#8a6d3b") + "22" : "transparent" } })),
    h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 6 } }, ({ order: "列表循环", one: "单曲循环", shuffle: "随机播放" })[playMode || "order"]),
    // 当前队列（展开）
    showQueue ? h("div", { className: "w-full", style: { marginTop: 14 } },
      h(Eyebrow, { style: { marginBottom: 8 } }, "当前队列 · " + nowQueue.length),
      h("div", { className: "space-y-1", style: { maxHeight: "34vh", overflowY: "auto" } }, nowQueue.map((s, i) => h("button", { key: s.id + "_" + i, onClick: () => onPlaySong(s.id, nowQueue.map(x => x.id)), className: "w-full flex items-center gap-2.5 active:opacity-70", style: { textAlign: "left", padding: "6px 8px", borderRadius: 10, background: s.id === nowId ? (t.accent || "#8a6d3b") + "14" : "transparent" } },
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: s.id === nowId ? (t.accent || "#8a6d3b") : t.fog, width: 18, flexShrink: 0, textAlign: "center" } }, s.id === nowId && playing ? "▶" : String(i + 1)),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: s.id === nowId ? t.ink : t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.title),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.artist || "")))))) : null,
    // 和谁听（可不选 = 自己听）
    h("div", { className: "flex items-center gap-2", style: { marginTop: 22, width: "100%", overflowX: "auto" } },
      h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, flexShrink: 0 } }, "和谁听："),
      h("button", { onClick: () => onSetPartner(null), className: "active:opacity-70", style: { flexShrink: 0, fontFamily: F_BODY, fontSize: 12, color: !partner ? t.ink : t.fog, border: "1px solid " + (!partner ? t.ink : t.line), borderRadius: 999, padding: "5px 12px" } }, "自己听"),
      (characters || []).map(c => { const on = data.partnerId === c.id; return h("button", { key: c.id, onClick: () => onSetPartner(on ? null : c.id), className: "active:opacity-70", style: { flexShrink: 0, opacity: on ? 1 : 0.5, border: on ? "2px solid " + (t.accent || "#8a6d3b") : "2px solid transparent", borderRadius: 999, padding: 1 } }, h(Avatar, { character: c, size: 30, radius: 999 })); })),
    partner ? h("div", { className: "flex items-center justify-between w-full", style: { marginTop: 14, background: t.bg2, border: "1px solid " + t.line, borderRadius: 12, padding: "10px 12px" } },
      h("div", { style: { flex: 1, minWidth: 0 } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, "让 " + partner.name + " 在聊天里聊这首歌"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, lineHeight: 1.4 } }, "开：TA 会在私聊里自然聊你俩在听的歌、也能帮你切歌（消耗一次回复）")),
      h("button", { onClick: () => onSetAutoComment(!data.autoComment), className: "shrink-0 active:opacity-70", style: { width: 44, height: 26, borderRadius: 999, background: data.autoComment ? (t.accent || "#8a6d3b") : t.line, position: "relative", transition: "background .15s" } },
        h("div", { style: { position: "absolute", top: 3, left: data.autoComment ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" } }))) : null)
    : h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, textAlign: "center", padding: "80px 24px", lineHeight: 1.9 } }, "还没有歌\n去「首页」搜歌名 / 贴链接 / 传本地");

  // ============ 首页 tab（浏览 + 添加 + 设置）============
  const homeTab = h("div", { className: "px-6 pb-6" },
    // 搜索栏（仿音乐 app）
    h("div", { className: "flex gap-2 items-center", style: { marginTop: 6 } },
      h("div", { className: "flex-1 flex items-center gap-2", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "8px 14px" } },
        ic("search", t.fog, 15),
        h("input", { value: q, onChange: e => setQ(e.target.value), onKeyDown: e => { if (e.key === "Enter") doSearch(); }, placeholder: apiBase ? "全网 搜索歌曲 / 歌手" : "先配搜索接口↓", style: { flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: F_BODY, fontSize: 13.5, color: t.ink } })),
      h("button", { onClick: () => audioFileRef.current && audioFileRef.current.click(), className: "shrink-0 active:opacity-70 flex items-center justify-center", style: { width: 40, height: 40, borderRadius: 999, background: t.bg2, border: "1px solid " + t.line } }, ic("upload", t.ink, 17))),
    // 静音保活：像一首歌，点播放=放段无声音频占住后台，让 TA 能后台发消息来；暂停就关、想听真歌直接换
    (() => {
      const kaOn = !!(player && player.songId === KEEPALIVE_ID && player.playing);
      return h("button", { onClick: () => (player && player.songId === KEEPALIVE_ID) ? onTogglePlay() : onPlaySong(KEEPALIVE_ID), className: "w-full flex items-center gap-3 active:opacity-80", style: { marginTop: 12, background: kaOn ? (t.accent || "#8a6d3b") + "14" : t.bg2, border: "1px solid " + (kaOn ? (t.accent || "#8a6d3b") + "44" : t.line), borderRadius: 14, padding: "11px 13px", textAlign: "left" } },
        h("div", { style: { flexShrink: 0, width: 40, height: 40, borderRadius: 999, background: "radial-gradient(circle at 50% 50%, #3a3a42 0 34%, #23232a 35%)", display: "flex", alignItems: "center", justifyContent: "center", animation: kaOn ? "wk-spin 9s linear infinite" : "none" } }, h("span", { style: { fontSize: 17 } }, "🌙")),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, "静音保活"),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 1, lineHeight: 1.4 } }, kaOn ? "正放着 · 手机后台醒着接消息（无声，别锁太久 iOS 仍会挂起）" : "点一下：放段无声音频撑住后台，让 TA 更容易后台发消息来")),
        h("div", { style: { flexShrink: 0, width: 30, height: 30, borderRadius: 999, background: t.ink, display: "flex", alignItems: "center", justifyContent: "center" } },
          kaOn ? h("div", { style: { display: "flex", gap: 2.5 } }, h("div", { style: { width: 3, height: 11, borderRadius: 2, background: t.bg2 } }), h("div", { style: { width: 3, height: 11, borderRadius: 2, background: t.bg2 } }))
          : h("div", { style: { width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "9px solid " + t.bg2, marginLeft: 2 } })));
    })(),
    // 搜索结果
    apiBase && (searching || results != null) ? h("div", { style: { marginTop: 10 } },
      searching ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "6px 2px" } }, "搜索中…")
      : results && results.length === 0 ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "6px 2px" } }, "没搜到（或接口没响应）")
      : h("div", { className: "space-y-1.5" }, (results || []).map(s => h("div", { key: s.id, className: "w-full flex items-center gap-2.5", style: { padding: "4px 2px" } },
          h("button", { onClick: () => onPlayResult(s), className: "flex items-center gap-2.5 flex-1 min-w-0 active:opacity-70", style: { textAlign: "left" } },
            h("div", { style: { flexShrink: 0, width: 40, height: 40, borderRadius: 8, background: s.cover ? "center/cover no-repeat url(" + s.cover + ")" : "linear-gradient(135deg,#cfc9bd,#a8a294)" } }),
            h("div", { className: "flex-1 min-w-0" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.name),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.artist || "未知歌手"))),
          h("button", { onClick: () => onPlayResult(s), className: "shrink-0 active:opacity-60 flex items-center justify-center", style: { width: 30, height: 30, borderRadius: 999, background: t.ink }, title: "现在播放" }, ic("play", t.bg2, 15)),
          h("button", { onClick: () => setPickFor({ song: s, isResult: true }), className: "shrink-0 active:opacity-60", style: { fontSize: 18, color: t.tint, padding: "0 3px" }, title: "加到歌单" }, "＋")))) ) : null,
    // 全部歌曲（这里删歌只影响「全部」，不动歌单）
    songs.length ? h("div", { style: { marginTop: 16 } },
      h(Eyebrow, { style: { marginBottom: 8 } }, "全部 · " + songs.length),
      h("div", { className: "space-y-2" }, songs.map(s => songRow(s, { canRename: true })))) : null,
    // 添加：链接ID / 本地 + 接口设置（折叠在下方）
    h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "12px 14px", marginTop: 18 } },
      h(Eyebrow, { style: { marginBottom: 10 } }, "添加歌曲"),
      h("div", { className: "flex gap-2", style: { marginBottom: 10 } }, apiBase ? tabBtn("search", "搜歌名") : null, tabBtn("netease", "链接/ID"), tabBtn("local", "本地")),
      addTab === "search" && apiBase
        ? h("div", { className: "flex gap-2" },
            h("input", { value: q, onChange: e => setQ(e.target.value), onKeyDown: e => { if (e.key === "Enter") doSearch(); }, placeholder: "搜歌名 / 歌手（结果在上方）", style: field }),
            h("button", { onClick: doSearch, disabled: searching || !q.trim(), className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13, padding: "0 16px", borderRadius: 8, flexShrink: 0 } }, searching ? "…" : "搜"))
        : addTab === "netease"
          ? h("div", null,
              h("input", { value: link, onChange: e => setLink(e.target.value), placeholder: "贴网易云分享链接或歌曲ID", style: Object.assign({ marginBottom: 8 }, field) }),
              h("input", { value: title, onChange: e => setTitle(e.target.value), placeholder: "歌名（选填，填了角色聊得更准）", style: Object.assign({ marginBottom: 8 }, field) }),
              h("div", { className: "flex items-center gap-2" },
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, flex: 1, lineHeight: 1.4 } }, "分享→复制链接贴进来；VIP/无版权可能放不出"),
                h("button", { onClick: addNet, disabled: !link.trim(), className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "7px 18px", borderRadius: 10, flexShrink: 0 } }, "添加")))
          : h("div", null,
              h("button", { onClick: () => audioFileRef.current && audioFileRef.current.click(), className: "w-full active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, color: localFile ? t.ink : t.tint, border: "1px dashed " + t.line, borderRadius: 8, padding: "10px", marginBottom: 8 } }, localFile ? "✓ " + localFile.name.slice(0, 24) : "＋ 选一个音频文件"),
              h("input", { value: title, onChange: e => setTitle(e.target.value), placeholder: "歌名（留空=文件名）", style: Object.assign({ marginBottom: 8 }, field) }),
              h("div", { className: "flex items-center gap-2" },
                h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, flex: 1, lineHeight: 1.4 } }, "只存这台设备，不上传；清缓存会没"),
                h("button", { onClick: addLoc, disabled: !localFile, className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "7px 18px", borderRadius: 10, flexShrink: 0 } }, "添加"))),
      h("div", { style: { borderTop: "1px solid " + t.line, marginTop: 12, paddingTop: 10 } },
        apiEdit
          ? h("div", null,
              h("input", { value: apiInput, onChange: e => setApiInput(e.target.value), placeholder: "https://你的-netease-api.vercel.app", style: Object.assign({ marginBottom: 8 }, field) }),
              h("div", { className: "flex gap-2" },
                h("button", { onClick: () => { onSetApiBase(apiInput); setApiEdit(false); }, className: "flex-1 py-2 active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13, borderRadius: 8 } }, "保存"),
                h("button", { onClick: () => setApiEdit(false), className: "flex-1 py-2 active:opacity-70", style: { border: "1px solid " + t.line, color: t.fog, fontFamily: F_BODY, fontSize: 13, borderRadius: 8 } }, "取消")))
          : h("button", { onClick: () => { setApiInput(apiBase || ""); setApiEdit(true); }, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, color: apiBase ? t.fog : t.tint } }, apiBase ? "✓ 已连搜索接口 · 改" : "＋ 配网易云搜索接口（自部署后填地址，就能搜歌名）")),
      // 可选：网易云账号 Cookie（放 VIP 歌用）——服务端注入的可不填
      apiBase ? h("div", { style: { borderTop: "1px solid " + t.line, marginTop: 10, paddingTop: 10 } },
        ckEdit
          ? h("div", null,
              h("textarea", { value: ckInput, onChange: e => setCkInput(e.target.value), rows: 3, placeholder: "粘贴网易云 Cookie（一般是 MUSIC_U=…；只想放免费歌可留空）", style: Object.assign({ marginBottom: 8, resize: "vertical", lineHeight: 1.4 }, field) }),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, lineHeight: 1.5, marginBottom: 8 } }, "只存这台设备。填了后点歌会带上它 → 后端转发给网易云 → 能放你账号的 VIP 歌。Cookie 会过期，失效了重登换一份。"),
              h("div", { className: "flex gap-2" },
                h("button", { onClick: () => { onSetCookie(ckInput); setCkEdit(false); }, className: "flex-1 py-2 active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13, borderRadius: 8 } }, "保存"),
                h("button", { onClick: () => setCkEdit(false), className: "flex-1 py-2 active:opacity-70", style: { border: "1px solid " + t.line, color: t.fog, fontFamily: F_BODY, fontSize: 13, borderRadius: 8 } }, "取消")))
          : h("div", { className: "flex items-center justify-between gap-2" },
              h("button", { onClick: () => { setCkInput(cookie || ""); setCkEdit(true); }, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, color: cookie ? t.fog : t.tint, textAlign: "left" } }, cookie ? "✓ 已填账号 Cookie（可放 VIP）· 改" : "＋ 配账号 Cookie（可放 VIP 歌，选填）"),
              h("button", { onClick: onTestLogin, className: "shrink-0 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.tint, border: "1px solid " + t.line, borderRadius: 8, padding: "4px 10px" } }, "测登录"))) : null));

  // ============ 我的 tab（歌单）============
  const favs = songs.filter(s => s.fav);
  const isFavView = openPl === "__fav__";
  const openPlObj = isFavView ? { id: "__fav__", name: "我喜欢的音乐", songs: favs } : (playlists.find(p => p.id === openPl) || null);
  const mineTab = h("div", { className: "px-6 pb-6" },
    openPlObj
      ? h("div", null, // 歌单详情（含「我喜欢的音乐」）
          h("div", { className: "flex items-center gap-2", style: { marginTop: 8, marginBottom: 12 } },
            h("button", { onClick: () => setOpenPl(null), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "‹ 歌单"),
            h("div", { className: "flex-1 min-w-0 flex items-center justify-center gap-1.5" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, openPlObj.name),
              !isFavView ? h("button", { onClick: () => { const nv = window.prompt("歌单改名", openPlObj.name); if (nv && nv.trim()) onRenamePlaylist(openPlObj.id, nv.trim()); }, className: "shrink-0 active:opacity-60", style: { fontSize: 12.5, color: t.fog, padding: "0 2px" } }, "✎") : null),
            !isFavView ? h("button", { onClick: () => { onDeletePlaylist(openPlObj.id); setOpenPl(null); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "删除") : h("div", { style: { width: 28 } })),
          (openPlObj.songs || []).length
            ? h("div", { className: "space-y-2" }, (openPlObj.songs || []).map(s => songRow(s, { queue: (openPlObj.songs || []).map(x => x.id), inPlaylist: isFavView ? null : openPlObj.id })))
            : h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "16px 0", lineHeight: 1.8 } }, isFavView ? "还没有收藏的歌。听到喜欢的点一下 ♡ 就会收进这里。" : "这个歌单还没歌。去「首页」搜歌/在歌里点＋加进来——下面也能从「全部」挑。"),
          // 从全部歌里挑加入（复制一份进歌单，和「全部」互不影响）——收藏歌单不需要
          (!isFavView && songs.length) ? h("div", { style: { marginTop: 16 } },
            h(Eyebrow, { style: { marginBottom: 8 } }, "从全部歌加入"),
            h("div", { className: "flex flex-wrap gap-2" }, songs.filter(s => !(openPlObj.songs || []).some(x => (s.neteaseId && x.neteaseId === s.neteaseId) || x.id === s.id)).map(s => h("button", { key: s.id, onClick: () => onAddToPlaylist(openPlObj.id, s), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "6px 12px" } }, "＋ " + s.title)))) : null)
      : h("div", null,
          // 我喜欢的音乐（点左侧打开看列表；右侧圆钮直接播放）
          h("div", { className: "w-full flex items-center gap-3", style: { marginTop: 8, background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "12px 14px" } },
            h("button", { onClick: () => setOpenPl("__fav__"), className: "flex items-center gap-3 flex-1 min-w-0 active:opacity-80 text-left" },
              h("div", { style: { flexShrink: 0, width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg,#e0576b,#f0a8c0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff" } }, "♥"),
              h("div", { className: "flex-1 min-w-0" },
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "我喜欢的音乐"),
                h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, favs.length + " 首 · 收藏歌单"))),
            h("button", { onClick: () => favs.length && onPlaySong(favs[0].id, favs.map(s => s.id)), className: "shrink-0 active:opacity-70", style: { width: 36, height: 36, borderRadius: 999, background: t.ink, display: "flex", alignItems: "center", justifyContent: "center" } }, ic("play", t.bg2, 18))),
          // 创建歌单
          h("div", { className: "flex gap-2", style: { marginTop: 14 } },
            h("input", { value: plName, onChange: e => setPlName(e.target.value), placeholder: "新建歌单名", style: field }),
            h("button", { onClick: () => { if (plName.trim()) { const id = onCreatePlaylist(plName.trim(), []); setPlName(""); setOpenPl(id); } }, disabled: !plName.trim(), className: "active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, fontFamily: F_BODY, fontSize: 13, padding: "0 16px", borderRadius: 8, flexShrink: 0 } }, "建")),
          // 角色歌单生成
          h("div", { style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 16, padding: "12px 14px", marginTop: 14 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, "根据角色人设生成歌单"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, marginBottom: 10, lineHeight: 1.4 } }, "让 TA 推 10 首自己会单曲循环的歌，自动去网易云拉成能直接听的歌单（需先配搜索接口）"),
            plCharPick
              ? h("div", { className: "flex flex-wrap gap-2" }, (characters || []).map(c => h("button", { key: c.id, onClick: () => { setPlCharPick(false); onGenCharPlaylist(c); }, className: "active:opacity-70 flex items-center gap-1.5", style: { background: t.bg, border: "1px solid " + t.line, borderRadius: 999, padding: "5px 10px 5px 5px" } }, h(Avatar, { character: c, size: 24, radius: 999 }), h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink } }, c.name))))
              : h("button", { onClick: () => setPlCharPick(true), disabled: !!genCharPl, className: "w-full active:opacity-70 disabled:opacity-50", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "9px", borderRadius: 10 } }, genCharPl ? "生成中…" : "选一个角色生成")),
          // 已有歌单列表
          playlists.length ? h("div", { style: { marginTop: 16 } },
            h(Eyebrow, { style: { marginBottom: 8 } }, "歌单 · " + playlists.length),
            h("div", { className: "space-y-2" }, playlists.map(pl => { const ch = pl.charId ? (characters || []).find(c => c.id === pl.charId) : null; const q = (pl.songs || []).map(s => s.id); return h("div", { key: pl.id, className: "flex items-center gap-3", style: { background: t.bg2, border: "1px solid " + t.line, borderRadius: 14, padding: "10px 12px" } },
              h("button", { onClick: () => { if (q.length) onPlaySong(q[0], q); }, className: "shrink-0 active:opacity-70", style: { width: 46, height: 46, borderRadius: 10, background: pl.cover ? "center/cover no-repeat url(" + pl.cover + ")" : "linear-gradient(135deg,#a8b4c0,#cfc9bd)", display: "flex", alignItems: "center", justifyContent: "center" } }, ch ? h(Avatar, { character: ch, size: 26, radius: 999 }) : h("span", { style: { color: "#fff", fontSize: 16 } }, "♪")),
              h("button", { onClick: () => setOpenPl(pl.id), className: "flex-1 min-w-0 text-left active:opacity-70" },
                h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, pl.name),
                h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 1 } }, (pl.songs || []).length + " 首" + (ch ? " · " + ch.name : ""))),
              h("button", { onClick: () => { if (q.length) onPlaySong(q[0], q); }, className: "shrink-0 active:opacity-60 flex items-center justify-center", style: { width: 34, height: 34, borderRadius: 999, background: t.ink } }, ic("play", t.bg2, 16))); }))) : null));

  // 底部导航
  const navBtn = (k, label, iconEl) => h("button", { onClick: () => setNav(k), className: "flex-1 flex flex-col items-center gap-1 active:opacity-70 py-2", style: { color: nav === k ? t.ink : t.fog } }, iconEl, h("span", { style: { fontFamily: F_BODY, fontSize: 10.5 } }, label));

  return h("div", { className: "h-full flex flex-col relative", style: { background: t.bg } },
    h(Head, { zh: "一起听", en: nav === "play" && now ? (idx >= 0 ? idx + 1 : 1) + " / " + (nowQueue.length || songs.length) : "Listen", onBack: () => { if (openPl) setOpenPl(null); else onBack(); } }),
    h("div", { className: "flex-1 overflow-y-auto" }, nav === "play" ? playTab : nav === "home" ? homeTab : mineTab),
    pickerOverlay,
    // 底部三 tab：首页 / 播放 / 我的
    h("div", { className: "shrink-0 flex items-stretch", style: { borderTop: "1px solid " + t.line, background: t.bg } },
      navBtn("home", "首页", h("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: nav === "home" ? t.ink : t.fog, strokeWidth: 1.7 }, h("path", { d: "M4 11l8-6 8 6M6 10v9h12v-9" }))),
      navBtn("play", "播放", h("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: nav === "play" ? t.ink : t.fog, strokeWidth: 1.7 }, h("circle", { cx: 12, cy: 12, r: 8 }), h("path", { d: "M10 9l5 3-5 3z", fill: nav === "play" ? t.ink : t.fog }))),
      navBtn("mine", "我的", h("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: nav === "mine" ? t.ink : t.fog, strokeWidth: 1.7 }, h("circle", { cx: 12, cy: 8, r: 3.4 }), h("path", { d: "M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" })))),
    h("input", { ref: audioFileRef, type: "file", accept: "audio/*", onChange: e => { const f = e.target.files && e.target.files[0]; if (f) { setLocalFile(f); setAddTab("local"); setNav("home"); } e.target.value = ""; }, style: { display: "none" } }),
    h("input", { ref: coverRef, type: "file", accept: "image/*", onChange: e => { const f = e.target.files && e.target.files[0]; if (f && now) onSetCover(now.id, f); e.target.value = ""; }, style: { display: "none" } }));
}

// 设置·情侣问答自定义题库：为每个角色单独加题（各角色不互通，内置 60 题仍共用）
function CoupleQAConfig({ characters, custom, onSave, toast }) {
  const t = useTheme();
  const chars = characters || [];
  const [selId, setSelId] = useState(chars[0] ? chars[0].id : "");
  const [text, setText] = useState("");
  useEffect(() => { setText(((custom || {})[selId] || []).join("\n")); }, [selId, custom]);
  const cur = chars.find(c => c.id === selId);
  const count = text.split("\n").filter(s => s.trim()).length;
  const save = () => { onSave(selId, text.split("\n")); toast("已保存 " + count + " 题"); };
  if (!chars.length) return h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, paddingTop: 8 } }, "还没有角色，先去名录录入一位。");
  return h("div", null,
    h(Eyebrow, { style: { marginBottom: 8 } }, "情侣问答 · 自定义题库"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.7, color: t.fog, marginBottom: 12 } }, "为某个角色添加只属于你俩的问题——一行一题。内置 60 题所有角色共用；这里加的题只出现在你和该角色的问答小本，各角色之间不互通。"),
    h("div", { className: "flex gap-2 flex-wrap mb-3" }, chars.map(c => h("button", { key: c.id, onClick: () => setSelId(c.id), className: "active:opacity-70", style: { padding: "6px 12px", borderRadius: 999, fontFamily: F_BODY, fontSize: 13, background: selId === c.id ? t.ink : t.bg2, color: selId === c.id ? t.bg2 : t.sub, border: "1px solid " + (selId === c.id ? t.ink : t.line) } }, c.name))),
    h("textarea", { value: text, onChange: e => setText(e.target.value), rows: 8, placeholder: "一行一题，例如：\n你还记得我们第一次牵手是在哪里吗？\n如果周末去露营，你负责扎营还是生火？", style: { width: "100%", outline: "none", resize: "vertical", padding: "10px 12px", borderRadius: 12, fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.7, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
    h("div", { className: "flex items-center justify-between mt-2" },
      h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, count + " 题 · " + (cur ? cur.name : "")),
      h("button", { onClick: save, className: "active:opacity-70", style: { background: t.ink, color: t.bg2, fontFamily: F_DISPLAY, fontSize: 14, padding: "8px 20px", borderRadius: 10 } }, "保存")));
}
// 思维链 COT（全局通用）设置：开关 + 思考方式 + 预设存取。线下/同人文/梦境共用一套。
const COT_TEMPLATE =
  "· 此刻{{char}}的情绪与身体状态：TA现在最在意什么、身上什么感觉最强？\n" +
  "· 上一幕/上一句的张力：{{user}}刚才的话或动作，对{{char}}意味着什么？别答非所问。\n" +
  "· 这一步往哪推：顺着上面的情绪，{{char}}接下来最自然会做/说什么？只推进一点点，别跳戏、别提前写没发生的剧情。\n" +
  "· 落笔前自检：有没有八股翻译腔（如「空气中弥漫着」「嘴角勾起一抹弧度」「不易察觉的」）、超雄爹味、说教、OOC？有就换成贴人设的具体写法再落笔。";
function CotConfig({ toast }) {
  const t = useTheme();
  const [cfg, setCfg] = useState(() => loadCotConfig());
  const [sel, setSel] = useState("");
  const taRef = React.useRef(null);
  const save = next => { const c = saveCotConfig(next); setCfg(c); return c; };
  const setThink = v => save({ ...cfg, think: v });
  const insertVar = tok => {
    const el = taRef.current;
    if (el && typeof el.selectionStart === "number") {
      const s = el.selectionStart, e = el.selectionEnd, val = cfg.think || "";
      setThink(val.slice(0, s) + tok + val.slice(e));
      setTimeout(() => { try { el.focus(); el.selectionStart = el.selectionEnd = s + tok.length; } catch (x) {} }, 0);
    } else setThink((cfg.think || "") + tok);
  };
  const loadPreset = name => {
    const pr = (cfg.presets || []).find(x => x.name === name);
    setSel(name);
    if (pr) { save({ ...cfg, think: pr.think }); toast && toast("已载入预设「" + name + "」"); }
  };
  const saveAsPreset = () => {
    const name = (window.prompt("给这套思考方式起个名字（如：温柔向 / 高张力 / 专治八股）") || "").trim();
    if (!name) return;
    if (!(cfg.think || "").trim()) { toast && toast("思考方式是空的，先写点内容再存"); return; }
    const others = (cfg.presets || []).filter(x => x.name !== name);
    save({ ...cfg, presets: [...others, { name, think: cfg.think }] });
    setSel(name);
    toast && toast("已存为预设「" + name + "」");
  };
  const delPreset = () => {
    if (!sel) { toast && toast("先在上面选一个要删的预设"); return; }
    if (!window.confirm("删除预设「" + sel + "」？")) return;
    save({ ...cfg, presets: (cfg.presets || []).filter(x => x.name !== sel) });
    setSel("");
    toast && toast("已删除");
  };
  const inputSt = { width: "100%", outline: "none", padding: "9px 12px", borderRadius: 11, fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line };
  const chip = (label, onClick) => h("button", { onClick, className: "active:opacity-60", style: { fontFamily: "monospace", fontSize: 12, padding: "4px 12px", borderRadius: 999, border: "1px solid " + t.line, color: t.sub, background: "transparent" } }, label);
  return h("div", { className: "pt-4 pb-4" },
    // 总开关
    h("div", { className: "flex items-center justify-between py-4", style: { borderBottom: "1px solid " + t.line } },
      h("div", { style: { paddingRight: 12 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "启用自定义思维链"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, lineHeight: 1.5, color: t.fog, marginTop: 2 } }, "线下 / 同人文 / 梦境：AI 先按你写的思路想一遍再落笔。思考不进正文，每条正文旁能点开「看TA怎么想的」。留空 = 不启用，一切照旧。")),
      h(Toggle, { on: cfg.enabled === true, onChange: v => { save({ ...cfg, enabled: v }); toast && toast(v ? "已开启思维链" : "已关闭"); } })),
    // 预设
    h("div", { className: "pt-5" },
      h("div", { className: "flex items-baseline gap-2 mb-2" },
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, "预设"),
        h("span", { style: { fontFamily: "monospace", fontSize: 10, letterSpacing: 1, color: t.fog } }, "PRESETS"),
        h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "存好几套，换着用不用重填")),
      h("div", { className: "flex gap-2" },
        h("select", { value: sel, onChange: e => loadPreset(e.target.value), style: { ...inputSt, flex: 1, appearance: "none", WebkitAppearance: "none" } },
          h("option", { value: "" }, (cfg.presets || []).length ? "选择预设载入…" : "（还没有预设）"),
          (cfg.presets || []).map(pr => h("option", { key: pr.name, value: pr.name }, pr.name))),
        h("button", { onClick: saveAsPreset, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, padding: "0 16px", borderRadius: 11, border: "1px solid " + t.line, color: t.ink } }, "存为"),
        h("button", { onClick: delPreset, className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, padding: "0 14px", borderRadius: 11, border: "1px solid " + t.line, color: "#a24a4a" } }, "删除"))),
    // 思考方式
    h("div", { className: "pt-5" },
      h("div", { className: "flex items-baseline justify-between mb-2" },
        h("div", { className: "flex items-baseline gap-2" },
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, "思考方式"),
          h("span", { style: { fontFamily: "monospace", fontSize: 10, letterSpacing: 1, color: t.fog } }, "HOW TO THINK")),
        h("button", { onClick: () => { if (!(cfg.think || "").trim() || window.confirm("用示例模板替换当前内容？")) setThink(COT_TEMPLATE); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, "插入示例模板")),
      h("div", { className: "flex gap-2 mb-2" }, chip("{{char}}", () => insertVar("{{char}}")), chip("{{user}}", () => insertVar("{{user}}"))),
      h("textarea", { ref: taRef, value: cfg.think || "", onChange: e => setThink(e.target.value), rows: 9,
        placeholder: "写下你希望角色在动笔前思考的步骤，一行一条。\n\n· {{char}} 会替换成角色名，{{user}} 替换成你的名字\n· 留空 = 不启用，剧情走默认方式\n· 思考不进正文，想看点每条正文旁的「看TA怎么想的」\n· 想治八股词/超雄/OOC？在这里写「落笔前自检」，示例模板里有现成的",
        style: { width: "100%", outline: "none", resize: "vertical", padding: "11px 13px", borderRadius: 12, fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.75, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 6, lineHeight: 1.5 } }, "改动即时保存，全部角色通用。思考越细，正文越贴——但也会多花一点点生成。")));
}
// 图像 API（角色自拍）设置：开关 + 端点/密钥/模型/尺寸/质量。存 x_imgApi（图本身进 IndexedDB 不在这）。
// MiniMax 语音 TTS 配置：懒生成（点开语音那条才合成收费），成品缓存在本机重播免费
function TtsApiConfig({ toast, characters, onAssignVoice }) {
  const t = useTheme();
  const [c, setC] = useState(loadTtsApi());
  const set = patch => setC(saveTtsApi(patch));
  const [testing, setTesting] = useState(false);
  const [testErr, setTestErr] = useState(null);
  const testAudRef = useRef(null);
  // 克隆音色
  const [cloneFile, setCloneFile] = useState(null);
  const [cloneId, setCloneId] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneMsg, setCloneMsg] = useState(null);
  // 音色库：克过的 voice_id 登记清单（试听/备注/指派给角色）
  const [vlib, setVlib] = useState(loadVoiceLib());
  const [assignFor, setAssignFor] = useState(null); // 展开指派角色列表的 voice_id
  const [manualId, setManualId] = useState("");
  const vtp = useTtsPlayer();
  const saveVlib = next => { setVlib(next); saveVoiceLib(next); };
  const addVoice = vid => {
    vid = String(vid || "").trim();
    if (!vid) return;
    saveVlib([{ id: vid, note: "", ts: Date.now() }, ...vlib.filter(v => v.id !== vid)]);
  };
  const runClone = async () => {
    if (!cloneFile || !cloneId.trim() || cloning) return;
    setCloning(true); setCloneMsg(null);
    try {
      const vid = await ttsCloneVoice(cloneFile, cloneId);
      addVoice(vid); // 克隆成功自动进音色库
      setCloneMsg({ ok: true, text: "✅ 克隆成功！voice_id = " + vid + "\n已存进下面的「我的音色库」——点「指派」直接给某个角色，或去角色档案手动填。" });
    } catch (e) { setCloneMsg({ ok: false, text: "❌ " + String((e && e.message) || e) }); }
    finally { setCloning(false); }
  };
  const runTest = async () => {
    if (!ttsReady(c)) { toast && toast("先填 GroupId 和密钥"); return; }
    const aud = new Audio();
    testAudRef.current = aud;
    aud.play().catch(() => {});
    setTesting(true); setTestErr(null);
    try {
      const blob = await ttsSpeak("你好呀，听听我的声音合不合适？", "female-shaonv");
      const url = URL.createObjectURL(blob);
      aud.src = url; aud.onended = () => URL.revokeObjectURL(url);
      await aud.play();
      toast && toast("✅ 接口通了，正在播放试听");
    } catch (e) { setTestErr(String((e && e.message) || e)); }
    finally { setTesting(false); }
  };
  const inSt = { width: "100%", outline: "none", padding: "9px 12px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line };
  const row = (label, node) => h("div", { className: "mb-3" }, h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 4 } }, label), node);
  return h("div", { className: "pt-8 mt-6", style: { borderTop: "1px dashed " + t.line } },
    h("div", { className: "flex items-center justify-between py-2" },
      h("div", { style: { paddingRight: 12 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "语音 TTS · 角色真发声"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, lineHeight: 1.5, color: t.fog, marginTop: 2 } }, "接 MiniMax 语音合成。开了之后，选了音色的角色发的语音消息能点 ▶ 真听。⭐按字符计费，但只有你点开那条才合成；合成过的存在本机、重播免费。")),
      h(Toggle, { on: c.enabled === true, onChange: v => { set({ enabled: v }); toast && toast(v ? "已开启语音合成（点开才收费）" : "已关闭"); } })),
    c.enabled ? h("div", { className: "pt-3" },
      row("接口地址（key 在哪个平台申请的就点哪个，别混）", h("div", null,
        h("div", { style: { display: "flex", gap: 6, marginBottom: 6 } },
          [["国际版 platform.minimax.io", "https://api.minimax.io"], ["国内 minimaxi.com", "https://api.minimaxi.com"], ["老国内站", "https://api.minimax.chat"]].map(pair =>
            h("button", { key: pair[1], onClick: () => set({ baseUrl: pair[1] }), className: "active:opacity-70",
              style: { flex: 1, fontFamily: F_BODY, fontSize: 10, padding: "7px 2px", borderRadius: 8, background: t.bg2, border: "1px solid " + ((c.baseUrl || "").trim() === pair[1] ? t.tint : t.line), color: (c.baseUrl || "").trim() === pair[1] ? t.tint : t.sub } }, pair[0]))),
        h("input", { value: c.baseUrl || "", onChange: e => set({ baseUrl: e.target.value }), placeholder: "https://api.minimax.io", style: inSt }))),
      row("GroupId（MiniMax 控制台·账户信息里）", h("input", { value: c.groupId || "", onChange: e => set({ groupId: e.target.value }), placeholder: "17xxxxxxxxxxxx", style: inSt })),
      row("密钥 API Key", h("input", { value: c.apiKey || "", onChange: e => set({ apiKey: e.target.value }), placeholder: "eyJ…", type: "password", style: inSt })),
      row("模型", h("select", { value: c.model || "speech-02-hd", onChange: e => set({ model: e.target.value }), style: Object.assign({}, inSt, { appearance: "none", WebkitAppearance: "none" }) },
        h("option", { value: "speech-02-hd" }, "speech-02-hd（音质好·推荐）"),
        h("option", { value: "speech-02-turbo" }, "speech-02-turbo（快·便宜）"),
        h("option", { value: "speech-01-hd" }, "speech-01-hd"),
        h("option", { value: "speech-01-turbo" }, "speech-01-turbo"))),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, "填好后，去角色档案里给每位选一个「音色」，TA 的语音消息就能听了。"),
      h("button", { onClick: runTest, disabled: testing, className: "w-full mt-4 active:opacity-80 disabled:opacity-50", style: { fontFamily: F_BODY, fontSize: 13, color: "#fff", background: t.tint, borderRadius: 10, padding: "11px 0" } }, testing ? "合成中…" : "🔊 试听一句（诊断接口）"),
      // ---- 克隆音色：传人声样本 → 得到专属 voice_id → 填进角色档案 ----
      h("div", { className: "pt-4 mt-4", style: { borderTop: "1px dashed " + t.line } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink, marginBottom: 4 } }, "🎤 克隆音色"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.6, marginBottom: 10 } }, "传一段【只有一个人说话、没背景音乐】的干净人声（10 秒~5 分钟，mp3/wav/m4a），起一个专属 voice_id——克隆好后去角色档案把「音色」填成这个 id 就是 TA 的声音了。⚠️ 克隆按次收费（比合成贵），確認样本干净再点；只克隆你有权使用的声音。"),
        // accept 不能只写 audio/*：iOS 会只给录音/媒体库入口、选不了「文件」里的 mp3——列明扩展名才会出现文件 App 选项
        h("input", { type: "file", accept: ".mp3,.m4a,.wav,.aac,audio/mpeg,audio/mp4,audio/wav,audio/*", onChange: e => { setCloneFile(e.target.files && e.target.files[0] || null); }, style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 8, display: "block", width: "100%" } }),
        h("input", { value: cloneId, onChange: e => setCloneId(e.target.value), placeholder: "起个 voice_id（字母开头≥8位，如 GuChao2026）", style: Object.assign({}, inSt, { marginBottom: 8 }) }),
        h("button", { onClick: runClone, disabled: cloning || !cloneFile || !cloneId.trim(), className: "w-full active:opacity-80 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 13, color: "#fff", background: t.ink, borderRadius: 10, padding: "10px 0" } }, cloning ? "上传克隆中…（可能要一会儿）" : "上传并克隆"),
        cloneMsg ? h("div", { style: { marginTop: 10, padding: "10px 12px", background: cloneMsg.ok ? "rgba(63,109,90,0.08)" : "rgba(194,90,74,0.08)", border: "1px solid " + (cloneMsg.ok ? "rgba(63,109,90,0.3)" : "rgba(194,90,74,0.3)"), borderRadius: 10, fontFamily: F_BODY, fontSize: 12, lineHeight: 1.6, color: cloneMsg.ok ? "#3f6d5a" : "#c25a4a", userSelect: "text", WebkitUserSelect: "text", wordBreak: "break-all" } }, cloneMsg.text) : null),
      // ---- 我的音色库：克过的 voice_id 清单（试听/备注/指派给角色/补录）----
      h("div", { className: "pt-4 mt-4", style: { borderTop: "1px dashed " + t.line } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink, marginBottom: 4 } }, "🗂 我的音色库" + (vlib.length ? " · " + vlib.length : "")),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.6, marginBottom: 10 } }, "克隆成功的音色自动记在这，可试听、写备注、一键指派给角色。以前克过没登记的，补录 voice_id 即可。「移除」只是清单删掉，不影响 MiniMax 账号里的音色。"),
        h("div", { className: "flex gap-2", style: { marginBottom: 10 } },
          h("input", { value: manualId, onChange: e => setManualId(e.target.value), placeholder: "补录已有的 voice_id", style: Object.assign({}, inSt, { flex: 1, width: "auto" }) }),
          h("button", { onClick: () => { addVoice(manualId); setManualId(""); }, disabled: !manualId.trim(), className: "active:opacity-70 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 12.5, color: "#fff", background: t.ink, border: "none", borderRadius: 10, padding: "0 16px", flexShrink: 0 } }, "补录")),
        vlib.length === 0 ? null : h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, vlib.map(v => {
          const users = (characters || []).filter(ch => ch.voiceId === v.id);
          const meP = vtp.play && vtp.play.k === v.id;
          return h("div", { key: v.id, style: { border: "1px solid " + t.line, borderRadius: 12, padding: "10px 12px", background: t.bg2 } },
            h("div", { className: "flex items-center gap-2" },
              h("div", { className: "flex-1 min-w-0" },
                h("div", { style: { fontFamily: "'Archivo',ui-monospace,monospace", fontSize: 12.5, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, v.id),
                users.length ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.tint, marginTop: 2 } }, "→ " + users.map(u => u.remark || u.name).join("、") + " 在用") : null),
              h("button", { onClick: () => vtp.toggle(v.id, "你好呀，我是这个音色，听听合不合适？", v.id), className: "active:opacity-60 shrink-0", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.ink, border: "1px solid " + t.line, borderRadius: 999, padding: "5px 12px", background: "transparent" } }, meP ? (vtp.play.st === "gen" ? "…" : "⏸") : "试听"),
              h("button", { onClick: () => setAssignFor(assignFor === v.id ? null : v.id), className: "active:opacity-60 shrink-0", style: { fontFamily: F_BODY, fontSize: 11.5, color: "#fff", background: t.tint, border: "none", borderRadius: 999, padding: "6px 12px" } }, "指派"),
              h("button", { onClick: () => { if (window.confirm("从清单移除这个音色？（不影响 MiniMax 账号）")) saveVlib(vlib.filter(x => x.id !== v.id)); }, className: "active:opacity-60 shrink-0", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, border: "none", background: "transparent", padding: "2px 4px" } }, "✕")),
            h("input", { value: v.note || "", onChange: e => saveVlib(vlib.map(x => x.id === v.id ? { ...x, note: e.target.value } : x)), placeholder: "备注（谁的声音 / 什么感觉）", style: { width: "100%", outline: "none", marginTop: 8, padding: "7px 10px", borderRadius: 8, fontFamily: F_BODY, fontSize: 12, background: t.bg, color: t.sub, border: "1px solid " + t.line } }),
            assignFor === v.id ? h("div", { className: "flex flex-wrap gap-2", style: { marginTop: 8 } },
              (characters || []).length === 0 ? h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "还没有角色，先去名录建一个。") :
              (characters || []).map(ch => h("button", { key: ch.id, onClick: () => { onAssignVoice && onAssignVoice(ch.id, v.id); setAssignFor(null); }, className: "active:opacity-70",
                style: { fontFamily: F_BODY, fontSize: 12, padding: "6px 13px", borderRadius: 999, background: ch.voiceId === v.id ? t.tint : "transparent", color: ch.voiceId === v.id ? "#fff" : t.ink, border: "1px solid " + (ch.voiceId === v.id ? t.tint : t.line) } }, ch.remark || ch.name))) : null);
        }))),
      testErr ? h("div", { style: { marginTop: 12, padding: "12px 13px", background: "rgba(194,90,74,0.08)", border: "1px solid rgba(194,90,74,0.3)", borderRadius: 10 } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: "#c25a4a", marginBottom: 6 } }, "❌ 没出声。报错原文（可截图发我）："),
        h("div", { style: { fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: t.ink, wordBreak: "break-all", userSelect: "text", WebkitUserSelect: "text", maxHeight: 160, overflowY: "auto" } }, testErr)) : null) : null);
}
function ImageApiConfig({ toast }) {
  const t = useTheme();
  const [c, setC] = useState(() => (typeof loadImgApi === "function" ? loadImgApi() : { baseUrl: "", apiKey: "", model: "gpt-image-1", size: "1024x1536", quality: "medium", enabled: false }));
  const set = patch => { const n = Object.assign({}, c, patch); setC(n); if (typeof saveImgApi === "function") saveImgApi(n); };
  const [models, setModels] = useState([]);
  const [fetching, setFetching] = useState(false);
  const pull = async () => {
    if (!c.baseUrl || !c.apiKey) { toast && toast("先填接口地址和密钥"); return; }
    setFetching(true);
    try { const ms = await fetchModelList(c); setModels(ms || []); toast && toast((ms || []).length + " 个模型（挑含 image/dall-e/flux 的）"); }
    catch (e) { toast && toast("拉取失败：" + (e.message || e)); }
    finally { setFetching(false); }
  };
  // 诊断：真调一次接口拍张测试图。成→当场显示；败→把原始报错整段贴出来（能截图排查）
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState(null);
  const runTest = async () => {
    if (typeof generateSelfieImage !== "function") { toast && toast("图像模块没加载"); return; }
    setTesting(true); setTestRes(null);
    try {
      const out = await generateSelfieImage("a cute golden retriever puppy sitting on green grass, soft natural daylight, realistic photo", null, {});
      const src = out.dataUrl || out.url || (out.blob ? URL.createObjectURL(out.blob) : null);
      setTestRes(src ? { ok: true, src: src } : { ok: false, err: "接口通了但没从返回里解析出图片。" });
    } catch (e) { setTestRes({ ok: false, err: String((e && e.message) || e) }); }
    finally { setTesting(false); }
  };
  const inSt = { width: "100%", outline: "none", padding: "9px 12px", borderRadius: 10, fontFamily: F_BODY, fontSize: 13.5, background: t.bg2, color: t.ink, border: "1px solid " + t.line };
  const row = (label, node) => h("div", { className: "mb-3" }, h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 4 } }, label), node);
  return h("div", { className: "pt-8 mt-6", style: { borderTop: "1px dashed " + t.line } },
    h("div", { className: "flex items-center justify-between py-2" },
      h("div", { style: { paddingRight: 12 } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "图像 API · 角色自拍"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, lineHeight: 1.5, color: t.fog, marginTop: 2 } }, "接一个 OpenAI 兼容的图像接口（gpt-image 类）。开了之后，给角色填了『外貌/参考照』的，聊天里会偶尔发自拍。按张计费、比文字贵，别乱开；生成的图只存在本机、不进云同步。")),
      h(Toggle, { on: c.enabled === true, onChange: v => { set({ enabled: v }); toast && toast(v ? "已开启角色自拍（按张计费）" : "已关闭"); } })),
    c.enabled ? h("div", { className: "pt-3" },
      row("接口地址 Base URL", h("input", { value: c.baseUrl || "", onChange: e => set({ baseUrl: e.target.value }), placeholder: "如 https://xxx.com（会自动补 /v1/images）", style: inSt })),
      row("密钥 API Key", h("input", { value: c.apiKey || "", onChange: e => set({ apiKey: e.target.value }), placeholder: "sk-…", type: "password", style: inSt })),
      row("模型", h("div", null,
        h("div", { className: "flex gap-2" },
          h("input", { value: c.model || "", onChange: e => set({ model: e.target.value }), placeholder: "gpt-image-1", style: Object.assign({}, inSt, { flex: 1 }) }),
          h("button", { onClick: pull, disabled: fetching, className: "shrink-0 active:opacity-70 disabled:opacity-50", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "0 14px" } }, fetching ? "拉取中…" : "拉取模型")),
        models.length > 0 ? h("div", { className: "flex flex-wrap gap-1.5", style: { marginTop: 8, maxHeight: 118, overflowY: "auto" } }, models.map(m => h("button", { key: m, onClick: () => set({ model: m }), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 11.5, padding: "4px 10px", borderRadius: 999, background: c.model === m ? t.ink : t.bg2, color: c.model === m ? t.bg2 : t.sub, border: "1px solid " + t.line } }, m))) : null,
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 6, lineHeight: 1.5 } }, "拉取后从上面挑一个【图像】模型（名字通常含 image / dall-e / flux）。自动填的默认是 gpt-image-1，不一定你的接口商支持——拉一下看有没有更保险。"))),
      h("div", { className: "flex gap-3" },
        h("div", { className: "flex-1" }, row("尺寸", h("select", { value: c.size || "1024x1536", onChange: e => set({ size: e.target.value }), style: Object.assign({}, inSt, { appearance: "none", WebkitAppearance: "none" }) },
          h("option", { value: "1024x1536" }, "竖 1024×1536（自拍推荐）"),
          h("option", { value: "1024x1024" }, "方 1024×1024"),
          h("option", { value: "1536x1024" }, "横 1536×1024")))),
        h("div", { className: "flex-1" }, row("质量", h("select", { value: c.quality || "medium", onChange: e => set({ quality: e.target.value }), style: Object.assign({}, inSt, { appearance: "none", WebkitAppearance: "none" }) },
          h("option", { value: "low" }, "low（最省）"),
          h("option", { value: "medium" }, "medium"),
          h("option", { value: "high" }, "high（最贵）"))))),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, "填好后，去某个角色的档案里写『外貌』或传参考照，再在聊天里让 TA『拍张自拍』试试。参考照会用 images/edits 尽量保住长相。"),
      // 诊断按钮：真拍一张测试图
      h("button", { onClick: runTest, disabled: testing, className: "w-full mt-4 active:opacity-80 disabled:opacity-50", style: { fontFamily: F_BODY, fontSize: 13, color: "#fff", background: t.tint, borderRadius: 10, padding: "11px 0" } }, testing ? "生成中…（可能要 30~90 秒）" : "🔬 拍张测试图（诊断接口）"),
      testRes ? (testRes.ok
        ? h("div", { style: { marginTop: 12 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: "#4f8a6a", marginBottom: 6 } }, "✅ 成功！接口能出图（下面是刚拍的测试图）"),
            h("img", { src: testRes.src, style: { width: "100%", maxWidth: 220, borderRadius: 12, display: "block" } }))
        : h("div", { style: { marginTop: 12, padding: "12px 13px", background: "rgba(194,90,74,0.08)", border: "1px solid rgba(194,90,74,0.3)", borderRadius: 10 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, fontWeight: 700, color: "#c25a4a", marginBottom: 6 } }, "❌ 没出图。接口/报错原文（可长按复制、截图发我）："),
            h("div", { style: { fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: t.ink, wordBreak: "break-all", userSelect: "text", WebkitUserSelect: "text", maxHeight: 200, overflowY: "auto" } }, testRes.err))) : null) : null);
}
// 上下文透视（v47.75 借汪汪机的调试页思路）：把「此刻和 TA 聊天会喂给模型的完整 system prompt」
// 按【段落】拆开展示。角色变笨/OOC/忘事时来这里一眼定位是哪一段的问题。只读、零 API。
function CtxDebug({ characters, getBundle }) {
  const t = useTheme();
  const [cid, setCid] = useState(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState({});
  const load = id => { setCid(id); setText(String((getBundle && getBundle(id)) || "（空）")); setOpen({}); };
  const secs = (() => {
    if (!cid || !text) return [];
    return text.split(/\n(?=【)/).map((p, i) => {
      const m = p.match(/^【[^】]*】/);
      return { title: m ? m[0] : (i === 0 ? "【开头】" : "【段落 " + (i + 1) + "】"), body: p };
    });
  })();
  return h("div", { style: { marginTop: 28 } },
    h(Eyebrow, { style: { marginBottom: 8 } }, "上下文透视"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.7, marginBottom: 10 } }, "看看此刻和 TA 聊天时，到底喂了什么给模型（人设 / 记忆 / 世界书 / 行程…按段拆开）。角色变笨、OOC、忘事时来这里排查是哪一段出了问题。"),
    h("div", { className: "flex gap-2 flex-wrap", style: { marginBottom: 10 } }, (characters || []).map(c =>
      h("button", { key: c.id, onClick: () => load(c.id), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 12.5, padding: "6px 13px", borderRadius: 999, background: cid === c.id ? t.ink : t.bg2, color: cid === c.id ? t.bg2 : t.ink, border: "1px solid " + (cid === c.id ? t.ink : t.line) } }, c.remark || c.name))),
    cid ? (() => {
      // 每段占比 + 肥度条（v47.84 她要的「谁肥一眼看穿」）：≥20% 红、≥10% 金、其余灰
      const total = Math.max(1, text.length);
      const pctOf = s => Math.round(s.body.length / total * 100);
      const top3 = secs.slice().sort((a, b) => b.body.length - a.body.length).slice(0, 3).filter(s => s.body.length > 0);
      const barColor = p => p >= 20 ? "#c25a4a" : p >= 10 ? "#b89150" : t.line;
      return h("div", null,
        h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, secs.length + " 段 · 共 " + text.length + " 字 · 点标题展开"),
          h("button", { onClick: () => load(cid), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, "刷新")),
        top3.length ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.sub, lineHeight: 1.7, background: t.bg2, border: "1px solid " + t.line, borderRadius: 10, padding: "7px 11px", marginBottom: 10 } },
          "最肥三段：" + top3.map(s => s.title.replace(/[【】]/g, "") + " " + pctOf(s) + "%").join(" · ") + "——变笨先查它们") : null,
        secs.map((s, i) => {
          const pct = pctOf(s);
          return h("div", { key: i, style: { border: "1px solid " + t.line, borderRadius: 12, marginBottom: 8, overflow: "hidden" } },
            h("button", { onClick: () => setOpen(o => ({ ...o, [i]: !o[i] })), className: "w-full active:opacity-70", style: { padding: "9px 12px 7px", background: t.bg2, textAlign: "left", display: "block" } },
              h("div", { className: "flex items-center justify-between gap-2" },
                h("span", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: t.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.title),
                h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: pct >= 20 ? "#c25a4a" : t.fog, flexShrink: 0 } }, s.body.length + " 字 · " + pct + "% " + (open[i] ? "▾" : "▸"))),
              h("div", { style: { height: 3, borderRadius: 999, background: t.bg, marginTop: 6, overflow: "hidden" } },
                h("div", { style: { height: "100%", width: Math.max(2, pct) + "%", borderRadius: 999, background: barColor(pct) } }))),
            open[i] ? h("div", { style: { padding: "10px 12px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: t.sub, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 300, overflowY: "auto", background: t.bg } }, s.body) : null);
        }));
    })() : null);
}
function Config({
  apiProfiles,
  activeId,
  bgApiId,
  onSetBgApi,
  onSaveApi,
  characters,
  onAssignVoice,
  coupleQACustom,
  onSaveCustomQA,
  theme,
  onSaveTheme,
  wallpaper,
  onSaveWallpaper,
  prefs,
  onSavePrefs,
  geo,
  onRequestGeo,
  onBack,
  onExport,
  onImport,
  onClearAll,
  debugBundleFor,
  toast
}) {
  const t = useTheme();
  const [tab, setTab] = useState("api");
  const tabs = [["api", "API"], ["sense", "感知"], ["cot", "思维链"], ["qa", "问答"], ["theme", "主题"], ["data", "数据"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col"
  }, /*#__PURE__*/React.createElement(Head, {
    zh: "设置",
    en: "Config",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    className: "px-6 flex gap-5 shrink-0",
    style: {
      marginTop: -6
    }
  }, tabs.map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    className: "pb-2",
    style: {
      borderBottom: tab === k ? `2px solid ${t.ink}` : "2px solid transparent"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: tab === k ? t.ink : t.fog
    }
  }, l)))), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 mx-6 h-px",
    style: {
      background: t.line
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto px-6 pb-10"
  }, tab === "api" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ApiConfig, {
    profiles: apiProfiles,
    activeId: activeId,
    bgApiId: bgApiId,
    onSetBgApi: onSetBgApi,
    onSave: onSaveApi,
    toast: toast
  }), /*#__PURE__*/React.createElement(ImageApiConfig, {
    toast: toast
  }), /*#__PURE__*/React.createElement(TtsApiConfig, {
    toast: toast,
    characters: characters,
    onAssignVoice: onAssignVoice
  })), tab === "sense" && /*#__PURE__*/React.createElement(SenseConfig, {
    prefs: prefs,
    onSave: onSavePrefs,
    geo: geo,
    onRequestGeo: onRequestGeo,
    toast: toast
  }), tab === "cot" && /*#__PURE__*/React.createElement(CotConfig, {
    toast: toast
  }), tab === "qa" && /*#__PURE__*/React.createElement(CoupleQAConfig, {
    characters: characters,
    custom: coupleQACustom,
    onSave: onSaveCustomQA,
    toast: toast
  }), tab === "theme" && /*#__PURE__*/React.createElement(ThemeConfig, {
    theme: theme,
    onSave: onSaveTheme,
    wallpaper: wallpaper,
    onSaveWallpaper: onSaveWallpaper
  }), tab === "data" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(DataConfig, {
    onExport: onExport,
    onImport: onImport,
    onClearAll: onClearAll,
    toast: toast
  }), /*#__PURE__*/React.createElement(CtxDebug, {
    characters: characters,
    getBundle: debugBundleFor
  }))));
}
function ApiConfig({
  profiles,
  activeId,
  bgApiId,
  onSetBgApi,
  onSave,
  toast
}) {
  const t = useTheme();
  const [list, setList] = useState(profiles.length ? profiles : [{
    id: "p_" + Date.now(),
    name: "",
    baseUrl: "",
    apiKey: "",
    model: "",
    temperature: 0.75
  }]);
  const [curId, setCurId] = useState(activeId || profiles[0] && profiles[0].id || (profiles.length ? profiles[0].id : null));
  const [dd, setDd] = useState(false);
  const [models, setModels] = useState([]);
  const [fetching, setFetching] = useState(false);
  const cur = list.find(p => p.id === curId) || list[0];
  const upd = patch => setList(l => l.map(p => p.id === cur.id ? {
    ...p,
    ...patch
  } : p));
  const addNew = () => {
    const np = {
      id: "p_" + Date.now(),
      name: "",
      baseUrl: "",
      apiKey: "",
      model: "",
      temperature: 0.75
    };
    setList(l => [...l, np]);
    setCurId(np.id);
    setModels([]);
    setDd(false);
  };
  const removeCur = () => {
    if (list.length <= 1) return;
    const nl = list.filter(p => p.id !== cur.id);
    setList(nl);
    setCurId(nl[0].id);
  };
  const pull = async () => {
    setFetching(true);
    try {
      const ms = await fetchModelList(cur);
      setModels(ms);
      toast(ms.length + " 个模型");
    } catch (e) {
      toast("拉取失败：" + e.message);
    } finally {
      setFetching(false);
    }
  };
  // 测这个配置支不支持向量（embedding）——想搞向量记忆前先按这个确认
  const [embTest, setEmbTest] = useState(null);
  const testEmb = async () => {
    if (!cur.baseUrl || !cur.apiKey) { toast("先填地址和 key"); return; }
    setEmbTest({ busy: true });
    try {
      const r = await testEmbedding(cur);
      setEmbTest(r);
    } catch (e) { setEmbTest({ ok: false, msg: e.message || String(e) }); }
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(LineField, {
    zh: "选择配置",
    en: "Profile",
    right: /*#__PURE__*/React.createElement("button", {
      onClick: addNew,
      style: {
        fontFamily: F_BODY,
        fontSize: 11,
        color: t.ink
      }
    }, "+ 新建")
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(!dd),
    className: "w-full flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 20,
      color: cur.name ? t.ink : t.fog
    }
  }, cur.name || "未命名配置"), /*#__PURE__*/React.createElement(IChevD, {
    size: 18,
    color: t.fog
  })), dd && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 space-y-1"
  }, list.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    onClick: () => {
      setCurId(p.id);
      setModels([]);
      setDd(false);
    },
    className: "w-full text-left py-1.5",
    style: {
      fontFamily: F_BODY,
      fontSize: 14,
      color: p.id === curId ? t.ink : t.fog
    }
  }, p.name || "未命名", p.id === curId ? " ·" : "")))), /*#__PURE__*/React.createElement(LineField, {
    zh: "配置名称",
    en: "Name"
  }, /*#__PURE__*/React.createElement(LineInput, {
    value: cur.name,
    onChange: e => upd({
      name: e.target.value
    }),
    placeholder: "给这个配置起个名字"
  })), /*#__PURE__*/React.createElement(LineField, {
    zh: "接口地址",
    en: "Endpoint"
  }, /*#__PURE__*/React.createElement(LineInput, {
    value: cur.baseUrl,
    onChange: e => upd({
      baseUrl: e.target.value
    }),
    placeholder: "https://api.openai.com 或中转地址",
    style: {
      fontSize: 15,
      fontFamily: F_BODY
    }
  })), /*#__PURE__*/React.createElement(LineField, {
    zh: "密钥",
    en: "Key"
  }, /*#__PURE__*/React.createElement(LineInput, {
    type: "password",
    value: cur.apiKey,
    onChange: e => upd({
      apiKey: e.target.value
    }),
    placeholder: "sk-... / AIza...",
    style: {
      fontSize: 15,
      fontFamily: F_BODY
    }
  })), /*#__PURE__*/React.createElement(LineField, {
    zh: "模型",
    en: "Model",
    right: /*#__PURE__*/React.createElement("button", {
      onClick: pull,
      disabled: fetching,
      className: "disabled:opacity-40",
      style: {
        fontFamily: F_BODY,
        fontSize: 11,
        color: t.ink,
        borderBottom: `1.5px solid ${t.ink}`,
        paddingBottom: 1
      }
    }, fetching ? "拉取中…" : "点击拉取列表")
  }, /*#__PURE__*/React.createElement(LineInput, {
    value: cur.model,
    onChange: e => upd({
      model: e.target.value
    }),
    placeholder: "先拉取列表或手动输入模型名",
    style: {
      fontSize: 16
    }
  }), models.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto"
  }, models.map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => upd({
      model: m
    }),
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      padding: "4px 9px",
      borderRadius: 999,
      border: `1px solid ${cur.model === m ? t.ink : t.line}`,
      color: cur.model === m ? t.ink : t.fog
    }
  }, m)))), /*#__PURE__*/React.createElement(LineField, {
    zh: "温度",
    en: "Temperature",
    right: /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: F_DISPLAY,
        fontStyle: "italic",
        fontSize: 18,
        color: t.ink
      }
    }, (cur.temperature != null ? cur.temperature : 0.75).toFixed(1))
  }, /*#__PURE__*/React.createElement(Slider, {
    value: cur.temperature != null ? cur.temperature : 0.75,
    min: 0,
    max: 2,
    step: 0.1,
    onChange: v => upd({
      temperature: v
    })
  })),
  // 向量记忆前置检测：这个 API 支不支持 embedding
  h("div", { style: { marginTop: 20, paddingTop: 16, borderTop: "1px solid " + t.line } },
    h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
      h("div", null,
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, "向量记忆检测"),
        h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginLeft: 8 } }, "Embedding")),
      h("button", { onClick: testEmb, disabled: embTest && embTest.busy, className: "active:opacity-70 disabled:opacity-40", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.ink, borderBottom: "1.5px solid " + t.ink, paddingBottom: 1 } }, embTest && embTest.busy ? "检测中…" : "测一下")),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.6, marginBottom: embTest && !embTest.busy ? 8 : 0 } }, "想搞向量记忆（更聪明的记忆检索）先测这个——会真调一次这家的 /embeddings 接口。"),
    embTest && !embTest.busy ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.6, padding: "9px 12px", borderRadius: 10, background: embTest.ok ? "rgba(90,150,90,0.1)" : "rgba(194,90,74,0.09)", border: "1px solid " + (embTest.ok ? "#8ab88a55" : "#c25a4a55"), color: embTest.ok ? "#4a7a4a" : "#b0503f" } },
      embTest.ok ? ("✅ 支持！模型「" + embTest.model + "」，向量维度 " + embTest.dim + "。可以搞向量记忆了。") : ("❌ 不支持 / 没测通：" + (embTest.msg || "未知") + (embTest.embModelHint ? "" : "\n可在下面手填 embedModel 再试。"))) : null,
    h("input", { value: cur.embedModel || "", onChange: e => upd({ embedModel: e.target.value }), placeholder: "可选：手填 embedding 模型名（如 text-embedding-3-small）", style: { width: "100%", outline: "none", marginTop: 8, padding: "8px 11px", borderRadius: 9, fontFamily: F_BODY, fontSize: 12, background: t.bg2, color: t.ink, border: "1px solid " + t.line } })),
  /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3 mt-8"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onSave(list, curId);
      toast("已保存");
    },
    className: "flex-1 py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      letterSpacing: "0.06em",
      background: t.ink,
      color: t.bg2,
      borderRadius: 6
    }
  }, "保存"), list.length > 1 && /*#__PURE__*/React.createElement("button", {
    onClick: removeCur,
    className: "py-3 px-5",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.fog,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, "删除此配置")), onSetBgApi && h("div", { style: { marginTop: 26, paddingTop: 18, borderTop: "1px solid " + t.line } },
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink, marginBottom: 4 } }, "后台任务 API（省钱可选）"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 12, lineHeight: 1.6 } }, "抽取记忆 / 日程 / 钱包 / 查手机 / 随身物 / 购物 / 便签墙 / 心情日历 / 记账 / 番茄钟 这些后台活，走一个便宜的按量小模型（如 gemini-flash-nothinking），不动聊天/日记/同人这些创作类。不选＝跟主模型用同一个。"),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } },
      [{ id: null, name: "跟随主模型" }].concat(list).map(p => {
        const on = (bgApiId || null) === (p.id || null);
        return h("button", { key: p.id || "none", onClick: () => onSetBgApi(p.id || null), className: "active:opacity-70",
          style: { fontFamily: F_BODY, fontSize: 12.5, color: on ? t.bg2 : t.sub, background: on ? t.ink : "transparent", border: "1px solid " + (on ? t.ink : t.line), borderRadius: 999, padding: "6px 13px" } }, p.name || p.model || "未命名配置");
      }))));
}
function SenseConfig({
  prefs,
  onSave,
  geo,
  onRequestGeo,
  toast
}) {
  const t = useTheme();
  const [p, setP] = useState(prefs);
  const [notifOn, setNotifOn] = useState(() => !!(window.Notify && window.Notify.isOn()));
  const save = np => {
    setP(np);
    onSave(np);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "pt-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-4",
    style: {
      borderBottom: `1px solid ${t.line}`
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 16,
      color: t.ink
    }
  }, "时间感知"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11.5,
      color: t.fog,
      marginTop: 2
    }
  }, "角色知道现在的真实时间，深夜/清晨会自然回应")), /*#__PURE__*/React.createElement(Toggle, {
    on: p.timeAware !== false,
    onChange: v => save({
      ...p,
      timeAware: v
    })
  })), h("div", {
    className: "flex items-center justify-between py-4",
    style: { borderBottom: `1px solid ${t.line}` }
  }, h("div", { style: { paddingRight: 12 } }, h("div", {
    style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink }
  }, "锁屏通知"), h("div", {
    style: { fontFamily: F_BODY, fontSize: 11.5, lineHeight: 1.5, color: t.fog, marginTop: 2 }
  }, "角色发来消息、动态时，若你切到别处或锁了屏，弹成真·系统通知。iOS 需先把网页用 Safari「添加到主屏」、以独立 App 打开再开启。")), h(Toggle, {
    on: notifOn,
    onChange: v => {
      if (!window.Notify || !window.Notify.supported()) { toast && toast("此设备/浏览器不支持通知"); return; }
      if (v) {
        window.Notify.enable().then(perm => {
          if (perm === "granted") { setNotifOn(true); toast && toast("锁屏通知已开启～切后台也能收到"); window.Notify.test(700); }
          else if (perm === "denied") { setNotifOn(false); toast && toast("通知被拒了：去系统/浏览器设置里手动允许"); }
          else { setNotifOn(false); toast && toast("iOS 请先「添加到主屏」，以独立 App 打开再开"); }
        });
      } else { window.Notify.disable(); setNotifOn(false); toast && toast("已关闭锁屏通知"); }
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-4",
    style: {
      borderBottom: `1px solid ${t.line}`
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 16,
      color: t.ink
    }
  }, "位置感知"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11.5,
      color: t.fog,
      marginTop: 2
    }
  }, geo && geo.label ? "当前：" + geo.label : "角色可据你的位置回应（需授权定位）")), /*#__PURE__*/React.createElement(Toggle, {
    on: p.geoAware === true,
    onChange: v => {
      save({
        ...p,
        geoAware: v
      });
      if (v) onRequestGeo();
    }
  })), p.geoAware && /*#__PURE__*/React.createElement("button", {
    onClick: onRequestGeo,
    className: "mt-4 w-full py-2.5",
    style: {
      fontFamily: F_BODY,
      fontSize: 12,
      color: t.ink,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, geo && geo.label ? "重新获取定位" : "获取当前定位"), geo && geo.error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11.5,
      color: t.accent,
      marginTop: 8
    }
  }, "定位失败：", geo.error));
}
function ThemeConfig({
  theme,
  onSave,
  wallpaper,
  onSaveWallpaper
}) {
  const t = useTheme();
  const [th, setTh] = useState(theme);
  const fileRef = useRef(null);
  const pickWallpaper = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 1080, 0.82);
      onSaveWallpaper(dataUrl);
    } catch (err) {
      onSaveWallpaper && onSaveWallpaper(wallpaper); // 触发 toast 之外无操作
    }
  };
  const fields = [["bg", "背景"], ["bg2", "卡片/次背景"], ["ink", "文字/强调"], ["sub", "正文"], ["fog", "弱文字"], ["line", "分割线"], ["accent", "警示色"], ["tint", "点缀色"]];
  return /*#__PURE__*/React.createElement("div", {
    className: "pt-4"
  },
  // 主屏壁纸：从相册自定义
  /*#__PURE__*/React.createElement("div", {
    className: "pb-5 mb-2",
    style: {
      borderBottom: `1px solid ${t.line}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink,
      marginBottom: 12
    }
  }, "主屏壁纸"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => fileRef.current && fileRef.current.click(),
    style: {
      width: 62,
      height: 112,
      borderRadius: 14,
      flexShrink: 0,
      cursor: "pointer",
      border: `1px solid ${t.line}`,
      background: wallpaper ? `center/cover no-repeat url(${wallpaper})` : "linear-gradient(165deg, #efe9df 0%, #e6ddd0 55%, #ddd2c4 100%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => fileRef.current && fileRef.current.click(),
    className: "w-full py-2.5",
    style: {
      fontFamily: F_BODY,
      fontSize: 12.5,
      color: t.bg2,
      background: t.ink,
      borderRadius: 6
    }
  }, wallpaper ? "从相册更换" : "从相册选择"), wallpaper && /*#__PURE__*/React.createElement("button", {
    onClick: () => onSaveWallpaper(""),
    className: "w-full py-2.5 mt-2",
    style: {
      fontFamily: F_BODY,
      fontSize: 12.5,
      color: t.fog,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, "恢复默认背景"))), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    onChange: pickWallpaper,
    style: {
      display: "none"
    }
  })), fields.map(([k, l]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "flex items-center justify-between py-3.5",
    style: {
      borderBottom: `1px solid ${t.line}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.fog
    }
  }, th[k]), /*#__PURE__*/React.createElement("input", {
    type: "color",
    value: th[k],
    onChange: e => setTh({
      ...th,
      [k]: e.target.value
    }),
    style: {
      width: 30,
      height: 30,
      borderRadius: 999
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3 mt-8"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onSave(th),
    className: "flex-1 py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      background: t.ink,
      color: t.bg2,
      borderRadius: 6
    }
  }, "保存主题"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTh(DEFAULT_THEME),
    className: "py-3 px-5",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.fog,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, "默认")));
}
function CloudSync({ toast }) {
  const t = useTheme();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmPull, setConfirmPull] = useState(false);
  useEffect(() => {
    if (window.Cloud && window.Cloud.ready()) {
      setReady(true);
      window.Cloud.getUser().then(setUser);
    }
  }, []);
  const field = {
    fontFamily: F_BODY,
    fontSize: 13,
    color: t.ink,
    background: t.bg2,
    border: `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "10px 12px",
    width: "100%"
  };
  const btnDark = {
    fontFamily: F_BODY,
    fontSize: 13,
    background: t.ink,
    color: t.bg2,
    borderRadius: 6
  };
  const btnLine = {
    fontFamily: F_BODY,
    fontSize: 13,
    color: t.ink,
    border: `1px solid ${t.line}`,
    borderRadius: 6
  };
  const label = txt => h("div", {
    style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink, marginBottom: 4 }
  }, txt);
  const note = txt => h("div", {
    style: { fontFamily: F_BODY, fontSize: 12, lineHeight: 1.7, color: t.fog }
  }, txt);

  if (!ready) {
    return h("div", { className: "pt-6 pb-6", style: { borderBottom: `1px solid ${t.line}` } },
      label("云备份"),
      note("云服务未就绪（网络问题或未加载 Supabase）。你仍可用下方的本地导出/导入备份。"));
  }

  const doSignIn = async () => {
    if (!email || !pw) { toast("请填写邮箱和密码"); return; }
    setBusy("in");
    try {
      const r = await window.Cloud.signIn(email.trim(), pw);
      setUser(r.user);
      setPw("");
      toast("已登录，正在同步…");
      const res = await window.Cloud.autoPull();
      if (res && res.applied) { setTimeout(() => location.reload(), 600); }
      else toast("已开启自动同步");
    } catch (e) {
      toast("登录失败：" + (e.message || "请检查邮箱密码"));
    } finally { setBusy(""); }
  };
  const doSignUp = async () => {
    if (!email || !pw) { toast("请填写邮箱和密码"); return; }
    if (pw.length < 6) { toast("密码至少 6 位"); return; }
    setBusy("up");
    try {
      const r = await window.Cloud.signUp(email.trim(), pw);
      setPw("");
      if (r.session && r.user) {
        setUser(r.user);
        toast("注册成功，已登录");
        const res = await window.Cloud.autoPull();
        if (res && res.applied) setTimeout(() => location.reload(), 600);
      } else {
        toast("注册成功，请到邮箱确认后再登录");
      }
    } catch (e) {
      toast("注册失败：" + (e.message || "请重试"));
    } finally { setBusy(""); }
  };
  const doPush = async () => {
    setBusy("push");
    try {
      await window.Cloud.push();
      toast("已备份到云端");
    } catch (e) {
      toast("备份失败：" + (e.message || "请重试"));
    } finally { setBusy(""); }
  };
  const doPull = async () => {
    setBusy("pull");
    try {
      const row = await window.Cloud.pull();
      if (!row || !row.data) { toast("云端还没有备份"); setBusy(""); setConfirmPull(false); return; }
      window.Cloud.apply(row.data);
      toast("已从云端恢复，正在重载…");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast("恢复失败：" + (e.message || "请重试"));
      setBusy("");
      setConfirmPull(false);
    }
  };
  const doSignOut = async () => {
    setBusy("out");
    await window.Cloud.signOut();
    setUser(null);
    toast("已退出登录，本机数据已清空，正在重载…");
    setTimeout(function () { location.reload(); }, 800);
  };

  const inner = user
    ? [
        h("div", { key: "who", style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, marginTop: 4 } },
          "已登录：" + (user.email || user.id)),
        note("已开启自动同步：数据改动会自动备份到云端，换设备/重装登录后自动拉回最新存档。下面两个按钮一般用不到，仅在你想立刻手动操作时用。"),
        h("button", { key: "push", onClick: doPush, disabled: !!busy, className: "mt-4 w-full py-3", style: btnDark },
          busy === "push" ? "备份中…" : "立即备份到云端"),
        !confirmPull
          ? h("button", { key: "pull", onClick: () => setConfirmPull(true), disabled: !!busy, className: "mt-3 w-full py-3", style: btnLine },
              "从云端恢复")
          : h("div", { key: "pullc", className: "mt-3" },
              note("从云端恢复会覆盖本机当前数据，确定？"),
              h("div", { className: "flex gap-3 mt-2" },
                h("button", { onClick: () => setConfirmPull(false), className: "flex-1 py-3", style: btnLine }, "取消"),
                h("button", { onClick: doPull, disabled: busy === "pull", className: "flex-1 py-3", style: { ...btnDark, background: t.accent, color: "#fff" } },
                  busy === "pull" ? "恢复中…" : "确定恢复"))),
        h("div", { key: "outnote", style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 18, lineHeight: 1.6 } },
          "退出登录会先把最新存档同步到云端，然后清空本机数据、回到初始状态。你的数据都在云端，重新登录会自动拉回。"),
        h("button", { key: "out", onClick: doSignOut, disabled: !!busy, className: "mt-2 w-full py-3", style: { ...btnLine, color: "#c0503f" } },
          busy === "out" ? "退出中…" : "退出登录（清空本机数据）")
      ]
    : [
        note("访客模式：不登录也能正常玩，数据只存在本机浏览器。登录后可云端备份、换设备恢复。"),
        h("input", { key: "em", type: "email", inputMode: "email", autoComplete: "email", placeholder: "邮箱", value: email, onChange: e => setEmail(e.target.value), className: "mt-4", style: field }),
        h("input", { key: "pw", type: "password", autoComplete: "current-password", placeholder: "密码（至少 6 位）", value: pw, onChange: e => setPw(e.target.value), className: "mt-3", style: field }),
        h("div", { key: "btns", className: "flex gap-3 mt-3" },
          h("button", { onClick: doSignIn, disabled: !!busy, className: "flex-1 py-3", style: btnDark }, busy === "in" ? "登录中…" : "登录"),
          h("button", { onClick: doSignUp, disabled: !!busy, className: "flex-1 py-3", style: btnLine }, busy === "up" ? "注册中…" : "注册"))
      ];

  return h("div", { className: "pt-6 pb-6", style: { borderBottom: `1px solid ${t.line}` } },
    label("云备份"), ...inner);
}
// 本地存储占用条：localStorage 约 5MB 上限（图片吃大头），快满时红色预警——防「悄悄写满丢数据」
// 存储 key → 人话名称（谁占地方一眼看懂）；前缀匹配，最长优先
const STORAGE_KEY_LABELS = [
  ["x_chat:", "聊天记录"], ["x_gchat:", "群聊记录"], ["x_emojiPacks", "表情包"], ["x_emoji", "表情包"],
  ["x_wallpaper", "壁纸"], ["x_moments", "朋友圈"], ["x_characters", "角色档案(含头像)"],
  ["x_memLib", "记忆库"], ["x_memories", "长期记忆"], ["x_diaries", "日记"],
  ["x_forumPosts", "论坛帖子"], ["x_forumComments", "论坛评论"], ["x_fanfic", "同人文"],
  ["x_carry", "随身物"], ["x_selfie", "自拍(缩略)"], ["x_coupleExDiary", "交换日记"],
  ["x_capsule", "时光胶囊"], ["x_schedules", "角色日程"], ["x_couple", "情侣空间"],
  ["x_ledger", "记账"], ["x_memo", "备忘录"], ["x_read", "一起读"], ["x_study", "一起学"],
  ["x_lore", "世界书"], ["x_geo", "定位"], ["x_wx", "天气缓存"]
];
function storageBreakdown() {
  const rows = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k) continue;
      const bytes = (k.length + (localStorage.getItem(k) || "").length) * 2;
      let label = null;
      for (const [pfx, name] of STORAGE_KEY_LABELS) { if (k.indexOf(pfx) === 0) { label = name; break; } }
      if (!label) label = k.indexOf("x_") === 0 ? "其他数据" : "系统/其他";
      rows[label] = (rows[label] || 0) + bytes;
    }
  } catch (e) {}
  return Object.keys(rows).map(name => ({ name, bytes: rows[name] })).sort((a, b) => b.bytes - a.bytes);
}
function StorageMeter() {
  const t = useTheme();
  const [info, setInfo] = useState(null);
  const [detail, setDetail] = useState(false);
  const refresh = () => {
    const ls = (typeof localStorageBytes === "function") ? localStorageBytes() : 0;
    const LIMIT = 5 * 1024 * 1024;
    const rows = storageBreakdown();
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => setInfo({ ls: ls, lim: LIMIT, idbUsed: est.usage || 0, idbQuota: est.quota || 0, rows: rows })).catch(() => setInfo({ ls: ls, lim: LIMIT, rows: rows }));
    } else setInfo({ ls: ls, lim: LIMIT, rows: rows });
  };
  useEffect(refresh, []);
  if (!info) return null;
  const pct = Math.min(100, Math.round(info.ls / info.lim * 100));
  const near = pct >= 80;
  const mb = n => (n / 1048576).toFixed(1);
  const kb = n => n >= 102400 ? (n / 1048576).toFixed(2) + " MB" : Math.round(n / 1024) + " KB";
  const rows = info.rows || [];
  const maxB = rows.length ? rows[0].bytes : 1;
  return h("div", { style: { marginBottom: 20, padding: "14px 15px", background: t.bg2, border: "1px solid " + (near ? "#c25a4a" : t.line), borderRadius: 12 } },
    h("div", { className: "flex items-center justify-between", style: { marginBottom: 8 } },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, "本地存储占用"),
      h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: near ? "#c25a4a" : t.fog } }, mb(info.ls) + " / ~5 MB（" + pct + "%）")),
    h("div", { style: { height: 8, borderRadius: 999, background: t.line, overflow: "hidden" } },
      h("div", { style: { width: pct + "%", height: "100%", borderRadius: 999, background: near ? "#c25a4a" : (pct >= 60 ? "#b89150" : t.tint), transition: "width .3s" } })),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 8, lineHeight: 1.6 } },
      near ? "⚠️ 快满了！点下面「看谁占地方」找出大头——通常是壁纸/表情包/头像/朋友圈图。删掉用不到的、或导出备份后清理。满了新消息会存不进、可能丢。"
        : "文字＋图片都存这里（上限约 5MB），图片占大头。快满时 app 会提前弹警告。"),
    // 明细：谁占地方一眼看穿
    h("button", { onClick: () => { setDetail(d => !d); refresh(); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.tint, marginTop: 8 } }, detail ? "收起明细 ▴" : "看谁占地方 ▾"),
    detail ? h("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 6 } },
      rows.slice(0, 12).map(r => h("div", { key: r.name },
        h("div", { className: "flex items-center justify-between", style: { marginBottom: 2 } },
          h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.ink } }, r.name),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: r.bytes >= 512000 ? "#c25a4a" : t.fog } }, kb(r.bytes) + " · " + Math.round(r.bytes / info.ls * 100) + "%")),
        h("div", { style: { height: 3, borderRadius: 999, background: t.line, overflow: "hidden" } },
          h("div", { style: { width: Math.max(2, Math.round(r.bytes / maxB * 100)) + "%", height: "100%", borderRadius: 999, background: r.bytes >= 512000 ? "#c25a4a" : (r.bytes >= 204800 ? "#b89150" : t.tint) } })))),
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 4, lineHeight: 1.6 } }, "红=大头(≥0.5MB)。壁纸/表情包/头像是常见凶手：换小图、删旧表情包、清理老角色头像最省地方。图片迁 IndexedDB 是根治方向（后续可做）。")) : null,
    info.idbQuota ? h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 6 } }, "音频 / 自拍 / 书正文另存在 IndexedDB（已用 " + mb(info.idbUsed) + " MB，空间大得多、不占这 5MB）") : null);
}
function DataConfig({
  onExport,
  onImport,
  onClearAll,
  toast
}) {
  const t = useTheme();
  const [c, setC] = useState(false);
  const ref = useRef(null);
  return /*#__PURE__*/React.createElement("div", {
    className: "pt-6"
  }, h(StorageMeter, null), h(CloudSync, { toast: toast }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      lineHeight: 1.7,
      color: t.fog
    }
  }, "本地备份：数据保存在本机浏览器。换设备或清缓存前，也可导出为文件。"), /*#__PURE__*/React.createElement("button", {
    onClick: onExport,
    className: "mt-6 w-full py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      background: t.ink,
      color: t.bg2,
      borderRadius: 6
    }
  }, "导出全部数据（.json）"), /*#__PURE__*/React.createElement("button", {
    onClick: () => ref.current && ref.current.click(),
    className: "mt-3 w-full py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.ink,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, "导入备份恢复"), /*#__PURE__*/React.createElement("input", {
    ref: ref,
    type: "file",
    accept: "application/json,.json",
    className: "hidden",
    onChange: e => {
      const f = e.target.files && e.target.files[0];
      if (f) onImport(f);
      e.target.value = "";
    }
  }), !c ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setC(true),
    className: "mt-8 w-full py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.fog,
      border: `1px solid ${t.line}`,
      borderRadius: 6
    }
  }, "清空所有数据") : /*#__PURE__*/React.createElement("div", {
    className: "mt-8"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink,
      marginBottom: 12
    }
  }, "确定清空全部数据？无法撤销。建议先导出。"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setC(false),
    className: "flex-1 py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      border: `1px solid ${t.line}`,
      color: t.ink,
      borderRadius: 6
    }
  }, "取消"), /*#__PURE__*/React.createElement("button", {
    onClick: onClearAll,
    className: "flex-1 py-3",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      background: t.accent,
      color: "#fff",
      borderRadius: 6
    }
  }, "确定"))));
}
// ============================================================
// MEMORY LIBRARY 记忆库
// ============================================================
function MemoryLib({
  entries,
  characters,
  focusChar,
  busy,
  cfg,
  oldMemories,
  onBack,
  onAdd,
  onUpdate,
  onDelete,
  onExtract,
  onSaveCfg,
  onImportOld,
  onBackfillEmotion,
  emoBusy
}) {
  const t = useTheme();
  const [filter, setFilter] = useState(focusChar ? focusChar.id : "all");
  const [editing, setEditing] = useState(null); // "new" | entry
  const [cfgOpen, setCfgOpen] = useState(false); // 召回设置弹层
  const [q, setQ] = useState(""); // 搜索
  const [openOnly, setOpenOnly] = useState(false); // 只看未了结的约定/心事
  const nameOf = id => {
    const c = characters.find(x => x.id === id);
    return c ? c.remark || c.name : "未知";
  };
  // 情绪徽标：显愉悦度带符号 + 强度点数，颜色随愉悦度暖/冷/中（Ombre Brain 借鉴）。未评估(无 a)不显示
  const emoBadge = e => {
    if (typeof e.a !== "number") return null;
    const v = e.v || 0, a = e.a;
    const col = v >= 2 ? "#c98a3c" : v <= -2 ? "#5f7c9a" : "#9a9082";
    return h("span", { key: "emo", title: "愉悦度 " + v + " · 强度 " + a, style: { display: "inline-flex", alignItems: "center", gap: 4, fontFamily: F_BODY, fontSize: 10, fontWeight: 700, color: "#fff", background: col, padding: "1px 7px", borderRadius: 999 } },
      (v > 0 ? "＋" : v < 0 ? "－" : "") + Math.abs(v), h("span", { style: { opacity: 0.7 } }, "·"), "🔥" + a);
  };
  const unrated = (entries || []).filter(e => e && typeof e.a !== "number").length;
  const qlc = q.trim().toLowerCase();
  const list = (entries || []).filter(e => (!openOnly || e.open) && (filter === "all" || !e.charIds || e.charIds.length === 0 || e.charIds.includes(filter)) && (!qlc || (String(e.text || "") + " " + (e.tags || []).join(" ") + " " + (e.charIds || []).map(nameOf).join(" ")).toLowerCase().indexOf(qlc) >= 0)).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0));
  const importable = focusChar && oldMemories && (oldMemories[focusChar.id] || "").trim();
  return h("div", {
    className: "h-full flex flex-col"
  }, h(Head, {
    zh: "记忆库",
    en: "Memory · " + ((entries || []).length) + " 条",
    onBack: onBack,
    right: h("div", { className: "flex items-center", style: { gap: 14 } },
      onSaveCfg ? h("button", { onClick: () => setCfgOpen(true), className: "active:opacity-50", title: "召回设置" }, h(GConfig, { size: 19, color: t.ink })) : null,
      h("button", { onClick: () => setEditing("new"), className: "active:opacity-50" }, h(IPlus, { size: 20, color: t.ink })))
  }), h("div", {
    className: "shrink-0 px-6 pb-2"
  }, h("input", { value: q, onChange: e => setQ(e.target.value), placeholder: "搜索记忆内容 / 标签 / 角色…",
    className: "w-full outline-none", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, background: t.bg2, border: "1px solid " + t.line, borderRadius: 999, padding: "8px 14px" } })), h("div", {
    className: "shrink-0 px-6 pb-2 flex gap-2 overflow-x-auto"
  }, h("button", {
    key: "_open",
    onClick: () => setOpenOnly(o => !o),
    className: "px-3 py-1 rounded-full whitespace-nowrap",
    style: { fontFamily: F_BODY, fontSize: 12, background: openOnly ? "#b8860b" : "transparent", color: openOnly ? "#fff" : t.fog, border: "1px solid " + (openOnly ? "#b8860b" : t.line) }
  }, "⏳未了结"), [["all", "全部"]].concat(characters.map(c => [c.id, c.remark || c.name])).map(([id, label]) => h("button", {
    key: id,
    onClick: () => setFilter(id),
    className: "px-3 py-1 rounded-full whitespace-nowrap",
    style: {
      fontFamily: F_BODY,
      fontSize: 12,
      background: filter === id ? t.ink : "transparent",
      color: filter === id ? t.bg2 : t.fog,
      border: "1px solid " + (filter === id ? t.ink : t.line)
    }
  }, label))), h("div", {
    className: "flex-1 overflow-y-auto px-6 pb-8"
  }, onBackfillEmotion && unrated > 0 ? h("button", {
    onClick: onBackfillEmotion, disabled: emoBusy,
    className: "w-full rounded-xl py-2.5 mb-3 disabled:opacity-40",
    style: { border: "1px dashed " + t.tint, color: t.tint, fontFamily: F_BODY, fontSize: 13 }
  }, emoBusy ? "评估中…" : "✨ 给 " + unrated + " 条旧记忆补上情绪评估（点亮色标）") : null, focusChar && onExtract && h("button", {
    onClick: onExtract,
    disabled: busy,
    className: "w-full rounded-xl py-2.5 mb-3 disabled:opacity-40",
    style: {
      border: "1px dashed " + t.line,
      color: t.sub,
      fontFamily: F_BODY,
      fontSize: 13
    }
  }, busy ? "抽取中…" : "＋ 从与 " + (focusChar.remark || focusChar.name) + " 的对话自动提取"), importable && onImportOld ? h("button", {
    onClick: () => onImportOld(focusChar.id), disabled: busy, className: "w-full rounded-xl py-2.5 mb-3 disabled:opacity-40",
    style: { border: "1px dashed " + t.line, color: t.sub, fontFamily: F_BODY, fontSize: 13 }
  }, "↧ 把 " + (focusChar.remark || focusChar.name) + " 的旧长期记忆拆成条目导入") : null, list.length === 0 && h(Empty, {
    text: qlc ? "没找到相关记忆" : "还没有记忆",
    sub: "点右上角 + 手动添加，或从对话自动提取"
  }), list.map(e => h("button", {
    key: e.id,
    onClick: () => setEditing(e),
    className: "w-full text-left rounded-2xl px-4 py-3 mb-2.5",
    style: {
      background: t.bg2,
      border: "1px solid " + t.line
    }
  }, h("div", {
    className: "flex items-start justify-between gap-2"
  }, h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 14,
      lineHeight: 1.6,
      color: t.ink,
      whiteSpace: "pre-wrap"
    }
  }, e.text), e.pinned && h("span", {
    style: {
      fontSize: 11,
      color: t.accent,
      fontFamily: F_BODY,
      whiteSpace: "nowrap"
    }
  }, "置顶")), h("div", {
    className: "flex flex-wrap items-center gap-1.5 mt-2"
  }, emoBadge(e), e.open ? h("span", { key: "open", style: { fontFamily: F_BODY, fontSize: 10.5, color: "#fff", background: "#b06a4f", padding: "1px 7px", borderRadius: 999 } }, "未了") : null, (e.tags || []).map((tag, i) => h("span", {
    key: i,
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.sub,
      background: t.bg,
      padding: "1px 7px",
      borderRadius: 999
    }
  }, tag)), h("span", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog
    }
  }, !e.charIds || e.charIds.length === 0 ? "全局可见" : e.charIds.map(nameOf).join("、")), h("span", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10,
      color: t.line
    }
  }, "· " + new Date(e.ts || Date.now()).toLocaleDateString("zh-CN"), (e.source === "import" ? " · 导入" : e.source === "manual" ? " · 手动" : (e.tags || []).includes("群聊") ? " · 群聊" : (e.tags || []).includes("线下") ? " · 线下" : e.source === "auto" ? " · 自动" : "")))))), cfgOpen && onSaveCfg && h(MemCfgSheet, {
    cfg: cfg || {}, onSave: onSaveCfg, onClose: () => setCfgOpen(false)
  }), editing && h(MemEntrySheet, {
    entry: editing === "new" ? null : editing,
    characters: characters,
    focusChar: focusChar,
    onClose: () => setEditing(null),
    onSave: data => {
      if (editing === "new") onAdd(data);else onUpdate(editing.id, data);
      setEditing(null);
    },
    onDelete: editing === "new" ? null : () => {
      onDelete(editing.id);
      setEditing(null);
    }
  }));
}
// 召回设置：自动抽取开关 + top-k + 抽取间隔 + 短期窗天数（消死区）
function MemCfgSheet({ cfg, onSave, onClose }) {
  const t = useTheme();
  const [c, setC] = useState(Object.assign({ topK: 5, autoExtract: true, extractInterval: 1, recentDays: 3, recentBudget: 8000 }, cfg || {}));
  const set = patch => setC(p => Object.assign({}, p, patch));
  const toggle = (label, sub, val, onT) => h("div", { className: "flex items-center justify-between", style: { padding: "12px 0", borderTop: "1px solid " + t.line } },
    h("div", { style: { flex: 1, paddingRight: 12 } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, label),
      sub ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, sub) : null),
    h("button", { onClick: onT, className: "active:opacity-70 shrink-0", style: { width: 50, height: 29, borderRadius: 999, background: val ? t.ink : t.line, position: "relative", transition: "background .2s" } },
      h("span", { style: { position: "absolute", top: 3, left: val ? 24 : 3, width: 23, height: 23, borderRadius: 999, background: "#fff", transition: "left .2s" } })));
  const slider = (label, val, min, max, step, unit, onCh, note) => h("div", { style: { padding: "12px 0", borderTop: "1px solid " + t.line } },
    h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, label),
      h("span", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.accent } }, val + (unit || ""))),
    h("input", { type: "range", min: min, max: max, step: step, value: val, onChange: e => onCh(Number(e.target.value)), className: "w-full" }),
    note ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, note) : null);
  return h(Sheet, { onClose: onClose, tall: true },
    h(Eyebrow, { style: { marginBottom: 2 } }, "召回设置"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 6 } }, "每轮往上下文塞几条 + 自动抽取的节拍 — token 封顶的旋钮"),
    toggle("自动抽取", "每轮聊天后后台静默把值得记的事拆成记忆入库（自带去重）", c.autoExtract !== false, () => set({ autoExtract: c.autoExtract === false })),
    slider("每轮召回条数 (top-k)", c.topK || 5, 2, 12, 1, " 条", v => set({ topK: v }), "不管库里存多少，每轮只取这么多 → token 恒定。"),
    slider("自动抽取间隔", c.extractInterval || 1, 1, 5, 1, " 轮", v => set({ extractInterval: v }), (c.extractInterval || 1) > 1 ? "每 " + c.extractInterval + " 轮抽一次，省抽取 API。" : "每轮都抽，记得最全、最费 API。日常设 2~3 轮够用。"),
    slider("短期窗覆盖天数", c.recentDays || 3, 1, 7, 1, " 天", v => set({ recentDays: v }), "最近这些天说的话一定带进上下文（消死区，不忘最近几天）。"),
    slider("短期窗字符预算", c.recentBudget || 8000, 3000, 16000, 1000, " 字", v => set({ recentBudget: v }), "上面那些原文最多带这么多字进上下文——长消息少带几条、短消息多带几条，token 有上限。调大记得更全、更费；调小更省。超出的老内容由自动抽取+摘要兜底。"),
    h("button", { onClick: () => { onSave(c); onClose(); }, className: "w-full active:opacity-80", style: { marginTop: 18, fontFamily: F_BODY, fontSize: 14.5, fontWeight: 700, color: t.bg2, background: t.ink, borderRadius: 12, padding: "12px" } }, "保存"));
}
function MemEntrySheet({
  entry,
  characters,
  focusChar,
  onClose,
  onSave,
  onDelete
}) {
  const t = useTheme();
  const [text, setText] = useState(entry ? entry.text : "");
  const [tagStr, setTagStr] = useState(entry ? (entry.tags || []).join("、") : "");
  const [charIds, setCharIds] = useState(entry ? entry.charIds || [] : focusChar ? [focusChar.id] : []);
  const [pinned, setPinned] = useState(entry ? !!entry.pinned : false);
  const [open, setOpen] = useState(entry ? !!entry.open : false);
  const [vv, setVv] = useState(entry && typeof entry.v === "number" ? entry.v : 0);
  const [aa, setAa] = useState(entry && typeof entry.a === "number" ? entry.a : 1);
  const toggleChar = id => setCharIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const save = () => {
    const tt = text.trim();
    if (!tt) return;
    const tags = tagStr.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean);
    onSave({
      text: tt,
      tags,
      charIds,
      pinned,
      open,
      v: vv,
      a: aa
    });
  };
  return h(Sheet, {
    onClose: onClose,
    tall: true
  }, h("div", {
    className: "flex items-center justify-between mb-3"
  }, h("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 22,
      color: t.ink
    }
  }, entry ? "编辑记忆" : "新增记忆"), h("button", {
    onClick: save
  }, h(ICheck, {
    size: 19,
    color: t.ink
  }))), h(LineArea, {
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "一句关键事实，如：他答应周末带我去看海。",
    style: {
      minHeight: 90
    }
  }), h(LineField, {
    zh: "标签",
    en: "Tags"
  }, h(LineInput, {
    value: tagStr,
    onChange: e => setTagStr(e.target.value),
    placeholder: "用、或空格分隔，如：约定 海边"
  })), h("div", {
    className: "pt-5"
  }, h(Eyebrow, {
    style: {
      marginBottom: 8
    }
  }, "关联角色（不选＝全局对所有人可见）"), h("div", {
    className: "flex flex-wrap gap-2"
  }, characters.map(c => {
    const on = charIds.includes(c.id);
    return h("button", {
      key: c.id,
      onClick: () => toggleChar(c.id),
      className: "px-3 py-1.5 rounded-full",
      style: {
        fontFamily: F_BODY,
        fontSize: 13,
        background: on ? t.ink : "transparent",
        color: on ? t.bg2 : t.sub,
        border: "1px solid " + (on ? t.ink : t.line)
      }
    }, c.remark || c.name);
  }))), h("div", {
    className: "flex items-center justify-between pt-6"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14,
      color: t.sub
    }
  }, "置顶（每次都注入对话）"), h("button", {
    onClick: () => setPinned(v => !v),
    style: {
      width: 46,
      height: 27,
      borderRadius: 999,
      background: pinned ? t.tint : t.line,
      position: "relative",
      transition: "background .2s"
    }
  }, h("span", {
    style: {
      position: "absolute",
      top: 3,
      left: pinned ? 22 : 3,
      width: 21,
      height: 21,
      borderRadius: 999,
      background: "#fff",
      transition: "left .2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
    }
  }))),
  // 未了结（Ombre Brain·承诺可标记完成）：勾上会更常被想起，办完/翻篇点掉它就不再惦记
  h("div", { className: "flex items-center justify-between pt-6" },
    h("div", { style: { flex: 1, paddingRight: 12 } },
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.sub } }, "还没了结（约定 / 心结）"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, "标记后 TA 会更常惦记这件事；等兑现了 / 翻篇了，点掉它就不再念叨")),
    h("button", { onClick: () => setOpen(v => !v), className: "shrink-0", style: { width: 46, height: 27, borderRadius: 999, background: open ? "#b06a4f" : t.line, position: "relative", transition: "background .2s" } },
      h("span", { style: { position: "absolute", top: 3, left: open ? 22 : 3, width: 21, height: 21, borderRadius: 999, background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" } }))),
  // 情绪坐标（Ombre Brain·valence/arousal）：愉悦度 + 强度，影响被想起的权重
  (() => {
    const stepper = (label, val, lo, hi, onCh) => h("div", { className: "flex items-center justify-between", style: { padding: "8px 0" } },
      h("span", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub } }, label),
      h("div", { className: "flex items-center", style: { gap: 12 } },
        h("button", { onClick: () => onCh(Math.max(lo, val - 1)), className: "active:opacity-60", style: { width: 26, height: 26, borderRadius: 999, border: "1px solid " + t.line, color: t.ink, fontFamily: F_DISPLAY, fontSize: 15 } }, "−"),
        h("span", { style: { minWidth: 24, textAlign: "center", fontFamily: F_DISPLAY, fontSize: 15, color: t.accent } }, val),
        h("button", { onClick: () => onCh(Math.min(hi, val + 1)), className: "active:opacity-60", style: { width: 26, height: 26, borderRadius: 999, border: "1px solid " + t.line, color: t.ink, fontFamily: F_DISPLAY, fontSize: 15 } }, "＋")));
    return h("div", { className: "pt-4", style: { borderTop: "1px solid " + t.line, marginTop: 14 } },
      h(Eyebrow, { style: { marginBottom: 4 } }, "情绪坐标"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 4, lineHeight: 1.5 } }, "越激动、越强烈的事越难忘、越常被想起。自动抽取会自己判断，也可手调"),
      stepper("愉悦度（-5 难过 ～ +5 开心）", vv, -5, 5, setVv),
      stepper("强度（0 平淡 ～ 5 刻骨）", aa, 0, 5, setAa));
  })(),
  onDelete && h("button", {
    onClick: onDelete,
    className: "w-full text-center pt-6",
    style: {
      fontFamily: F_BODY,
      fontSize: 13,
      color: t.accent
    }
  }, "删除这条记忆"));
}

// ============================================================
// 日记（Diary）——角色私密手账
// ============================================================
function diarySameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
function diaryNoOf(e) {
  if (e.no) return String(e.no).padStart(4, "0");
  let hsh = 0; const s = e.id || "";
  for (let i = 0; i < s.length; i++) hsh = (hsh * 31 + s.charCodeAt(i)) >>> 0;
  return String(hsh % 10000).padStart(4, "0");
}
function DiaryBarcode({ seed, color, h: hh = 26 }) {
  let x = 0; const s = String(seed || "0");
  for (let i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) >>> 0;
  const bars = [];
  for (let i = 0; i < 20; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    const w = (x % 3) + 1;
    const on = (x >> 5) % 4 !== 0;
    bars.push(h("span", { key: i, style: { width: w, height: hh, background: on ? color : "transparent", display: "inline-block" } }));
  }
  return h("div", { style: { display: "flex", gap: 1, alignItems: "flex-end" } }, bars);
}
function diaryPreview(e) {
  const p = (e.paras || []).find(x => !x.secret) || (e.paras || [])[0];
  return p ? p.text : "";
}

// 全文页
function DiaryEntryView({ entry, char, isMe, chars, onBack, onDelete, onComment, commenting }) {
  const t = useTheme();
  const [revealed, setRevealed] = useState({});
  const d = new Date(entry.ts);
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const hasSecret = (entry.paras || []).some(p => p.secret);
  const comments = entry.comments || [];
  const metaRow = (label, value, sub) => h("div", { className: "flex items-start justify-between py-2.5", style: { borderTop: `1px solid ${t.line}` } },
    h(Eyebrow, { style: { paddingTop: 3 } }, label),
    h("div", { className: "text-right" },
      h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 15, color: t.ink, letterSpacing: "0.02em" } }, value),
      sub && h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, color: t.fog, marginTop: 2 } }, sub)));
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg2 } },
    h("div", { className: "shrink-0 flex items-center justify-between px-6 pt-5 pb-2" },
      h("button", { onClick: onBack, className: "flex items-center gap-2 active:opacity-50" },
        h(IArrow, { size: 19, color: t.ink }),
        h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.15em", color: t.ink } }, "BACK")),
      h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.18em", color: t.fog } }, (isMe ? "ENTRY / " : "FRAGMENT / ") + diaryNoOf(entry)),
      h("button", { onClick: onDelete, className: "active:opacity-50" }, h(ITrash, { size: 18, color: t.fog }))),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-16" },
      isMe
        ? h("h1", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 38, lineHeight: 1.1, color: t.ink, marginTop: 14 } }, entry.title || "无题手记")
        : h(Fragment, null,
            h("h1", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 42, lineHeight: 1.05, color: t.ink, marginTop: 14 } }, entry.titleEn || "Untitled"),
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.fog, letterSpacing: "0.28em", marginTop: 12 } }, entry.titleZh || "")),
      // 元数据卡
      h("div", { className: "mt-8 px-4 pt-1 pb-2", style: { border: `1px solid ${t.line}`, borderRadius: 4, position: "relative" } },
        h("span", { style: { position: "absolute", top: -8, left: 12, fontSize: 16, color: t.fog, background: t.bg2, padding: "0 4px", lineHeight: 1 } }, "+"),
        metaRow("DATE & TIME", dateStr + "  /  " + (entry.timeStr || fmtClockShort(d))),
        metaRow("LOCATION", entry.location || "—", entry.coords || null),
        metaRow("ENVIRONMENT", entry.weather || "—")),
      // 正文
      h("div", { className: "mt-9 flex gap-3" },
        h("div", { style: { writingMode: "vertical-rl", fontFamily: "'Archivo',sans-serif", fontSize: 9.5, letterSpacing: "0.32em", color: t.fog, textTransform: "uppercase", height: "fit-content", paddingTop: 4 } }, isMe ? "Personal Record" : "Confidential Recollection"),
        h("div", { className: "flex-1 min-w-0" },
          hasSecret && h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10.5, letterSpacing: "0.14em", color: t.fog, marginBottom: 20, textAlign: "center" } }, "[ TAP THE BLURRED INK TO REVEAL ]"),
          (entry.paras || []).map((p, i) => {
            const hidden = p.secret && !revealed[i];
            return h("p", {
              key: i,
              onClick: hidden ? () => setRevealed(r => ({ ...r, [i]: true })) : undefined,
              style: {
                fontFamily: F_BODY, fontSize: 16.5, lineHeight: 2.05, color: t.ink, marginBottom: 20,
                filter: hidden ? "blur(5.5px)" : "none",
                cursor: hidden ? "pointer" : "auto",
                userSelect: hidden ? "none" : "auto",
                opacity: p.secret && !hidden ? 0.86 : 1,
                transition: "filter .35s ease"
              }
            }, p.text);
          }),
          (char && char.name) ? h("div", { style: { marginTop: 22, fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 19, color: t.sub, textAlign: "right" } }, "— " + char.name) : null)),
      // 角色评论（只在「我的日记」显示）
      isMe && h("div", { className: "mt-12" },
        h("div", { className: "flex items-baseline justify-between mb-1" },
          h(Eyebrow, null, "ECHOES · 回响"),
          comments.length > 0 && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, color: t.fog } }, comments.length + " 条")),
        comments.map(c => h("div", { key: c.id, className: "flex gap-3 py-3.5", style: { borderTop: `1px solid ${t.line}` } },
          h(Avatar, { character: (chars || []).find(x => x.id === c.charId) || { name: c.name }, size: 34, radius: 10 }),
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink, marginBottom: 3 } }, c.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, lineHeight: 1.7, color: t.sub } }, c.text)))),
        h("button", { onClick: onComment, disabled: commenting, className: "w-full mt-5 flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-50", style: { border: `1px dashed ${t.line}`, borderRadius: 14, padding: "12px 0", fontFamily: F_BODY, fontSize: 14, color: t.sub } },
          commenting ? h(IPulse, { size: 16, color: t.sub }) : h(ISpark, { size: 16, color: t.sub }),
          commenting ? "角色正在看你的日记…" : (comments.length ? "再让角色评论（可多选）" : "让角色评论（可多选）")))));
}
function fmtClockShort(d) {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// 单人档案卡（DIRECTORY），可横向翻页
function DiaryArchive({ characters, curId, setCurId, diaries, onOpen, onBack, onOpenList, onEditStyle, onCompose }) {
  const t = useTheme();
  const tp = useRef(null);
  const idx = Math.max(0, characters.findIndex(c => c.id === curId));
  const char = characters[idx] || characters[0];
  if (!char) return null;
  const list = diaries[char.id] || [];
  const last = list[0];
  const go = dir => {
    const ni = idx + dir;
    if (ni >= 0 && ni < characters.length) setCurId(characters[ni].id);
  };
  const onTS = e => { const t0 = e.touches[0]; tp.current = { x: t0.clientX, y: t0.clientY }; };
  const onTE = e => {
    if (!tp.current) return;
    const t1 = e.changedTouches[0];
    const dx = t1.clientX - tp.current.x, dy = t1.clientY - tp.current.y;
    tp.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };
  const bg = char.avatarImage
    ? `linear-gradient(180deg, rgba(10,9,8,0.15) 0%, rgba(10,9,8,0.55) 55%, #0c0b0a 92%), center/cover no-repeat url(${char.avatarImage})`
    : `linear-gradient(180deg, ${char.color || "#3a3730"} 0%, #0c0b0a 82%)`;
  return h("div", { className: "h-full flex flex-col", style: { background: "#0c0b0a", color: "#efe9df", touchAction: "pan-y" }, onTouchStart: onTS, onTouchEnd: onTE },
    h("div", { className: "flex-1 min-h-0 flex flex-col relative", style: { background: bg } },
      h("div", { className: "shrink-0 flex items-start justify-between px-6 pt-6" },
        h("button", { onClick: onBack, className: "flex items-center gap-2 active:opacity-60" },
          h("span", { className: "flex items-center justify-center", style: { width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(239,233,223,0.4)" } }, h(IArrow, { size: 18, color: "#efe9df" })),
          h("div", null,
            h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.15em" } }, "BACK"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.6 } }, "返回桌面"))),
        h("div", { className: "flex items-center gap-2" },
          h("button", { onClick: () => char.isMe ? onCompose() : onEditStyle(char.id), className: "flex items-center justify-center active:opacity-60", style: { width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(239,233,223,0.4)" } }, h(IPencil, { size: 17, color: "#efe9df" })),
          h("button", { onClick: onOpenList, className: "text-right active:opacity-60" },
            h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.15em" } }, "INDEX"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.6 } }, "目录定位")))),
      h("div", { className: "flex-1" }),
      h("div", { className: "shrink-0 px-6 pb-7" },
        h("div", { className: "flex items-baseline gap-3 mb-1" },
          h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 26, opacity: 0.5 } }, "No." + String(idx + 1).padStart(2, "0")),
          h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.2em", opacity: 0.6 } }, "AUTHOR IDENTITY · 记录对象")),
        h("div", { className: "flex items-end gap-3" },
          h("span", { style: { fontFamily: F_DISPLAY, fontWeight: 500, fontSize: 72, lineHeight: 0.95 } }, char.name),
          char.remark && h("span", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 26, opacity: 0.7, paddingBottom: 8 } }, char.remark)),
        h("div", { style: { height: 1, background: "rgba(239,233,223,0.35)", margin: "22px 0" } }),
        char.mbti && h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, letterSpacing: "0.14em", opacity: 0.85, marginBottom: 10 } }, "ARCHETYPE: " + char.mbti),
        char.motto && h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontStyle: "italic", fontSize: 18, opacity: 0.72, marginBottom: 22 } }, "“" + char.motto + "”"),
        h("div", { className: "flex items-end justify-between" },
          h("div", { className: "flex gap-10" },
            h("div", null,
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.2em", opacity: 0.55 } }, "ENTRIES 收录"),
              h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 34 } }, list.length)),
            h("div", null,
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.2em", opacity: 0.55 } }, "LAST SYNC 最后"),
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 17, marginTop: 8 } }, last ? new Date(last.ts).toLocaleDateString("en-CA").replace(/-/g, ".") : "—"))),
          h("button", { onClick: () => onOpen(char.id), className: "flex items-center gap-2 shrink-0 active:opacity-70", style: { background: "rgba(239,233,223,0.12)", border: "1px solid rgba(239,233,223,0.3)", borderRadius: 999, padding: "7px 8px 7px 13px" } },
            h("div", { className: "text-left" },
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.14em", whiteSpace: "nowrap" } }, "READ"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10, opacity: 0.7, whiteSpace: "nowrap" } }, "翻阅")),
            h("span", { className: "flex items-center justify-center shrink-0", style: { width: 30, height: 30, borderRadius: 999, background: "#efe9df" } }, h(IChevR, { size: 16, color: "#0c0b0a" })))),
        characters.length > 1 && h("div", { className: "flex items-center justify-center gap-6", style: { marginTop: 20 } },
          h("button", { onClick: () => go(-1), disabled: idx === 0, className: "active:opacity-50", style: { opacity: idx === 0 ? 0.2 : 0.7, padding: 6 } }, h(IArrow, { size: 20, color: "#efe9df" })),
          h("div", { className: "flex gap-1.5" }, characters.map((c, i) => h("span", { key: c.id, style: { width: i === idx ? 16 : 5, height: 5, borderRadius: 999, background: "#efe9df", opacity: i === idx ? 0.9 : 0.35, transition: "width .2s" } }))),
          h("button", { onClick: () => go(1), disabled: idx === characters.length - 1, className: "active:opacity-50", style: { opacity: idx === characters.length - 1 ? 0.2 : 0.7, padding: 6, transform: "scaleX(-1)" } }, h(IArrow, { size: 20, color: "#efe9df" }))))));
}

// 文风编辑
function DiaryStyleSheet({ char, onSave, onClose }) {
  const t = useTheme();
  const [mbti, setMbti] = useState(char.mbti || "");
  const [motto, setMotto] = useState(char.motto || "");
  const [style, setStyle] = useState(char.diaryStyle || "");
  const field = (label, node) => h("div", { className: "mb-4" }, h(Eyebrow, { style: { marginBottom: 7 } }, label), node);
  const inputStyle = { width: "100%", background: t.bg, border: `1px solid ${t.line}`, borderRadius: 12, padding: "11px 13px", fontFamily: F_BODY, fontSize: 14, color: t.ink };
  return h(Sheet, { onClose, tall: true },
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginBottom: 4 } }, char.name + " · 日记档案"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 18 } }, "只影响日记的档案卡与文风，留空则自动从人设推断。"),
    field("ARCHETYPE / 原型（如 ISFJ）", h("input", { value: mbti, onChange: e => setMbti(e.target.value), placeholder: "选填，如 ISFJ / 疯批学者", style: inputStyle })),
    field("一句话签名 / MOTTO", h("input", { value: motto, onChange: e => setMotto(e.target.value), placeholder: "选填，如 “反正你是我的”", style: inputStyle })),
    field("日记文风", h("textarea", { value: style, onChange: e => setStyle(e.target.value), rows: 5, placeholder: "选填。写这个角色写日记的调性：克制/热烈/文艺/毒舌…爱用什么意象、英文标题偏冷还是偏诗意、口头禅等。", style: { ...inputStyle, resize: "none", lineHeight: 1.6 } })),
    h("button", { onClick: () => { onSave(char.id, { mbti: mbti.trim(), motto: motto.trim(), diaryStyle: style.trim() }); onClose(); }, className: "w-full mt-2 active:opacity-70", style: { background: t.ink, color: t.bg2, borderRadius: 14, padding: "13px 0", fontFamily: F_BODY, fontSize: 15 } }, "保存"));
}

// 我自己写日记（全屏），时间/天气/城市自动抓本地
function MyDiaryCompose({ onBack, onSave }) {
  const t = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loc, setLoc] = useState("");
  const [weather, setWeather] = useState("");
  const [coords, setCoords] = useState(null);
  const [envState, setEnvState] = useState("loading"); // loading | done | denied
  const now = useRef(new Date()).current;
  const aliveRef = useRef(true);
  const grab = () => {
    setEnvState("loading");
    fetchLocalEnv().then(e => {
      if (!aliveRef.current) return;
      // 只覆盖抓到的，不清掉用户已手填的
      if (e.location) setLoc(e.location);
      if (e.weather) setWeather(e.weather);
      if (e.coords) setCoords(e.coords);
      setEnvState(e.coords ? "done" : "denied");
    }).catch(() => aliveRef.current && setEnvState("denied"));
  };
  useEffect(() => { aliveRef.current = true; grab(); return () => { aliveRef.current = false; }; }, []);
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const inp = { background: "transparent", border: "none", outline: "none", textAlign: "right", fontFamily: "'Archivo',sans-serif", fontSize: 15, color: t.ink, width: "60%" };
  const metaRow = (label, node) => h("div", { className: "flex items-center justify-between py-2.5", style: { borderTop: `1px solid ${t.line}` } }, h(Eyebrow, null, label), node);
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg2 } },
    h("div", { className: "shrink-0 flex items-center justify-between px-6 pt-5 pb-2" },
      h("button", { onClick: onBack, className: "flex items-center gap-2 active:opacity-50" },
        h(IArrow, { size: 19, color: t.ink }),
        h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.15em", color: t.ink } }, "BACK")),
      h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.18em", color: t.fog } }, "NEW ENTRY / 写日记"),
      h("button", { onClick: () => onSave({ title, body, location: loc, weather, coords, timeStr: fmtClockShort(now) }), className: "active:opacity-50", style: { fontFamily: F_BODY, fontSize: 15, color: t.accent } }, "保存")),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-16" },
      h("input", { value: title, onChange: e => setTitle(e.target.value), placeholder: "标题（选填）", style: { background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: F_DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 34, lineHeight: 1.1, color: t.ink, marginTop: 14 } }),
      h("div", { className: "mt-6 px-4 pt-1 pb-2", style: { border: `1px solid ${t.line}`, borderRadius: 4, position: "relative" } },
        h("span", { style: { position: "absolute", top: -8, left: 12, fontSize: 16, color: t.fog, background: t.bg2, padding: "0 4px", lineHeight: 1 } }, "+"),
        metaRow("DATE & TIME", h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 15, color: t.ink } }, dateStr + "  /  " + fmtClockShort(now))),
        metaRow("LOCATION", h("input", { value: loc, onChange: e => setLoc(e.target.value), placeholder: envState === "loading" ? "定位中…" : "手动填写", style: inp })),
        metaRow("ENVIRONMENT", h("input", { value: weather, onChange: e => setWeather(e.target.value), placeholder: envState === "loading" ? "抓取天气…" : "手动填写", style: inp }))),
      h("div", { className: "flex items-center justify-between mt-2.5" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } },
          envState === "loading" ? "· 正在请求定位与天气…" : envState === "denied" ? "· 没抓到定位/天气，可手填、留空，或重试。" : "· 已抓取本地位置与天气，可手动改。"),
        h("button", { onClick: grab, disabled: envState === "loading", className: "flex items-center gap-1.5 active:opacity-60 disabled:opacity-40", style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.08em", color: t.sub } },
          h(IRefresh, { size: 13, color: t.sub }), "重新定位")),
      h("textarea", { value: body, onChange: e => setBody(e.target.value), rows: 12, placeholder: "今天……（空行分段）", style: { width: "100%", marginTop: 24, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: F_BODY, fontSize: 16.5, lineHeight: 2.05, color: t.ink } })));
}

// 选哪些角色来评论（多选）
function DiaryCommentPickSheet({ characters, onConfirm, onClose }) {
  const t = useTheme();
  const [sel, setSel] = useState([]);
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return h(Sheet, { onClose, tall: true },
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginBottom: 4 } }, "让谁来评论"),
    h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 16 } }, "选中的角色会按此刻的心情、和你的关系与好感度各写一条。"),
    characters.map(c => {
      const on = sel.includes(c.id);
      return h("button", { key: c.id, onClick: () => toggle(c.id), className: "w-full flex items-center gap-3 py-3 active:opacity-70", style: { borderBottom: `1px solid ${t.line}` } },
        h(Avatar, { character: c, size: 42, radius: 12 }),
        h("div", { className: "flex-1 text-left" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, c.name),
          c.remark && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, c.remark)),
        h("span", { className: "flex items-center justify-center", style: { width: 24, height: 24, borderRadius: 999, border: `1.5px solid ${on ? t.ink : t.line}`, background: on ? t.ink : "transparent" } }, on && h(ICheck, { size: 14, color: t.bg2 })));
    }),
    h("button", { onClick: () => { if (sel.length) onConfirm(sel); }, disabled: !sel.length, className: "w-full mt-5 active:opacity-70 disabled:opacity-40", style: { background: t.ink, color: t.bg2, borderRadius: 14, padding: "13px 0", fontFamily: F_BODY, fontSize: 15 } }, sel.length ? "让这 " + sel.length + " 位评论" : "先选角色"));
}

function Diary({ characters, diaries, profile, genBusy, commentingId, onBack, onGen, onDelEntry, onSaveFields, onAddMyEntry, onGenComments, toast }) {
  const t = useTheme();
  // 「我」也是一个作者（No.00），放在最前
  const meAuthor = { id: "__me", name: profile.name || "我", avatarImage: profile.avatarImage, color: profile.color || t.accent, motto: profile.tagline || "", isMe: true };
  const authors = [meAuthor, ...characters];
  const [view, setView] = useState("archive"); // archive(默认大图) | home(目录) | entries | entry | compose
  const [curId, setCurId] = useState(characters[0] ? characters[0].id : "__me");
  const [curEntry, setCurEntry] = useState(null);
  const [styleEdit, setStyleEdit] = useState(null);
  const [commentPick, setCommentPick] = useState(null); // entryId 正在选评论角色
  const tx = useRef(null);
  const busy = genBusy || {};
  const curAuthor = authors.find(c => c.id === curId) || authors[0];
  const isMe = curAuthor && curAuthor.isMe;
  const entriesOf = id => diaries[id] || [];
  // 日记写的是【昨天】的，所以按钮/去重都按昨天判定
  const wroteToday = id => entriesOf(id).some(e => diarySameDay(e.ts, Date.now() - 86400000));

  const openEntries = id => { setCurId(id); setView("entries"); };
  const openArchive = id => { setCurId(id); setView("archive"); };
  const saveMyEntry = data => {
    const id = onAddMyEntry(data);
    if (id) { setCurId("__me"); setCurEntry(id); setView("entry"); }
    else setView("entries");
  };

  if (!authors.length) return h("div", { className: "h-full flex flex-col" },
    h(Head, { zh: "日记", en: "Diary", onBack }),
    h(Empty, { text: "还没有角色", sub: "先去名录录入" }));

  // ---- 我写日记 ----
  if (view === "compose") return h(MyDiaryCompose, { onBack: () => setView("entries"), onSave: saveMyEntry });

  // ---- 全文 ----
  if (view === "entry" && curEntry) {
    const e = entriesOf(curId).find(x => x.id === curEntry) || curEntry;
    return h(Fragment, null,
      h(DiaryEntryView, {
        entry: e, char: curAuthor, isMe, chars: characters,
        commenting: commentingId === e.id,
        onComment: isMe ? () => setCommentPick(e.id) : null,
        onBack: () => { setCurEntry(null); setView("entries"); },
        onDelete: () => { onDelEntry(curId, e.id); setCurEntry(null); setView("entries"); }
      }),
      commentPick && h(DiaryCommentPickSheet, {
        characters,
        onClose: () => setCommentPick(null),
        onConfirm: ids => { setCommentPick(null); onGenComments(commentPick, ids); }
      }));
  }

  // ---- 单人档案卡（默认进入的大图）----
  if (view === "archive") return h(Fragment, null,
    h(DiaryArchive, {
      characters: authors, curId, setCurId, diaries,
      onOpen: openEntries,
      onBack: onBack,
      onOpenList: () => setView("home"),
      onEditStyle: id => setStyleEdit(id),
      onCompose: () => setView("compose")
    }),
    styleEdit && h(DiaryStyleSheet, { char: characters.find(c => c.id === styleEdit), onSave: onSaveFields, onClose: () => setStyleEdit(null) }));

  // ---- 某作者的日记列表 ----
  if (view === "entries") {
    const list = entriesOf(curId);
    const idx = Math.max(0, authors.findIndex(c => c.id === curId));
    const onTS = ev => { tx.current = ev.touches[0].clientX; };
    const onTE = ev => {
      if (tx.current == null) return;
      const dx = ev.changedTouches[0].clientX - tx.current;
      if (dx < -55 && idx < authors.length - 1) setCurId(authors[idx + 1].id);
      if (dx > 55 && idx > 0) setCurId(authors[idx - 1].id);
      tx.current = null;
    };
    const done = wroteToday(curId), gb = busy[curId];
    return h("div", { className: "h-full flex flex-col" },
      h(Head, {
        zh: curAuthor.name, en: isMe ? "My Journal · 我的日记" : "Journal · 翻阅日记",
        onBack: () => setView("archive"),
        right: isMe
          ? h("button", { onClick: () => setView("compose"), className: "active:opacity-50" }, h(IPencil, { size: 18, color: t.ink }))
          : h("button", {
              onClick: () => { if (gb) return; if (done) { toast && toast("昨天的日记已经写过了"); return; } onGen(curId, { manual: true }); },
              disabled: gb, className: "active:opacity-50 disabled:opacity-40",
              style: { opacity: done && !gb ? 0.35 : 1 }
            }, gb ? h(IPulse, { size: 18, color: t.ink }) : h(IPencil, { size: 18, color: t.ink }))
      }),
      h("div", { className: "flex-1 overflow-y-auto px-6 pb-10", onTouchStart: onTS, onTouchEnd: onTE },
        gb && h(Spinner, { label: curAuthor.name + " 正在记录昨天…" }),
        !gb && !list.length && h(Empty, { text: "还没有日记", sub: isMe ? "点右上角铅笔写一篇" : "点右上角，或等 Ta 自己写" }),
        list.map((e, i) => {
          const d = new Date(e.ts);
          const mon = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
          const titleMain = isMe ? (e.title || "无题手记") : (e.titleEn || "Untitled");
          return h("div", {
            key: e.id, onClick: () => { setCurEntry(e.id); setView("entry"); },
            className: "flex gap-5 py-7 active:opacity-70",
            style: { borderTop: i === 0 ? "none" : `1px solid ${t.line}` }
          },
            h("div", { style: { width: 62, flexShrink: 0 } },
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.12em", color: t.fog } }, mon + ", " + d.getFullYear()),
              h("div", { style: { fontFamily: F_DISPLAY, fontWeight: 400, fontSize: 46, lineHeight: 1, color: t.ink, marginTop: 4 } }, String(d.getDate()).padStart(2, "0")),
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9.5, letterSpacing: "0.1em", color: t.accent, marginTop: 12 } }, "N° " + diaryNoOf(e)),
              h("div", { style: { marginTop: 6 } }, h(DiaryBarcode, { seed: e.id, color: t.sub, h: 20 }))),
            h("div", { className: "flex-1 min-w-0" },
              h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 25, lineHeight: 1.12, color: t.ink } }, titleMain),
              h("div", { className: "flex items-center gap-3 mt-1.5 mb-3" },
                !isMe && h("span", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 15, color: t.sub, letterSpacing: "0.08em" } }, e.titleZh || ""),
                isMe && (e.comments || []).length > 0 && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.1em", color: t.fog } }, (e.comments || []).length + " 条回响"),
                h("span", { style: { flex: 1, height: 1, background: t.line } })),
              h("div", { className: "line-clamp-2", style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.7, color: t.sub } }, diaryPreview(e)),
              h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 10, letterSpacing: "0.14em", color: t.fog, marginTop: 12 } }, "[ TAP TO DECRYPT / 点击查阅 ]")));
        })));
  }

  // ---- 目录定位：角色列表（从大图右上角 INDEX 进入，点一个跳回该角色大图）----
  return h("div", { className: "h-full flex flex-col" },
    h(Head, {
      zh: "目录", en: "Index · 记录对象",
      onBack: () => setView("archive")
    }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-10 pt-1" },
      authors.map(c => {
        const list = entriesOf(c.id); const last = list[0]; const gb = busy[c.id]; const cur = c.id === curId;
        return h("div", {
          key: c.id, onClick: () => openArchive(c.id),
          className: "flex items-center gap-4 py-4 active:opacity-70",
          style: { borderBottom: `1px solid ${t.line}` }
        },
          h(Avatar, { character: c, size: 52, radius: 15 }),
          h("div", { className: "flex-1 min-w-0" },
            h("div", { className: "flex items-center gap-2" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink } }, c.isMe ? c.name + "（我）" : c.name),
              cur && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 8, letterSpacing: "0.14em", padding: "2px 6px", borderRadius: 999, border: `1px solid ${t.line}`, color: t.fog } }, "当前")),
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } },
              gb ? "正在记录今天…" : list.length ? "共 " + list.length + " 篇 · 最后 " + new Date(last.ts).toLocaleDateString("zh-CN", { month: "long", day: "numeric" }) : (c.isMe ? "还没写过，点铅笔写一篇" : "尚未记录"))),
          gb ? h(IPulse, { size: 18, color: t.fog }) : h(IChevR, { size: 16, color: t.fog }));
      })),
    styleEdit && h(DiaryStyleSheet, { char: characters.find(c => c.id === styleEdit), onSave: onSaveFields, onClose: () => setStyleEdit(null) }));
}
// ---- 我的钱包（聊天软件「我」下面）----
function MyWallet({ balance, log, cards, characters, onBack, onSetBalance, onOpenCard }) {
  const t = useTheme();
  const [view, setView] = useState("main"); // main | cards
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState("");
  const cardList = Array.isArray(cards) ? cards : [];
  const charById = id => (characters || []).find(c => c.id === id);
  const saveEdit = () => {
    const v = Number(amt);
    if (!isNaN(v)) onSetBalance(v);
    setEditing(false);
    setAmt("");
  };
  if (view === "cards") {
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h("div", { className: "shrink-0 px-4 pt-5 pb-3 flex items-center gap-3", style: { background: t.bg2, borderBottom: "1px solid " + t.line } },
        h("button", { onClick: () => setView("main"), className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, "亲属卡"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginLeft: "auto" } }, "角色给你的卡 · 刷他们的钱")),
      h("div", { className: "flex-1 overflow-y-auto p-5 space-y-3" },
        cardList.length === 0 ? h("div", { className: "text-center mt-16", style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.8, color: t.fog } }, "还没有收到亲属卡。\n在聊天设置里开启「允许角色给我亲属卡」，\n合适的时候 TA 会主动给你一张，刷 TA 的钱。")
          : cardList.map(cd => {
            const c = charById(cd.charId) || {};
            const remaining = Math.round(((cd.limit || 0) - (cd.used || 0)) * 100) / 100;
            return h("button", { key: cd.charId, onClick: () => onOpenCard && onOpenCard(cd.charId), className: "w-full text-left active:opacity-80", style: { borderRadius: 16, overflow: "hidden", border: "1px solid " + t.line, background: "linear-gradient(135deg," + (c.color || "#6b7a8f") + "," + (c.color || "#3a4652") + ")" } },
              h("div", { className: "p-4", style: { color: "#fff" } },
                h("div", { className: "flex items-center justify-between mb-6" },
                  h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.14em", opacity: 0.85 } }, "亲属卡 · KINSHIP"),
                  h("span", { style: { fontFamily: F_BODY, fontSize: 12, opacity: 0.9 } }, c.name || "")),
                h("div", { className: "flex items-end justify-between" },
                  h("div", null,
                    h("div", { style: { fontFamily: F_BODY, fontSize: 10, opacity: 0.75, marginBottom: 2 } }, "剩余额度"),
                    h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 26, lineHeight: 1 } }, "¥" + remaining)),
                  h("div", { className: "text-right", style: { fontFamily: F_BODY, fontSize: 10.5, opacity: 0.8 } }, "总额度 ¥" + (cd.limit || 0)))));
          })));
  }
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h("div", { className: "shrink-0 px-4 pt-5 pb-3 flex items-center gap-3", style: { background: t.bg2, borderBottom: "1px solid " + t.line } },
      h("button", { onClick: onBack, className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, "我的钱包"),
      h("button", { onClick: () => setView("cards"), className: "ml-auto active:opacity-60 flex items-center gap-1", style: { fontFamily: F_BODY, fontSize: 12, color: t.tint } }, "亲属卡", cardList.length ? h("span", { style: { fontFamily: F_BODY, fontSize: 10, color: "#fff", background: t.tint, borderRadius: 999, padding: "0 6px" } }, String(cardList.length)) : null)),
    h("div", { className: "flex-1 overflow-y-auto" },
      // 余额卡
      h("div", { className: "m-5 p-5", style: { borderRadius: 18, background: "linear-gradient(135deg,#2f3a42,#171d21)", color: "#fff" } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, letterSpacing: "0.16em", opacity: 0.7 } }, "CNY · 余额"),
        h("div", { className: "flex items-end gap-3 mt-1" },
          h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 40, lineHeight: 1 } }, "¥" + balance),
          h("button", { onClick: () => { setAmt(String(balance)); setEditing(true); }, className: "mb-1 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 999, padding: "2px 10px" } }, "改余额"))),
      // 手动改余额
      editing && h("div", { className: "mx-5 mb-3 p-4", style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 8 } }, "把余额改成"),
        h("div", { className: "flex items-center gap-2" },
          h("input", { value: amt, onChange: e => setAmt(e.target.value), type: "number", inputMode: "decimal", autoFocus: true, className: "flex-1 outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 15, color: t.ink, background: "#fff", border: "1px solid " + t.line } }),
          h("button", { onClick: saveEdit, className: "px-4 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: t.ink, color: t.bg2, borderRadius: 8 } }, "保存"),
          h("button", { onClick: () => { setEditing(false); setAmt(""); }, className: "px-3 py-2 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "取消"))),
      // 流水
      h("div", { className: "px-5 pb-8" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.14em", color: t.fog, marginBottom: 10 } }, "流水 · LEDGER"),
        (!log || log.length === 0) ? h("div", { className: "text-center mt-8", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog } }, "还没有流水。转账、红包、购物都会记在这里。")
          : log.map(e => h("div", { key: e.id, className: "flex items-center justify-between py-3", style: { borderBottom: "1px solid " + t.line } },
            h("div", { className: "min-w-0 flex-1" },
              h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, e.label),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, fmtStamp(e.ts))),
            h("div", { className: "text-right shrink-0 ml-3" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: e.delta > 0 ? "#3f8a54" : t.ink } }, (e.delta > 0 ? "+" : "") + e.delta),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, marginTop: 1 } }, "余 " + e.after)))))));
}

// ============================================================
// 角色钱包 CharWallet —— 主页独立 app：花名册 → 单角色钱包（持久 running balance）
// 首开生成资产档案，转账/红包/礼物/亲属卡实时加减余额，每天 23 点按日程补日常消费
// ============================================================
function CharWallet({ characters, charWallet, selId, busyKey, hasApi, onBack, onSel, onInit, onCatchUp, onSetBalance, onRefresh }) {
  const t = useTheme();
  const chars = characters || [];
  const cw = charWallet || {};
  const char = chars.find(c => c.id === selId) || null;
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState("");
  const profEmpty = r => !r || ((!r.incomes || !r.incomes.length) && !r.monthlyIncome && !r.investAssets && !(r.notes && Object.keys(r.notes).length));
  // 打开某角色：没建档就生成资产；已建档但档案是空的（首开时没 API/生成失败）且现在有 API 就补生成；否则补账
  useEffect(() => {
    if (!char) return;
    const rec = cw[char.id];
    if (!rec || !rec.init) onInit(char);
    else { if (profEmpty(rec) && hasApi) onRefresh(char); onCatchUp(char); }
    setEditing(false); setAmt("");
    // eslint-disable-next-line
  }, [selId]);

  if (!chars.length) return h("div", { className: "h-full flex flex-col" }, h(Head, { zh: "钱包", en: "Wallet", onBack }), h(Empty, { text: "还没有角色", sub: "先去名录录入一位" }));

  // —— 花名册（未选角色）——
  if (!char) return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h(Head, { zh: "钱包", en: "Wallet · 选择角色", onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-5 pb-10 pt-1" }, chars.map(c => {
      const rec = cw[c.id];
      return h("button", { key: c.id, onClick: () => onSel(c.id), className: "w-full text-left flex items-center gap-4 py-4 active:opacity-70", style: { borderBottom: "1px solid " + t.line } },
        h(Avatar, { character: c, size: 50, radius: 14 }),
        h("div", { className: "flex-1 min-w-0" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, c.name),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, rec && rec.init ? "钱包余额" : "未开通 · 点开生成资产")),
        rec && rec.init
          ? h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, fmtMoney(rec.balance))
          : h(IChevR, { size: 16, color: t.fog }));
    })));

  // —— 单角色钱包详情 ——
  const rec = cw[char.id];
  const loading = busyKey === char.id;
  const ledger = (rec && rec.ledger) || [];
  const notes = (rec && rec.notes) || {};
  const incomes = (rec && rec.incomes) || [];
  const saveEdit = () => { const v = Number(amt); if (!isNaN(v)) onSetBalance(char.id, v); setEditing(false); setAmt(""); };
  const AV = ["#f2b134", "#3f6d8c", "#8a8f7a", "#c25a4a"];
  const secTitle = s => h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink, marginBottom: 10 } }, s);
  const note = s => s ? h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, fontStyle: "italic", lineHeight: 1.7, marginTop: 10 } }, s) : null;
  const cardBox = kids => h("div", { className: "mx-5 mb-4 p-4", style: { background: t.bg2, borderRadius: 16, border: "1px solid " + t.line } }, kids);
  // 本月收支（从流水分类算）
  const _now = new Date();
  const inMonth = ts => { const d = new Date(ts); return d.getMonth() === _now.getMonth() && d.getFullYear() === _now.getFullYear(); };
  const monthlyIncome = (rec && rec.monthlyIncome) || 0;
  const fixedMonthly = (rec && rec.fixedMonthly) || 0;
  const monthDaily = ledger.filter(e => e.kind === "daily" && inMonth(e.ts)).reduce((a, e) => a + Math.abs(e.delta), 0);
  const monthSpend = Math.round((fixedMonthly + monthDaily) * 100) / 100;
  const monthRemain = Math.round((monthlyIncome - monthSpend) * 100) / 100;
  const dailyEntries = ledger.filter(e => e.kind === "daily");
  const flowEntries = ledger.filter(e => ["transfer", "redpacket", "kinship", "gift"].indexOf(e.kind) >= 0);
  const sumRow = (label, value, color, sub) => h("div", { key: label, className: "flex items-center justify-between py-2.5", style: { borderTop: "1px solid " + t.line } },
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14, color: t.ink } }, label, sub ? h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginLeft: 6 } }, sub) : null),
    h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: color || t.ink } }, value));

  const header = h(Head, {
    zh: char.name, en: "Wallet",
    onBack: () => onSel(null),
    right: h("button", { onClick: () => onRefresh(char), disabled: loading, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 18, color: t.ink }))
  });

  if (loading && (!rec || !rec.init)) return h("div", { className: "h-full flex flex-col", style: { background: t.bg } }, header, h("div", { className: "flex-1 flex items-center justify-center" }, h(Spinner, { label: "正在生成 " + char.name + " 的资产…" })));

  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } }, header,
    h("div", { className: "flex-1 overflow-y-auto pb-10" },
      // 余额卡（跑动余额）
      h("div", { className: "m-5 p-5", style: { borderRadius: 18, background: "linear-gradient(135deg," + (char.color || "#2f3a42") + ",#171d21)", color: "#fff" } },
        h("div", { className: "flex items-center justify-between" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11, letterSpacing: "0.16em", opacity: 0.72 } }, char.name + " · 钱包余额"),
          h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9, letterSpacing: "0.16em", opacity: 0.6 } }, "RUNNING")),
        h("div", { className: "flex items-end gap-3 mt-1" },
          h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 38, lineHeight: 1 } }, fmtMoney(rec ? rec.balance : 0)),
          h("button", { onClick: () => { setAmt(String(rec ? rec.balance : 0)); setEditing(true); }, className: "mb-1 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 999, padding: "2px 10px" } }, "改余额")),
        rec && rec.monthlyIncome ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, opacity: 0.7, marginTop: 8 } }, "月收入 " + fmtMoney(rec.monthlyIncome) + (rec.fixedMonthly ? " · 月固定支出 " + fmtMoney(rec.fixedMonthly) : "")) : null),
      // 手动改余额
      editing ? h("div", { className: "mx-5 mb-4 p-4", style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line } },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 8 } }, "把余额改成"),
        h("div", { className: "flex items-center gap-2" },
          h("input", { value: amt, onChange: e => setAmt(e.target.value), type: "number", inputMode: "decimal", autoFocus: true, className: "flex-1 outline-none px-3 py-2 rounded-lg", style: { fontFamily: F_BODY, fontSize: 15, color: t.ink, background: "#fff", border: "1px solid " + t.line } }),
          h("button", { onClick: saveEdit, className: "px-4 py-2 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, background: t.ink, color: t.bg2, borderRadius: 8 } }, "保存"),
          h("button", { onClick: () => { setEditing(false); setAmt(""); }, className: "px-3 py-2 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "取消"))) : null,
      // 收入来源
      incomes.length ? cardBox([
        h("div", { key: "h", className: "flex items-center justify-between mb-1" }, secTitle("收入来源"),
          monthlyIncome ? h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub, background: t.bg, borderRadius: 999, padding: "3px 10px" } }, "月合计 " + fmtMoney(monthlyIncome)) : null),
        incomes.map((s, i) => h("div", { key: i, className: "flex items-center justify-between py-2", style: i > 0 ? { borderTop: "1px solid " + t.line } : null },
          h("div", { className: "flex items-center min-w-0" },
            h("span", { style: { display: "inline-block", width: 7, height: 7, borderRadius: 7, background: AV[i % AV.length], marginRight: 8 } }),
            h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, s.name),
            s.category ? h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginLeft: 8 } }, s.category) : null),
          h("span", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, "+" + fmtMoney(s.amount)))),
        note(notes.income)
      ]) : null,
      // 存款概览（当前余额 + 每月固定支出 + 本月收入/花费/剩余可用）
      cardBox([
        secTitle("存款概览"),
        h("div", { key: "bal", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "当前余额"),
        h("div", { key: "balv", style: { fontFamily: F_DISPLAY, fontSize: 28, color: t.ink, margin: "2px 0 6px" } }, fmtMoney(rec ? rec.balance : 0)),
        fixedMonthly ? h("div", { key: "fx", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 6 } }, "每月固定支出 " + fmtMoney(fixedMonthly) + "（房租、交通、订阅等）") : null,
        sumRow("本月收入", "+" + fmtMoney(monthlyIncome), "#3f8a54"),
        sumRow("本月花费", "−" + fmtMoney(monthSpend), t.accent),
        sumRow("剩余可用", fmtMoney(monthRemain), t.ink),
        note(notes.savings)
      ]),
      // 理财
      (rec && rec.investAssets) || notes.invest ? cardBox([
        secTitle("理财"),
        h("div", { key: "iv", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "持有资产"),
        h("div", { key: "ivv", style: { fontFamily: F_DISPLAY, fontSize: 24, color: t.ink, marginTop: 2 } }, fmtMoney((rec && rec.investAssets) || 0)),
        note(notes.invest)
      ]) : null,
      // 日常消费（按日程每天扣的那笔）
      cardBox([
        secTitle("日常消费"),
        dailyEntries.length === 0
          ? h("div", { key: "e", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "10px 0" } }, "每天晚上按当日行程结算，暂时还没有记录")
          : dailyEntries.map((e, i) => h("div", { key: e.id, className: "py-2.5", style: i > 0 ? { borderTop: "1px solid " + t.line } : null },
            h("div", { className: "flex items-baseline justify-between gap-3" },
              h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, schedDateParts(schedDayKey(new Date(e.ts))).md),
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.accent, whiteSpace: "nowrap" } }, "−" + fmtMoney(Math.abs(e.delta)))),
            h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink, marginTop: 2, lineHeight: 1.5 } }, (e.label || "").replace(/^日常消费 · /, "")))),
        note(notes.spending)
      ]),
      // 送礼与转账
      cardBox([
        secTitle("送礼与转账"),
        flowEntries.length === 0
          ? h("div", { key: "e", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, textAlign: "center", padding: "10px 0" } }, "还没有礼物和转账记录")
          : flowEntries.map((e, i) => h("div", { key: e.id, className: "flex items-center justify-between py-3", style: i > 0 ? { borderTop: "1px solid " + t.line } : null },
            h("div", { className: "min-w-0 flex-1" },
              h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, e.label),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, fmtStamp(e.ts) + " · 余 " + fmtMoney(e.after))),
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: e.delta > 0 ? "#3f8a54" : t.accent, marginLeft: 12, whiteSpace: "nowrap" } }, (e.delta > 0 ? "+" : "−") + fmtMoney(Math.abs(e.delta)))))
      ])));
}

// ============================================================
// 表情包字典 Emote Matrix —— 分类字典/全局或专属绑定/批量导入(关键词:url)/图库
// ============================================================
function EmoteMatrix({ packs, characters, onBack, onAddPack, onUpdatePack, onDeletePack, onToggleChar, onImport, onDeleteEmotes }) {
  const t = useTheme();
  const list = packs || [];
  const [selId, setSelId] = useState(list[0] && list[0].id);
  const [selMode, setSelMode] = useState(false);
  const [selEmotes, setSelEmotes] = useState([]);
  const [importText, setImportText] = useState("");
  const fileRef = useRef(null);
  const pack = list.find(p => p.id === selId) || list[0] || null;
  useEffect(() => { if (list.length && !list.find(p => p.id === selId)) setSelId(list[0].id); }, [packs]);
  const idx = pack ? list.findIndex(p => p.id === pack.id) : -1;
  const chars = characters || [];
  const readFile = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setImportText(prev => (prev ? prev + "\n" : "") + String(r.result || ""));
    r.readAsText(f); e.target.value = "";
  };
  const eyebrow = (en, zh) => h("div", { className: "flex items-baseline gap-2", style: { marginBottom: 12 } },
    h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.28em", color: t.fog } }, en),
    h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "/ " + zh));

  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    // Header
    h("div", { className: "shrink-0 px-6 pt-6 pb-4 flex items-start justify-between" },
      h("div", null,
        h("div", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 34, color: t.ink, lineHeight: 1 } }, "Emote Matrix"),
        h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.3em", color: t.fog, marginTop: 6 } }, "EXPRESSION & MIMICRY")),
      h("button", { onClick: onBack, className: "flex items-center justify-center active:opacity-60", style: { width: 40, height: 40, borderRadius: 999, border: "1px solid " + t.line } }, h("span", { style: { fontSize: 20, color: t.ink } }, "×"))),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-10" },
      // CATEGORIES
      h("div", { className: "flex items-center justify-between", style: { marginTop: 4 } },
        h("div", { className: "flex items-baseline gap-2" },
          h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.28em", color: t.fog } }, "CATEGORIES"),
          h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "/ 分类字典")),
        h("button", { onClick: () => onAddPack(), className: "flex items-center gap-1 active:opacity-60", style: { fontFamily: "'Archivo',sans-serif", fontSize: 12, letterSpacing: "0.12em", color: t.ink, border: "1px solid " + t.line, borderRadius: 10, padding: "6px 12px" } }, h("span", null, "+"), h("span", null, "NEW"))),
      h("div", { style: { height: 1, background: t.line, margin: "14px 0 18px" } }),
      // category chips
      list.length > 1 && h("div", { className: "flex gap-2 flex-wrap", style: { marginBottom: 20 } }, list.map((p, i) => h("button", {
        key: p.id, onClick: () => { setSelId(p.id); setSelMode(false); setSelEmotes([]); },
        className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, padding: "6px 12px", borderRadius: 999, border: "1px solid " + (p.id === (pack && pack.id) ? t.ink : t.line), background: p.id === (pack && pack.id) ? t.ink : "transparent", color: p.id === (pack && pack.id) ? t.bg2 : t.sub }
      }, String(i + 1).padStart(2, "0") + " " + p.name))),
      !pack ? h("div", { className: "text-center", style: { paddingTop: 40, fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "还没有表情字典，点右上 NEW 新建")
        : h("div", null,
          // pack name + GLOBAL pill
          h("div", { className: "flex items-center gap-3", style: { marginBottom: 14 } },
            h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 13, color: t.fog } }, String(idx + 1).padStart(2, "0")),
            h("input", { value: pack.name, onChange: e => onUpdatePack(pack.id, { name: e.target.value }), className: "flex-1 outline-none bg-transparent", style: { fontFamily: F_DISPLAY, fontSize: 22, color: t.ink } }),
            pack.global && h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.1em", color: t.bg2, background: t.ink, borderRadius: 999, padding: "5px 12px" } }, "GLOBAL")),
          // Global toggle
          h("div", { className: "flex items-center justify-between", style: { background: t.bg2, borderRadius: 16, border: "1px solid " + t.line, padding: "16px 18px", marginBottom: 20 } },
            h("div", null,
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, "Global Access"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, "全局通用（开启后不受下方专属限制）")),
            h("button", { onClick: () => onUpdatePack(pack.id, { global: !pack.global }), className: "active:opacity-70 shrink-0", style: { width: 52, height: 30, borderRadius: 999, background: pack.global ? t.ink : t.line, position: "relative", transition: "background .2s" } },
              h("span", { style: { position: "absolute", top: 3, left: pack.global ? 25 : 3, width: 24, height: 24, borderRadius: 999, background: "#fff", transition: "left .2s" } }))),
          // 加入我的表情库开关
          h("div", { className: "flex items-center justify-between", style: { background: t.bg2, borderRadius: 16, border: "1px solid " + t.line, padding: "14px 18px", marginBottom: 20 } },
            h("div", null,
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, "加入我的表情库"),
              h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, "关掉后角色仍能用，但我发消息的选择器里不显示")),
            h("button", { onClick: () => onUpdatePack(pack.id, { mine: pack.mine === false }), className: "active:opacity-70 shrink-0", style: { width: 52, height: 30, borderRadius: 999, background: pack.mine !== false ? t.ink : t.line, position: "relative", transition: "background .2s" } },
              h("span", { style: { position: "absolute", top: 3, left: pack.mine !== false ? 25 : 3, width: 24, height: 24, borderRadius: 999, background: "#fff", transition: "left .2s" } }))),
          // Specific cast
          eyebrow("SPECIFIC CAST", "专属绑定"),
          h("div", { className: "flex gap-2 flex-wrap", style: { marginBottom: 6 } }, chars.length === 0 ? h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "还没有角色") : chars.map(c => {
            const bound = (pack.charIds || []).includes(c.id);
            return h("button", { key: c.id, onClick: () => onToggleChar(pack.id, c.id), className: "active:opacity-70", style: { fontFamily: F_BODY, fontSize: 14, padding: "8px 16px", borderRadius: 999, border: "1px solid " + (bound ? t.ink : t.line), background: bound ? t.ink : "transparent", color: bound ? t.bg2 : t.sub } }, c.name);
          })),
          pack.global && h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 6, marginBottom: 4 } }, "已开全局，绑定暂不生效（关掉全局才按专属限制）"),
          h("div", { style: { height: 20 } }),
          // Matrix gallery
          h("div", { className: "flex items-center justify-between", style: { marginBottom: 12 } },
            h("div", { className: "flex items-baseline gap-2" },
              h("span", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 11, letterSpacing: "0.28em", color: t.fog } }, "MATRIX GALLERY"),
              h("span", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "/ 矩阵图库 " + ((pack.emotes || []).length ? "· " + pack.emotes.length : ""))),
            (pack.emotes || []).length > 0 && h("button", { onClick: () => { setSelMode(m => !m); setSelEmotes([]); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: selMode ? t.accent : t.ink, border: "1px solid " + t.line, borderRadius: 10, padding: "5px 12px" } }, selMode ? "取消" : "Select")),
          (pack.emotes || []).length === 0
            ? h("div", { className: "text-center", style: { background: t.bg2, borderRadius: 16, border: "1px solid " + t.line, padding: "40px 0", fontFamily: F_BODY, fontSize: 13, color: t.fog, lineHeight: 1.9 } }, "图库空空如也\n请在下方批量导入")
            : h("div", { className: "grid grid-cols-3 gap-2" }, pack.emotes.map(em => {
              const on = selEmotes.includes(em.id);
              return h("button", { key: em.id, onClick: () => { if (!selMode) return; setSelEmotes(s => s.includes(em.id) ? s.filter(x => x !== em.id) : [...s, em.id]); }, className: "text-left active:opacity-80", style: { border: "1px solid " + (on ? t.accent : t.line), borderRadius: 12, overflow: "hidden", background: t.bg2 } },
                h("div", { style: { width: "100%", aspectRatio: "1", background: t.line, position: "relative" } },
                  h("img", { src: em.url, referrerPolicy: "no-referrer", loading: "lazy", style: { width: "100%", height: "100%", objectFit: "cover", display: "block" }, onError: e => { e.target.style.display = "none"; } }),
                  selMode && h("span", { style: { position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 999, background: on ? t.accent : "rgba(0,0,0,0.4)", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" } }, on ? "✓" : "")),
                h("div", { className: "truncate", style: { fontFamily: F_BODY, fontSize: 11, color: t.sub, padding: "5px 7px" } }, em.keyword));
            })),
          selMode && selEmotes.length > 0 && h("button", { onClick: () => { onDeleteEmotes(pack.id, selEmotes); setSelEmotes([]); setSelMode(false); }, className: "w-full active:opacity-70", style: { marginTop: 12, fontFamily: F_BODY, fontSize: 14, color: "#fff", background: t.accent, borderRadius: 12, padding: "12px 0" } }, "删除选中（" + selEmotes.length + "）"),
          // Delete matrix
          h("button", { onClick: () => { if (confirm("删除字典「" + pack.name + "」？其中的表情也会一并删除。")) onDeletePack(pack.id); }, className: "w-full active:opacity-70", style: { marginTop: 24, fontFamily: F_DISPLAY, fontSize: 16, color: t.accent, border: "1px solid " + t.accent, borderRadius: 14, padding: "14px 0" } }, "Delete Matrix (删除字典)"),
          h("div", { style: { height: 1, background: t.line, margin: "28px 0 20px" } }),
          // Batch import
          eyebrow("BATCH IMPORT", "批量指令"),
          h("div", { style: { background: t.bg2, borderRadius: 12, border: "1px solid " + t.line, padding: "14px 16px", fontFamily: F_BODY, fontSize: 12.5, color: t.fog, lineHeight: 1.9, marginBottom: 14, whiteSpace: "pre-wrap" } }, "格式：每个表情「关键词 + 链接」，同行用冒号/空格分隔，或关键词一行、链接下一行。关键词写「什么时候用」最好。\n\n喜欢喜欢: https://i.postimg.cc/xxx/IMG.jpg\n为什么?: https://i.postimg.cc/yyy/IMG.jpg"),
          h("div", { className: "flex items-center gap-3", style: { marginBottom: 12 } },
            h("button", { onClick: () => fileRef.current && fileRef.current.click(), className: "flex items-center gap-2 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13, color: t.ink, border: "1px solid " + t.line, borderRadius: 10, padding: "9px 14px" } }, "⬆ 导入文件"),
            h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "支持 .txt"),
            h("input", { ref: fileRef, type: "file", accept: ".txt,.text,.md", onChange: readFile, style: { display: "none" } })),
          h("textarea", { value: importText, onChange: e => setImportText(e.target.value), placeholder: "确保上方选中了要操作的字典，在此粘贴内容…", rows: 5, className: "w-full outline-none", style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, background: "#fff", border: "1px solid " + t.line, borderRadius: 14, padding: "14px", resize: "none", marginBottom: 16 } }),
          h("button", { onClick: () => { if (importEmotesOk(importText)) { onImport(pack.id, importText); setImportText(""); } }, className: "w-full active:opacity-80", style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.bg2, background: t.ink, borderRadius: 16, padding: "16px 0", marginBottom: 14 } }, "Import Matrix (批量导入)"),
          h("button", { onClick: onBack, className: "w-full active:opacity-80", style: { fontFamily: "'Archivo',sans-serif", fontSize: 15, letterSpacing: "0.16em", color: t.bg2, background: t.ink, borderRadius: 16, padding: "16px 0" } }, "CLOSE MATRIX"))));
}
function importEmotesOk(text) { return /(https?:\/\/\S+)/.test(String(text || "")); }

// ============================================================
// 收藏 Favorites —— 按角色查看收藏的聊天消息
// ============================================================
function Favorites({ favorites, characters, onBack, onDelete }) {
  const t = useTheme();
  const [sel, setSel] = useState(null);
  const ftp = typeof useTtsPlayer === "function" ? useTtsPlayer() : null; // 收藏语音回听
  const favs = favorites || [];
  const byChar = {};
  favs.forEach(f => { (byChar[f.charId] = byChar[f.charId] || []).push(f); });
  const charById = id => (characters || []).find(c => c.id === id);
  if (sel) {
    const c = charById(sel) || { name: "未知角色" };
    const list = byChar[sel] || [];
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      h(Head, { zh: "收藏", en: c.name, onBack: () => setSel(null) }),
      h("div", { className: "flex-1 overflow-y-auto px-5 py-3" },
        list.length === 0 ? h(Empty, { text: "还没有收藏 TA 的消息" })
          : list.map(f => h("div", { key: f.id, className: "mb-3", style: { background: t.bg2, borderRadius: 14, border: "1px solid " + t.line, padding: "12px 14px" } },
            h("div", { className: "flex items-center justify-between", style: { marginBottom: 6 } },
              h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, (f.role === "user" ? "我" : c.name) + " · " + fmtStamp(f.ts)),
              h("button", { onClick: () => onDelete(f.id), className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11.5, color: t.accent } }, "移除")),
            f.kind === "emote" && f.url
              ? h("img", { src: f.url, referrerPolicy: "no-referrer", loading: "lazy", style: { maxWidth: 110, maxHeight: 110, borderRadius: 10, display: "block" }, onError: e => { e.target.style.display = "none"; } })
              : f.kind === "selfie"
              ? h(SelfieBubble, { m: f }) // 复用聊天里的自拍气泡：从 IndexedDB 读 imgKey，点开可放大
              : f.kind === "voice"
              ? h("div", null,
                  h("div", { className: "flex items-center gap-2", style: { marginBottom: 5 } },
                    h("span", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "🎤 语音消息" + (f.dur ? " · " + f.dur + "″" : "")),
                    (ftp && typeof TtsDot === "function" && f.role !== "user") ? h(TtsDot, { k: f.id, text: f.content, spk: c, tp: ftp }) : null),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, lineHeight: 1.65, whiteSpace: "pre-wrap" } }, f.content || ""))
              : f.kind === "photo"
              ? h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink, lineHeight: 1.65, whiteSpace: "pre-wrap" } }, "📷 " + (f.content || "（照片）"))
              : h("div", { style: { fontFamily: F_BODY, fontSize: 14.5, color: t.ink, lineHeight: 1.65, whiteSpace: "pre-wrap" } }, f.content || "（无文本内容）")))));
  }
  const chars = (characters || []).filter(c => byChar[c.id] && byChar[c.id].length);
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h(Head, { zh: "收藏", en: "Saved · 选择角色", onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-5 pb-10 pt-1" },
      chars.length === 0 ? h(Empty, { text: "还没有收藏", sub: "长按聊天里的消息 →「收藏」" })
        : chars.map(c => h("button", { key: c.id, onClick: () => setSel(c.id), className: "w-full text-left flex items-center gap-4 py-4 active:opacity-70", style: { borderBottom: "1px solid " + t.line } },
          h(Avatar, { character: c, size: 48, radius: 13 }),
          h("div", { className: "flex-1 min-w-0" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, c.name),
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 2 } }, (byChar[c.id] || []).length + " 条收藏")),
          h(IChevR, { size: 16, color: t.fog })))));
}

// ============================================================
// 随身物品 Carry —— 翻角色随身携带的东西（像查手机，各版块 AI 刷新）+ 收到的礼物永久区
// ============================================================
const CARRY_SECTIONS = [
  { key: "bag", zh: "包内", en: "Bag" },
  { key: "pocket", zh: "口袋", en: "Pocket" },
  { key: "outfit", zh: "衣柜", en: "Wardrobe" },
  { key: "trinket", zh: "珍藏小物", en: "Trinkets" },
  { key: "care", zh: "护理", en: "Care" },
  { key: "gifts", zh: "收到的礼物", en: "Gifts", gifts: true }
];
function carryProbeSpec(key, char) {
  const nm = char.name;
  const tail = "每件除了 name、note(一句状态/来历) 外，再写 thought：「" + nm + "」对这件东西的私人想法/批注（为什么带它、和谁有关、藏了什么心事），点开细看用，贴人设、可以更私密。**thought 每件都要写完整，别写一半。**";
  const cnt = "**务必给满数量，一件都不能少；宁可每条描述精简一点，也要凑齐件数。**";
  const hint = "{\"items\":[{\"name\":\"物品\",\"note\":\"备注\",\"thought\":\"TA 对这件东西的私人想法\"}]}";
  const S = {
    bag: { instruction: "推演「" + nm + "」此刻包里/随身携带的东西（正好 5 件），贴合人设、职业与当下心境。" + cnt + tail, schemaHint: hint },
    pocket: { instruction: "推演「" + nm + "」口袋里的零碎小东西（正好 5 件，如钥匙、票根、糖、纸条），私人贴身。" + cnt + tail, schemaHint: hint },
    outfit: { instruction: "推演「" + nm + "」衣柜里的衣物——挂着的、常穿的、压箱底的，涵盖不同季节/场合（外套/上衣/裤或裙/鞋/配饰等，6-8 件），风格与材质贴合 TA 的人设、身份与审美，note 写材质/颜色/风格/来历或什么场合穿。" + cnt + tail, schemaHint: hint },
    trinket: { instruction: "推演「" + nm + "」随身的小物件/护身符/珍藏（正好 5 件），带情感重量与故事。" + cnt + tail, schemaHint: hint },
    care: { instruction: "推演「" + nm + "」随身的护理/药品/日常保养品（正好 5 件），透露健康与生活习惯。" + cnt + tail, schemaHint: hint }
  };
  return { maxTokens: 4000, ...(S[key] || S.bag) };
}
// 版块详情：打开即自动生成，失败退回上一级；点条目看角色想法/批注
function CarrySection({ char, sectionKey, data, gifts, busyKey, giftBusy, onGen, onGenGiftThought, onBack }) {
  const t = useTheme();
  const sec = CARRY_SECTIONS.find(s => s.key === sectionKey) || {};
  const isGifts = !!sec.gifts;
  const loading = busyKey === sectionKey;
  const [sheet, setSheet] = useState(null); // {name,note,thought} AI 物品
  const [openGiftId, setOpenGiftId] = useState(null);
  // 打开非礼物版块：没内容就直接生成，失败退回上一级
  useEffect(() => {
    if (isGifts || data) return;
    let alive = true;
    Promise.resolve(onGen(char, sectionKey)).then(ok => { if (alive && ok === false) onBack(); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [sectionKey]);
  const openGift = (gifts || []).find(g => g.id === openGiftId) || null;
  let content;
  if (isGifts) {
    content = (gifts || []).length === 0
      ? h("div", { className: "text-center", style: { paddingTop: 60, fontFamily: F_BODY, fontSize: 13, lineHeight: 1.9, color: t.fog } }, "还没收到你送的礼物。\n在购物 App 结算时选「送礼」，\n送达后会永久留在这里。")
      : h("div", null, (gifts || []).map(g => h("button", { key: g.id, onClick: () => { setOpenGiftId(g.id); if (!g.thought && giftBusy !== g.id) onGenGiftThought(char.id, g.id, g.name); }, className: "w-full text-left flex items-center justify-between py-3.5 active:opacity-60", style: { borderBottom: "1px solid " + t.line } },
          h("div", { className: "flex items-center gap-3 min-w-0" },
            h(IHeart, { size: 17, color: t.accent }),
            h("div", { className: "min-w-0" },
              h("div", { className: "truncate", style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, g.name),
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2 } }, "收到于 " + new Date(g.receivedTs).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) + (g.thought ? " · 点看 TA 的想法" : "")))),
          h(IChevR, { size: 15, color: t.line }))));
  } else if (loading || !data) {
    content = h(Spinner, { label: "正在翻看 " + sec.zh + "…" });
  } else {
    const items = (data && data.items) || [];
    content = items.length === 0
      ? h("div", { className: "text-center", style: { paddingTop: 40, fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "空空如也")
      : h("div", { style: { animation: "fadeUp .3s ease both" } }, items.map((it, i) => h("button", { key: i, onClick: () => setSheet(it), className: "w-full text-left flex items-start justify-between gap-3 py-3.5 active:opacity-60", style: { borderBottom: "1px solid " + t.line } },
          h("div", { className: "min-w-0 flex-1" },
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15.5, color: t.ink } }, it.name),
            it.note && h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 3, lineHeight: 1.6 } }, it.note)),
          h(IChevR, { size: 15, color: t.line, style: { marginTop: 3 } }))));
  }
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h(Head, { zh: sec.zh, en: char.name, onBack, right: !isGifts && h("button", { onClick: () => onGen(char, sectionKey), disabled: !!busyKey, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 18, color: t.ink })) }),
    h("div", { className: "flex-1 overflow-y-auto px-6 py-4" }, content),
    sheet && h(Sheet, { onClose: () => setSheet(null), tall: true },
      h(Eyebrow, { style: { marginBottom: 8 } }, sheet.name),
      sheet.note && h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.fog, marginBottom: 12, lineHeight: 1.7 } }, sheet.note),
      h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9.5, letterSpacing: "0.16em", color: t.accent, marginBottom: 6 } }, char.name + " 的想法"),
      h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.85, color: t.ink, whiteSpace: "pre-wrap" } }, sheet.thought || "（TA 没多说什么）")),
    openGift && h(Sheet, { onClose: () => setOpenGiftId(null), tall: true },
      h(Eyebrow, { style: { marginBottom: 8 } }, openGift.name),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 12 } }, "你送的 · 收到于 " + new Date(openGift.receivedTs).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })),
      h("div", { style: { fontFamily: "'Archivo',sans-serif", fontSize: 9.5, letterSpacing: "0.16em", color: t.accent, marginBottom: 6 } }, char.name + " 的想法"),
      giftBusy === openGift.id && !openGift.thought
        ? h(Spinner, { label: "让 " + char.name + " 说说…" })
        : openGift.thought
          ? h("div", { style: { fontFamily: F_BODY, fontSize: 14, lineHeight: 1.85, color: t.ink, whiteSpace: "pre-wrap" } }, openGift.thought)
          : h("button", { onClick: () => onGenGiftThought(char.id, openGift.id, openGift.name), className: "w-full py-2.5 active:opacity-70", style: { fontFamily: F_BODY, fontSize: 13, border: "1px solid " + t.ink, borderRadius: 999, color: t.ink } }, "让 " + char.name + " 说说对它的想法")));
}
function Carry({ characters, carry, carryGifts, selId, busyKey, giftBusy, onBack, onSel, onGen, onGenAll, onGenGiftThought }) {
  const t = useTheme();
  const [pick, setPick] = useState(false);
  const [open, setOpen] = useState(null);
  const [inBox, setInBox] = useState(true); // 先看盒子，打开盒子点头像才进 Ta 的随身物
  const [boxOpen, setBoxOpen] = useState(false);
  // 绿点=有内容且没看过；点开即消，刷新全部时重亮
  const [seen, setSeen] = useState(() => loadJSON("x_carrySeen", {}));
  const isSeen = (cid, k) => !!(seen[cid] && seen[cid][k]);
  const markSeen = (cid, k) => setSeen(p => { const n = { ...p, [cid]: { ...(p[cid] || {}), [k]: true } }; saveJSON("x_carrySeen", n); return n; });
  const clearSeen = cid => setSeen(p => { const n = { ...p }; delete n[cid]; saveJSON("x_carrySeen", n); return n; });
  const char = characters.find(c => c.id === selId) || characters[0];
  if (!char) return h("div", { className: "h-full flex flex-col" }, h(Head, { zh: "随身物", en: "Carry", onBack }), h(Empty, { text: "还没有角色", sub: "先去名录录入一位" }));
  // 盒子首页：点开盒子 → 角色头像跳出来 → 点头像才进 Ta 的随身物
  if (inBox) return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h(Head, { zh: "随身物", en: "Carry", onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-6 pb-10 flex flex-col items-center" },
      h("button", { onClick: () => setBoxOpen(v => !v), className: "active:opacity-90", style: { marginTop: 26, position: "relative", width: 156, height: 128 } },
        // 盖子
        h("div", { style: { position: "absolute", top: boxOpen ? -18 : 2, left: -7, right: -7, height: 30, borderRadius: 8, background: "linear-gradient(180deg,#e7dcc6,#d4c4a6)", border: "1px solid " + t.line, transform: boxOpen ? "rotate(-7deg)" : "none", transformOrigin: "left center", transition: "all .28s ease", boxShadow: "0 5px 12px rgba(0,0,0,0.12)" } }),
        // 盒身
        h("div", { style: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100, borderRadius: "5px 5px 14px 14px", background: "linear-gradient(180deg,#f0e8d8,#ddd0b6)", border: "1px solid " + t.line, boxShadow: "inset 0 6px 14px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" } },
          boxOpen ? null : h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 15, color: t.fog, letterSpacing: "0.08em" } }, "CARRY"))),
      h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginTop: 16 } }, boxOpen ? "点头像，翻翻 Ta 的随身物" : "点一下打开盒子"),
      boxOpen ? h("div", { className: "grid grid-cols-3 gap-x-3 gap-y-5", style: { marginTop: 24, width: "100%", animation: "fadeUp .32s ease" } },
        characters.map(c => h("button", { key: c.id, onClick: () => { onSel(c.id); setOpen(null); setInBox(false); }, className: "flex flex-col items-center gap-1.5 active:opacity-70" },
          h(Avatar, { character: c, size: 62, radius: 17 }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 84 } }, c.remark || c.name)))) : null));
  const data = carry[char.id] || {};
  const gifts = (carryGifts && carryGifts[char.id]) || [];
  const hasData = s => s.gifts ? gifts.length > 0 : !!data[s.key];
  if (open) return h(CarrySection, { char, sectionKey: open, data: data[open], gifts, busyKey: busyKey === "__all__" ? open : busyKey, giftBusy, onGen, onGenGiftThought, onBack: () => setOpen(null) });
  return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h("div", { className: "shrink-0 px-5 pt-5 pb-3 flex items-center justify-between" },
      h("button", { onClick: () => setInBox(true), className: "active:opacity-50" }, h(IArrow, { size: 19, color: t.ink })),
      h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, char.name + " 的随身物"),
      h("div", { className: "flex items-center gap-3" },
        h("button", { onClick: () => setPick(true), className: "active:opacity-50" }, h(Avatar, { character: char, size: 24, radius: 6 })),
        h("button", { onClick: () => { clearSeen(char.id); onGenAll(char); }, disabled: !!busyKey, className: "active:opacity-50 disabled:opacity-40" }, h(IRefresh, { size: 18, color: t.ink })))),
    h("div", { className: "flex-1 overflow-y-auto px-4 pb-8" },
      h("div", { className: "rounded-[28px] px-5 pt-7 pb-8", style: { background: "linear-gradient(170deg,#fbfaf7,#f1eee7)", border: "1px solid " + t.line } },
        h("div", { className: "flex flex-col items-center mb-7" },
          h(Avatar, { character: char, size: 74, radius: 22 }),
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink, marginTop: 10, letterSpacing: "0.02em" } }, (char.name || "") + " · CARRY"),
          busyKey === "__all__"
            ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4 } }, "正在翻看全部…")
            : h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 4 } }, "点右上角刷新全部 · 或点开单个版块")),
        h("div", { className: "grid grid-cols-3 gap-y-6 gap-x-2" }, CARRY_SECTIONS.map(s => h("button", { key: s.key, onClick: () => { markSeen(char.id, s.key); setOpen(s.key); }, className: "flex flex-col items-center gap-1.5 active:opacity-60" },
          h("div", { className: "relative flex items-center justify-center", style: { width: 54, height: 54, borderRadius: 16, background: "#fff", border: "1px solid " + t.line } },
            s.gifts ? h(IHeart, { size: 22, color: t.accent }) : h("span", { style: { fontFamily: F_DISPLAY, fontStyle: "italic", fontSize: 13, color: t.ink } }, s.en),
            hasData(s) && !isSeen(char.id, s.key) && h("span", { style: { position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: 9, background: s.gifts ? t.accent : "#95d16f", border: "1.5px solid #fff" } })),
          h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.sub } }, s.zh))))),
    pick && h(Sheet, { onClose: () => setPick(false) },
      h(Eyebrow, { style: { marginBottom: 12 } }, "切换角色"),
      h("div", { className: "space-y-1 max-h-72 overflow-y-auto" }, characters.map(c => h("button", { key: c.id, onClick: () => { onSel(c.id); setPick(false); setOpen(null); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
        h(Avatar, { character: c, size: 34, radius: 7 }),
        h("span", { style: { fontFamily: F_DISPLAY, fontSize: 16, color: t.ink } }, c.name)))))));
}
