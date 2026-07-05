const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
  Fragment
} = React;
const h = React.createElement; // 简写，供查手机等新模块使用

// ============================================================
// TOKENS — iOS glass home + calm interior. warm neutral base.
// ============================================================
const DEFAULT_THEME = {
  bg: "#ece8e1",
  bg2: "#f6f4ef",
  ink: "#1b1a17",
  sub: "#4b493f",
  fog: "#96938a",
  line: "#ddd8cd",
  accent: "#c25a4a",
  tint: "#3f6d8c"
};
const ThemeContext = createContext(DEFAULT_THEME);
const useTheme = () => useContext(ThemeContext);
const AV_COLORS = ["#c25a4a", "#5a6357", "#4f5a63", "#7a6a5a", "#6d5a78", "#33322e"];
const F_DISPLAY = "'Fraunces',serif";
const F_BODY = "'Archivo','Noto Serif SC',system-ui,sans-serif";
function Svg({
  size = 18,
  color = "currentColor",
  sw = 1.6,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style
  }, children);
}
const IArrow = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M19 12H5M12 19l-7-7 7-7"
}));
const IPlus = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 5v14M5 12h14"
}));
const IX = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M18 6L6 18M6 6l12 12"
}));
// 置顶图钉
const IPin = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v5"
}));
// 让角色回复：闪光/召唤感的小图标
const ISpark = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 4c.4 3.6 1.9 5.1 5.5 5.5C13.9 9.9 12.4 11.4 12 15c-.4-3.6-1.9-5.1-5.5-5.5C10.1 9.1 11.6 7.6 12 4z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M18.5 13.5c.2 1.6.8 2.2 2.4 2.4-1.6.2-2.2.8-2.4 2.4-.2-1.6-.8-2.2-2.4-2.4 1.6-.2 2.2-.8 2.4-2.4z"
}));
const ISend = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 11l5-5 5 5M12 6v13"
}));
const ITrash = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
}));
const IPencil = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
}));
const IChevD = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 9l6 6 6-6"
}));
const IChevR = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l6 6-6 6"
}));
const IDots = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "5",
  cy: "12",
  r: "1.4",
  fill: p.color || "currentColor"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "1.4",
  fill: p.color || "currentColor"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "19",
  cy: "12",
  r: "1.4",
  fill: p.color || "currentColor"
}));
const IRefresh = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 12a9 9 0 019-9 9 9 0 016.7 3H21M21 3v5h-5M21 12a9 9 0 01-9 9 9 9 0 01-6.7-3H3M3 21v-5h5"
}));
const ICamera = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "13",
  r: "4"
}));
const ICheck = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 6L9 17l-5-5"
}));
const IHeart = p => /*#__PURE__*/React.createElement(Svg, {
  ...p,
  fill: p.filled ? p.color : "none"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20.8 5.6a5.4 5.4 0 00-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 10-7.7 7.7L12 22l8.8-8.7a5.4 5.4 0 000-7.7z"
}));
const IPulse = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 12h4l2-6 4 12 2-6h6"
}));
const ISearch = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "7"
}), /*#__PURE__*/React.createElement("path", {
  d: "M21 21l-4.3-4.3"
}));
// 论坛底栏 / 操作条用（与聊天、查手机同一套线性图标风格）
const IHome = p => h(Svg, p, h("path", { d: "M3 11l9-8 9 8" }), h("path", { d: "M5 10v10h5v-6h4v6h5V10" }));
const IMail = p => h(Svg, p, h("rect", { x: 3, y: 5, width: 18, height: 14, rx: 2 }), h("path", { d: "M3 7l9 6 9-6" }));
const IRepeat = p => h(Svg, p, h("path", { d: "M17 2l4 4-4 4" }), h("path", { d: "M3 11V9a4 4 0 014-4h14" }), h("path", { d: "M7 22l-4-4 4-4" }), h("path", { d: "M21 13v2a4 4 0 01-4 4H3" }));
const IBars = p => h(Svg, p, h("path", { d: "M4 20V10M10 20V4M16 20v-8M22 20H2" }));
// dock/app glyphs
const GMsg = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M21 11.5a8.4 8.4 0 01-12.3 7.5L3 21l1.9-5.7A8.4 8.4 0 1121 11.5z"
}));
const GConfig = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "3.2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"
}));
const GForum = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 5h16v10H9l-4 4V5z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 9h8M8 12h5"
}));
const GUs = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 21C6 16.5 3 13 3 9.2 3 6.5 5 4.5 7.5 4.5c1.7 0 3.3 1 4.5 2.6C13.2 5.5 14.8 4.5 16.5 4.5 19 4.5 21 6.5 21 9.2 21 13 18 16.5 12 21z"
}));
const GCast = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "8",
  r: "3.2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.5 20a5.5 5.5 0 0111 0"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "17",
  cy: "9",
  r: "2.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M15 20a4.5 4.5 0 016.5-4"
}));
const GTies = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "6",
  cy: "6",
  r: "2.3"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "18",
  cy: "7",
  r: "2.3"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "18",
  r: "2.3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7.6 7.5L11 16M16.2 9L13 16M8 6.2h7.7"
}));
const GLife = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "9"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 7v5l3 2"
}));
const GPhone = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("rect", {
  x: "6",
  y: "2.5",
  width: "12",
  height: "19",
  rx: "2.4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 5.5h4"
}));
const GLore = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 4.5A1.5 1.5 0 015.5 3H12v16H5.5A1.5 1.5 0 004 20.5zM20 4.5A1.5 1.5 0 0018.5 3H12v16h6.5a1.5 1.5 0 011.5 1.5z"
}));
const GShop = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 7h16l-1.2 11.2a2 2 0 01-2 1.8H7.2a2 2 0 01-2-1.8L4 7zM8.5 7l3.5-4 3.5 4"
}));
const GBag = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 8h12l-.9 11a2 2 0 01-2 1.8H8.9a2 2 0 01-2-1.8L6 8zM9 8V6.5a3 3 0 016 0V8"
}));
const GUser = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
}));
const GCarry = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 8V6.5A2.5 2.5 0 019.5 4h5A2.5 2.5 0 0117 6.5V8M5.5 8h13a1.5 1.5 0 011.5 1.6l-.7 9A2 2 0 0117.3 20.4H6.7a2 2 0 01-2-1.8l-.7-9A1.5 1.5 0 015.5 8zM12 12v3"
}));
// 钱包：钱夹 + 卡扣
const GWallet = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 7.5A2.5 2.5 0 016.5 5h11A1.5 1.5 0 0119 6.5V8M4 7.5v9A2.5 2.5 0 006.5 19h12a1.5 1.5 0 001.5-1.5V10a1.5 1.5 0 00-1.5-1.5H6.5A2.5 2.5 0 014 6.5M16 13.5a1 1 0 100 .01"
}));
// 占位（敬请期待）：沙漏
const GSoon = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 4h10M7 20h10M8 4c0 4 8 5 8 8s-8 4-8 8M16 4c0 4-8 5-8 8s8 4 8 8"
}));
// 一起听（唱片：外圈 + 内孔）
const GListen = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12", cy: "12", r: "9"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12", cy: "12", r: "2.4"
}));
// —— 行程活动图标 ——
const GCoffee = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5V8zM17 9h2.5a2.5 2.5 0 010 5H17M7 3.5c0 1-.8 1.3-.8 2.3M11 3.5c0 1-.8 1.3-.8 2.3"
}));
const GBrief = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 8.5A1.5 1.5 0 015.5 7h13A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5zM9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M4 12.5h16"
}));
const GPen = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M15.5 5.5l3 3M4 20l1-4L16.5 4.5a1.5 1.5 0 012 0l1 1a1.5 1.5 0 010 2L8 19l-4 1z"
}));
const GMeal = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 3v7a2 2 0 004 0V3M8 10v11M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4M17 12v9"
}));
const GMoon = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"
}));
const GWalk = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 21s-6-4.5-6-9.5a6 6 0 0112 0c0 5-6 9.5-6 9.5zM12 9.5a2 2 0 100 .01"
}));
const GChat = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 6.5A1.5 1.5 0 015.5 5h13A1.5 1.5 0 0120 6.5v8a1.5 1.5 0 01-1.5 1.5H9l-4 3v-3H5.5A1.5 1.5 0 014 14.5z"
}));
const GMem = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 3a5 5 0 00-5 5c0 1 .3 1.7.8 2.5M12 3a5 5 0 015 5c0 1-.3 1.7-.8 2.5M12 3v18M7.8 10.5A4 4 0 006 14a4 4 0 004 4h0M16.2 10.5A4 4 0 0118 14a4 4 0 01-4 4h0M8 8H5.5M16 8H18.5M8.5 13.5H6M15.5 13.5H18"
}));
// 日记：合起来的手账本，书脊 + 书签
const GDiary = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M6.5 3.5h11a1.5 1.5 0 011.5 1.5v14a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 18.5V5a1.5 1.5 0 011.5-1.5z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 3.5v6l2-1.4 2 1.4v-6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 20.5V22"
}));
const GStudy = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M3.5 6.5l8.5-3 8.5 3-8.5 3-8.5-3z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 8v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M20.5 6.5v4.5"
}));
// 周刊：对折的报纸（外壳 + 卷起的右页 + 栏目线）
const GWeekly = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 6h12a1 1 0 011 1v11a1.5 1.5 0 01-1.5 1.5h-9A2.5 2.5 0 014 18V6z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17 9h2a1 1 0 011 1v7.5a2 2 0 01-4 0V7"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 9.5h6M7 12.5h6M7 15.5h4"
}));
// 同人文：翻开的书 + 一支笔尖，寓意「续写」
const GFanfic = p => /*#__PURE__*/React.createElement(Svg, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 5.5c2.5-1 4.5-1 7 0v12c-2.5-1-4.5-1-7 0v-12z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M11 5.5c2.5-1 4.5-1 7 0v8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M15.5 21l4-4 1.5 1.5-4 4-2 .5.5-2z"
}));
// 同人文底 nav 用：书架（三本书）、穿越（拱门/传送门）
const IShelf = p => h(Svg, p, h("path", { d: "M4 4v16M8 6v14M12 5v15" }), h("path", { d: "M15.5 6.2l4.4 1.2-3.8 13.6-4.4-1.2" }), h("path", { d: "M4 20h16" }));
const IPortal = p => h(Svg, p, h("path", { d: "M5 21V8a7 4 0 0114 0v13" }), h("path", { d: "M9 21v-9a3 2.2 0 016 0v9" }));

