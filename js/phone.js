// ============================================================
// 查手机 — 仿 iOS 桌面：12 个 app，每个独立生成/刷新，点进去看细节
// ============================================================
const PHONE_APPS = [{
  key: "wechat",
  zh: "微信"
}, {
  key: "notes",
  zh: "备忘录"
}, {
  key: "calls",
  zh: "电话"
}, {
  key: "browser",
  zh: "浏览器"
}, {
  key: "shopping",
  zh: "购物"
}, {
  key: "album",
  zh: "相册"
}, {
  key: "forum",
  zh: "论坛"
}, {
  key: "music",
  zh: "音乐"
}, {
  key: "settings",
  zh: "设置"
}, {
  key: "recordings",
  zh: "录音"
}, {
  key: "video",
  zh: "视频"
}];
const PHONE_LABEL = PHONE_APPS.reduce((o, a) => (o[a.key] = a.zh, o), {});
const strColor = s => AV_COLORS[[...String(s || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const parseMins = s => {
  s = String(s || "");
  let m = 0;
  const hm = s.match(/(\d+)\s*(小时|时|h)/i),
    mm = s.match(/(\d+)\s*(分|min|m)/i);
  if (hm) m += parseInt(hm[1]) * 60;
  if (mm) m += parseInt(mm[1]);
  if (!hm && !mm) {
    const n = s.match(/\d+/);
    if (n) m = parseInt(n[0]);
  }
  return m;
};
const fmtMoney = n => "¥" + Number(n || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const fmtMD = d => d.getMonth() + 1 + "月" + d.getDate() + "日";
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// 根据财务档案 + 生成日期，推算「跑动余额」：每天扣一笔日常消费，每月1号进月收入/扣固定支出
function computeLedger(w) {
  if (!w) return null;
  const pool = (w.dailyPool || []).filter(x => x && typeof x.amount === "number");
  const start = new Date((w._startDate || ymd(new Date(w._at || Date.now()))) + "T00:00:00");
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const daily = [];
  let firsts = 0,
    idx = 0;
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + dayMs)) {
    if (pool.length) {
      const p = pool[idx % pool.length];
      daily.push({
        date: fmtMD(d),
        items: p.items,
        amount: p.amount,
        ts: d.getTime()
      });
    }
    if (d.getDate() === 1 && d.getTime() !== start.getTime()) firsts++;
    idx++;
  }
  const monthly = Number(w.monthlyIncome) || 0,
    fixed = Number(w.fixedMonthly) || 0;
  const spentAll = daily.reduce((a, x) => a + x.amount, 0);
  const balance = (Number(w.baseBalance) || 0) + (Number(w.extra) || 0) + (monthly - fixed) * firsts - spentAll;
  const thisMonth = daily.filter(x => {
    const dt = new Date(x.ts);
    return dt.getMonth() === today.getMonth() && dt.getFullYear() === today.getFullYear();
  });
  const monthSpend = fixed + thisMonth.reduce((a, x) => a + x.amount, 0);
  return {
    balance,
    monthIncome: monthly,
    monthSpend,
    remain: monthly - monthSpend,
    fixed,
    daily: daily.slice().reverse()
  };
}

// app 图标（线性，黑白）
function PGlyph({
  k,
  size = 26,
  color = "#1b1a17"
}) {
  const P = d => h("path", {
    d
  });
  const C = (cx, cy, r) => h("circle", {
    cx,
    cy,
    r
  });
  const R = (x, y, w, ht, rx) => h("rect", {
    x,
    y,
    width: w,
    height: ht,
    rx
  });
  const kids = {
    wechat: [P("M21 11.5a8.5 8.5 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 013.5 11.5 8.5 8.5 0 0112 3a8.5 8.5 0 019 8.5z")],
    notes: [R(5, 3, 14, 18, 2), P("M8 8h8M8 12h8M8 16h5")],
    calls: [P("M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L9 11.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z")],
    browser: [C(12, 12, 9), P("M16.2 7.8l-2.1 6.4-6.4 2.1 2.1-6.4 6.4-2.1z")],
    shopping: [P("M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"), P("M3 6h18"), P("M16 10a4 4 0 01-8 0")],
    wallet: [R(3, 6, 18, 14, 2), P("M3 10h18"), C(17, 14, 1)],
    album: [R(3, 4, 18, 16, 2), C(8.5, 9, 1.5), P("M21 16l-5-5L5 20")],
    forum: [P("M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"), P("M8 9h8M8 12h5")],
    music: [P("M9 18V5l12-2v13"), C(6, 18, 3), C(18, 16, 3)],
    settings: [C(12, 12, 3), P("M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z")],
    recordings: [R(9, 2, 6, 12, 3), P("M5 10v2a7 7 0 0014 0v-2"), P("M12 19v3")],
    video: [R(2, 5, 20, 14, 3), h("polygon", {
      points: "10,9 16,12 10,15",
      fill: color,
      stroke: "none"
    })]
  };
  return h(Svg, {
    size,
    color,
    sw: 1.5
  }, ...(kids[k] || []));
}

// 点开某条看细节的通用 sheet 内容（在事件里构造，需显式传 t）
const DetailSheet = (title, body, t) => h("div", null, h(Eyebrow, {
  style: {
    marginBottom: 8
  }
}, title), h("div", {
  style: {
    fontFamily: F_BODY,
    fontSize: 14,
    lineHeight: 1.8,
    color: t.ink,
    whiteSpace: "pre-wrap"
  }
}, body || "（无内容）"));
const RecSheet = (it, t) => h("div", null, h(Eyebrow, {
  style: {
    marginBottom: 8
  }
}, it.name), h("div", {
  style: {
    fontFamily: F_BODY,
    fontSize: 14,
    lineHeight: 1.8,
    color: t.ink,
    whiteSpace: "pre-wrap"
  }
}, it.transcript || "（无转录）"), it.thought && h("div", {
  style: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: `1px solid ${t.line}`
  }
}, h(Eyebrow, {
  style: {
    marginBottom: 6
  }
}, "TA 的想法"), h("div", {
  style: {
    fontFamily: F_BODY,
    fontSize: 13,
    lineHeight: 1.7,
    color: t.sub,
    fontStyle: "italic"
  }
}, it.thought)));
const WeChatThread = (c, char, t) => h("div", null, h(Eyebrow, {
  style: {
    marginBottom: 12
  }
}, c.name), h("div", {
  className: "space-y-2"
}, (c.messages || []).map((m, i) => {
  const self = m.from === char.name || m.from === "我" || m.from === "本人";
  return h("div", {
    key: i,
    className: "flex " + (self ? "justify-end" : "justify-start")
  }, h("div", {
    style: {
      maxWidth: "76%",
      padding: "8px 12px",
      borderRadius: 14,
      fontFamily: F_BODY,
      fontSize: 13.5,
      lineHeight: 1.5,
      background: self ? "#95d16f" : "#fff",
      color: self ? "#16330a" : t.ink,
      border: self ? "none" : `1px solid ${t.line}`
    }
  }, m.text));
})));

// 相册：可把喜欢的照片收藏进 x_phoneKeep（按角色分组），刷新全部/单个都不会覆盖它
function AlbumView({ d, char, t, setSheet }) {
  const [keep, setKeep] = useState(() => loadJSON("x_phoneKeep", {}));
  const arr = a => a || [];
  const sig = p => (p.caption || "") + "|" + (p.desc || ""); // 照片无 id，用标题+描述判重
  const saved = arr(keep[char.id]);
  const isSaved = p => saved.some(s => sig(s) === sig(p));
  const toggle = p => setKeep(prev => {
    const list = arr(prev[char.id]);
    const exists = list.some(s => sig(s) === sig(p));
    const nl = exists ? list.filter(s => sig(s) !== sig(p)) : [{ caption: p.caption || "照片", desc: p.desc || "", _at: Date.now() }, ...list];
    const n = { ...prev, [char.id]: nl };
    saveJSON("x_phoneKeep", n);
    return n;
  });
  const tile = (it, i) => h("div", {
    key: i,
    style: { position: "relative" }
  }, h("button", {
    onClick: () => setSheet(DetailSheet(it.caption || "照片", it.desc, t)),
    className: "active:opacity-70 w-full"
  }, h("div", {
    style: {
      position: "relative",
      width: "100%",
      paddingBottom: "100%",
      borderRadius: 12,
      overflow: "hidden",
      background: "linear-gradient(135deg,#d8d3c8,#b3ada0)"
    }
  }, h("div", {
    style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }
  }, h(PGlyph, { k: "album", size: 22, color: "rgba(255,255,255,0.85)" }))), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10,
      color: t.fog,
      marginTop: 4,
      textAlign: "center",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, it.caption), it._at ? h("div", {
    style: { fontFamily: F_BODY, fontSize: 9, color: t.fog, marginTop: 1, textAlign: "center" }
  }, "收藏于 " + ymd(new Date(it._at))) : null), h("button", {
    onClick: e => { e.stopPropagation(); toggle(it); },
    className: "active:opacity-60",
    style: {
      position: "absolute",
      top: 5,
      right: 5,
      width: 24,
      height: 24,
      borderRadius: 999,
      background: "rgba(0,0,0,0.32)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, h(IHeart, { size: 13, color: "#fff", filled: isSaved(it) })));
  const grid = items => h("div", { className: "grid grid-cols-3 gap-2" }, items.map(tile));
  return h("div", {
    style: { animation: "fadeUp .3s ease both" }
  }, saved.length ? h("div", {
    style: { marginBottom: 18 }
  }, h(Eyebrow, { style: { marginBottom: 10 } }, "收藏 · " + saved.length), grid(saved)) : null, saved.length ? h(Eyebrow, { style: { marginBottom: 10 } }, "相册") : null, grid(arr(d.items)));
}

// 各 app 详情内容
function renderPhoneModule(key, d, ctx) {
  const {
    t,
    char,
    setSheet,
    vtab,
    setVtab
  } = ctx;
  const line = {
    borderTop: `1px solid ${t.line}`
  };
  const wrap = kids => h("div", {
    style: {
      animation: "fadeUp .3s ease both"
    }
  }, kids);
  const arr = a => a || [];
  if (key === "wechat") return wrap(arr(d.chats).map((c, i) => h("button", {
    key: i,
    onClick: () => c.messages && c.messages.length && setSheet(WeChatThread(c, char, t)),
    className: "w-full text-left py-3 flex items-center gap-3",
    style: line
  }, h(Avatar, {
    character: {
      name: c.name,
      color: strColor(c.name)
    },
    size: 42,
    radius: 12
  }), h("div", {
    className: "flex-1 min-w-0"
  }, h("div", {
    className: "flex items-baseline justify-between gap-2"
  }, h("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink
    }
  }, c.name), h("span", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog
    }
  }, c.time)), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 12.5,
      color: t.fog,
      marginTop: 2,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, c.last)))));
  if (key === "notes") return wrap(arr(d.items).map((it, i) => h("button", {
    key: i,
    onClick: () => setSheet(DetailSheet(it.title, it.detail, t)),
    className: "w-full text-left py-3.5 flex items-start justify-between gap-3",
    style: line
  }, h("div", {
    className: "flex-1"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink
    }
  }, it.title), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 3
    }
  }, it.time)), h(IChevR, {
    size: 14,
    color: t.line,
    style: {
      marginTop: 4
    }
  }))));
  if (key === "calls") return wrap(arr(d.items).map((it, i) => {
    const missed = it.connected === false;
    const out = it.dir === "out";
    const mark = missed ? "✕" : out ? "↗" : "↙";
    return h("div", {
      key: i,
      className: "py-3 flex items-center gap-3",
      style: line
    }, h("span", {
      style: {
        fontFamily: F_BODY,
        fontSize: 15,
        width: 16,
        textAlign: "center",
        color: missed ? t.accent : t.tint
      }
    }, mark), h("div", {
      className: "flex-1"
    }, h("div", {
      style: {
        fontFamily: F_DISPLAY,
        fontSize: 14.5,
        color: missed ? t.accent : t.ink
      }
    }, it.name), h("div", {
      style: {
        fontFamily: F_BODY,
        fontSize: 10.5,
        color: t.fog,
        marginTop: 2
      }
    }, (out ? "去电" : "来电") + (missed ? " · 未接" : it.duration ? " · " + it.duration : " · 已接"))), h("span", {
      style: {
        fontFamily: F_BODY,
        fontSize: 10.5,
        color: t.fog
      }
    }, it.time));
  }));
  if (key === "browser") return wrap(arr(d.items).map((it, i) => h("button", {
    key: i,
    onClick: () => setSheet(DetailSheet(it.title, (it.url ? "🔗 " + it.url + "\n\n" : "") + (it.content || ""), t)),
    className: "w-full text-left py-3.5 flex items-start justify-between gap-3",
    style: line
  }, h("div", {
    className: "flex-1 min-w-0"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14.5,
      color: t.ink
    }
  }, it.title), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.tint,
      marginTop: 2,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, it.url), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 2
    }
  }, it.time)), h(IChevR, {
    size: 14,
    color: t.line,
    style: {
      marginTop: 3
    }
  }))));
  if (key === "shopping") return wrap(arr(d.items).map((it, i) => h("button", {
    key: i,
    onClick: () => setSheet(DetailSheet(it.name, it.thought, t)),
    className: "w-full text-left py-3.5 flex items-start justify-between gap-3",
    style: line
  }, h("div", {
    className: "flex-1"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14.5,
      color: t.ink
    }
  }, it.name), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 2
    }
  }, it.time)), h("div", {
    className: "flex items-center gap-2"
  }, h("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14,
      color: t.accent
    }
  }, it.price), h(IChevR, {
    size: 14,
    color: t.line
  })))));
  if (key === "album") return h(AlbumView, { d, char, t, setSheet });
  if (key === "forum") return wrap(arr(d.items).map((it, i) => h("div", {
    key: i,
    className: "py-3.5",
    style: line
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink,
      lineHeight: 1.4
    }
  }, it.title), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 4
    }
  }, it.time))));
  if (key === "music") return h("div", {
    style: {
      animation: "fadeUp .3s ease both"
    }
  }, h("div", {
    className: "mb-5"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 22,
      color: t.ink
    }
  }, d.playlist || "歌单"), d.desc && h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 12,
      color: t.fog,
      marginTop: 4
    }
  }, d.desc)), arr(d.songs).map((s, i) => h("div", {
    key: i,
    className: "py-2.5 flex items-center gap-3",
    style: {
      borderTop: `1px solid ${t.line}`
    }
  }, h("span", {
    style: {
      fontFamily: "'Archivo',sans-serif",
      fontSize: 11,
      color: t.fog,
      width: 20
    }
  }, String(i + 1).padStart(2, "0")), h(PGlyph, {
    k: "music",
    size: 15,
    color: t.fog
  }), h("div", {
    className: "flex-1 min-w-0"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14,
      color: t.ink
    }
  }, s.name), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.fog,
      marginTop: 1
    }
  }, s.artist)))));
  if (key === "settings") {
    const apps = arr(d.apps),
      mins = apps.map(a => parseMins(a.time)),
      max = Math.max(1, ...mins);
    return h("div", {
      style: {
        animation: "fadeUp .3s ease both"
      }
    }, h("div", {
      className: "mb-6 text-center py-5",
      style: {
        borderRadius: 16,
        background: t.bg2,
        border: `1px solid ${t.line}`
      }
    }, h(Eyebrow, null, "日均屏幕使用时间"), h("div", {
      style: {
        fontFamily: F_DISPLAY,
        fontSize: 30,
        color: t.ink,
        marginTop: 6
      }
    }, d.screenTime || "—")), h(Eyebrow, {
      style: {
        marginBottom: 12
      }
    }, "各 App 使用"), apps.map((a, i) => h("div", {
      key: i,
      className: "py-2.5",
      style: i > 0 ? {
        borderTop: `1px solid ${t.line}`
      } : null
    }, h("div", {
      className: "flex items-baseline justify-between mb-1.5"
    }, h("span", {
      style: {
        fontFamily: F_DISPLAY,
        fontSize: 14,
        color: t.ink
      }
    }, a.name), h("span", {
      style: {
        fontFamily: F_BODY,
        fontSize: 11,
        color: t.fog
      }
    }, a.time)), h("div", {
      style: {
        height: 6,
        borderRadius: 6,
        background: t.line,
        overflow: "hidden"
      }
    }, h("div", {
      style: {
        height: "100%",
        width: Math.round(mins[i] / max * 100) + "%",
        background: t.tint,
        borderRadius: 6
      }
    })))));
  }
  if (key === "recordings") return wrap(arr(d.items).map((it, i) => h("button", {
    key: i,
    onClick: () => setSheet(RecSheet(it, t)),
    className: "w-full text-left py-3.5 flex items-center justify-between gap-3",
    style: line
  }, h("div", {
    className: "flex items-center gap-3 flex-1 min-w-0"
  }, h("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      flexShrink: 0,
      background: t.bg2,
      border: `1px solid ${t.line}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, h(PGlyph, {
    k: "recordings",
    size: 16,
    color: t.tint
  })), h("div", {
    className: "flex-1 min-w-0"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 14.5,
      color: t.ink,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, it.name), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 2
    }
  }, it.time))), h(IChevR, {
    size: 14,
    color: t.line
  }))));
  if (key === "video_day") return wrap(arr(d.items).map((v, i) => h("div", {
    key: i,
    className: "py-3 flex gap-3",
    style: {
      borderTop: `1px solid ${t.line}`
    }
  }, h("div", {
    style: {
      position: "relative",
      width: 116,
      height: 66,
      borderRadius: 8,
      flexShrink: 0,
      overflow: "hidden",
      background: "linear-gradient(135deg,#cfc9bd,#b3ada0)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, h(PGlyph, {
    k: "video",
    size: 20,
    color: "#fff"
  }), v.duration && h("div", {
    style: {
      position: "absolute",
      right: 4,
      bottom: 4,
      background: "rgba(0,0,0,.65)",
      color: "#fff",
      fontFamily: F_BODY,
      fontSize: 9.5,
      lineHeight: 1.4,
      padding: "1px 5px",
      borderRadius: 4
    }
  }, v.duration)), h("div", {
    className: "flex-1 min-w-0"
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 13.5,
      color: t.ink,
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, v.title), h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 10.5,
      color: t.fog,
      marginTop: 3
    }
  }, (v.up || "") + (v.tag ? " · " + v.tag : ""))))));
  if (key === "video_night") return wrap(arr(d.items).map((v, i) => h("button", {
    key: i,
    onClick: () => setSheet(DetailSheet(v.title, v.thought, t)),
    className: "w-full text-left py-3 flex gap-3",
    style: {
      borderTop: `1px solid ${t.line}`
    }
  }, h("div", {
    style: {
      position: "relative",
      width: 116,
      height: 66,
      flexShrink: 0,
      borderRadius: 8,
      overflow: "hidden",
      background: `linear-gradient(135deg, ${t.bg2}, ${t.line})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, h("svg", {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24"
  }, h("polygon", {
    points: "9,7 9,17 17,12",
    fill: t.fog
  })), v.duration && h("div", {
    style: {
      position: "absolute",
      right: 4,
      bottom: 4,
      background: "rgba(0,0,0,.65)",
      color: "#fff",
      fontFamily: F_BODY,
      fontSize: 9.5,
      lineHeight: 1.4,
      padding: "1px 5px",
      borderRadius: 4
    }
  }, v.duration)), h("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 13.5,
      color: t.ink,
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, v.title), h("div", {
    className: "flex flex-wrap gap-1.5 mt-2"
  }, arr(v.tags).map((tg, j) => h("span", {
    key: j,
    style: {
      fontFamily: F_BODY,
      fontSize: 10,
      color: t.sub,
      padding: "2px 7px",
      borderRadius: 999,
      background: t.bg2,
      border: `1px solid ${t.line}`
    }
  }, tg)))))));
  return null;
}

// 单个 app 的详情页
function PhoneApp({
  appKey,
  char,
  charData,
  busyKey,
  onGen,
  onBack
}) {
  const t = useTheme();
  const [sheet, setSheet] = useState(null);
  const [vtab, setVtab] = useState(null); // 视频子版块：day / night，默认不选
  const zh = PHONE_LABEL[appKey];
  const data = charData[appKey];
  const loading = busyKey === appKey;
  const isVideo = appKey === "video";
  // 打开非视频版块：直接生成，失败退回上一级（不再显示中间的「生成」页）
  useEffect(() => {
    if (isVideo || charData[appKey]) return;
    let alive = true;
    Promise.resolve(onGen(char, appKey)).then(ok => { if (alive && ok === false) onBack(); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [appKey]);
  // 视频子版块：点击 tab 时直接生成，失败退回上一级
  const genVideo = k => Promise.resolve(onGen(char, "video_" + k)).then(ok => { if (ok === false) setVtab(null); });
  let content;
  if (isVideo) {
    const subKey = vtab ? "video_" + vtab : null;
    const subData = subKey ? charData[subKey] : null;
    const subLoading = subKey && busyKey === subKey;
    const tabBtn = (k, l) => h("button", {
      key: k,
      onClick: () => {
        setVtab(k);
        if (!charData["video_" + k] && busyKey !== "video_" + k) genVideo(k);
      },
      className: "px-5 py-2",
      style: {
        borderRadius: 999,
        fontFamily: F_BODY,
        fontSize: 13,
        background: vtab === k ? t.ink : "transparent",
        color: vtab === k ? t.bg2 : t.fog,
        border: `1px solid ${vtab === k ? t.ink : t.line}`
      }
    }, l);
    content = h("div", {
      style: {
        animation: "fadeUp .3s ease both"
      }
    }, h("div", {
      className: "flex gap-2 mb-5"
    }, tabBtn("day", "白天"), tabBtn("night", "深夜")), !vtab ? h("div", {
      style: {
        fontFamily: F_BODY,
        fontSize: 12.5,
        color: t.fog,
        textAlign: "center",
        padding: "40px 0"
      }
    }, "点「白天」或「深夜」查看 TA 在看的视频") : subLoading ? h(Spinner, {
      label: "正在读取…"
    }) : subData ? renderPhoneModule(subKey, subData, {
      t,
      char,
      setSheet
    }) : h(Spinner, {
      label: "正在读取…"
    }));
  } else if (loading) content = h(Spinner, {
    label: "正在读取 " + zh + "…"
  });else if (!data) content = h(Spinner, {
    label: "正在读取 " + zh + "…"
  });else content = renderPhoneModule(appKey, data, {
    t,
    char,
    setSheet
  });
  const refreshKey = isVideo ? vtab ? "video_" + vtab : null : appKey;
  return h("div", {
    className: "h-full flex flex-col",
    style: {
      background: t.bg
    }
  }, h(Head, {
    zh,
    en: char.name,
    onBack,
    right: refreshKey && h("button", {
      onClick: () => onGen(char, refreshKey),
      disabled: !!busyKey,
      className: "active:opacity-50 disabled:opacity-40"
    }, h(IRefresh, {
      size: 18,
      color: t.ink
    }))
  }), h("div", {
    className: "flex-1 overflow-y-auto px-6 py-4"
  }, content), sheet && h(Sheet, {
    onClose: () => setSheet(null),
    tall: true
  }, sheet));
}

// 查手机主界面：仿桌面
function PhoneCarry({
  characters,
  phones,
  selId,
  busyKey,
  onBack,
  onSel,
  onGenApp,
  onGenAll
}) {
  const t = useTheme();
  const [pick, setPick] = useState(false);
  const [open, setOpen] = useState(null);
  const [inList, setInList] = useState(true); // 先看通讯录列表，点某人才进 Ta 的手机
  // 绿点 = 有数据且还没看过；打开即消，刷新全部时重新点亮
  const [seen, setSeen] = useState(() => loadJSON("x_phoneSeen", {}));
  const isSeen = (cid, k) => !!(seen[cid] && seen[cid][k]);
  const markSeen = (cid, k) => setSeen(p => { const n = { ...p, [cid]: { ...(p[cid] || {}), [k]: true } }; saveJSON("x_phoneSeen", n); return n; });
  const clearSeen = cid => setSeen(p => { const n = { ...p }; delete n[cid]; saveJSON("x_phoneSeen", n); return n; });
  const char = characters.find(c => c.id === selId) || characters[0];
  if (!char) return h("div", {
    className: "h-full flex flex-col"
  }, h(Head, {
    zh: "查手机",
    en: "Inspect",
    onBack
  }), h(Empty, {
    text: "还没有角色",
    sub: "先去群像录入一位"
  }));
  // 通讯录列表：进查手机先看这个，点某人才进 Ta 的手机
  if (inList) return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
    h(Head, { zh: "查手机", en: "Whose Phone", onBack }),
    h("div", { className: "flex-1 overflow-y-auto px-5 pb-8" },
      characters.map(c => h("button", {
        key: c.id, onClick: () => { onSel(c.id); setOpen(null); setInList(false); },
        className: "w-full flex items-center gap-3 py-3 active:opacity-60", style: { borderBottom: "1px solid " + t.line }
      },
        h(Avatar, { character: c, size: 46, radius: 13 }),
        h("div", { className: "flex-1 min-w-0 text-left" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 16.5, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.remark || c.name),
          h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 1 } }, "翻翻 Ta 的手机")),
        h("span", { style: { fontFamily: F_BODY, fontSize: 20, color: t.fog, flexShrink: 0 } }, "›")))));
  const data = phones[char.id] || {};
  const hasData = a => a.key === "video" ? data.video_day || data.video_night : data[a.key];
  if (open) return h(PhoneApp, {
    appKey: open,
    char,
    charData: data,
    busyKey: busyKey === "__all__" ? open : busyKey,
    onGen: onGenApp,
    onBack: () => setOpen(null)
  });
  return h("div", {
    className: "h-full flex flex-col",
    style: {
      background: t.bg
    }
  }, h("div", {
    className: "shrink-0 px-5 pt-5 pb-3 flex items-center justify-between"
  }, h("button", {
    onClick: () => setInList(true),
    className: "active:opacity-50"
  }, h(IArrow, {
    size: 19,
    color: t.ink
  })), h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 15,
      color: t.ink
    }
  }, char.name + " 的手机"), h("div", {
    className: "flex items-center gap-3"
  }, h("button", {
    onClick: () => setPick(true),
    className: "active:opacity-50"
  }, h(Avatar, {
    character: char,
    size: 24,
    radius: 6
  })), h("button", {
    onClick: () => { clearSeen(char.id); onGenAll(char); },
    disabled: !!busyKey,
    className: "active:opacity-50 disabled:opacity-40"
  }, h(IRefresh, {
    size: 18,
    color: t.ink
  })))), h("div", {
    className: "flex-1 overflow-y-auto px-4 pb-8"
  }, h("div", {
    className: "rounded-[28px] px-5 pt-7 pb-8",
    style: {
      background: "linear-gradient(170deg,#fbfaf7,#f1eee7)",
      border: `1px solid ${t.line}`
    }
  }, h("div", {
    className: "flex flex-col items-center mb-7"
  }, h(Avatar, {
    character: char,
    size: 74,
    radius: 22
  }), h("div", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 18,
      color: t.ink,
      marginTop: 10,
      letterSpacing: "0.02em"
    }
  }, (char.name || "") + "'S PHONE"), busyKey === "__all__" ? h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.fog,
      marginTop: 4
    }
  }, "正在生成全部…") : h("div", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.fog,
      marginTop: 4
    }
  }, "点右上角刷新全部 · 或点开单个 App 生成")), h("div", {
    className: "grid grid-cols-4 gap-y-6 gap-x-2"
  }, PHONE_APPS.map(a => h("button", {
    key: a.key,
    onClick: () => a.soon ? null : (markSeen(char.id, a.key), setOpen(a.key)),
    className: "flex flex-col items-center gap-1.5 active:opacity-60"
  }, h("div", {
    className: "relative flex items-center justify-center",
    style: {
      width: 52,
      height: 52,
      borderRadius: 15,
      background: "#fff",
      border: `1px solid ${t.line}`,
      opacity: a.soon ? 0.5 : 1
    }
  }, h(PGlyph, {
    k: a.key,
    size: 26,
    color: a.soon ? t.fog : t.ink
  }), hasData(a) && !a.soon && !isSeen(char.id, a.key) && h("span", {
    style: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 9,
      height: 9,
      borderRadius: 9,
      background: "#95d16f",
      border: "1.5px solid #fff"
    }
  })), h("span", {
    style: {
      fontFamily: F_BODY,
      fontSize: 11,
      color: t.sub
    }
  }, a.zh))))), pick && h(Sheet, {
    onClose: () => setPick(false)
  }, h(Eyebrow, {
    style: {
      marginBottom: 12
    }
  }, "切换角色"), h("div", {
    className: "space-y-1 max-h-72 overflow-y-auto"
  }, characters.map(c => h("button", {
    key: c.id,
    onClick: () => {
      onSel(c.id);
      setPick(false);
      setOpen(null);
    },
    className: "w-full flex items-center gap-3 py-2.5 active:opacity-60"
  }, h(Avatar, {
    character: c,
    size: 34,
    radius: 7
  }), h("span", {
    style: {
      fontFamily: F_DISPLAY,
      fontSize: 16,
      color: t.ink
    }
  }, c.name)))))));
}

// 各 app 的推演任务
function phoneProbeSpec(key, char, rel) {
  const relHint = rel && rel.length ? "关系网里的人（" + rel.join("、") + "）请优先出现。" : "";
  const S = {
    wechat: {
      instruction: "推演此刻「" + char.name + "」微信里的聊天列表（3-4 个会话，不含与用户本人的对话）。" + relHint + "每个会话给出对方名字、最后一条消息、时间；并给出这段最近对话（不超过 6 条，来回都有，from 为对方名字或「" + char.name + "」本人）。贴合人物关系与近况。",
      schemaHint: "{\"chats\":[{\"name\":\"对方名\",\"last\":\"最后一条\",\"time\":\"14:20\",\"messages\":[{\"from\":\"对方名或" + char.name + "\",\"text\":\"内容\"}]}]}",
      maxTokens: 3000
    },
    notes: {
      instruction: "推演「" + char.name + "」备忘录里的几条笔记（3-5 条），每条有标题、时间，点开能看正文细节。贴合身份与当下心境。",
      schemaHint: "{\"items\":[{\"title\":\"标题\",\"time\":\"昨天 21:03\",\"detail\":\"正文\"}]}"
    },
    calls: {
      instruction: "推演「" + char.name + "」最近的通话记录（4-7 条）。" + relHint + "给出通话人、来电(in)还是拨出(out)、时间、是否接通、通话时长（未接为空）。时长要合理。",
      schemaHint: "{\"items\":[{\"name\":\"通话人\",\"dir\":\"in或out\",\"time\":\"今天 09:12\",\"connected\":true,\"duration\":\"04:32\"}]}"
    },
    browser: {
      instruction: "推演「" + char.name + "」浏览器最近的浏览记录（3-5 条），有网址和标题，点开看具体内容摘要。反映兴趣与心境。",
      schemaHint: "{\"items\":[{\"title\":\"网页标题\",\"url\":\"www...\",\"time\":\"13:40\",\"content\":\"内容摘要\"}]}"
    },
    shopping: {
      instruction: "推演「" + char.name + "」最近买过的东西（3-6 件），有名称和价格，点开看 Ta 为什么想买的想法。",
      schemaHint: "{\"items\":[{\"name\":\"商品\",\"price\":\"¥128\",\"time\":\"3天前\",\"thought\":\"想法\"}]}"
    },
    album: {
      instruction: "推演「" + char.name + "」相册里的几张照片（4-6 张）。照片本身看不到，只给一句话标题和时间，点开看这张照片内容的文字描述。",
      schemaHint: "{\"items\":[{\"caption\":\"一句话\",\"time\":\"周日 下午\",\"desc\":\"照片内容的文字描述\"}]}"
    },
    forum: {
      instruction: "推演「" + char.name + "」最近在论坛发的帖子标题（3-5 条）和时间，受最近对话与心情影响。只要标题，不需要正文。",
      schemaHint: "{\"items\":[{\"title\":\"帖子标题\",\"time\":\"2小时前\"}]}"
    },
    music: {
      instruction: "根据「" + char.name + "」的性格取一个歌单名，列出歌单里的歌（5-8 首）。必须是真实存在的歌，给出真实歌名和歌手，不要编造。",
      schemaHint: "{\"playlist\":\"歌单名\",\"desc\":\"一句话描述\",\"songs\":[{\"name\":\"歌名\",\"artist\":\"歌手\"}]}"
    },
    settings: {
      instruction: "推演「" + char.name + "」的屏幕使用时间，像 iOS：日均总时长，以及各 App 单独的使用时长（5-7 个，从多到少）。贴合性格。",
      schemaHint: "{\"screenTime\":\"6小时12分\",\"apps\":[{\"name\":\"微信\",\"time\":\"2小时3分\"}]}"
    },
    recordings: {
      instruction: "推演「" + char.name + "」录音 App 里的几条录音（3-5 条），有名字和时间，点开看录音转文字内容以及 Ta 的内心想法。",
      schemaHint: "{\"items\":[{\"name\":\"录音名\",\"time\":\"昨天 23:40\",\"transcript\":\"转文字内容\",\"thought\":\"内心想法\"}]}"
    },
    video_day: {
      instruction: "推演「" + char.name + "」白天正常刷的视频（3-5 条，仿 B站/抖音，根据性格和最近对话）。每条含：title(标题)、up(up主)、tag(分区标签)、duration(时长，如 08:24 或 12:05，符合该类视频合理长度)。",
      schemaHint: "{\"items\":[{\"title\":\"标题\",\"up\":\"up主\",\"tag\":\"分区\",\"duration\":\"08:24\"}]}"
    },
    video_night: {
      instruction: "推演「" + char.name + "」深夜私密看的小电影（3-5 条），大胆贴合人物欲望。每条含：title(标题)、duration(时长，如 00:12:34 或 01:45:20)、tags(若干标签的字符串数组)、thought(点开时显示 Ta 的想法)。时长要符合小电影的合理长度，标签 2-4 个。",
      schemaHint: "{\"items\":[{\"title\":\"标题\",\"duration\":\"00:18:42\",\"tags\":[\"tag1\",\"tag2\"],\"thought\":\"想法\"}]}"
    },
    wallet: {
      instruction: "推演「" + char.name + "」的财务档案。**最重要：收入来源与全部金额必须严格依据 TA 的人设、职业、身份和社会阶层来定，money 要贴合 TA 真实的谋生方式。** 收入来源 incomes（1-3 项，name+category+amount 数字）——category 从 TA 实际的谋生方式来：工资/自由职业/接单/做生意/兼职/学生生活费/退休金/稿费/打赏 等；**只有当人设明确是富家子弟、继承人、家境优渥时，才可以出现「家族供养/信托」这类收入，否则绝对不要默认套用家族收入。** 普通人就是普通收入、金额可以不高甚至拮据。monthlyIncome 月收入合计；fixedMonthly 每月固定支出；baseBalance 当前存款余额；investAssets 理财持有资产（普通人可能很少或为 0）；notes 各部分批注（income/savings/invest/spending，每条一句符合人设的旁白，透露财力与消费态度）；dailyPool 15-25 条日常消费模板（每条 items 一句话描述当天买了啥，amount 数字，反映其真实生活水平）；可选 gifts 送礼转账。所有金额纯数字不带符号，务必与身份匹配、不要人人都很有钱。",
      schemaHint: "{\"incomes\":[{\"name\":\"公司月薪\",\"category\":\"工资\",\"amount\":11000}],\"monthlyIncome\":11000,\"fixedMonthly\":6800,\"baseBalance\":38400,\"investAssets\":15000,\"notes\":{\"income\":\"...\",\"savings\":\"...\",\"invest\":\"...\",\"spending\":\"...\"},\"dailyPool\":[{\"items\":\"地铁+便利店午饭\",\"amount\":42}],\"gifts\":[{\"date\":\"6月20日\",\"name\":\"给朋友的生日礼物\",\"amount\":200}]}",
      maxTokens: 3200
    }
  };
  return S[key] || {
    instruction: "推演内容",
    schemaHint: "{}"
  };
}

