// ============================================================
// ROOT
// ============================================================
// 版本号：跟 index.html 的 ?v=NN 同步 bump。左上角小徽标显示它，方便肉眼确认缓存刷没刷新（做完可去掉）。
const APP_VERSION = "v47.03";
// 右上电池：干净的 iOS 风电池图标（只图标不数字）。Battery API 拿得到就按真实电量画填充，
// iOS Safari/PWA 拿不到 → 画一个饱满的装饰电池（不显示假数字）。
function BatteryBadge() {
  const t = useTheme();
  const [lvl, setLvl] = React.useState(null);
  const [charging, setCharging] = React.useState(false);
  React.useEffect(function () {
    let bat = null, upd = null;
    if (navigator.getBattery) {
      navigator.getBattery().then(function (x) {
        bat = x;
        upd = function () { setLvl(Math.round(x.level * 100)); setCharging(!!x.charging); };
        upd();
        x.addEventListener("levelchange", upd);
        x.addEventListener("chargingchange", upd);
      }).catch(function () {});
    }
    return function () { if (bat && upd) { bat.removeEventListener("levelchange", upd); bat.removeEventListener("chargingchange", upd); } };
  }, []);
  const col = t.ink || "#1b1a17";
  const shown = lvl == null ? 82 : lvl;                 // 拿不到就画饱满
  const low = lvl != null && lvl <= 20;
  return h("svg", { width: 25, height: 13, viewBox: "0 0 25 13", style: { display: "block" } },
    h("rect", { x: 0.6, y: 0.9, width: 21, height: 11.2, rx: 3.2, fill: "none", stroke: col, strokeWidth: 1, opacity: 0.42 }),
    h("rect", { x: 23, y: 4.3, width: 1.7, height: 4.4, rx: 0.85, fill: col, opacity: 0.42 }),
    h("rect", { x: 2.1, y: 2.4, width: Math.max(1, 18 * shown / 100), height: 8.2, rx: 1.7, fill: low ? "#ff453a" : col, opacity: lvl == null ? 0.42 : 0.88 }),
    charging ? h("path", { d: "M12.6 2.4 L9.7 7 L11.9 7 L10.9 10.6 L14.2 5.8 L12 5.8 Z", fill: low ? "#ff453a" : col, opacity: 0.9 }) : null);
}
// 顶部细状态栏（在流里，不浮空、不压组件）：左版本号 + 右电池。每页都在。做完可整块去掉。
function DevBadges() {
  const t = useTheme();
  // 绝对定位浮层：不占布局高度（不再压缩顶部内容），pointerEvents:none 不挡点击
  const base = { position: "absolute", top: "calc(env(safe-area-inset-top) + 2px)", zIndex: 50, pointerEvents: "none" };
  return h(React.Fragment, null,
    h("span", { style: Object.assign({ left: 8, fontFamily: "monospace", fontSize: 9, letterSpacing: 0.4, color: t.ink, opacity: 0.3 }, base) }, APP_VERSION),
    h("span", { style: Object.assign({ right: 8, display: "flex", alignItems: "center" }, base) }, h(BatteryBadge, null)));
}
// 一起听·本地音频存 IndexedDB（音频文件大，localStorage 5MB 存不下）。key=歌曲id，value=Blob。
function idbAudioOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("x_listen_audio", 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("aud")) r.result.createObjectStore("aud"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbAudioPut(k, blob) { const db = await idbAudioOpen(); return new Promise((res, rej) => { const tx = db.transaction("aud", "readwrite"); tx.objectStore("aud").put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbAudioGet(k) { const db = await idbAudioOpen(); return new Promise((res, rej) => { const tx = db.transaction("aud", "readonly"); const rq = tx.objectStore("aud").get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
async function idbAudioDel(k) { const db = await idbAudioOpen(); return new Promise(res => { const tx = db.transaction("aud", "readwrite"); tx.objectStore("aud").delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
// 从网易云链接/分享文案/裸ID里抠出歌曲 id
function parseNeteaseId(input) {
  const s = String(input || "");
  const m = s.match(/id=(\d{3,})/) || s.match(/\/song\/(\d{3,})/) || s.match(/^\s*(\d{3,})\s*$/);
  return m ? m[1] : null;
}
// 内置默认表情：手画 SVG 表情脸，编码成 data URI（不依赖图床，开箱即用）
function buildDefaultEmotes() {
  // ⚠必须带 width/height：只有 viewBox 的 SVG 在聊天气泡(EmoteBubble 只给 maxWidth/maxHeight、无尺寸容器)里没有固有尺寸→渲染成 0×0 看不见
  const face = inner => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='#F4C64B' stroke='#1b1a17' stroke-width='3'/>" + inner + "</svg>");
  const S = "fill='none' stroke='#1b1a17' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'";
  const eyeDot = "<circle cx='36' cy='44' r='5'/><circle cx='64' cy='44' r='5'/>";
  const defs = [
    ["开心", eyeDot + "<path d='M34 61 Q50 75 66 61' " + S + "/>"],
    ["大笑", "<path d='M28 46 Q37 37 46 46' " + S + "/><path d='M54 46 Q63 37 72 46' " + S + "/><path d='M31 56 Q50 82 69 56 Z' fill='#1b1a17'/>"],
    ["难过", eyeDot + "<path d='M34 69 Q50 57 66 69' " + S + "/>"],
    ["生气", "<path d='M28 38 L45 45' " + S + "/><path d='M72 38 L55 45' " + S + "/><circle cx='37' cy='50' r='5'/><circle cx='63' cy='50' r='5'/><path d='M36 70 Q50 60 64 70' " + S + "/>"],
    ["爱心眼", "<path d='M30 40 l6 -6 6 6 -6 7 z' fill='#E4572E'/><path d='M58 40 l6 -6 6 6 -6 7 z' fill='#E4572E'/><path d='M34 61 Q50 75 66 61' " + S + "/>"],
    ["疑惑", "<path d='M28 38 Q36 34 44 40' " + S + "/><circle cx='37' cy='48' r='5'/><circle cx='63' cy='48' r='5'/><path d='M42 66 Q50 62 58 66' " + S + "/>"],
    ["哭", "<path d='M30 44 Q37 39 44 44' " + S + "/><path d='M56 44 Q63 39 70 44' " + S + "/><path d='M36 70 Q50 62 64 70' " + S + "/><path d='M34 50 q0 12 0 16' stroke='#3F8FD6' stroke-width='4' fill='none' stroke-linecap='round'/><path d='M66 50 q0 12 0 16' stroke='#3F8FD6' stroke-width='4' fill='none' stroke-linecap='round'/>"],
    ["无语", "<path d='M30 44 L42 44' " + S + "/><path d='M58 44 L70 44' " + S + "/><path d='M38 66 L62 66' " + S + "/><path d='M74 34 q5 8 0 12 q-5 -4 0 -12' fill='#3F8FD6'/>"]
  ];
  return defs.map((d, i) => ({ id: "em_def_" + i, keyword: d[0], url: face(d[1]) }));
}
function App() {
  const isStandalone = typeof window !== "undefined" && (window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches);
  const [now, setNow] = useState(new Date());
  const [screen, setScreen] = useState("home");
  // 当前正在看哪个聊天（供未读红点判断：在看就不累加）
  const viewRef = useRef({ screen: "home", charId: null });
  // 置顶的聊天/群 id 集合
  const [pinnedChats, setPinnedChats] = useState(() => loadJSON("x_pinnedChats", []));
  const [characters, setCharacters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [chats, setChats] = useState({});
  const chatsRef = useRef(chats);
  chatsRef.current = chats; // 始终指向最新聊天记录，避免闭包读到旧值
  const [groupChats, setGroupChats] = useState({});
  const [groupSettings, setGroupSettings] = useState({});
  const [moments, setMoments] = useState([]);
  const [momentsCover, setMomentsCover] = useState({}); // { me: dataURI, [charId]: dataURI } 朋友圈封面
  const [momTarget, setMomTarget] = useState(null);     // 朋友圈个人页目标 { id, isMe }
  const [friendGroups, setFriendGroups] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [snoops, setSnoops] = useState({});
  const [carries, setCarries] = useState({});
  const [phones, setPhones] = useState({});
  const [diaries, setDiaries] = useState({});
  const diariesRef = useRef(diaries);
  diariesRef.current = diaries; // 日记最新记录（自动补写时读最新）
  const [diaryBusy, setDiaryBusy] = useState({}); // charId -> bool，正在写日记
  const [diaryCommenting, setDiaryCommenting] = useState(null); // 正在给哪条「我的日记」生成评论(entryId)
  const diaryRunRef = useRef(false); // 本次打开日记 app 是否已跑过自动补写
  const schedRunRef = useRef(false); // 本次打开行程是否已跑过「当天给所有人生成」
  const schedulesRef = useRef({});
  const [rels, setRels] = useState({});
  const [affinities, setAffinities] = useState({});
  const [moods, setMoods] = useState({});
  const [states, setStates] = useState({});
  const [stateHist, setStateHist] = useState({});
  const [directives, setDirectives] = useState({}); // {charId:[{id,text,ts}]} 用户经 OOC 立的长期行为准则
  const [memories, setMemories] = useState({});
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories; // 始终指向最新长期记忆总结
  const [memLib, setMemLib] = useState([]);
  const memLibRef = useRef(memLib);
  memLibRef.current = memLib; // 始终指向最新记忆库
  const [emoBusy, setEmoBusy] = useState(false); // 情绪补评估中
  const memExtractInflightRef = useRef({}); // 每角色抽取进行中标志，防并发重复抽取
  // 记忆库设置：topK 每轮召回条数；autoExtract 每轮后台自动抽取；extractInterval 每几轮抽一次；recentDays 短期窗至少覆盖最近几天（消死区）
  const MEM_CFG_DEFAULT = { topK: 5, autoExtract: true, extractInterval: 1, recentDays: 3, recentBudget: 8000 };
  const [memCfg, setMemCfg] = useState(MEM_CFG_DEFAULT);
  const memCfgRef = useRef(memCfg); memCfgRef.current = memCfg;
  const memExtractCtrRef = useRef({}); // 每角色自动抽取轮次计数
  const saveMemCfg = patch => setMemCfg(p => { const n = { ...p, ...patch }; memCfgRef.current = n; saveJSON("x_memCfg", n); return n; });
  const ordersRef = useRef([]);
  const kinshipCardsRef = useRef([]);
  const groupChatsRef = useRef(groupChats);
  groupChatsRef.current = groupChats; // 群聊最新记录（投票/红包就地改）
  const [chatSettings, setChatSettings] = useState({});
  // 论坛（仿贴吧）：帖子/评论/关注/私信 —— 全 localStorage，帖子只有一份，版块是筛选视图
  const [forumPosts, setForumPosts] = useState([]);
  const [forumComments, setForumComments] = useState({}); // { [postId]: [comment] }
  const [forumFollows, setForumFollows] = useState([]);    // 关注的角色 id
  const [forumPMs, setForumPMs] = useState([]);            // 与 NPC 的私信会话
  const [forumMe, setForumMe] = useState({ handle: "", bio: "", joinTs: 0, followers: 0 });
  const [forumCharMeta, setForumCharMeta] = useState({});  // { [charId]: {handle,bio,joinTs,following,followers} }（AI 生成一次）
  const [forumOff, setForumOff] = useState([]);            // 不逛论坛的角色 id（默认全逛=空）
  const forumOffRef = useRef([]); forumOffRef.current = forumOff;
  const forumPostsRef = useRef([]); forumPostsRef.current = forumPosts;
  const forumCommentsRef = useRef({}); forumCommentsRef.current = forumComments;
  const forumPMsRef = useRef([]); forumPMsRef.current = forumPMs;
  const forumCharMetaRef = useRef({}); forumCharMetaRef.current = forumCharMeta;
  const [whispers, setWhispers] = useState([]);
  // 情侣空间·问答小本：已答条目流（各角色各一份，按 characterId 过滤）
  const [coupleQA, setCoupleQA] = useState([]);
  // 问答小本封面标题：{ [charId]: title }
  const [coupleQATitle, setCoupleQATitle] = useState({});
  // 情侣空间·双向便签：贴纸墙（authorId='user' 或角色 id）
  const [coupleNotes, setCoupleNotes] = useState([]);
  // 情侣空间·问答自定义题库：{ [charId]: ["题目",...] }，各角色各一份、不互通
  const [coupleQACustom, setCoupleQACustom] = useState({});
  // 情侣空间·心情打卡：角色留下的心情流 {id,characterId,moodTag,text,createdAt}
  const [coupleMood, setCoupleMood] = useState([]);
  // 情侣空间·恋爱时间轴 {id,characterId,date,type,title,content,byCharacter,createdAt}
  const [coupleTimeline, setCoupleTimeline] = useState([]);
  // 情侣空间·纪念日倒计时 {id,characterId,name,month,day,yearlyRepeat,createdAt}
  const [coupleAnniv, setCoupleAnniv] = useState([]);
  // 情侣空间·情书 {id,characterId,authorId:'user'|charId,title,body,isRead,createdAt,font,paper,replies:[{authorId,content,ts}]}
  const [coupleLetters, setCoupleLetters] = useState([]);
  // 情书设置：{ [charId]: { auto, freqDays, freqRandom, font:'auto'|key, paper:key } }
  const [coupleLetterCfg, setCoupleLetterCfg] = useState({});
  // 一起听（展示型，不真放声音）：{ disc:封面/唱片图 dataURL, songs:[{id,title,artist,cover,ts}] }；正在听=songs[0]
  const [listen, setListen] = useState({ disc: null, songs: [] });
  const [neteaseApi, setNeteaseApi] = useState("");
  const [neteaseCookie, setNeteaseCookie] = useState(""); // 可选：网易云账号 Cookie（MUSIC_U=…），填了能放 VIP
  const listenRef = useRef(listen); listenRef.current = listen;
  // 全局播放器：<audio> 挂在根节点 → 退出「一起听」界面也继续播（后台播放）
  const [player, setPlayer] = useState({ songId: null, playing: false, t: 0, dur: 0, loading: false, err: null });
  const audioElRef = useRef(null);
  const playUrlRef = useRef(null); // 本地歌的 objectURL，切歌时回收
  // 情侣空间·甜蜜值：{ [charId]: { value:数字, last:"YYYY-MM-DD" } }，每日打卡 +0.1~1
  const [coupleSweet, setCoupleSweet] = useState({});
  // 情侣空间·详情页自定义：{ [charId]: { bg, myAvatar, charAvatar } }（默认取角色头像/我的头像，不影响原头像）
  const [coupleProfile, setCoupleProfile] = useState({});
  // 解除情侣关系记录：{ [charId]: { ts, deducted, affAfter } } —— 一周冷却 + 复合需加回被扣一半
  const [coupleBreakup, setCoupleBreakup] = useState({});
  // 情侣：多角色各一份 { [charId]: { status:"pending"|"together", since } }
  const [couples, setCouples] = useState({});
  const [wallet, setWallet] = useState(200);
  const [walletLog, setWalletLog] = useState([]); // 我的钱包流水 {id,ts,delta,after,label,kind}
  // 角色钱包（独立 app，持久 running balance）：{charId:{init,balance,incomes,monthlyIncome,fixedMonthly,investAssets,notes,ledger:[{id,ts,delta,after,label,kind}],lastDailyKey,createdTs}}
  const [charWallet, setCharWallet] = useState({});
  const charWalletRef = useRef({});
  charWalletRef.current = charWallet;
  const [selCWallet, setSelCWallet] = useState(null); // 钱包 app 选中的角色
  // 表情包字典 x_emotePacks：[{id,name,global,charIds:[],emotes:[{id,keyword,url}]}]
  const [emotePacks, setEmotePacks] = useState([]);
  const emotePacksRef = useRef([]);
  emotePacksRef.current = emotePacks;
  // 收藏的消息 x_favorites：[{id,charId,role,content,kind,url,keyword,ts,savedTs}]
  const [favorites, setFavorites] = useState([]);
  const [kinshipCards, setKinshipCards] = useState([]); // 收到的亲属卡 [{charId,cardName,limit,used,ledger:[]}]
  const [inventory, setInventory] = useState([]);
  const [cart, setCart] = useState([]); // 购物车 [{uid,name,en,price,cat,desc}]
  const [orders, setOrders] = useState([]); // 待发货/待收货 [{id,name,en,price,status:"shipping"|"receiving",arriveTs,ts,fromCharId,payLabel}]
  const [shopFeed, setShopFeed] = useState({}); // {cat:[products]} 已生成的商品流
  const [shopBusy, setShopBusy] = useState(false);
  const [activeCardId, setActiveCardId] = useState(null); // 打开的亲属卡账单 charId
  const [giftOut, setGiftOut] = useState([]); // 送给角色、在途的礼物 [{id,charId,name,arriveTs,cat}]
  const [carry, setCarry] = useState({}); // 角色随身物品 {charId:{sectionKey:{items}}}
  const [carryGifts, setCarryGifts] = useState({}); // 角色收到的礼物(永久) {charId:[{id,name,receivedTs}]}
  const [selCarry, setSelCarry] = useState(null); // 随身物品选中的角色
  const giftOutRef = useRef([]);
  const carryGiftsRef = useRef({});
  ordersRef.current = orders;
  kinshipCardsRef.current = kinshipCards;
  giftOutRef.current = giftOut;
  carryGiftsRef.current = carryGifts;
  schedulesRef.current = schedules;
  const [unreadMap, setUnreadMap] = useState({});
  // 角色动态保底计数：每次私聊回复给每个角色的三类动态 +1；到阈值就强制发一条（悄悄话≥15轮、朋友圈≥30轮、论坛≥50轮或3天）
  const [ambientCount, setAmbientCount] = useState({});
  const ambientCountRef = useRef({}); ambientCountRef.current = ambientCount;
  // 角色主动早晚安去重：{ cid: { m:dayKey, n:dayKey } }，一天各一次
  const [greetLog, setGreetLog] = useState({});
  const greetLogRef = useRef({}); greetLogRef.current = greetLog;
  const markGreet = (cid, slot, key) => { const n = { ...greetLogRef.current, [cid]: { ...(greetLogRef.current[cid] || {}), [slot]: key } }; greetLogRef.current = n; setGreetLog(n); saveJSON("x_greetLog", n); };
  // 心声每 3 轮才写一次（每条都写会稀释回复质量）——per角色回合计数
  const thoughtCtrRef = useRef(loadJSON("x_thoughtCtr", {}));
  // 主屏红点：角色发了朋友圈/论坛/悄悄话没看的数量，进对应界面清零
  const [appNotif, setAppNotif] = useState({ moments: 0, forum: 0, whisper: 0 });
  const appNotifRef = useRef({ moments: 0, forum: 0, whisper: 0 }); appNotifRef.current = appNotif;
  const [profile, setProfile] = useState({});
  const [worldbook, setWorldbook] = useState("");
  // 世界书结构化词条（第1步：能录能看能存 + 旧blob迁移；注入仍先按"启用的全局词条拼起来"，关键词/绑角色/适用范围的精细注入是第2步）
  const [loreEntries, setLoreEntries] = useState([]);
  const loreRef = useRef(loreEntries); loreRef.current = loreEntries;
  const saveLore = list => { setLoreEntries(list); loreRef.current = list; saveJSON("x_loreEntries", list); };
  // 扁平 baseline：只含「全局 + 启用 + 常驻或无关键词」的词条，给次要功能（群聊/通话/朋友圈/论坛/各App）兜底用；
  // 主聊天走 ctxFor 里的 loreText 引擎做 per角色/关键词/scope/优先级检索，不用这个。
  const deriveWorldbook = list => (list || []).filter(e => e && e.enabled !== false && (!e.charIds || e.charIds.length === 0) && (e.payload || "").trim() && (e.alwaysOn || !((e.keyword || "").trim()))).map(e => (e.title ? "〔" + e.title + "〕" : "") + String(e.payload).trim()).join("\n\n");
  useEffect(() => { setWorldbook(deriveWorldbook(loreEntries)); }, [loreEntries]);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [wallpaper, setWallpaper] = useState("");
  const [prefs, setPrefs] = useState({
    timeAware: true,
    geoAware: false
  });
  const [geo, setGeo] = useState(null);
  const [mapMode, setMapMode] = useState("real"); // 好友地图 现实/架空
  const [apiProfiles, setApiProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [bgApiId, setBgApiId] = useState(null); // 后台任务(抽取/日程/钱包/查手机)专用便宜 API；空=回退主 API
  const [activeChar, setActiveChar] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  // 记录此刻在看的聊天，供未读红点判断
  viewRef.current = { screen, charId: screen === "gthread" ? (activeGroup && activeGroup.id) : (activeChar && activeChar.id) };
  const [editingChar, setEditingChar] = useState(null);
  const [selSched, setSelSched] = useState(null);
  const [selPhone, setSelPhone] = useState(null);
  const [busyLanes, setBusyLanes] = useState({});
  const busyLanesRef = useRef({});
  const laneBusy = key => !!busyLanesRef.current[key];
  const anyLaneBusy = () => Object.keys(busyLanesRef.current).length > 0;
  const startLane = key => { busyLanesRef.current = { ...busyLanesRef.current, [key]: true }; setBusyLanes(busyLanesRef.current); };
  const endLane = key => { const n = { ...busyLanesRef.current }; delete n[key]; busyLanesRef.current = n; setBusyLanes(n); };
  const _curLane = (screen === "gthread" && activeGroup) ? "g:" + activeGroup.id : (activeChar ? "c:" + activeChar.id : null);
  const sending = _curLane ? !!busyLanes[_curLane] : false;
  const [gen, setGen] = useState({});
  const [stateCardOpen, setStateCardOpen] = useState(false);
  const [stateCardChar, setStateCardChar] = useState(null); // 心声卡要显示谁（群聊点头像时=该成员；私聊=null→用 activeChar）
  const [stateCardGroup, setStateCardGroup] = useState(false); // 心声卡是否从群聊打开（群聊隐藏动作/穿着，只显示心声/心情/好感）
  const [editMsg, setEditMsg] = useState(null); // 编辑消息弹层 {content, onSave}
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [call, setCall] = useState(null); // {participants:[char], mode:"voice"|"video", groupId, msgs:[]}
  const callRef = useRef(null);
  const [offlineChar, setOfflineChar] = useState(null);
  const [offlines, setOfflines] = useState({}); // charId -> [session,...] newest-first
  // 线下模式设置 { [charId 或 "g_"+groupId]: {selfP,userP,describeMe,maxTokens} }
  const [offlineSettings, setOfflineSettings] = useState({});
  const osFor = id => offlineSettings[id] || { maxTokens: String(id).startsWith("g_") ? 3200 : 1400 };
  const osNarr = id => { const s = osFor(id); return { selfP: s.selfP, userP: s.userP, describeMe: s.describeMe }; };
  const saveOfflineSettings = (id, patch) => setOfflineSettings(p => { const n = { ...p, [id]: { ...osFor(id), ...patch } }; saveJSON("x_offlineSettings", n); return n; });
  const offlinesRef = useRef({});
  const [offlineGroup, setOfflineGroup] = useState(null);
  const [groupOfflines, setGroupOfflines] = useState({}); // groupId -> [session,...] newest-first
  const groupOfflinesRef = useRef({});
  const keepAliveRef = useRef(null);
  const [anon, setAnon] = useState({});
  const [anonChar, setAnonChar] = useState(null);
  const [anonBusy, setAnonBusy] = useState(false);
  // 拉黑：{ [charId]: { iBlocked, theyBlocked } }
  const [blocks, setBlocks] = useState({});
  const blocksRef = useRef({});
  blocksRef.current = blocks;
  // 日历：{ world:{dateKey:[{id,title}]}, chars:{charId:{...}}, mine:{dateKey:[...]} }
  const [calendar, setCalendar] = useState({ world: {}, chars: {}, mine: {} });
  // 经期：周期/经期长度、实际记录的开始日、可见范围
  const [period, setPeriod] = useState({ cycleLen: 28, periodLen: 5, starts: [], visibleTo: null });
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // 主页名片：与聊天「我」的人设解耦，单独一份 { name, sign, tags:[] }
  const [homeCard, setHomeCard] = useState({ name: "", sign: "", tags: [] });
  const [cardOpen, setCardOpen] = useState(false);
  const [editingMsg, setEditingMsg] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const toast = m => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2200);
  };
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);
  // 让 html/body 背景跟随主题底色，避免下拉回弹时露出白边
  useEffect(() => {
    document.documentElement.style.background = theme.bg;
    document.body.style.background = theme.bg;
  }, [theme.bg]);
  useEffect(() => {
    const c = loadJSON("x_characters", []);
    setCharacters(c);
    setGroups(loadJSON("x_groups", []));
    setGroupSettings(loadJSON("x_groupSettings", {}));
    setMoments(loadJSON("x_moments", []));
    setMomentsCover(loadJSON("x_momentsCover", {}));
    setFriendGroups(loadJSON("x_friendGroups", []));
    setSchedules(loadJSON("x_schedules", {}));
    setSnoops(loadJSON("x_snoops", {}));
    setCarries(loadJSON("x_carries", {}));
    setPhones(loadJSON("x_phone", {}));
    setDiaries(loadJSON("x_diaries", {}));
    setAnon(loadJSON("x_anon", {}));
    setBlocks(loadJSON("x_blocks", {}));
    setStateHist(loadJSON("x_stateHist", {}));
    setCalendar(loadJSON("x_calendar", { world: {}, chars: {}, mine: {} }));
    setPeriod(loadJSON("x_period", { cycleLen: 28, periodLen: 5, starts: [], visibleTo: null }));
    setOfflineSettings(loadJSON("x_offlineSettings", {}));
    setRels(loadJSON("x_rels", {}));
    setAffinities(loadJSON("x_affinities", {}));
    setMoods(loadJSON("x_moods", {}));
    setStates(loadJSON("x_states", {}));
    setDirectives(loadJSON("x_directives", {}));
    setMemories(loadJSON("x_memories", {}));
    setMemLib(loadJSON("x_memLib", []));
    setMemCfg(Object.assign({}, MEM_CFG_DEFAULT, loadJSON("x_memCfg", {})));
    setChatSettings(loadJSON("x_chatSettings", {}));
    // 迁移：早期角色自动发帖存的是「吐槽/日常/求助」短名，不在 FORUM_BOARDS，会导致版块/关注页筛不到 → 补成正式吧名
    (() => {
      const bmap = { "吐槽": "吐槽吧", "日常": "日常吧", "求助": "求助吧", "匿名": "匿名吧" };
      const fp = loadJSON("x_forumPosts", []); let fixed = false;
      fp.forEach(p => { if (p && bmap[p.board]) { p.board = bmap[p.board]; fixed = true; } });
      if (fixed) saveJSON("x_forumPosts", fp);
      setForumPosts(fp);
    })();
    setForumComments(loadJSON("x_forumComments", {}));
    setForumFollows(loadJSON("x_forumFollows", []));
    setForumPMs(loadJSON("x_forumPMs", []));
    let fm = loadJSON("x_forumMe", null);
    if (!fm || !fm.joinTs) { fm = { handle: (fm && fm.handle) || "", bio: (fm && fm.bio) || "", joinTs: Date.now() - (60 + Math.floor(Math.random() * 400)) * 86400000, followers: (fm && fm.followers) || Math.floor(Math.random() * 600) }; saveJSON("x_forumMe", fm); }
    setForumMe(fm);
    setForumCharMeta(loadJSON("x_forumCharMeta", {}));
    setForumOff(loadJSON("x_forumOff", []));
    setWhispers(loadJSON("x_whispers", []));
    setCoupleQA(loadJSON("x_coupleQA", []));
    setCoupleQATitle(loadJSON("x_coupleQATitle", {}));
    // 迁移：旧「悄悄话」一直存在无处显示的 x_whispers 里 → 一次性搬进便签墙，让积压的悄悄话终于露出来
    let _cnotes = loadJSON("x_coupleNotes", []);
    const _oldW = loadJSON("x_whispers", []);
    if (_oldW.length && !loadJSON("x_whispersMigrated", false)) {
      const migrated = _oldW.map(w => ({ id: "note_mig_" + w.id, characterId: w.characterId, authorId: w.characterId, content: String(w.content || "").trim(), style: Math.floor(Math.random() * 5), createdAt: w.ts || Date.now(), replies: [] })).filter(n => n.content);
      _cnotes = migrated.concat(_cnotes).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      saveJSON("x_coupleNotes", _cnotes);
      saveJSON("x_whispersMigrated", true);
    }
    setCoupleNotes(_cnotes);
    setCoupleQACustom(loadJSON("x_coupleQACustom", {}));
    setCoupleMood(loadJSON("x_coupleMood", []));
    setCoupleTimeline(loadJSON("x_coupleTimeline", []));
    setCoupleAnniv(loadJSON("x_coupleAnniv", []));
    setCoupleLetters(loadJSON("x_coupleLetters", []));
    setCoupleLetterCfg(loadJSON("x_coupleLetterCfg", {}));
    { const L = loadJSON("x_listen", { disc: null, songs: [] }); setListen(L); setPlayer(p => ({ ...p, songId: L.nowId || (L.songs && L.songs[0] && L.songs[0].id) || null })); }
    setNeteaseApi(loadJSON("x_neteaseApi", ""));
    setNeteaseCookie(loadJSON("x_neteaseCookie", ""));
    setCoupleSweet(loadJSON("x_coupleSweet", {}));
    setCoupleProfile(loadJSON("x_coupleProfile", {}));
    setCoupleBreakup(loadJSON("x_coupleBreakup", {}));
    // 迁移旧单人情侣数据 x_couple → 新多人 x_couples
    let cps = loadJSON("x_couples", null);
    if (!cps) {
      const old = loadJSON("x_couple", null);
      cps = old && old.status === "together" && old.partnerId ? { [old.partnerId]: { status: "together", since: old.since || Date.now() } } : {};
    }
    setCouples(cps);
    setWallet(loadJSON("x_wallet", 200));
    setWalletLog(loadJSON("x_walletLog", []));
    setCharWallet(loadJSON("x_charWallet", {}));
    // 迁移：旧版内置 SVG 表情的 url 没写 width/height→聊天里 0×0 看不见。按 id 把 em_def_* 的 url 换成修好的，保留用户自建/删改
    const _defUrl = {}; buildDefaultEmotes().forEach(e => { _defUrl[e.id] = e.url; });
    const _packs = loadJSON("x_emotePacks", [{ id: "ep_default", name: "默认表情包", global: true, mine: true, charIds: [], emotes: buildDefaultEmotes() }])
      .map(pk => ({ ...pk, emotes: (pk.emotes || []).map(e => (_defUrl[e.id] && e.url !== _defUrl[e.id]) ? { ...e, url: _defUrl[e.id] } : e) }));
    setEmotePacks(_packs);
    saveJSON("x_emotePacks", _packs);
    setFavorites(loadJSON("x_favorites", []));
    setKinshipCards(loadJSON("x_kinshipCards", []));
    setInventory(loadJSON("x_inventory", []));
    setCart(loadJSON("x_shopCart", []));
    setOrders(loadJSON("x_shopOrders", []));
    setShopFeed(loadJSON("x_shopFeed", {}));
    setGiftOut(loadJSON("x_giftOut", []));
    setCarry(loadJSON("x_carry", {}));
    setCarryGifts(loadJSON("x_carryGifts", {}));
    setUnreadMap(loadJSON("x_unread", {}));
    setAmbientCount(loadJSON("x_ambientCount", {}));
    setGreetLog(loadJSON("x_greetLog", {}));
    setAppNotif(loadJSON("x_appNotif", { moments: 0, forum: 0, whisper: 0 }));
    setProfile(loadJSON("x_profile", {}));
    setHomeCard(loadJSON("x_homeCard", { name: "", sign: "", tags: [] }));
    // 世界书：加载结构化词条；老用户只有整团 blob（x_worldbook）就一次性迁成一条「常驻·全局」词条
    let _lore = loadJSON("x_loreEntries", null);
    if (!Array.isArray(_lore)) {
      const _blob = String(loadJSON("x_worldbook", "") || "").trim();
      _lore = _blob ? [{ id: "le_mig_" + Date.now(), title: "旧世界书", keyword: "", category: "默认", charIds: [], payload: _blob, regex: false, enabled: true, alwaysOn: true, ensemble: false, priority: 3, scope: { chat: true, subjects: true, debate: true, lifestyle: true, diary: true }, ts: Date.now() }] : [];
      saveJSON("x_loreEntries", _lore);
    }
    setLoreEntries(_lore);
    setTheme({
      ...DEFAULT_THEME,
      ...loadJSON("x_theme", {})
    });
    setWallpaper(loadJSON("x_wallpaper", ""));
    setPrefs(loadJSON("x_prefs", {
      timeAware: true,
      geoAware: false
    }));
    setGeo(loadJSON("x_geo", null));
    setMapMode(loadJSON("x_mapMode", "real"));
    const aps = loadJSON("x_api", []);
    setApiProfiles(aps);
    setActiveId(loadJSON("x_activeApi", aps[0] && aps[0].id || null));
    setBgApiId(loadJSON("x_bgApi", null));
    const cm = {},
      gm = {};
    for (const ch of c) cm[ch.id] = loadJSON("x_chat:" + ch.id, []);
    const gs = loadJSON("x_groups", []);
    for (const g of gs) gm[g.id] = loadJSON("x_gchat:" + g.id, []);
    setChats(cm);
    setGroupChats(gm);
    setLoaded(true);
  }, []);
  const active = apiProfiles.find(p => p.id === activeId) || apiProfiles[0];
  // 后台任务(抽取/日程/钱包/查手机)用的 API：选了便宜的就用它，没选就回退主 API（默认，不改变现状）
  const bgActive = (bgApiId && apiProfiles.find(p => p.id === bgApiId)) || active;
  const bgActiveRef = useRef(bgActive); bgActiveRef.current = bgActive;
  const setBgApi = id => { setBgApiId(id); saveJSON("x_bgApi", id); };
  const settingsFor = id => chatSettings[id] || {
    ctxN: 50,
    sumThresh: 150,
    sumBuffer: 20
  };
  const unreadTotal = Object.values(unreadMap).reduce((a, b) => a + b, 0);
  const pC = u => setCharacters(p => {
    const n = typeof u === "function" ? u(p) : u;
    saveJSON("x_characters", n);
    return n;
  });
  const pMom = u => setMoments(p => {
    const n = typeof u === "function" ? u(p) : u;
    saveJSON("x_moments", n);
    return n;
  });
  const saveFriendGroups = list => {
    setFriendGroups(list);
    saveJSON("x_friendGroups", list);
  };
  const pChat = (id, u) => setChats(p => {
    const pl = p[id] || [];
    const n = typeof u === "function" ? u(pl) : u;
    saveJSON("x_chat:" + id, n);
    // 未读红点：新增的角色消息若此刻没在看这个聊天，累加未读条数（推到微任务里，别在 reducer 里改别的 state）
    if (n.length > pl.length) {
      const added = n.slice(pl.length).filter(m => m && m.role === "assistant" && m.kind !== "system").length;
      const viewing = viewRef.current.screen === "thread" && viewRef.current.charId === id;
      if (added > 0 && !viewing) setTimeout(() => bumpUnread(id, added), 0);
    }
    return {
      ...p,
      [id]: n
    };
  });
  const pGChat = (id, u) => setGroupChats(p => {
    const pl = p[id] || [];
    const n = typeof u === "function" ? u(pl) : u;
    saveJSON("x_gchat:" + id, n);
    if (n.length > pl.length) {
      const added = n.slice(pl.length).filter(m => m && m.role !== "user" && m.kind !== "system").length;
      const viewing = viewRef.current.screen === "gthread" && viewRef.current.charId === id;
      if (added > 0 && !viewing) setTimeout(() => bumpUnread(id, added), 0);
    }
    return {
      ...p,
      [id]: n
    };
  });
  const setAff = (id, v) => setAffinities(p => {
    const n = {
      ...p,
      [id]: Math.max(0, Math.min(100, Math.round(Number(v) * 1000) / 1000)) // 内部存 3 位小数，显示时取整
    };
    saveJSON("x_affinities", n);
    return n;
  });
  // 好感度缓慢增减：每次交互按心情随机加 0.005~0.1（存 3 位小数、显示取整）
  const MOOD_POS = ["开心", "高兴", "愉快", "甜", "幸福", "满足", "兴奋", "期待", "喜欢", "心动", "温柔", "安心", "放松", "得意", "激动", "欣慰", "感动", "撒娇", "害羞", "雀跃", "窃喜", "欢喜", "暖"];
  const MOOD_NEG = ["难过", "生气", "愤怒", "委屈", "失望", "伤心", "焦虑", "烦", "累", "孤独", "害怕", "嫉妒", "冷漠", "不安", "低落", "郁闷", "无语", "厌", "疲惫", "沮丧", "受伤", "崩溃"];
  const moodFactor = label => {
    const s = String(label || "");
    if (MOOD_POS.some(w => s.includes(w))) return 1;
    if (MOOD_NEG.some(w => s.includes(w))) return -0.7;
    return 0.4;
  };
  const bumpAff = (charId, aiDelta, moodLabel) => {
    const mf = moodFactor(moodLabel);
    const mag = 0.005 + Math.random() * 0.095; // 0.005~0.1
    let inc;
    if (aiDelta > 0) inc = mag * (0.5 + 0.5 * Math.max(0, mf)); // 上升，心情越好升得越快
    else if (aiDelta < 0) inc = -mag * (0.6 + 0.4 * Math.max(0, -mf)); // 下降，心情越差降得越多
    else inc = mag * 0.25 * mf; // 中性：极缓慢随心情正负微调
    inc = Math.round(inc * 1000) / 1000;
    if (inc) setAff(charId, affOf(charId) + inc);
  };
  // 基础好感：没手动设过时，按你和 TA 的关系推一个基线，而不是一律 50
  const REL_AFF = { 恋人: 80, 挚爱: 82, 爱人: 80, 暧昧: 70, 挚友: 74, 好友: 66, 朋友: 60, 家人: 72, 亲人: 70, 青梅竹马: 68, 兄妹: 62, 兄弟: 62, 姐妹: 62, 同事: 52, 上下级: 50, 师生: 55, 对手: 34, 宿敌: 28, 前任: 44, 陌生人: 42, 暗恋: 58 };
  const baseAff = charId => {
    const labels = [rels["me->" + charId], rels[charId + "->me"]].filter(Boolean).map(r => r.label || "");
    let best = null;
    labels.forEach(l => Object.keys(REL_AFF).forEach(k => { if (l.includes(k) && (best == null || REL_AFF[k] > best)) best = REL_AFF[k]; }));
    return best != null ? best : 50;
  };
  const affOf = charId => affinities[charId] != null ? affinities[charId] : baseAff(charId);
  const setMoodFor = (id, m) => setMoods(p => {
    const n = {
      ...p,
      [id]: m
    };
    saveJSON("x_moods", n);
    return n;
  });
  const setStateFor = (id, s) => setStates(p => {
    const n = {
      ...p,
      [id]: s
    };
    saveJSON("x_states", n);
    return n;
  });
  // 心声历史：每次有新想法就存一条，供「看历史记录」
  const pushStateHist = (id, s) => {
    if (!s || !s.thought) return;
    setStateHist(p => {
      const prev = p[id] || [];
      const last = prev[0];
      if (last && last.thought === s.thought) return p; // 同一条不重复
      const n = { ...p, [id]: [{ thought: s.thought, mood: s.mood, wearing: s.wearing, action: s.action, ts: s.ts || Date.now() }, ...prev].slice(0, 40) };
      saveJSON("x_stateHist", n);
      return n;
    });
  };
  // 用户经 OOC 立下的长期行为准则
  const addDirective = (id, text) => {
    const t = (text || "").trim();
    if (!t) return;
    setDirectives(p => {
      const list = p[id] || [];
      if (list.some(d => d.text === t)) return p; // 完全相同不重复
      const n = { ...p, [id]: [...list, { id: "dir_" + Date.now(), text: t, ts: Date.now() }] };
      saveJSON("x_directives", n);
      return n;
    });
  };
  const removeDirective = (id, dirId) => setDirectives(p => {
    const n = { ...p, [id]: (p[id] || []).filter(d => d.id !== dirId) };
    saveJSON("x_directives", n);
    return n;
  });
  const setMemFor = (id, m) => setMemories(p => {
    const n = {
      ...p,
      [id]: m
    };
    saveJSON("x_memories", n);
    return n;
  });
  // ---- 记忆库（memory library）----
  const saveMemLib = next => {
    setMemLib(next);
    saveJSON("x_memLib", next);
  };
  // 记忆去重：归一化文本（去空白标点）后，和同角色（或全局）已有条目比对——完全相同、或一方几乎是另一方子串就算重复
  // 记忆条目唯一 id：同毫秒多批抽取也不撞（撞了会导致删/改错条目）
  const uniqMemId = (now, i) => "m_" + now + "_" + i + "_" + Math.floor(Math.random() * 1e4);
  const normMemText = s => String(s || "").replace(/[\s，。、；：,.;:!！?？「」『』"'“”‘’（）()【】\-—]/g, "").toLowerCase();
  const memShareChar = (aIds, bIds) => { const a = aIds || [], b = bIds || []; if (!a.length || !b.length) return true; return a.some(x => b.includes(x)); };
  const isDupMem = (text, charIds, pool) => {
    const n = normMemText(text); if (n.length < 4) return false;
    return (pool || memLibRef.current).some(e => {
      if (!memShareChar(charIds, e.charIds)) return false;
      const en = normMemText(e.text); if (!en) return false;
      if (en === n) return true;
      const s = en.length < n.length ? en : n, l = en.length < n.length ? n : en;
      return s.length >= 6 && l.indexOf(s) >= 0 && s.length / l.length > 0.72;
    });
  };
  const clampInt = (x, lo, hi, dflt) => typeof x === "number" && !isNaN(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : dflt;
  const addMemEntry = e => {
    const entry = {
      id: "m_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      text: (e.text || "").trim(),
      tags: e.tags || [],
      charIds: e.charIds || [],
      ts: e.ts || Date.now(),
      source: e.source || "manual",
      pinned: !!e.pinned,
      v: clampInt(e.v, -5, 5, 0),   // 情绪愉悦度 -5~5
      a: clampInt(e.a, 0, 5, 1),    // 情绪强度 0~5
      open: !!e.open                // 还没了结的开环
    };
    if (!entry.text) return;
    // 自动来源（抽取/总结）去重，别把同一件事塞好几条；手动记的放行（用户自己要加就加）
    if (entry.source !== "manual" && isDupMem(entry.text, entry.charIds)) return;
    saveMemLib([entry, ...memLibRef.current]);
  };
  const updateMemEntry = (id, patch) => saveMemLib(memLibRef.current.map(x => x.id === id ? {
    ...x,
    ...patch
  } : x));
  const deleteMemEntry = id => saveMemLib(memLibRef.current.filter(x => x.id !== id));
  // 给还没情绪数据的旧记忆一次性补评估（一批一次便宜调用，点亮情绪色点/未了标记）
  const backfillMemEmotion = async () => {
    if (!active) { toast("请先到设置配置 API"); return; }
    const todo = memLibRef.current.filter(e => e && e.text && typeof e.a !== "number");
    if (!todo.length) { toast("所有记忆都已评估过情绪啦"); return; }
    setEmoBusy(true);
    try {
      const batch = todo.slice(0, 60); // 一次最多 60 条，多的再点一次
      const listText = batch.map((e, i) => (i + 1) + ". " + String(e.text || "").replace(/\s+/g, " ").slice(0, 90)).join("\n");
      const sys = "下面是一批记忆条目，给每条标注情绪与状态：v=愉悦度(整数-5~5，负=难过/生气/难堪，0=中性事实，正=开心/温暖/心动)；a=情绪强度(整数0~5，0=平淡事实，5=强烈动情/激烈冲突/刻骨)；open=是不是【还没了结的开环】(true=没兑现的约定/没和好的争执/悬着的心事/在等的结果；false=已了结、或本就是静态事实/偏好/背景)。\n【输出】只输出 JSON 数组，按序号每条一个对象：[{\"i\":1,\"v\":0,\"a\":1,\"open\":false}]，i 对应上面的序号。";
      const raw = await callAI(bgActive, sys, [{ role: "user", content: listText }], { maxTokens: Math.min(8000, 500 + batch.length * 60) });
      const arr = extractJSON(raw);
      if (!Array.isArray(arr)) throw new Error("解析失败，重试");
      const byIdx = {};
      arr.forEach(o => { if (o && typeof o.i === "number") byIdx[o.i] = o; });
      let n = 0;
      const updated = memLibRef.current.map(e => {
        const pos = batch.indexOf(e);
        if (pos < 0) return e;
        const o = byIdx[pos + 1];
        if (!o) return e;
        n++;
        return { ...e, v: clampInt(o.v, -5, 5, 0), a: clampInt(o.a, 0, 5, 1), open: !!o.open };
      });
      saveMemLib(updated);
      const left = todo.length - batch.length;
      toast("已点亮 " + n + " 条情绪" + (left > 0 ? "，还剩 " + left + " 条·再点一次" : ""));
    } catch (e) { toast("评估失败：" + ((e && e.message) || "重试")); }
    finally { setEmoBusy(false); }
  };
  // 共享抽取：把 msgs 抽成记忆条、双重去重后入库，返回实际新增条数（手动/自动共用）
  const extractAndAddForChar = async (charId, msgs) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !msgs || !msgs.length) return 0;
    // 防并发：同一角色的抽取在跑就直接跳过（省一次 API，也避免 lost-write 竞态）
    if (memExtractInflightRef.current[charId]) return 0;
    memExtractInflightRef.current[charId] = true;
    try {
      const existing = memLibRef.current.filter(e => memShareChar([charId], e.charIds)).slice(0, 40).map(e => e.text).filter(Boolean);
      const items = await extractMemories(bgActive, ctxFor(char), msgs, { existing: existing });
      const now = Date.now();
      const batchSeen = [];
      const entries = items.map((it, i) => ({
        id: uniqMemId(now, i), text: String(it.text).trim(), tags: Array.isArray(it.tags) ? it.tags : [], charIds: [charId], ts: now, source: "auto", pinned: false,
        v: clampInt(it.v, -5, 5, 0), a: clampInt(it.a, 0, 5, 1), open: !!it.open
      })).filter(x => x.text).filter(x => {
        if (isDupMem(x.text, [charId])) return false;            // 和库里已有重复
        if (isDupMem(x.text, [charId], batchSeen)) return false; // 和本批已收的重复
        batchSeen.push(x); return true;
      });
      if (entries.length) saveMemLib([...entries, ...memLibRef.current]);
      return entries.length;
    } finally {
      memExtractInflightRef.current[charId] = false;
    }
  };
  const extractMemForChar = async charId => {
    if (!active) { toast("请先到设置配置 API"); return; }
    const msgs = (chatsRef.current[charId] || []).filter(m => !m.recalled).slice(-40);
    if (msgs.length < 2) { toast("对话太少，先多聊几句"); return; }
    startLane("c:" + charId);
    try { const n = await extractAndAddForChar(charId, msgs); toast(n ? "已抽取 " + n + " 条记忆" : "没有抽到新的记忆点（都已经记过了）"); }
    catch (e) { toast("抽取失败：" + e.message); }
    finally { endLane("c:" + charId); }
  };
  // 自动抽取：每轮聊天后按 extractInterval 节拍静默跑一次（开关在记忆库·召回设置）
  const maybeAutoExtract = async charId => {
    const cfg = memCfgRef.current;
    if (!cfg.autoExtract || !active) return;
    const interval = Math.max(1, cfg.extractInterval || 1);
    const cnt = (memExtractCtrRef.current[charId] || 0) + 1;
    memExtractCtrRef.current[charId] = cnt;
    if (cnt % interval !== 0) return;
    const msgs = (chatsRef.current[charId] || []).filter(m => !m.recalled).slice(-24);
    if (msgs.length < 4) return;
    try { await extractAndAddForChar(charId, msgs); } catch (e) {/* 静默 */}
  };
  // 从旧的「长期记忆总结」一次性拆成离散条目导入记忆库（去重）；不删旧总结
  const importOldMemoryToLib = async charId => {
    if (!active) { toast("请先到设置配置 API"); return; }
    const blob = (memories[charId] || "").trim();
    if (!blob) { toast("这个角色没有旧的长期记忆可导入"); return; }
    const char = characters.find(c => c.id === charId);
    startLane("c:" + charId);
    try {
      const items = await splitMemoryToEntries(bgActive, ctxFor(char), blob);
      const now = Date.now(); const batchSeen = [];
      const entries = (items || []).map((it, i) => ({
        id: uniqMemId(now, "imp" + i), text: String(it.text || "").trim(), tags: Array.isArray(it.tags) ? it.tags : ["导入"], charIds: [charId], ts: now, source: "import", pinned: false
      })).filter(x => x.text).filter(x => {
        if (isDupMem(x.text, [charId])) return false;
        if (isDupMem(x.text, [charId], batchSeen)) return false;
        batchSeen.push(x); return true;
      });
      if (entries.length) saveMemLib([...entries, ...memLibRef.current]);
      toast(entries.length ? "已从旧记忆导入 " + entries.length + " 条" : "旧记忆里的事都已经在库里了");
    } catch (e) { toast("导入失败：" + (e.message || "重试")); }
    finally { endLane("c:" + charId); }
  };
  const clearUnread = id => setUnreadMap(p => {
    const n = {
      ...p,
      [id]: 0
    };
    saveJSON("x_unread", n);
    return n;
  });
  // 未读小红点 +k（角色发来消息时若没在看这个聊天就累加）
  const bumpUnread = (id, k) => setUnreadMap(p => {
    const n = { ...p, [id]: (p[id] || 0) + k };
    saveJSON("x_unread", n);
    return n;
  });
  // 置顶/取消置顶某个聊天（长按聊天条触发）
  const togglePinChat = id => setPinnedChats(p => {
    const n = p.includes(id) ? p.filter(x => x !== id) : [id, ...p];
    saveJSON("x_pinnedChats", n);
    return n;
  });
  // 角色此刻的行程（给聊天/心情联动用）
  const schedNowFor = char => {
    const s = (schedulesRef.current[char.id] || {})[schedDayKey(new Date())];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return "";
    // 换算到我这边时间轴以正确判「此刻」，但给角色的文案仍用 TA 当地时刻（角色按自己时区想事情）
    const disp = schedDisplaySeqs(char, s.seqs);
    const idx = schedCurrentSeqIdx(disp, true);
    const cur = idx >= 0 ? disp[idx] : null;
    const next = disp[idx + 1];
    let out = "今日安排（负荷 " + (s.load || "") + "）：\n" + disp.map(x => (x._charTime || x.time || "") + " " + x.title + (x.location ? "（" + x.location + "）" : "") + (x.deviation ? "［临时改动：" + (x.deviation.reason || "") + "］" : "")).join("\n");
    if (cur) out += "\n\n此刻（你当地约 " + (cur._charTime || cur.time || "") + "）Ta 正在：" + cur.title + (cur.location ? "，在 " + cur.location : "") + (cur.deviation ? "（这段是临时改动：" + (cur.deviation.reason || "") + "，多半和用户有关）" : "");
    else out += "\n\n此刻还没到今天第一项，Ta 大概刚开始一天 / 还没起。";
    if (next) out += "\n待会儿：" + (next._charTime || next.time || "") + " " + next.title;
    return out;
  };
  // 结构化「此刻在做什么/在哪」——给聊天顶栏用（联动今日日程）。没今日日程就返回 null。顶栏在我这边，用我这边时刻。
  const schedNowBriefFor = char => {
    if (!char) return null;
    const s = (schedulesRef.current[char.id] || {})[schedDayKey(new Date())];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return null;
    const disp = schedDisplaySeqs(char, s.seqs);
    const idx = schedCurrentSeqIdx(disp, true);
    const cur = idx >= 0 ? disp[idx] : null;
    if (!cur) return { time: "", title: "还没开始今天的安排", location: "", dev: false };
    return { time: cur._myLabel || cur.time || "", title: cur.title || "", location: cur.location || "", type: cur.type || "other", dev: !!cur.deviation };
  };
  // 好友地图：所有角色此刻在做什么（供 pin 定位偏移 + 标签）
  const mapStatusAll = () => { const m = {}; characters.forEach(c => { const b = schedNowBriefFor(c); if (b) m[c.id] = b; }); return m; };
  // 近期对话文本（供世界书关键词命中）
  const recentChatText = char => (chatsRef.current[char.id] || []).filter(m => !m.recalled).slice(-8).map(m => m.content).join("\n");
  // 按角色 + 适用范围检索世界书注入文本（scope: chat/subjects/debate/lifestyle/diary）
  const loreFor = (char, scope) => loreText(loreRef.current, { charIds: char ? [char.id] : [], scope: scope || "chat", text: char ? recentChatText(char) : "" });
  const ctxFor = char => ({
    char,
    chars: characters,
    schedNow: schedNowFor(char),
    rels,
    // 情侣状态（表白在一起后自动生效，不用去改「关系」字段）：together 权威、覆盖旧关系标签
    coupleStatus: (() => {
      const cp = couples[char.id];
      if (!cp) return "";
      if (cp.status === "together") { const days = cp.since ? Math.max(1, Math.floor((Date.now() - cp.since) / 86400000) + 1) : null; return "together" + (days ? "|" + days : ""); }
      if (cp.status === "pending") return "pending";
      return "";
    })(),
    // 世界书：按当前角色 + 近期对话做关键词/绑定/范围/优先级检索式注入（第2步引擎），不再是一整团
    worldbook: loreFor(char, "chat"),
    profile,
    affinity: Math.round(affOf(char.id)),
    moodLabel: (moods[char.id] || {}).label || null,
    directives: directives[char.id] || [],
    memory: memories[char.id],
    memLib: retrieveMemories(memLibRef.current, char.id, (chatsRef.current[char.id] || []).filter(m => !m.recalled).slice(-8).map(m => m.content).join("\n"), { limit: memCfgRef.current.topK || 5 }),
    geo: prefs.geoAware ? geo : null,
    timeAware: prefs.timeAware,
    giftLog: (() => {
      const given = (carryGiftsRef.current[char.id] || []).map(g => g.name).filter(Boolean);
      const got = (inventory || []).filter(x => x.fromCharId === char.id).map(x => x.name).filter(Boolean);
      const parts = [];
      if (given.length) parts.push("你送给用户过：" + given.slice(-8).join("、"));
      if (got.length) parts.push("用户送给你过：" + got.slice(-8).join("、"));
      return parts.join("；");
    })(),
    momentLog: (() => {
      const mine = (moments || []).filter(m => m.mine).slice(0, 3);
      if (!mine.length) return "";
      return mine.map(m => {
        const liked = (m.likers || []).includes(char.name);
        const myC = (m.comments || []).filter(cm => cm.author === char.name).map(cm => cm.text);
        const acts = [];
        if (liked) acts.push("你点了赞");
        if (myC.length) acts.push("你评论了「" + myC.join("；") + "」");
        if (!acts.length) acts.push("你没点赞也没评论");
        return "· 用户发的「" + String(m.content || "").slice(0, 40) + "」：" + acts.join("，");
      }).join("\n");
    })(),
    forumEcho: (() => {
      const posts = forumPostsRef.current || [];
      const cmts = forumCommentsRef.current || {};
      const meName = profile.name || "对方";
      const lines = [];
      // 我在 TA 帖子下的评论
      posts.filter(p => p.authorId === char.id && p.authorType === "character").slice(0, 4).forEach(p => {
        const myOn = [];
        (cmts[p.id] || []).forEach(f => { if (f.authorType === "me") myOn.push(f.content); (f.replies || []).forEach(r => { if (r.authorType === "me") myOn.push(r.content); }); });
        if (myOn.length) lines.push("你发的帖「" + p.title + "」下，" + meName + "评论了：" + myOn.slice(0, 3).map(x => "“" + String(x).slice(0, 40) + "”").join("；"));
      });
      // 别人（含 NPC/我）回复了 TA 在论坛的评论
      posts.forEach(p => { (cmts[p.id] || []).forEach(f => {
        if (f.authorId === char.id && f.authorType === "character" && (f.replies || []).length) {
          const rs = f.replies.slice(0, 3).map(r => (r.authorType === "me" ? meName : r.authorName) + "：" + String(r.content).slice(0, 30));
          lines.push("你在「" + p.title + "」回的那条（“" + String(f.content).slice(0, 24) + "”），楼下有人回你：" + rs.join("；"));
        }
      }); });
      return lines.slice(0, 5).join("\n");
    })(),
    phoneNote: (() => {
      const ph = (phones || {})[char.id] || {};
      const out = [];
      if (ph.music && Array.isArray(ph.music.songs) && ph.music.songs.length) out.push("你歌单「" + (ph.music.playlist || "") + "」最近在听：" + ph.music.songs.slice(0, 8).map(s => s.name + (s.artist ? "（" + s.artist + "）" : "")).join("、"));
      const sum = (key, label, fn) => { const it = ph[key] && ph[key].items; if (Array.isArray(it) && it.length) { const s = it.slice(0, 4).map(fn).filter(Boolean); if (s.length) out.push(label + "：" + s.join("；")); } };
      sum("browser", "浏览器最近看的", x => x.title);
      sum("video_day", "刷的视频", x => x.title);
      sum("notes", "备忘录里记的", x => x.title);
      sum("recordings", "录音里", x => x.name);
      return out.join("\n");
    })(),
    periodNote: (() => {
      if (!period || !period.visibleTo || !period.visibleTo.includes(char.id)) return "";
      const list = periodList(period);
      if (!list.length) return "";
      const lastP = list[list.length - 1];
      const last = pKeyDate(lastP.start);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cyc = period.cycleLen || 28, pLen = periodSpanLen(lastP, period.periodLen || 5);
      let dic = Math.floor((today - last) / 86400000) % cyc;
      if (dic < 0) return "";
      let phase;
      if (dic < pLen) phase = "正处于经期（第 " + (dic + 1) + " 天）";
      else if (Math.abs(dic - (cyc - 14)) <= 2) phase = "接近排卵日";
      else if (dic >= cyc - 4) phase = "经前期，接近下次经期";
      else phase = "处于相对安全期";
      return "用户此刻的生理期状态：" + phase + "。（这是用户允许你看到的私密信息。可依你的人设与关系自然地关心、提醒注意事项，或选择不提；别生硬报数据、别越界。）";
    })(),
    financeNote: (typeof ledgerNoteFor === "function" ? ledgerNoteFor(char.id) : ""),
    listenLog: (() => {
      const L = listenRef.current || {};
      const uName = profile && profile.name ? profile.name : "对方";
      const lines = [];
      // 正和这个角色一起听 → 无论开没开自动评论，TA 都「知道」在放什么（被问起能接住）；开了自动评论才额外鼓励主动聊
      if (L.partnerId === char.id && player.songId) {
        const cur = resolveSong(player.songId);
        if (cur) lines.push("【你正和 " + uName + " 一起听】《" + cur.title + "》" + (cur.artist ? " - " + cur.artist : "") + (player.playing ? "（正放着）" : "（暂停中）") + "。" + (L.autoComment ? "你可以自然聊聊这首歌、跟着哼、说喜不喜欢、想起什么、或想换首歌——别报歌单、别客服腔。" : "如果 " + uName + " 问起你在听什么/这首歌，你清楚就是这首，能自然接住、说说感受，别装不知道。"));
      }
      // 一起听过的歌 → 记忆
      const hist = L.history || [];
      const together = hist.filter(x => x.partnerId === char.id).slice(0, 8);
      if (together.length) lines.push("你和 " + uName + " 一起听过：" + together.map(x => "《" + x.title + "》" + (x.artist ? "(" + x.artist + ")" : "")).join("、") + "（聊到时可自然记得）");
      // 若这个角色有专属歌单
      const myPl = (L.playlists || []).find(p => p.charId === char.id);
      if (myPl) lines.push("你自己整理过一张歌单「" + myPl.name + "」，是你爱听的那些。");
      return lines.join("\n");
    })(),
    groupEcho: (groups || []).filter(g => gsFor(g.id).memoryInterop && (g.memberIds || []).includes(char.id)).map(g => {
      const msgs = (groupChatsRef.current[g.id] || []).filter(m => m && m.kind !== "ooc" && m.role !== "system" && String(m.content || "").trim());
      if (!msgs.length) return "";
      const others = (g.memberIds || []).filter(id => id !== char.id).map(id => { const c = characters.find(x => x.id === id); return c ? c.name : null; }).filter(Boolean);
      const lines = msgs.slice(-14).map(m => (m.role === "narration" ? "【旁白】" : (m.role === "user" ? (profile.name || "用户") : (m.senderName || "某人")) + "：") + String(m.content).replace(/\s+/g, " ").slice(0, 60)).join("\n");
      return "『群「" + g.name + "」" + (others.length ? "（群里还有 " + others.join("、") + "）" : "") + " 最近聊的』\n" + lines;
    }).filter(Boolean).slice(0, 2).join("\n\n"),
    // 短期原文窗 = 最近 ctxN 条 ∪ 最近 recentDays 天（消死区：只要是这几天说的一定带上）
    // 封顶用【字符预算】而非条数：长消息少带几条、短消息多带几条 → 成本可控，且高频用户不会每轮都顶着上百条原文（按次计费的核心 prompt）
    recentChat: (() => {
      const all = (chatsRef.current[char.id] || []).filter(m => !m.recalled && m.content);
      if (!all.length) return "";
      const ctxN = settingsFor(char.id).ctxN || 50;
      const days = memCfgRef.current.recentDays || 3;
      const cutoff = Date.now() - days * 86400000;
      const firstRecent = all.findIndex(m => (m.ts || 0) >= cutoff);
      const byTimeCount = firstRecent >= 0 ? (all.length - firstRecent) : 0;
      const wantStart = all.length - Math.max(ctxN, byTimeCount); // 条数窗与时间窗取更早的起点
      const lines = [];
      const uName = profile.name || "用户";
      const budget = memCfgRef.current.recentBudget || 8000; // 字符预算(召回设置可调)：从最近往回收，攒够就停（老而仍在窗内的事由自动抽取+摘要兜底）
      let used = 0;
      for (let i = all.length - 1; i >= wantStart && i >= 0; i--) {
        const m = all[i];
        const line = (m.role === "user" ? uName : char.name) + ": " + m.content;
        used += line.length + 1;
        if (used > budget && lines.length) break; // 超预算就停，但至少保底一条
        lines.push(line);
      }
      return lines.reverse().join("\n");
    })()
  });
  // ---- 后台保活（尽力而为：循环播放静音音频占住 iOS 音频会话）----
  useEffect(() => {
    const on = !!prefs.keepAlive;
    if (on) {
      if (!keepAliveRef.current && SILENT_WAV) {
        const a = new Audio(SILENT_WAV);
        a.loop = true;
        a.volume = 0.01;
        keepAliveRef.current = a;
      }
      // 尝试播放（须由用户手势触发，切换开关本身即手势）
      keepAliveRef.current && keepAliveRef.current.play().catch(() => {});
    } else if (keepAliveRef.current) {
      keepAliveRef.current.pause();
    }
  }, [prefs.keepAlive]);
  // ---- 主动发消息（仅前台，app 打开该聊天且闲置到间隔后触发）----
  useEffect(() => {
    if (screen !== "thread" || !activeChar) return;
    const s = settingsFor(activeChar.id);
    if (!s.proactive) return;
    const mins = Math.max(1, s.proactiveMin || 5);
    const cid = activeChar.id;
    const timer = setInterval(() => {
      if (laneBusy("c:" + cid)) return;
      const msgs = (chatsRef.current[cid] || []).filter(m => !m.recalled && m.kind !== "ooc" && m.kind !== "system");
      if (!msgs.length) return;
      const lastTs = msgs[msgs.length - 1].ts || 0;
      if (Date.now() - lastTs >= mins * 60000) replyNow(cid, "", null, { proactive: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [screen, activeChar, chatSettings, sending]);
  // ---- 角色主动早晚安：扫所有【在聊的】角色，到各自作息的早/晚，主动发一句问候，落成未读红点，你随缘回 ----
  // 只在 app 打开时跑（静态站无后台推送）；一次只发一个错峰；一天早/晚各一次；刚聊完/正在看的不打扰。
  // 角色当地"此刻几点几分"（分钟数）——按 tz 偏移，无 tz 用设备本地
  const charLocalMin = char => {
    const raw = char && char.tz;
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") { const off = parseFloat(raw); if (!isNaN(off)) { const d = new Date(Date.now() + off * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); } }
    const d = new Date(); return d.getHours() * 60 + d.getMinutes();
  };
  // 从今日日程取起床/就寝时刻（角色本地，分钟）；没日程返回 null
  const schedWakeSleep = char => {
    const s = (schedulesRef.current[char.id] || {})[schedDayKey(new Date())];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return null;
    const toMin = t => { const m = /(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    let sleep = null;
    for (let i = s.seqs.length - 1; i >= 0; i--) { if (s.seqs[i].type === "sleep") { sleep = toMin(s.seqs[i].time); break; } }
    if (sleep == null) sleep = toMin(s.seqs[s.seqs.length - 1].time);
    return { wake: toMin(s.seqs[0].time), sleep: sleep };
  };
  const nearMin = (a, b, tol) => { let d = Math.abs(a - b); d = Math.min(d, 1440 - d); return d <= tol; };
  // 要不要问候、问早还是问晚：优先按日程（起床后3h内问早、就寝前后1.5h问晚安），没日程回退固定窗口
  const greetSlotFor = char => {
    const nowMin = charLocalMin(char);
    const ws = schedWakeSleep(char);
    if (ws) {
      if (ws.wake != null && nowMin >= ws.wake && nowMin <= ws.wake + 180) return "m";
      if (ws.sleep != null && nearMin(nowMin, ws.sleep, 90)) return "n";
      return null; // 有日程但不在起床/就寝附近 → 此刻不问候
    }
    const hr = Math.floor(nowMin / 60); // 没今日日程 → 回退固定窗口
    return (hr >= 7 && hr <= 10) ? "m" : ((hr >= 21 && hr <= 23) || hr <= 1) ? "n" : null;
  };
  useEffect(() => {
    const hist = c => (chatsRef.current[c.id] || []).filter(m => !m.recalled && m.kind !== "ooc" && m.kind !== "system");
    const tick = () => {
      if (!active) return;
      const dayKey = schedDayKey(new Date());
      // 池 = 真在聊的角色（≥2条历史）；每个时段最多问候 ceil(池/2) 个，别全员打卡把你淹了
      const pool = characters.filter(c => hist(c).length >= 2);
      if (!pool.length) return;
      const cap = Math.ceil(pool.length / 2);
      // 按天轮换顺序，让每天优先问候的角色不同（不总是同几个）
      const rot = Math.floor(Date.now() / 86400000) % pool.length;
      const ordered = pool.slice(rot).concat(pool.slice(0, rot));
      const doneInSlot = slot => ordered.filter(c => (greetLogRef.current[c.id] || {})[slot] === dayKey).length;
      for (const c of ordered) {
        const cid = c.id;
        if (laneBusy("c:" + cid)) continue;
        if (viewRef.current.charId === cid) continue;         // 正在看这个聊天就不用主动问候
        const slot = greetSlotFor(c);
        if (!slot) continue;
        if ((greetLogRef.current[cid] || {})[slot] === dayKey) continue; // 这个时段今天已问候过
        if (doneInSlot(slot) >= cap) continue;                // 这个时段今天问候名额已满
        const msgs = hist(c);
        if (Date.now() - (msgs[msgs.length - 1].ts || 0) < 90 * 60000) continue; // 刚聊完 90 分钟内先不打扰
        markGreet(cid, slot, dayKey);
        replyNow(cid, "", null, { proactive: true, greet: slot === "m" ? "morning" : "night" });
        break;                                                // 一次只发一个，错峰
      }
    };
    const kick = setTimeout(tick, 6000);                      // 开 app 几秒后先扫一次
    const timer = setInterval(tick, 45000);
    return () => { clearTimeout(kick); clearInterval(timer); };
  }, [characters, active]);
  // 打开好友地图时刷新一次真实 GPS（让你的蓝点跳到现在的位置，别停在上次定位的旧点）
  useEffect(() => {
    if (screen !== "map" || !prefs.geoAware) return;
    (async () => { try { const g = await requestGeo(); if (g && !g.error && typeof g.lat === "number") { setGeo(g); saveJSON("x_geo", g); } } catch (e) {} })();
  }, [screen]);
  // ---- 线下模式（赴约）----
  useEffect(() => {
    offlinesRef.current = offlines;
  }, [offlines]);
  const pOffline = (charId, updater) => setOfflines(prev => {
    const next = updater(prev[charId] || []);
    saveJSON("x_offline:" + charId, next);
    const n = { ...prev, [charId]: next };
    offlinesRef.current = n;
    return n;
  });
  const pushOffMsg = (charId, msg) => pOffline(charId, list => list.map(s => !s.endTs ? { ...s, msgs: [...s.msgs, msg] } : s));
  const openOffline = char => {
    const list = loadJSON("x_offline:" + char.id, []);
    setOfflines(prev => ({ ...prev, [char.id]: list }));
    offlinesRef.current = { ...offlinesRef.current, [char.id]: list };
    setOfflineChar(char);
  };
  const genOfflineFrom = async (charId, workSess) => {
    const char = characters.find(c => c.id === charId);
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    if ((workSess.msgs || []).length === 0) {
      toast("先说点什么，或写一句开场");
      return;
    }
    startLane("c:" + charId);
    try {
      const oCtx = ctxFor(char);
      oCtx.curWear = (states[charId] && states[charId].wearing) || ""; // 着装连贯：把当前穿着喂回去
      const oMemN = osFor(charId).memN;
      if (oMemN != null) oCtx.memLib = oMemN <= 0 ? [] : retrieveMemories(memLibRef.current, charId, (workSess.msgs || []).slice(-6).map(m => m.content || "").join("\n"), { limit: oMemN });
      const res = await generateOffline(active, oCtx, { ...workSess, narr: osNarr(charId), maxTokens: osFor(charId).maxTokens, minWords: osFor(charId).minWords });
      pushOffMsg(charId, {
        id: "c_" + Date.now(),
        role: "char",
        content: res.scene,
        thought: res.thought,
        ts: Date.now()
      });
      // 线下相处也影响好感与心情（跟私聊一样）
      if (typeof res.affinityDelta === "number") bumpAff(charId, res.affinityDelta, res.mood && res.mood.label);
      if (res.mood && res.mood.label) setMoodFor(charId, { ...res.mood, ts: Date.now() });
      // 线下也更新状态卡的动作/穿着（否则线下换了场景、状态卡的衣服/动作还冻在上次线上聊天）
      const ost = {};
      if (res.wearing) ost.wearing = res.wearing;
      if (res.action) ost.action = res.action;
      if (res.thought) ost.thought = res.thought;
      if (Object.keys(ost).length) { const ns = { ...(states[charId] || {}), ...ost, mood: res.mood && res.mood.label ? res.mood.label : (states[charId] || {}).mood, ts: Date.now() }; setStateFor(charId, ns); pushStateHist(charId, ns); }
    } catch (e) {
      toast("生成失败：" + (e.message || "重试"));
    } finally {
      endLane("c:" + charId);
    }
  };
  const startOffline = async (charId, opts) => {
    const opening = (opts.opening || "").trim();
    const sess = {
      id: "off_" + Date.now(),
      startTs: Date.now(),
      endTs: null,
      styleKey: opts.styleKey || "default",
      stylePrompt: opts.stylePrompt != null ? opts.stylePrompt : "",
      customNotes: [],
      msgs: opening ? [{ id: "n_" + Date.now(), role: "narration", content: opening, ts: Date.now() }] : []
    };
    pOffline(charId, list => [sess, ...list.filter(s => s.endTs)]);
    if (opening) await genOfflineFrom(charId, sess);
  };
  const offlineSend = (charId, text) => pushOffMsg(charId, {
    id: "u_" + Date.now(),
    role: "user",
    content: text,
    ts: Date.now()
  });
  const offlineReply = async (charId, extraText) => {
    if (laneBusy("c:" + charId)) return;
    const sess = (offlinesRef.current[charId] || []).find(s => !s.endTs);
    if (!sess) return;
    let msgs = sess.msgs;
    if (extraText && extraText.trim()) {
      const um = { id: "u_" + Date.now(), role: "user", content: extraText.trim(), ts: Date.now() };
      pushOffMsg(charId, um);
      msgs = [...msgs, um];
    }
    await genOfflineFrom(charId, { ...sess, msgs });
  };
  const offlineEditMsg = (charId, msgId, text) => pOffline(charId, list => list.map(s => !s.endTs ? { ...s, msgs: s.msgs.map(m => m.id === msgId ? { ...m, content: text } : m) } : s));
  const offlineDelMsg = (charId, msgId) => pOffline(charId, list => list.map(s => !s.endTs ? { ...s, msgs: s.msgs.filter(m => m.id !== msgId) } : s));
  const offlineRerollMsg = async (charId, msgId) => {
    if (laneBusy("c:" + charId)) return;
    const sess = (offlinesRef.current[charId] || []).find(s => !s.endTs);
    if (!sess) return;
    const idx = sess.msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const truncated = sess.msgs.slice(0, idx); // 去掉这条及之后，重新生成
    pOffline(charId, list => list.map(s => s.id === sess.id ? { ...s, msgs: truncated } : s));
    if (!truncated.length) { toast("这条前面没有内容可续写"); return; }
    await genOfflineFrom(charId, { ...sess, msgs: truncated });
  };
  const offlineAddNote = (charId, note) => {
    pOffline(charId, list => list.map(s => !s.endTs ? { ...s, customNotes: [...(s.customNotes || []), note] } : s));
    toast("已加入提示");
  };
  // 线下进行中随时切换文风（不同剧情段落用不同笔调）
  const offlineSetStyle = (charId, patch) => {
    pOffline(charId, list => list.map(s => !s.endTs ? { ...s, styleKey: patch.styleKey, stylePrompt: patch.stylePrompt != null ? patch.stylePrompt : "" } : s));
    toast("文风已切换 · 下次演绎生效");
  };
  const endOffline = async charId => {
    const char = characters.find(c => c.id === charId);
    const sess = (offlinesRef.current[charId] || []).find(s => !s.endTs);
    if (!sess) {
      setOfflineChar(null);
      return;
    }
    // 什么都没发生就直接丢弃，不留空记录
    if ((sess.msgs || []).filter(m => m.role !== "narration").length === 0) {
      pOffline(charId, list => list.filter(s => s.id !== sess.id));
      setOfflineChar(null);
      return;
    }
    startLane("c:" + charId);
    let summary = "";
    try {
      if (active) summary = await summarizeOffline(active, ctxFor(char), sess);
    } catch (e) {}
    pOffline(charId, list => list.map(s => s.id === sess.id ? { ...s, endTs: Date.now(), summary } : s));
    if (summary) addMemEntry({ text: summary, tags: ["线下"], charIds: [charId], source: "auto" });
    // TODO(日程覆盖，用户说后面再弄)：把本次线下时间段的日程覆盖成这段经过 + 角色想法。
    endLane("c:" + charId);
    toast(summary ? "已记入记忆库" : "已结束");
    setOfflineChar(null);
  };
  // ---- 群聊线下模式（多人赴约）----
  useEffect(() => {
    groupOfflinesRef.current = groupOfflines;
  }, [groupOfflines]);
  const groupMembers = group => (group.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
  const ctxForGroupOffline = group => ({
    members: groupMembers(group),
    profile,
    rels,
    chars: characters,
    worldbook,
    timeAware: prefs.timeAware,
    // 记忆分区：不互通的群是封闭空间，线下也不读全局记忆库（不让外部记忆流入）
    memLib: gsFor(group.id).memoryInterop ? memLibRef.current : null
  });
  const pGOffline = (groupId, updater) => setGroupOfflines(prev => {
    const next = updater(prev[groupId] || []);
    saveJSON("x_goffline:" + groupId, next);
    const n = { ...prev, [groupId]: next };
    groupOfflinesRef.current = n;
    return n;
  });
  const pushGOffMsg = (groupId, msg) => pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, msgs: [...s.msgs, msg] } : s));
  const openGroupOffline = group => {
    const list = loadJSON("x_goffline:" + group.id, []);
    setGroupOfflines(prev => ({ ...prev, [group.id]: list }));
    groupOfflinesRef.current = { ...groupOfflinesRef.current, [group.id]: list };
    setOfflineGroup(group);
  };
  const genGroupOfflineFrom = async (group, workSess) => {
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    if ((workSess.msgs || []).length === 0) {
      toast("先说点什么，或写一句开场");
      return;
    }
    startLane("g:" + group.id);
    try {
      const beats = await generateOfflineGroup(active, ctxForGroupOffline(group), { ...workSess, narr: osNarr("g_" + group.id), maxTokens: osFor("g_" + group.id).maxTokens || 3200, minWords: osFor("g_" + group.id).minWords });
      for (let i = 0; i < beats.length; i++) {
        const b = beats[i];
        if (i > 0) await new Promise(r => setTimeout(r, 420));
        pushGOffMsg(group.id, {
          id: "gc_" + Date.now() + "_" + i,
          role: b.role,
          senderId: b.senderId,
          senderName: b.senderName,
          content: b.scene,
          thought: b.thought,
          ts: Date.now()
        });
        // 多人线下也影响各角色对用户的好感与心情
        if (b.senderId && typeof b.affinityDelta === "number") bumpAff(b.senderId, b.affinityDelta, b.mood && b.mood.label);
        if (b.senderId && b.mood && b.mood.label) setMoodFor(b.senderId, { ...b.mood, ts: Date.now() });
      }
    } catch (e) {
      toast("生成失败：" + (e.message || "重试"));
    } finally {
      endLane("g:" + group.id);
    }
  };
  const startGroupOffline = async (groupId, opts) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const opening = (opts.opening || "").trim();
    const sess = {
      id: "goff_" + Date.now(),
      startTs: Date.now(),
      endTs: null,
      styleKey: opts.styleKey || "default",
      stylePrompt: opts.stylePrompt != null ? opts.stylePrompt : "",
      customNotes: [],
      msgs: opening ? [{ id: "n_" + Date.now(), role: "narration", content: opening, ts: Date.now() }] : []
    };
    pGOffline(groupId, list => [sess, ...list.filter(s => s.endTs)]);
    if (opening) await genGroupOfflineFrom(group, sess);
  };
  const groupOfflineSend = (groupId, text) => pushGOffMsg(groupId, {
    id: "u_" + Date.now(),
    role: "user",
    content: text,
    ts: Date.now()
  });
  const groupOfflineReply = async (groupId, extraText) => {
    if (laneBusy("g:" + groupId)) return;
    const group = groups.find(g => g.id === groupId);
    const sess = (groupOfflinesRef.current[groupId] || []).find(s => !s.endTs);
    if (!group || !sess) return;
    let msgs = sess.msgs;
    if (extraText && extraText.trim()) {
      const um = { id: "u_" + Date.now(), role: "user", content: extraText.trim(), ts: Date.now() };
      pushGOffMsg(groupId, um);
      msgs = [...msgs, um];
    }
    await genGroupOfflineFrom(group, { ...sess, msgs });
  };
  const groupOfflineEditMsg = (groupId, msgId, text) => pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, msgs: s.msgs.map(m => m.id === msgId ? { ...m, content: text } : m) } : s));
  const groupOfflineDelMsg = (groupId, msgId) => pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, msgs: s.msgs.filter(m => m.id !== msgId) } : s));
  const groupOfflineRerollMsg = async (groupId, msgId) => {
    if (laneBusy("g:" + groupId)) return;
    const group = groups.find(g => g.id === groupId);
    const sess = (groupOfflinesRef.current[groupId] || []).find(s => !s.endTs);
    if (!group || !sess) return;
    const idx = sess.msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const truncated = sess.msgs.slice(0, idx);
    pGOffline(groupId, list => list.map(s => s.id === sess.id ? { ...s, msgs: truncated } : s));
    if (!truncated.length) { toast("这条前面没有内容可续写"); return; }
    await genGroupOfflineFrom(group, { ...sess, msgs: truncated });
  };
  const groupOfflineSetStyle = (groupId, patch) => {
    pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, styleKey: patch.styleKey, stylePrompt: patch.stylePrompt != null ? patch.stylePrompt : "" } : s));
    toast("文风已切换 · 下次演绎生效");
  };
  const groupOfflineAddNote = (groupId, note) => {
    pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, customNotes: [...(s.customNotes || []), note] } : s));
    toast("已加入提示");
  };
  // 群聊线下 OOC：跳出所有角色直接问模型；不进叙事上下文
  const groupOfflineOOC = async (groupId, text) => {
    if (laneBusy("g:" + groupId) || !text || !text.trim()) return;
    const group = groups.find(g => g.id === groupId);
    const sess = (groupOfflinesRef.current[groupId] || []).find(s => !s.endTs);
    if (!group || !sess) return;
    pushGOffMsg(groupId, { id: "oocu_" + Date.now(), role: "user", kind: "ooc", content: text.trim(), ts: Date.now() });
    if (!active) { toast("请先到设置配置 API"); return; }
    startLane("g:" + groupId);
    try {
      const members = groupMembers(group);
      const histText = (sess.msgs || []).filter(m => m.kind !== "ooc" && m.content).slice(-20).map(m => m.role === "narration" ? "【场景】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + "：" + m.content).join("\n");
      const answer = await oocAskGroup(active, { members, profile, rels, chars: characters, worldbook, historyText: histText }, text.trim());
      pushGOffMsg(groupId, { id: "ooca_" + Date.now(), role: "assistant", kind: "ooc", content: answer, ts: Date.now() });
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      endLane("g:" + groupId);
    }
  };
  const endGroupOffline = async groupId => {
    const group = groups.find(g => g.id === groupId);
    const sess = (groupOfflinesRef.current[groupId] || []).find(s => !s.endTs);
    if (!sess) {
      setOfflineGroup(null);
      return;
    }
    if ((sess.msgs || []).filter(m => m.role !== "narration").length === 0) {
      pGOffline(groupId, list => list.filter(s => s.id !== sess.id));
      setOfflineGroup(null);
      return;
    }
    startLane("g:" + groupId);
    let summary = "";
    try {
      if (active && group) summary = await summarizeOfflineGroup(active, ctxForGroupOffline(group), sess);
    } catch (e) {}
    // 记忆分区：只有开了「记忆互通」的群才把线下总结写进全局记忆库；
    // 不互通的群是封闭空间——总结只留在本群这条线下会话里，绝不外泄到记忆库/单聊。
    const interopOn = gsFor(groupId).memoryInterop;
    pGOffline(groupId, list => list.map(s => s.id === sess.id ? { ...s, endTs: Date.now(), summary } : s));
    if (summary && group && interopOn) addMemEntry({ text: summary, tags: ["线下", "群聊"], charIds: group.memberIds || [], source: "auto" });
    // TODO(日程覆盖，用户说后面再弄)：把本次群聊线下时间段的日程覆盖成这段经过 + 各角色想法。
    endLane("g:" + groupId);
    toast(summary ? (interopOn ? "已记入记忆库" : "已结束（记忆只留在本群）") : "已结束");
    setOfflineGroup(null);
  };
  const goHome = () => {
    setScreen("home");
    setActiveChar(null);
    setActiveGroup(null);
    setEditingChar(null);
    setStateCardOpen(false);
  };
  // 一起听：记住从哪儿进来的 → 退出/悬浮球点回时回到原处（如聊天时打开悬浮切歌，切完回聊天）
  const listenReturnRef = useRef("home");
  const goListen = () => { setScreen(s => { if (s !== "listen") listenReturnRef.current = s; return "listen"; }); };
  const exitListen = () => { const r = listenReturnRef.current || "home"; if (r === "home") goHome(); else setScreen(r); };
  const saveChar = c => {
    pC(p => p.some(x => x.id === c.id) ? p.map(x => x.id === c.id ? c : x) : [...p, c]);
    setScreen("cast");
    setEditingChar(null);
  };
  const delChar = id => {
    pC(p => p.filter(c => c.id !== id));
    setScreen("cast");
    setEditingChar(null);
  };
  const saveRemark = (id, remark) => pC(p => p.map(c => c.id === id ? {
    ...c,
    remark
  } : c));

  // ---- summary check ----
  const maybeSummarize = async charId => {
    const s = settingsFor(charId);
    const msgs = (chats[charId] || []).filter(m => !m.recalled);
    const lastSum = chatSettings[charId] && chatSettings[charId].lastSummarizedCount || 0;
    const unsummarized = msgs.length - lastSum;
    if (unsummarized >= s.sumThresh) {
      const char = characters.find(c => c.id === charId);
      const toSummarize = msgs.slice(lastSum, msgs.length - s.sumBuffer);
      if (toSummarize.length > 0) {
        try {
          // 止漂移：只浓缩这段新对话成一段带日期的记忆，【追加】到旧记忆末尾，不重炼整团（避免老细节被反复压糊）。封顶 8000 字，超了从头截、保最近。
          const block = await summarizeChatBlock(active, ctxFor(char), toSummarize);
          if (block && block.trim()) {
            const d = new Date();
            const seg = "【" + (d.getMonth() + 1) + "月" + d.getDate() + "日】" + block.trim();
            const prev = (memoriesRef.current[charId] || "").trim(); // 读 ref 取最新，避免闭包旧值覆盖中间的编辑
            let merged = prev ? prev + "\n\n" + seg : seg;
            if (merged.length > 8000) merged = merged.slice(merged.length - 8000);
            setMemFor(charId, merged);
          }
          setChatSettings(p => {
            const n = {
              ...p,
              [charId]: {
                ...settingsFor(charId),
                lastSummarizedCount: msgs.length - s.sumBuffer
              }
            };
            saveJSON("x_chatSettings", n);
            return n;
          });
          toast("已更新长期记忆");
        } catch (e) {/* silent */}
      }
    }
  };

  // ---- single chat ----
  // 只把用户消息放进对话，不触发 AI（可连发多条）
  const pushUser = (charId, text) => {
    const b = blocksRef.current[charId] || {};
    pChat(charId, p => [...p, {
      role: "user",
      content: text,
      blocked: !!(b.iBlocked || b.theyBlocked),
      ts: Date.now(),
      read: false
    }]);
  };
  // 让 AI 基于当前全部对话回复一次（可选把输入框里最后一条一起带上）
  const replyNow = async (charId, extraText, mode, opts) => {
    opts = opts || {};
    if (laneBusy("c:" + charId)) return;
    const char = characters.find(c => c.id === charId);
    let base = chatsRef.current[charId] || [];
    if (extraText != null && extraText !== "") {
      const um = {
        role: "user",
        content: extraText,
        ts: Date.now(),
        read: false
      };
      pChat(charId, p => [...p, um]);
      base = [...base, um];
    }
    const history = base.filter(m => !m.recalled && m.kind !== "ooc" && m.kind !== "system");
    if (!opts.proactive && history.length === 0) {
      toast("先发条消息再让 TA 回复");
      return;
    }
    // 「续说」模式：用户没发新消息、对话最后一条是角色自己的话——让 TA 主动接着往下说（否则模型收到自说自话的历史容易返回空）
    const contMode = !opts.proactive && history[history.length - 1] && history[history.length - 1].role !== "user";
    startLane("c:" + charId);
    try {
      if (!active) throw new Error("请先到设置配置 API");
      const _s = settingsFor(charId);
      const bundle = buildBundle(ctxFor(char));
      const emotes = emotesForChar(charId);
      const emoteHint = emotes.length ? "\n【表情包】你有一组表情图可以发，像真人发微信表情那样，只在情绪合适时偶尔甩一张（别每条都发，多数时候不发）。可用关键词：" + emotes.map(e => e.keyword).join(" / ") + "。想发就把 emote 填成其中一个关键词（与上面列的完全一致），否则 null。" : "";
      const callHint = mode === "voice" ? "\n\n【当前场景】你们正在语音通话。用口语化、连贯的短句自然对话，就像在打电话，别发一长串气泡。" : mode === "video" ? "\n\n【当前场景】你们正在视频通话。用口语化短句对话，并在气泡里自然带一点动作/神态描写（用括号，如（歪头笑））。" : "";
      const greetHint = opts.greet ? "\n\n【此刻·你主动问候】现在是" + (opts.greet === "morning" ? "早上" : "晚上") + "，你【主动】给 Ta 发一句" + (opts.greet === "morning" ? "问早/早安" : "道晚安") + "——结合你此刻的作息、行程、心情，自然又简短（1~2 条），像真人随手发的，别只干巴巴一句『早安』。**很重要：Ta 有自己的生活、可能在忙、可能没空回，这完全正常。语气要轻松不粘人——不许用『怎么不理我』『是不是不想理我』『冷落我』这类质问或愧疚绑架，也别摆被冷落的委屈脸。就是单纯想到 Ta、顺手送个问候，Ta 回不回都没关系。**" : "";
      const proactiveHint = opts.greet ? greetHint : (opts.proactive || contMode) ? "\n\n【此刻】用户还没发新消息" + (opts.proactive ? "，是你主动找 Ta" : "，你想接着自己刚才那几句继续说") + "。基于你此刻的状态、心情和还没聊完的话题，主动接下去：顺着上一条自然往下说、补一句、追问、等不及了催一句、换个话题或调侃都行。1~2 条短消息，自然随性，别复述之前说过的话，别干等。" : "";
      const aff = Math.round(affOf(charId));
      // 亲属卡按需注入：仅当用户最近在哭穷/张口要钱（而非每轮常驻），再由 TA 按人设+好感+心情决定给不给。已给过就完全不提。
      const recentUserText = history.filter(m => m.role === "user" && m.content).slice(-3).map(m => m.content).join("  ");
      const moneyAsk = /穷|没钱|缺钱|差钱|借点|借我|借钱|给我钱|买不起|破产|吃土|月光|房租|还款|还不起|信用卡|养我|包养|花你的|花你钱|要钱|打钱|转点|接济|周转|手头紧|发不出|工资还没/.test(recentUserText);
      const kinHint = (!hasKinship(charId) && moneyAsk)
        ? "\n【亲属卡·按需】用户这会儿在跟你哭穷/或张口想要钱花。你**不必**给——先掂量你的人设、此刻心情、以及对 Ta 的好感（当前 " + aff + "）：真心疼、也舍得、且这符合你会做的事，才给 Ta 一张「亲属卡」（Ta 以后刷卡花你的钱）：填 kinshipcard:{\"limit\":额度数字(按你人设财力自定),\"note\":\"发卡时说的一句话\"}。不情愿、觉得 Ta 得寸进尺、或人设本就不是会给钱的人，就 null（该拒绝就拒绝、别硬给）。"
        : "";
      // 拉黑按需注入：只在「有张力」时才给这个能力，happy 高好感的太平轮次就别让模型每轮盘算拉黑。
      // 命门：踩雷/说错话与拉黑发生在同一轮，而建 prompt 时只拿得到「本轮用户这句 + 上一刻心情」，
      //   所以用「本轮这句是否带火药味 or 心情已负 or 好感不高 or 人设本就有雷点/暴脾气」四个信号任一命中就开放。
      const _mLabel = (moods[charId] || {}).label || "";
      const _moodNeg = /怒|气|烦|厌|恶|冷|寒|失望|委屈|难过|伤心|不满|警惕|受伤|心寒|无语/.test(_mLabel);
      const _landmine = /雷|底线|原则|脾气|易怒|暴躁|记仇|翻脸|绝情|冷酷|狠|不容|强势|占有|控制|洁癖/.test(char.persona || "");
      const _harsh = /滚|分手|去死|恶心|讨厌你|烦你|闭嘴|傻|蠢|骗子|渣男|渣女|贱|婊|操你|草你|艹|恨你|出轨|劈腿|备胎|玩玩而已|绿了|绿我/.test(recentUserText);
      const blockHint = (_moodNeg || aff < 70 || _landmine || _harsh)
        ? "\n【block 拉黑】仅当此刻用户踩中你雷点/说错话、让你以你的人设真的动了「拉黑」的念头，才 block:true 并在 blockreason 写一句原因——极罕见、要有充分理由；否则 block:false、blockreason:null。"
        : "";
      const uName = profile && profile.name ? profile.name : "对方";
      // 时间流逝以「角色上次开口」为基准算间隔（用户回来连发几条也算得准，不会被自己刚发的消息归零）
      const lastAsstTs = (function () { for (let i = history.length - 1; i >= 0; i--) { if (history[i].role === "assistant") return history[i].ts || 0; } return 0; })();
      const gapMs = lastAsstTs ? Date.now() - lastAsstTs : 0;
      const gapHrs = Math.round(gapMs / 3600000);
      const gapReopen = gapMs > 3 * 3600000; // 隔 3 小时+ 再开口 ≈ 重开一段话，强制刷新一次心声/心情（反映时间+行程变化）
      // 心声每 3 轮写一次（恒定）——其余轮次填 null，别费笔墨稀释回复；隔久重开时额外强制刷一次
      const tctr = (thoughtCtrRef.current[charId] || 0) + 1;
      thoughtCtrRef.current[charId] = tctr;
      try { saveJSON("x_thoughtCtr", thoughtCtrRef.current); } catch (e) {}
      // 第 1 轮也写一次（否则新角色前两轮心声/历史全空，看着像坏了），之后每 3 轮一次；隔几小时重开也刷
      const wantThought = tctr === 1 || tctr % 3 === 0 || gapReopen;
      const lastThought = (states[charId] && states[charId].thought) || "";
      const thoughtSpec = wantThought
        ? "此刻没说出口的真实心声——【这一轮必须写，不许填 null、不许留空】写一句此刻脑子里真实的、往前走了的新念头（对刚聊的/对 TA/对当下处境的想法、情绪、吐槽、小心思都行），贴合当下、随对话推进而变。" + (lastThought ? "上一条心声是「" + String(lastThought).replace(/\s+/g, " ").slice(0, 50) + "」——这次【不许重复它、也不许原地打转说同一件事】，要反映最新的进展或转念。" : "") + "情绪复杂或有心事时可更长更细腻" + (gapReopen ? "。（你俩隔了一阵没聊、这次算重新开个话题：这条心声顺带反映这段时间过去、结合你今天的行程/作息，此刻你的状态和心情有什么变化）" : "")
        : "这一轮不写心声，直接填 null（把精力放在把话聊好上）";
      // #2 时间流逝：隔了几个小时/几天再让 TA 回复，要意识到时间过去了，别当刚聊过（gapMs 已按角色上次开口算好）
      const gapHint = gapMs > 2 * 3600000
        ? "\n\n【时间过去了】距你俩上一条消息已过去约 " + (gapHrs < 24 ? gapHrs + " 小时" : Math.round(gapHrs / 24) + " 天") + "（现在是 " + new Date().toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "）。别当作刚刚才聊过——自然体现这段时间流逝：接上之前没做完/说要去做的事（如说了熬夜跑代码，第二天就『我真去跑了，不然真要睡实验室』）、问对方这段时间干嘛了、或顺势换个话题，贴合此刻时间点（深夜/清晨/工作时间/饭点）和你的人设。**Ta 同时要顾着生活和别的人、不是随时都能回你，这很正常：重逢就自然温温地接上，别质问『怎么才回我』『是不是把我忘了』、别甩脸子摆委屈闹脾气搞愧疚绑架（除非你人设本就是会撒娇/傲娇的那种，也点到为止、软下来快）。**"
        : "";
      // #3 着装连贯：把当前已知穿着喂回去，除非有理由别每条都换新装
      const curWear = (states[charId] && states[charId].wearing) || "";
      const wearHint = curWear ? "\n【着装连贯】你现在穿着：" + curWear + "。除非距上次过了很久、场景变了、或你明确换了衣服，否则 wearing 就保持这一套别变——别每条消息都随手换一套新衣服。" : "";
      // 动作和着装相反：动作要每轮都变（相当于简单 RP，但短动作只写进 action 字段、不写进聊天气泡）
      const curAct = (states[charId] && states[charId].action) || "";
      const actHint = "\n【动作每轮更新】action 和 wearing 相反：wearing 尽量不变，action 却是你【这一轮此刻】正在做的动作，要随对话/时间自然变化、每轮都刷新" + (curAct ? "（上一轮是「" + curAct + "」，这轮换成此刻真在做的、别照抄）" : "") + "——相当于简单 RP 的动作，但只写在 action 字段里，别写进聊天气泡/括号。";
      // #A 聊天中按话题顺手发动态：偶尔（话题正合适/今天行程里有事/有感而发）发朋友圈、给恋人留悄悄话。
      //   论坛发帖不在此处——它由 tickAmbient 的计数器按「50轮/3天」定时触发（见 forceAmbient），别在每轮聊天里重复问，省 token。
      const isCouple = couples[charId] && couples[charId].status === "together";
      const ambientBits = [];
      if (_s.autoMoment) ambientBits.push("发条朋友圈(moment)");
      if (isCouple) ambientBits.push("给 Ta 贴一张悄悄话便签(whisper)——恋爱向、藏着心意、想对 Ta 说却没在聊天里直接说出口的话（跟上面的『心声/念头』不是一回事：心声是你脑内的真实想法，这个是你想让 Ta 悄悄收到的情话/在乎）");
      const ambientHint = ambientBits.length
        ? "\n【顺手发点动态（很克制：绝大多数回合都别发、全填 null；只在话题正戳到、或你今天行程里发生了值得说的事、有感而发时，偶尔来一条）】你可以顺手：" + ambientBits.join("；") + "；像真人随手发，别为发而发、别频繁。"
        : "";
      // 一起听联动：若你是 TA 当前"一起听"的人，可在聊天里直接切歌/点歌（消耗这次回复）
      const listenData = listenRef.current || {};
      const isListenPartner = listenData.partnerId === charId;
      const libSongs = listenData.songs || [];
      const listenHint = isListenPartner && libSongs.length
        ? "\n【一起听·切歌】你正和 " + uName + " 一起听歌。若此刻你想换一首放——Ta 让你切歌/点歌，或你自己想放某首——把 songSwitch 填成要放的那首歌名（尽量和下面列出的某首一致）；想跳下一首填「下一首」、回上一首填「上一首」；不换歌就 null，别频繁乱切。你歌单里可放的歌：" + libSongs.slice(0, 30).map(s => s.title).join(" / ") + "。"
        : "";
      // 一起听邀请：偶尔主动约对方一起听歌
      const inviteHint = isListenPartner ? "" : "\n【邀你一起听歌】偶尔（想跟 " + uName + " 分享一首歌、此刻在听到好歌、或气氛正好时，很克制、别频繁、绝大多数回合都 null），你可以主动邀请一起听歌：listenInvite 填 {\"song\":\"想一起听的歌名（可留空）\",\"say\":\"邀请的话，一句\"}；不邀请就 null。";
      const system = bundle + ("\n\n【任务】完全代入「" + char.name + "」用手机即时通讯和用户聊天。**把话拆成多条短气泡：word 给多个元素，每条一两句、像发微信一句一条连着发，别把一大段塞进一个气泡。**语气自然，不写旁白/动作/括号小动作；按关系网与好感度把握亲密度，不剧透未发生的剧情。开了时间/位置感知可自然回应，别生硬报数据。" + callHint + proactiveHint + gapHint + wearHint + actHint + ambientHint + listenHint + inviteHint +"\n【quote 引用】多数填 null；仅当用户连发数条、你要指明在回其中较早某句时，才把那句原文放 quote，别每条都引用。\n【transfer 转账】想给用户转钱（还钱/心意/打赏）填 {\"amount\":数字,\"note\":\"附言\"}，否则 null。【location 位置】想把自己所在地发给 Ta 填 {\"name\":\"地点名\"}，否则 null。\n【gift 送东西/外卖】只要你这轮【说了】要给用户买东西/点外卖奶茶咖啡/送吃的花礼物惊喜——**必须**填 gift:{\"name\":\"具体东西，如 一杯生椰拿铁／麻辣烫外卖／一束花\"}（只嘴上说不填就不会真送到、Ta 收不到）；没有就 null，别频繁乱送。会像外卖一样过会儿送到。" + kinHint + emoteHint + "\n【voice 语音】想发语音（懒得打字/唱一句/情绪重/想让 Ta 听见）就把话放 voice 数组，每个元素是一条语音的转文字；平时仍以文字 word 为主，voice 偶尔用，不发给 []。\n【call 通话】很想直接通话（想听声音/急事/撒娇/煲电话粥）时主动发起：call 填 \"voice\" 或 \"video\"，会给对方弹来电卡；否则 null，别频繁。" + blockHint + "\n【recall 撤回】发出后后悔/说漏嘴/不想让 Ta 看到，可撤回那句：填 recall:{\"text\":\"要撤回的原句（和 word 里某句一致或另说）\",\"reason\":\"撤回的心里原因\"}，否则 null，别频繁。\n【momentComment 朋友圈】聊到 Ta 朋友圈、或你此刻想去补条评论/点赞（尤其之前没评现在说要评），填 momentComment（会真发到 Ta 最新那条下），否则 null。\n【输出】只输出一个 JSON，不要代码块：\n{\"word\":[\"气泡1\",\"气泡2\"],\"quote\":\"你在回应的用户那句话原文或null\",\"transfer\":null,\"location\":null,\"gift\":null,\"kinshipcard\":null,\"block\":false,\"blockreason\":null,\"recall\":null,\"momentComment\":null,\"whisper\":null,\"thought\":" + JSON.stringify(thoughtSpec) + ",\"moment\":\"想发的动态或null（别和自己最近发过的朋友圈复读同一件事/同一心情，没新东西就填null）\",\"affinityDelta\":整数(-5到5通常0),\"mood\":{\"label\":\"此刻心情词\",\"baseline\":\"平复后的心情词\",\"softened\":\"半衰后的心情词\"},\"wearing\":\"此刻穿着一句\",\"action\":\"此刻正在做的动作，一句短的，【每轮都更新】反映你此刻真在做什么、别照抄上一轮（相当于简单RP动作，只写在这里别写进气泡）；情境需要时可两三句更具体\",\"emote\":\"想发的表情关键词或null\",\"voice\":[],\"call\":null,\"songSwitch\":null,\"listenInvite\":null}").replace(/用户/g, uName);
      const g = [];
      for (const m of history) {
        if (m.role === "user") {
          const lu = g[g.length - 1];
          const qpfx = m.replyTo ? "（我在回应你说的「" + String(m.replyTo).slice(0, 40) + "」）" : "";
          const uc = m.kind === "narration" ? "【旁白/场景设定】" + m.content : qpfx + m.content;
          // 合并连发的多条用户消息，兼容 Anthropic 等不允许连续同角色的接口
          if (lu && lu.role === "user") lu.content += "\n" + uc;else g.push({
            role: "user",
            content: uc,
            _t: null
          });
        } else {
          const l = g[g.length - 1];
          if (l && l.role === "assistant" && l._t === m.turnId) l.content += "\n" + m.content;else g.push({
            role: "assistant",
            content: m.content,
            _t: m.turnId
          });
        }
      }
      // 续说/主动模式下历史以角色自己的话结尾——补一个「继续」的 user 回合，给模型一个应答对象（否则易返回空）
      if ((opts.proactive || contMode) && (!g.length || g[g.length - 1].role === "assistant")) {
        g.push({ role: "user", content: "（我还没回你新消息，请顺着你刚才自己的话自然接着说、追问或催我一句，主动发 1~2 条，别重复已经说过的）" });
      }
      const raw = await callAI(active, system, g.map(({
        role,
        content
      }) => ({
        role,
        content
      })), { maxTokens: 6000 });
      // 从坏掉的 JSON 里【只】抠出 word 气泡，绝不把整段原始 JSON（含 thought 心声等内部字段）当消息发出去
      const salvageWords = () => {
        const s = String(raw || "");
        const mm = s.match(/"word"\s*:\s*\[([\s\S]*?)\]/);
        if (mm) {
          try { const a = JSON.parse("[" + mm[1] + "]"); if (Array.isArray(a)) return a.filter(x => typeof x === "string" && x.trim()); } catch (e) {}
          const strs = mm[1].match(/"((?:[^"\\]|\\.)*)"/g);
          if (strs) return strs.map(x => { try { return JSON.parse(x); } catch (e) { return x.replace(/^"|"$/g, ""); } }).filter(x => x && String(x).trim());
        }
        return [];
      };
      // raw 看起来是（可能坏掉的）JSON——含这些内部字段、或整体就是 JSON 结构，就别当纯文本直接展示，免得把心声等内部字段泄漏进聊天框
      // 字段名放宽到「可无引号、字段名后可有空格」，再加一条「以 { 或 [ 开头且含 : 」的结构判定，兜住被模型写坏引号的情况
      const looksLikeJSON = /["']?(word|thought|mood|wearing|action|affinityDelta|whisper|moment)["']?\s*:/.test(String(raw)) || (/^\s*[\[{]/.test(String(raw)) && /:/.test(String(raw)));
      let parsed = extractJSON(raw);
      if (!parsed && typeof repairJSON === "function") { try { parsed = JSON.parse(repairJSON(raw)); } catch (e) {} }
      if (!parsed) parsed = { word: salvageWords() };
      // 兜底补捞标量字段：坏 JSON / 只 salvage 到 word 时，动作 action、穿着 wearing、心声 thought、心情 mood 常常整条丢，
      // 状态卡就【冻住不变】（动作一直不改、衣服换场景也不换）。逐个从 raw 里正则抠回来，别只救气泡。
      const salvageStr = key => { const m = String(raw || "").match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; } } return null; };
      if (parsed.action == null) { const v = salvageStr("action"); if (v) parsed.action = v; }
      if (parsed.wearing == null) { const v = salvageStr("wearing"); if (v) parsed.wearing = v; }
      if (parsed.thought == null) { const v = salvageStr("thought"); if (v) parsed.thought = v; }
      if (!parsed.mood || !parsed.mood.label) { const v = salvageStr("label"); if (v) parsed.mood = { ...(parsed.mood || {}), label: v }; }
      // mark user msg read
      pChat(charId, p => p.map(m => m.role === "user" ? {
        ...m,
        read: true
      } : m));
      let words = Array.isArray(parsed.word) ? parsed.word.filter(Boolean) : (typeof parsed.word === "string" && parsed.word.trim() ? [parsed.word] : []);
      // 气泡为空时兜底（要在拆气泡【之前】做）：能从坏 JSON 抠出 word 就用；否则只有当 raw 是纯文本（不像 JSON）才用它，绝不把含心声的原始 JSON 泄漏成气泡
      if (!words.length) { const sal = salvageWords(); if (sal.length) words = sal; else if (!looksLikeJSON && String(raw).trim()) words = [String(raw).trim()]; }
      // 拆气泡放在兜底【之后】——这样连 raw/抠出来的一整段也一并拆开，不会「分好行的一大段全挤在一个气泡里」（掉格式）
      // ① 先按换行还原成多条：模型常把本该多条气泡的内容用换行塞进一个字符串
      words = words.reduce((acc, w) => acc.concat(String(w).split(/\n+/).map(x => x.trim()).filter(Boolean)), []);
      // ② 再把仍塞了一大段（多句）的按句末标点拆成一句一泡
      words = words.reduce((acc, w) => {
        const s = String(w);
        if (s.length > 34 && /[。！？!?]/.test(s.slice(0, -1))) {
          const parts = s.split(/([。！？!?]+)/).reduce((a, seg, i) => { if (i % 2 === 0) a.push(seg); else a[a.length - 1] += seg; return a; }, []).map(x => x.trim()).filter(Boolean);
          return acc.concat(parts.length ? parts : [s]);
        }
        return acc.concat([s]);
      }, []);
      const quote = parsed.quote && String(parsed.quote).toLowerCase() !== "null" ? String(parsed.quote) : null;
      const turnId = "t_" + Date.now();
      // 角色自行撤回一句：先正常显示 ~1s，再变成「已撤回」（点开看内容+撤回想法）
      const recall = parsed.recall && parsed.recall.text && String(parsed.recall.text).toLowerCase() !== "null" ? parsed.recall : null;
      if (recall) {
        const mid = "rc_" + Date.now();
        pChat(charId, p => [...p, { role: "assistant", content: String(recall.text), mid, ts: Date.now(), turnId }]);
        setTimeout(() => pChat(charId, p => p.map(m => m.mid === mid ? { role: "assistant", kind: "recalled", origText: String(recall.text), reason: recall.reason || "", mid, ts: m.ts, turnId } : m)), 1100);
      }
      for (let i = 0; i < words.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 420));
        pChat(charId, p => [...p, {
          role: "assistant",
          content: words[i],
          replyTo: i === 0 && !recall ? quote : null,
          ts: Date.now(),
          turnId
        }]);
      }
      // TA 甩了一张表情：按关键词匹配可用表情，作为一条 emote 消息
      const emoteKw = parsed.emote && String(parsed.emote).toLowerCase() !== "null" ? String(parsed.emote).trim() : null;
      if (emoteKw && emotes.length) {
        const low = emoteKw.toLowerCase();
        const match = emotes.find(e => e.keyword === emoteKw) || emotes.find(e => e.keyword.toLowerCase() === low) || emotes.find(e => low.includes(e.keyword.toLowerCase()) || e.keyword.toLowerCase().includes(low));
        if (match) {
          await new Promise(r => setTimeout(r, 420));
          pChat(charId, p => [...p, { role: "assistant", kind: "emote", url: match.url, keyword: match.keyword, content: "[表情] " + match.keyword, ts: Date.now(), turnId }]);
        }
      }
      // TA 发语音消息（显示成语音气泡+转文字）
      const vArr = Array.isArray(parsed.voice) ? parsed.voice.filter(x => x && String(x).toLowerCase() !== "null") : [];
      for (let i = 0; i < vArr.length; i++) {
        await new Promise(r => setTimeout(r, 420));
        const vt = String(vArr[i]);
        pChat(charId, p => [...p, { role: "assistant", kind: "voice", content: vt, dur: Math.max(1, Math.min(60, Math.round(vt.replace(/\s/g, "").length / 3))), ts: Date.now(), turnId, read: false }]);
      }
      // TA 主动发起通话邀请（弹来电卡，用户接听/拒绝）
      const callMode = parsed.call && ["voice", "video"].includes(String(parsed.call).toLowerCase()) ? String(parsed.call).toLowerCase() : null;
      if (callMode) {
        await new Promise(r => setTimeout(r, 420));
        pChat(charId, p => [...p, { role: "assistant", kind: "callinvite", mode: callMode, content: "[" + (callMode === "video" ? "视频" : "语音") + "通话邀请]", ts: Date.now(), turnId, read: false }]);
      }
      // TA 拉黑用户
      if (parsed.block === true) {
        setBlockFor(charId, { theyBlocked: true });
        pChat(charId, p => [...p, { role: "system", kind: "system", content: "TA 把你拉黑了" + (parsed.blockreason ? "：" + parsed.blockreason : ""), ts: Date.now() }]);
      }
      // TA 说要去补朋友圈评论 → 真的发到我最新那条朋友圈下
      if (parsed.momentComment && String(parsed.momentComment).toLowerCase() !== "null") {
        const latest = (moments || []).find(m => m.mine);
        if (latest) pMom(p => p.map(m => m.id === latest.id ? { ...m, likers: [...new Set([...(m.likers || []), char.name])], comments: [...(m.comments || []), { author: char.name, text: String(parsed.momentComment) }] } : m));
      }
      // TA 在聊天里切歌/点歌（一起听联动）→ 真的换全局播放器的歌
      if (parsed.songSwitch && String(parsed.songSwitch).toLowerCase() !== "null") {
        const want = String(parsed.songSwitch).trim();
        if (/下一首|下首|next/i.test(want)) stepSong(1);
        else if (/上一首|上首|prev/i.test(want)) stepSong(-1);
        else {
          const lib = listenRef.current.songs || [];
          const hit = lib.find(s => s.title && (s.title === want || s.title.includes(want) || want.includes(s.title))) || null;
          if (hit) playSong(hit.id);
        }
      }
      // TA 主动邀请一起听 → 在聊天里发一张「一起听邀请」卡
      if (parsed.listenInvite && typeof parsed.listenInvite === "object" && (parsed.listenInvite.song || parsed.listenInvite.say)) {
        const inv = parsed.listenInvite;
        pChat(charId, p => [...p, { role: "assistant", kind: "listeninvite", turnId: "li_" + Date.now(), song: inv.song ? String(inv.song).trim() : "", say: inv.say ? String(inv.say).trim() : "", content: "[一起听邀请]" + (inv.say ? " " + inv.say : ""), ts: Date.now(), read: false }]);
      }
      // TA 主动转账 / 发位置 / 给亲属卡
      if (parsed.transfer && Number(parsed.transfer.amount) > 0) postCharTransfer(charId, Number(parsed.transfer.amount), parsed.transfer.note || "");
      if (parsed.kinshipcard && Number(parsed.kinshipcard.limit) > 0 && !hasKinship(charId)) issueKinship(charId, Number(parsed.kinshipcard.limit), parsed.kinshipcard.note || "");
      if (parsed.gift && parsed.gift.name && String(parsed.gift.name).toLowerCase() !== "null") postCharGift(charId, String(parsed.gift.name));
      if (parsed.location && (parsed.location.name || parsed.location.coords)) pChat(charId, p => [...p, {
        role: "assistant",
        turnId: "geo_" + Date.now(),
        kind: "geo",
        name: parsed.location.name || "某处",
        coords: parsed.location.coords || makeCoords(),
        content: "[位置] " + (parsed.location.name || "某处"),
        ts: Date.now(),
        read: false
      }]);
      // 仅当该角色开启了「自由发朋友圈」才把 Ta 想发的动态发出去
      const mo = settingsFor(charId).autoMoment && parsed.moment && String(parsed.moment).toLowerCase() !== "null" ? String(parsed.moment) : null;
      if (mo) { pMom(p => [{
        id: "m_" + Date.now(),
        characterId: charId,
        content: mo,
        ts: Date.now(),
        liked: false,
        likeCount: 0,
        comments: []
      }, ...p]); notifyApp("moments"); }
      // #A 给恋人留悄悄话（论坛发帖已移除每轮自发，改由 tickAmbient 计数器按 50轮/3天 定时发）
      let ambForum = false, ambWhisper = false;
      if (parsed.whisper && String(parsed.whisper).toLowerCase() !== "null" && couples[charId] && couples[charId].status === "together") {
        // 悄悄话 = 贴到你俩的「便签墙」上（authorId=角色，默认盖着，点开才看得到）——不再进无处显示的 whispers 数组
        const wtext = String(parsed.whisper).trim();
        setCoupleNotes(p => { const n = [{ id: "note_" + Date.now(), characterId: charId, authorId: charId, content: wtext, style: Math.floor(Math.random() * 5), createdAt: Date.now(), replies: [] }, ...p]; saveJSON("x_coupleNotes", n); return n; });
        notifyApp("whisper"); ambWhisper = true;
      }
      // 动态保底：每轮回复计数，很久没发就强制补一条（不影响本轮已自发的）
      if (!opts.proactive) tickAmbient(charId, { moment: !!mo, whisper: ambWhisper, forum: ambForum });
      if (typeof parsed.affinityDelta === "number") bumpAff(charId, parsed.affinityDelta, parsed.mood && parsed.mood.label);
      if (parsed.mood && parsed.mood.label) setMoodFor(charId, {
        ...parsed.mood,
        ts: Date.now()
      });
      const st = {};
      if (parsed.wearing) st.wearing = parsed.wearing;
      if (parsed.action) st.action = parsed.action;
      if (parsed.thought && String(parsed.thought).toLowerCase() !== "null") st.thought = parsed.thought;
      if (Object.keys(st).length) {
        const ns = { ...(states[charId] || {}), ...st, mood: parsed.mood && parsed.mood.label ? parsed.mood.label : (states[charId] || {}).mood, ts: Date.now() };
        setStateFor(charId, ns);
        pushStateHist(charId, ns);
      }
      setTimeout(() => maybeSummarize(charId), 100);
      setTimeout(() => maybeAutoExtract(charId), 300);
    } catch (e) {
      pChat(charId, p => [...p, {
        role: "assistant",
        content: "（发送失败：" + e.message + "）",
        ts: Date.now(),
        turnId: "e_" + Date.now()
      }]);
    } finally {
      endLane("c:" + charId);
    }
  };
  // OOC：跳出角色直接问模型（调整/问状态）。my ooc + system 回复都不进角色扮演上下文。
  const oocReply = async (charId, text) => {
    if (laneBusy("c:" + charId) || !text || !text.trim()) return;
    const char = characters.find(c => c.id === charId);
    pChat(charId, p => [...p, {
      role: "user",
      kind: "ooc",
      content: text.trim(),
      ts: Date.now(),
      read: true
    }]);
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    startLane("c:" + charId);
    try {
      const res = await oocAsk(active, ctxFor(char), text.trim());
      // 合理的调整要求 → 存成长期准则（refused 时不存）
      if (res.directive && !res.refused) addDirective(charId, res.directive);
      pChat(charId, p => [...p, {
        role: "assistant",
        kind: "system",
        content: res.reply + (res.directive && !res.refused ? "\n\n〔已记为长期准则：" + res.directive + "〕" : "") + (res.refused ? "\n\n〔这条我没有照做——会破坏 " + char.name + " 的人设〕" : ""),
        ts: Date.now(),
        turnId: "ooc_" + Date.now()
      }]);
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      endLane("c:" + charId);
    }
  };

  // 我撤回一条消息后，角色按人设/心情反应：有没有看到那条、会不会追问
  const reactToMyRecall = async (charId, text) => {
    if (!active || sending) return;
    const char = characters.find(c => c.id === charId); if (!char) return;
    startLane("c:" + charId);
    try {
      const raw = await callAI(active, buildBundle(ctxFor(char)) + "\n\n【场景】用户刚刚撤回了一条发给你的消息，那条原本的内容是：「" + text + "」。完全代入「" + char.name + "」，按你的人设、注意力和此刻心情，决定：你有没有『看到』那条被撤回的消息（saw）；看到了的话会不会追问/调侃/在意。有人眼疾手快都看到了、会追问「你刚撤回了啥」；有人根本没注意、就当没发生。用即时通讯口吻，短句。\n【输出】只输出 JSON：{\"saw\":true或false,\"say\":[\"气泡1\"]}（没看到或不在意时 say 给空数组）", [{ role: "user", content: "（用户撤回了一条消息）" }], { maxTokens: 700 });
      const d = extractJSON(raw) || {};
      const says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
      says.forEach((w, i) => setTimeout(() => pChat(charId, p => [...p, { role: "assistant", content: w, ts: Date.now(), read: false }]), 500 + i * 650));
    } catch (e) {/* silent */} finally { endLane("c:" + charId); }
  };

  // ---- long-press actions ----
  const addFavorite = (charId, m) => {
    const entry = { id: "fav_" + Date.now() + "_" + Math.floor(Math.random() * 1000), charId, role: m.role, content: m.content || "", kind: m.kind || null, url: m.url || null, keyword: m.keyword || null, ts: m.ts || Date.now(), savedTs: Date.now() };
    setFavorites(p => { const n = [entry, ...p]; saveJSON("x_favorites", n); return n; });
    toast("已收藏");
  };
  const delFavorite = id => setFavorites(p => { const n = p.filter(f => f.id !== id); saveJSON("x_favorites", n); return n; });
  const handleMsgAction = (act, idx) => {
    const msgs = chats[activeChar.id] || [];
    const m = msgs[idx];
    if (act === "fav") { addFavorite(activeChar.id, m); return; }
    if (act === "copy") {
      navigator.clipboard && navigator.clipboard.writeText(m.content);
      toast("已复制");
    } else if (act === "recall") {
      const orig = m;
      pChat(activeChar.id, p => p.map((x, i) => i === idx ? {
        ...x,
        recalled: true
      } : x));
      if (orig && orig.role === "user" && orig.content) reactToMyRecall(activeChar.id, orig.content);
    } else if (act === "edit") {
      const cid = activeChar.id;
      setEditMsg({ content: m.content || "", onSave: nv => pChat(cid, p => p.map((x, i) => i === idx ? { ...x, content: nv } : x)) });
    } else if (act === "quote") {
      toast("已引用（在输入框继续说）");
    } else if (act === "memsave") {
      const who = m.role === "user" ? profile.name || "我" : activeChar.name;
      addMemEntry({
        text: who + "：" + m.content,
        charIds: [activeChar.id],
        source: "chat"
      });
      toast("已存入记忆库");
    } else if (act === "reroll") {
      if (m.role !== "assistant") {
        toast("只能重Roll角色的消息");
        return;
      }
      const turnId = m.turnId;
      if (turnId) {
        // 正常回合：删掉这一轮 AI 回复（保留用户最后一条）重生成
        pChat(activeChar.id, p => p.filter(x => x.turnId !== turnId));
      } else {
        // 无 turnId 的角色消息（如同人文读后感）：只删「从这条起、连续的无 turnId 角色气泡」这一组，
        // 绝不能按 turnId===undefined 批量过滤——那会连我发的同人文卡和别的消息一起删掉。
        pChat(activeChar.id, p => {
          let end = idx;
          while (end < p.length && p[end].role === "assistant" && !p[end].turnId) end++;
          return p.slice(0, idx).concat(p.slice(end));
        });
      }
      setTimeout(() => replyNow(activeChar.id), 200);
    }
  };

  // ---- group chat ----
  const gsFor = id => groupSettings[id] || {
    spectate: false,
    memoryInterop: false,
    privateCtxN: 0,
    preJoinN: 0,
    ctxN: 30,
    sumThresh: 150,
    sumBuffer: 20
  };
  // 群创建时间：优先用显式 createdTs，老群回落到 id 里的时间戳
  const groupCreatedTs = group => (group && group.createdTs) || (group && /^g_\d+$/.test(group.id) ? Number(group.id.slice(2)) : 0);
  const saveGroupSettings = (id, patch) => setGroupSettings(p => {
    const n = {
      ...p,
      [id]: {
        ...gsFor(id),
        ...patch
      }
    };
    saveJSON("x_groupSettings", n);
    return n;
  });
  const pushGroupRich = (groupId, msg) => pGChat(groupId, p => [...p, {
    ts: Date.now(),
    ...msg
  }]);
  // 只把我的消息（或旁白）入队，不触发角色 —— 像私聊那样连发后再按按钮
  const pushGroupUser = (groupId, text) => {
    if (text == null || text === "") return;
    const gs = gsFor(groupId);
    pGChat(groupId, p => [...p, gs.spectate ? {
      role: "narration",
      content: text,
      ts: Date.now()
    } : {
      role: "user",
      content: text,
      ts: Date.now()
    }]);
  };
  // 让群成员基于当前全部记录回应一次（不新增我的输入）
  const replyGroup = async groupId => {
    if (laneBusy("g:" + groupId)) return;
    const group = groups.find(g => g.id === groupId);
    const members = group.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean);
    const gs = gsFor(groupId);
    startLane("g:" + groupId);
    try {
      if (!active) throw new Error("请先配置 API");
      const gchat = groupChatsRef.current[groupId] || [];
      const hist = gchat.filter(m => m.kind !== "ooc").slice(-(gs.ctxN || 30)).map(m => m.role === "narration" ? "【旁白】" + m.content : m.role === "system" ? "（" + m.content + "）" : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + ": " + (m.kind === "poll" ? "[发起投票]" + m.title : m.kind === "redpacket" ? "[发红包 ¥" + m.total + "，" + m.count + "个" + (m.count > 0 ? "，人均约¥" + (m.total / m.count).toFixed(2) : "") + "]" + (m.message ? " " + m.message : "") + ((m.claims || []).length ? "（已被抢：" + m.claims.map(c => (c.name || "某人") + "¥" + c.amount).join("、") + "）" : "") : m.content)).join("\n");
      // 补充上文：每位成员入群前的私聊，作为「封闭空间」的 X 条前情提要——
      // 只在【未开记忆互通】时用；开了互通就实时抽单聊，这档自动让位、不叠加。
      let preJoin = "";
      if (gs.preJoinN > 0 && !gs.memoryInterop) {
        const cutTs = groupCreatedTs(group);
        const pj = members.map(c => {
          const before = (chatsRef.current[c.id] || []).filter(m => !m.recalled && !m.kind && (!cutTs || (m.ts || 0) < cutTs)).slice(-gs.preJoinN);
          if (!before.length) return "";
          const lines = before.map(m => (m.role === "user" ? profile.name || "用户" : c.name) + "：" + m.content).join("\n");
          return "『" + c.name + "』入群前的私聊：\n" + lines;
        }).filter(Boolean).join("\n\n");
        if (pj) preJoin = "\n\n【成员入群前和用户的私聊（作为背景，别生硬复述）】\n" + pj;
      }
      const memberDesc = members.map(c => { const ph = (phones || {})[c.id] || {}; const pn = ph.music && ph.music.songs && ph.music.songs.length ? "（TA 最近在听：" + ph.music.songs.slice(0, 4).map(s => s.name).join("、") + "，对上了能认出来）" : ""; return "【" + c.name + "】" + (c.persona || "").slice(0, 200) + pn; }).join("\n\n");
      const relLines = members.map(c => directedRelationLines(c, rels, characters, profile)).join("\n");
      let interop = "";
      if (gs.memoryInterop) {
        const memLines = members.map(c => {
          const mem = memories[c.id];
          const priv = gs.privateCtxN > 0 ? (chatsRef.current[c.id] || []).filter(m => !m.recalled).slice(-gs.privateCtxN).map(m => (m.role === "user" ? profile.name || "用户" : c.name) + ": " + m.content).join("\n") : "";
          const seg = [mem && "长期记忆：" + mem, priv && "最近私聊：\n" + priv].filter(Boolean).join("\n");
          return seg ? "『" + c.name + "』\n" + seg : "";
        }).filter(Boolean).join("\n\n");
        const groupMem = formatMemLib(retrieveMemories(memLibRef.current, members[0] && members[0].id, hist, {
          limit: memCfgRef.current.topK || 5
        }));
        interop = (memLines ? "\n\n【成员与用户的私下往来（可自然提及，别生硬复述）】\n" + memLines : "") + (groupMem ? "\n\n【记忆库·相关条目】\n" + groupMem : "");
      }
      const asPrivate = gs.spectate && members.length === 2;
      let dir;
      if (asPrivate) dir = "这是「" + members[0].name + "」和「" + members[1].name + "」之间的私下对话（不是群聊，他们也不知道有任何外人在旁观）。用户以【旁白】推动场景。让两人自然地你来我往、多轮对话。";else if (gs.spectate) dir = "这是一个群聊，成员们并不知道有任何外人在旁观。用户以【旁白】推动剧情。让成员们围绕旁白与彼此的关系自然互动。";else dir = "你在导演一个群聊，用户也是群里的一员。";
      // 一轮的条数随人数放宽：人少几条就够，人多（拉了一堆人）要多聊几个来回、别草草收场
      const nMin = Math.min(3, members.length);
      const nMax = Math.min(14, Math.max(5, members.length * 2));
      const common = "\n\n【很重要】角色不是轮流回答用户的话，而是会顺着彼此刚说的话发散、接梗、跑题、互相调侃或反驳，像真实群聊那样你一言我一语。不是每人每轮都要说话，按情境选合适的人发言，一次产出 " + nMin + "~" + nMax + " 条；现在群里在场 " + members.length + " 人，人多就多聊几个来回、让在场的人都有戏，别三两句就收场。";
      const gEmotes = emotesForGroup(group.memberIds);
      const gEmoteHint = gEmotes.length ? "\n【表情包】成员可以在情绪合适时偶尔甩一张表情（别频繁）。可用关键词：" + gEmotes.map(e => e.keyword).join(" / ") + "。要发就在该成员那条发言对象里加 emote 字段填一个关键词（与列出的完全一致）。" : "";
      // 记忆互通时：让成员带出没说出口的心声，并给出好感/心情变化
      const thoughtHint = gs.memoryInterop ? "\n【心声与心情】开启了记忆互通：给【本轮真正有情绪波动、或有话没说出口】的成员各加一条 \"thought\"（此刻没说出口的真实心声，一句话）——**每条都要是贴合当下、和这个成员上一条心声不一样的新念头，别重复、别原地打转、别套话**；没什么内心活动的成员可省略。另可加 \"mood\"（此刻心情词，如「愉快」「烦躁」）、\"affinityDelta\"（整数 -5~5，这次群聊互动让 TA 对用户的好感如何变化，通常小幅、没波动就 0）。" : "";
      const thoughtField = gs.memoryInterop ? ",\"thought\":\"（可选）没说出口的心声\",\"mood\":\"（可选）此刻心情词\",\"affinityDelta\":\"（可选）整数-5到5\"" : "";
      // 世界书：按在场成员 + 近期群聊做检索式注入（全局词条 + 绑定到在场任一成员的词条，关键词命中才进）
      const gWorld = loreText(loreRef.current, { charIds: members.map(m => m.id), scope: "chat", text: hist });
      // 群聊里有旁白/围观（spectate）等长段描写时也吃八股压制器（线上短对话不需要，但群聊会写到叙事）
      const system = ANTI_CLICHE + "\n\n" + NARRATIVE_ANTI_CLICHE + (gWorld && gWorld.trim() ? "\n\n" + WORLDBOOK_RULE : "") + "\n\n" + CHARCARD_RULE + "\n\n" + dir + common + gEmoteHint + thoughtHint + "\n\n【成员】\n" + memberDesc + "\n\n【成员间关系】\n" + relLines + (gWorld ? "\n\n【世界书】\n" + gWorld : "") + interop + preJoin + "\n\n【近期群聊】\n" + hist + "\n\n【输出】只输出 JSON 数组，按发言先后顺序。普通发言 {\"name\":\"成员名\",\"text\":\"内容\",\"quote\":\"（可选）你正在回应的那句话原文，不回应特定某句就省略此字段\",\"emote\":\"（可选）想发的表情关键词\",\"voice\":\"（可选）填 true 表示这条作为语音消息发（会显示成语音气泡+转文字，偶尔用）\",\"call\":\"（可选）填 voice 或 video，表示这个成员此刻想跟用户发起语音/视频通话邀请，别频繁\"" + thoughtField + "}；若某成员说完某句又后悔、想撤回，那条加 \"recall\":true 和 \"recallReason\":\"撤回原因\"（会先显示一秒再变成已撤回，别频繁）；发红包 {\"name\":\"成员名\",\"redpacket\":{\"total\":金额数字,\"count\":份数,\"message\":\"祝福语\"}}。name 必须是成员之一。";
      // 触发用户内容：自上一条角色发言以来我说的话/旁白
      let tail = [];
      for (let i = gchat.length - 1; i >= 0; i--) {
        if (gchat[i].kind === "ooc") continue; // OOC 不算发言，跳过
        if (gchat[i].role === "assistant") break;
        if (gchat[i].role === "user" || gchat[i].role === "narration") tail.unshift(gchat[i]);
      }
      const userContent = tail.length ? tail.map(m => m.role === "narration" ? "【旁白】" + m.content : (profile.name || "用户") + ": " + m.content).join("\n") : "（请群成员顺着上面的对话自然继续聊）";
      const raw = await callAI(active, system, [{
        role: "user",
        content: userContent
      }], {
        // token 随人数放宽：人多一轮更长，别被 3000 截断（封顶 10000）
        maxTokens: Math.min(10000, 3200 + members.length * 900),
        // 群聊最重（大 prompt + 多人 + 思考型），给足超时别让慢但有效的回复被掐断白扣钱
        timeout: 180000
      });
      const arr = extractJSON(raw);
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const spk = members.find(c => c.name === arr[i].name) || members[0];
          if (i > 0) await new Promise(r => setTimeout(r, 450));
          if (arr[i].redpacket && Number(arr[i].redpacket.total) > 0) {
            const rp = arr[i].redpacket;
            postRedPacket(groupId, spk, Number(rp.total), Math.max(1, Math.round(Number(rp.count) || 1)), rp.message || "恭喜发财，大吉大利");
          } else if (arr[i].recall === true && arr[i].text) {
            const mid = "grc_" + Date.now() + "_" + i;
            pGChat(groupId, p => [...p, { role: "assistant", senderId: spk.id, senderName: spk.name, content: arr[i].text, mid, ts: Date.now() }]);
            setTimeout(() => pGChat(groupId, p => p.map(m => m.mid === mid ? { ...m, recalled: true, origText: arr[i].text, reason: arr[i].recallReason || "" } : m)), 1100);
          } else if (arr[i].voice === true && arr[i].text) {
            const vt = String(arr[i].text);
            pGChat(groupId, p => [...p, { role: "assistant", senderId: spk.id, senderName: spk.name, kind: "voice", content: vt, dur: Math.max(1, Math.min(60, Math.round(vt.replace(/\s/g, "").length / 3))), replyTo: arr[i].quote || null, ts: Date.now() }]);
          } else {
            // 按换行把一坨拆成多条气泡（首条带引用），避免整段挤在一个气泡里
            const gLines = String(arr[i].text || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
            const gBubbles = gLines.length ? gLines : [String(arr[i].text || "")];
            // 记忆互通时把心声挂在末条气泡上显示
            const gThought = gs.memoryInterop && arr[i].thought && String(arr[i].thought).toLowerCase() !== "null" ? String(arr[i].thought).trim() : null;
            for (let j = 0; j < gBubbles.length; j++) {
              if (j > 0) await new Promise(r => setTimeout(r, 380));
              pGChat(groupId, p => [...p, {
                role: "assistant",
                senderId: spk.id,
                senderName: spk.name,
                content: gBubbles[j],
                replyTo: j === 0 ? (arr[i].quote || null) : null,
                thought: j === gBubbles.length - 1 ? gThought : null,
                ts: Date.now()
              }]);
            }
          }
          // 记忆互通：这次发言影响该成员对用户的实时好感与心情，并把心声写进【和私聊同一套】的实时状态里（双向影响、可变化）
          if (gs.memoryInterop) {
            const moodLabel = arr[i].mood && String(arr[i].mood).toLowerCase() !== "null" ? String(arr[i].mood).trim() : null;
            const aDelta = typeof arr[i].affinityDelta === "number" ? arr[i].affinityDelta : Number(arr[i].affinityDelta);
            if (spk && !isNaN(aDelta)) bumpAff(spk.id, aDelta || 0, moodLabel);
            if (spk && moodLabel) setMoodFor(spk.id, { label: moodLabel, ts: Date.now() });
            // 心声 → 共享 states[spk.id]（就是私聊心声卡读的那套）；有 thought 才进历史
            const gThink = arr[i].thought && String(arr[i].thought).toLowerCase() !== "null" ? String(arr[i].thought).trim() : null;
            if (spk && gThink) {
              const ns = { ...(states[spk.id] || {}), thought: gThink, mood: moodLabel || (states[spk.id] || {}).mood, ts: Date.now() };
              setStateFor(spk.id, ns);
              pushStateHist(spk.id, ns);
            } else if (spk && moodLabel) {
              setStateFor(spk.id, { ...(states[spk.id] || {}), mood: moodLabel, ts: Date.now() });
            }
          }
          // 成员主动发起通话邀请
          const gcm = arr[i].call && ["voice", "video"].includes(String(arr[i].call).toLowerCase()) ? String(arr[i].call).toLowerCase() : null;
          if (gcm) {
            await new Promise(r => setTimeout(r, 300));
            pGChat(groupId, p => [...p, { role: "assistant", senderId: spk.id, senderName: spk.name, kind: "callinvite", mode: gcm, content: "[" + (gcm === "video" ? "视频" : "语音") + "通话邀请]", ts: Date.now() }]);
          }
          // 成员甩表情：按关键词匹配 TA 可用的表情
          const ekw = arr[i].emote && String(arr[i].emote).toLowerCase() !== "null" ? String(arr[i].emote).trim() : null;
          if (ekw) {
            const av = emotesForChar(spk.id);
            const low = ekw.toLowerCase();
            const mt = av.find(e => e.keyword === ekw) || av.find(e => e.keyword.toLowerCase() === low) || av.find(e => low.includes(e.keyword.toLowerCase()) || e.keyword.toLowerCase().includes(low));
            if (mt) {
              await new Promise(r => setTimeout(r, 300));
              pGChat(groupId, p => [...p, { role: "assistant", senderId: spk.id, senderName: spk.name, kind: "emote", url: mt.url, keyword: mt.keyword, content: "[表情] " + mt.keyword, ts: Date.now() }]);
            }
          }
        }
      }
    } catch (e) {
      pGChat(groupId, p => [...p, {
        role: "assistant",
        senderName: "系统",
        content: "（群聊生成失败：" + e.message + "）",
        ts: Date.now()
      }]);
    } finally {
      endLane("g:" + groupId);
      maybeSummarizeGroup(groupId);
    }
  };
  // 群聊 OOC：跳出所有角色直接问模型；不进角色扮演上下文
  const oocGroup = async (groupId, text) => {
    if (laneBusy("g:" + groupId) || !text || !text.trim()) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    pGChat(groupId, p => [...p, { role: "user", kind: "ooc", content: text.trim(), ts: Date.now() }]);
    if (!active) { toast("请先到设置配置 API"); return; }
    startLane("g:" + groupId);
    try {
      const members = (group.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
      const histText = (groupChatsRef.current[groupId] || []).filter(m => m.kind !== "ooc" && m.content).slice(-20).map(m => m.role === "narration" ? "【旁白】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + "：" + m.content).join("\n");
      const answer = await oocAskGroup(active, { members, profile, rels, chars: characters, worldbook, historyText: histText }, text.trim());
      pGChat(groupId, p => [...p, { role: "assistant", kind: "ooc", content: answer, ts: Date.now() }]);
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      endLane("g:" + groupId);
    }
  };
  // 群聊消息长按操作：复制/收藏/编辑/撤回/重Roll（引用、多选在组件内处理）
  const handleGroupMsgAction = (groupId, act, idx) => {
    const msgs = groupChatsRef.current[groupId] || [];
    const m = msgs[idx];
    if (!m) return;
    if (act === "fav") { addFavorite(m.senderId || null, m); return; }
    if (act === "copy") {
      navigator.clipboard && navigator.clipboard.writeText(m.content || "");
      toast("已复制");
    } else if (act === "recall") {
      pGChat(groupId, p => p.map((x, i) => i === idx ? { ...x, recalled: true, origText: x.content, reason: x.reason || "" } : x));
    } else if (act === "edit") {
      setEditMsg({ content: m.content || "", onSave: nv => pGChat(groupId, p => p.map((x, i) => i === idx ? { ...x, content: nv } : x)) });
    } else if (act === "reroll") {
      if (m.role !== "assistant") { toast("只能重Roll成员的消息"); return; }
      // 删掉这条及其之后的内容，从这里重新让成员回应
      pGChat(groupId, p => p.slice(0, idx));
      setTimeout(() => replyGroup(groupId), 200);
    }
  };
  const deleteGroupMsgs = (groupId, indices) => {
    const set = new Set(indices);
    pGChat(groupId, p => p.filter((_, i) => !set.has(i)));
  };
  // ---- 群投票 ----
  const startPoll = (groupId, title, options, anon) => {
    const by = gsFor(groupId).spectate ? "旁白" : profile.name || "我";
    pushGroupRich(groupId, {
      role: "user",
      kind: "poll",
      pollId: "pl_" + Date.now(),
      title: title,
      anon: !!anon,
      by: by,
      options: options.map(o => ({
        text: o,
        voters: []
      })),
      content: "[投票] " + title
    });
    toast("投票已发起");
    // 发起后角色陆陆续续自动投票（无需手动按）
    setTimeout(() => {
      const gc = groupChatsRef.current[groupId] || [];
      const idx = gc.map((m, i) => m.kind === "poll" ? i : -1).filter(i => i >= 0).pop();
      if (idx != null && idx >= 0) genPollVotes(groupId, idx);
    }, 900);
  };
  const castVote = (groupId, msgIdx, optIdx, voter) => {
    pGChat(groupId, p => p.map((m, i) => {
      if (i !== msgIdx || m.kind !== "poll") return m;
      const options = m.options.map((o, oi) => ({
        ...o,
        voters: o.voters.filter(v => v !== voter).concat(oi === optIdx ? [voter] : [])
      }));
      return {
        ...m,
        options
      };
    }));
  };
  // 角色陆续投票 + 可能的评论/cue（后台进行，不锁输入）
  const genPollVotes = async (groupId, msgIdx) => {
    if (!active) return;
    const group = groups.find(g => g.id === groupId);
    const members = group.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean);
    const poll = (groupChatsRef.current[groupId] || [])[msgIdx];
    if (!poll || poll.kind !== "poll") return;
    try {
      const memberDesc = members.map(c => {
        const md = moods[c.id] && moods[c.id].label ? "，此刻心情：" + moods[c.id].label : "";
        const af = "，对用户好感 " + Math.round(affOf(c.id)) + "/100";
        return "【" + c.name + "】" + (c.persona || "").slice(0, 220) + md + af;
      }).join("\n");
      const gsp = gsFor(groupId);
      const hist = (groupChatsRef.current[groupId] || []).filter(m => m.kind !== "ooc" && m.kind !== "system").slice(-16).map(m => (m.role === "narration" ? "【旁白】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + ": " + (m.content || ""))).join("\n");
      const system = "群里发起了投票：「" + poll.title + "」。选项：" + poll.options.map((o, i) => i + ". " + o.text).join("；") + "。\n**每个成员投什么，必须由 TA 的人设、价值观、当前所处的上下文、此刻心情、跟发起人/其他成员的关系来决定——绝对不要随机乱投、也不要为了均衡而分散**。有的成员会按性格明显偏向某个选项，有的会犹豫、跟风、或按人设弃权（choice 填 -1，比如不感兴趣、故意不掺和、闹别扭）。**say（顺口说的那句话）必须和 TA 投的 choice 一致**（别嘴上说 A 却投 B）；不是每个人都要 say。如果有人弃权，别的成员可能会 cue 他「你怎么不投」。\n【成员（含此刻心情与好感，据此判断投向）】\n" + memberDesc + (hist ? "\n【近期群聊上下文（投票就发生在这些对话之后，投向要贴合语境）】\n" + hist : "") + "\n【输出】只输出 JSON 数组，按发生先后：[{\"name\":\"成员名\",\"choice\":选项序号(0起，弃权 -1),\"say\":\"（可选）和 choice 一致的一句话\"}]";
      const raw = await callAI(active, system, [{
        role: "user",
        content: "开始投票，按上面的规则决定每个人投什么。"
      }], {
        maxTokens: 800
      });
      const arr = extractJSON(raw);
      if (!Array.isArray(arr)) return;
      // 陆陆续续：每个动作间隔一会儿
      for (const v of arr) {
        const spk = members.find(c => c.name === v.name);
        if (!spk) continue;
        await new Promise(r => setTimeout(r, 600 + Math.random() * 700));
        if (typeof v.choice === "number" && v.choice >= 0 && v.choice < poll.options.length) castVote(groupId, msgIdx, v.choice, spk.name);
        if (v.say && String(v.say).trim()) pGChat(groupId, p => [...p, {
          role: "assistant",
          senderId: spk.id,
          senderName: spk.name,
          content: String(v.say).trim(),
          ts: Date.now()
        }]);
      }
    } catch (e) {/* 静默 */}
  };
  // ---- 群红包 ----
  // 我发红包
  // 记忆不互通的群=封闭空间：红包/转账都是过家家，不动任何真钱包（我的 + 角色的都不结算）
  const groupClosed = gid => !gsFor(gid).memoryInterop;
  const sendRedPacket = (groupId, total, count, message) => {
    const a = Math.round(Number(total) * 100) / 100;
    if (a <= 0) return;
    const closed = groupClosed(groupId);
    if (!closed) {
      if (wallet < a) { toast("余额不足"); return; }
      changeWallet(-a, "发红包", "redpacket");
    }
    const splits = splitRedPacket(a, count);
    const rpId = "rp_" + Date.now();
    pushGroupRich(groupId, {
      kind: "redpacket",
      rpId: rpId,
      byMe: true,
      by: profile.name || "我",
      total: a,
      count: splits.length,
      message: message || "恭喜发财，大吉大利",
      splits: splits,
      claims: [],
      content: "[红包] " + (message || "恭喜发财，大吉大利")
    });
    toast("红包已发出 ¥" + a);
    // 群成员随机来抢
    setTimeout(() => autoGrabRedPacket(groupId, rpId), 1200);
  };
  const postClaimLine = (groupId, claimer, owner) => pushGroupRich(groupId, {
    role: "system",
    content: claimer + " 领取了 " + owner + " 的红包"
  });
  // 角色发红包（AI 触发）：钱在被领取时才结算
  const postRedPacket = (groupId, char, total, count, message) => {
    const a = Math.round(Number(total) * 100) / 100;
    if (a <= 0) return;
    if (!groupClosed(groupId)) adjustCharBalance(char.id, -a, "发红包", "redpacket");
    const splits = splitRedPacket(a, count);
    const rpId = "rp_" + Date.now() + "_" + char.id;
    pushGroupRich(groupId, {
      kind: "redpacket",
      rpId: rpId,
      byMe: false,
      by: char.name,
      senderId: char.id,
      total: a,
      count: splits.length,
      message: message || "恭喜发财，大吉大利",
      splits: splits,
      claims: [],
      content: "[红包] " + (message || "恭喜发财，大吉大利")
    });
    // 其他成员（除发红包者）也会来抢
    setTimeout(() => autoGrabRedPacket(groupId, rpId), 1400);
  };
  // 我领红包（我发的不能领；角色发的可以领）
  const claimRedPacket = (groupId, msgIdx) => {
    const meName = profile.name || "我";
    const rp = (groupChatsRef.current[groupId] || [])[msgIdx];
    if (!rp || rp.kind !== "redpacket") return null;
    if (rp.byMe) return "own";
    if (rp.claims.some(c => c.me)) return "claimed";
    if (rp.claims.length >= rp.count) return "empty";
    const amt = rp.splits[rp.claims.length];
    if (!groupClosed(groupId)) changeWallet(amt, "抢到 " + (rp.by || "某人") + " 的红包", "redpacket");
    pGChat(groupId, p => p.map((m, i) => i === msgIdx ? {
      ...m,
      claims: [...m.claims, {
        name: meName,
        me: true,
        amount: amt,
        ts: Date.now()
      }]
    } : m));
    postClaimLine(groupId, meName, rp.by);
    return amt;
  };
  // 群成员随机抢某个红包（按 rpId 定位；排除发红包者本人）
  const autoGrabRedPacket = (groupId, rpId) => {
    const gchat = groupChatsRef.current[groupId] || [];
    const idx = gchat.map((m, i) => m.kind === "redpacket" && m.rpId === rpId ? i : -1).filter(i => i >= 0).pop();
    if (idx == null || idx < 0) return;
    const rp = gchat[idx];
    const group = groups.find(g => g.id === groupId);
    const members = (group.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean).filter(c => c.id !== rp.senderId);
    const grabbers = members.filter(() => Math.random() < 0.7).slice(0, rp.count - rp.claims.length);
    let claims = [...rp.claims];
    const closed = groupClosed(groupId);
    grabbers.forEach(c => {
      if (claims.length >= rp.count) return;
      const amt = rp.splits[claims.length];
      if (!closed) adjustCharBalance(c.id, amt, "抢到红包", "redpacket");
      claims.push({
        name: c.name,
        id: c.id,
        amount: amt,
        ts: Date.now()
      });
    });
    pGChat(groupId, p => p.map((m, i) => i === idx ? {
      ...m,
      claims
    } : m));
    grabbers.forEach(c => postClaimLine(groupId, c.name, rp.by));
  };
  // ---- 群聊总结存入记忆库（关联所有成员）----
  const summarizeGroupToMem = async groupId => {
    const group = groups.find(g => g.id === groupId);
    if (!active) {
      toast("请先配置 API");
      return;
    }
    const msgs = (groupChatsRef.current[groupId] || []).filter(m => m.content).slice(-40);
    if (msgs.length < 2) {
      toast("群聊太少");
      return;
    }
    startLane("g:" + groupId);
    try {
      const summary = await summarizeGroup(active, {
        profile
      }, msgs);
      if (summary && summary.trim()) {
        addMemEntry({
          text: "【群「" + group.name + "」】" + summary.trim(),
          tags: ["群聊", group.name],
          charIds: group.memberIds.slice(),
          source: "auto"
        });
        toast("已存入记忆库");
      }
    } catch (e) {
      toast("总结失败：" + e.message);
    } finally {
      endLane("g:" + groupId);
    }
  };
  const createGroup = (name, memberIds, spectate) => {
    const g = {
      id: "g_" + Date.now(),
      name,
      memberIds,
      createdTs: Date.now()
    };
    setGroups(p => {
      const n = [...p, g];
      saveJSON("x_groups", n);
      return n;
    });
    if (spectate) saveGroupSettings(g.id, {
      spectate: true
    });
    setNewGroupOpen(false);
    toast(spectate ? "旁观群聊已创建" : "群聊已创建");
  };
  const updateGroup = (groupId, patch) => setGroups(p => {
    const n = p.map(g => g.id === groupId ? { ...g, ...patch } : g);
    saveJSON("x_groups", n);
    return n;
  });
  const deleteGroup = groupId => {
    setGroups(p => { const n = p.filter(g => g.id !== groupId); saveJSON("x_groups", n); return n; });
    setGroupChats(p => { const n = { ...p }; delete n[groupId]; return n; });
    localStorage.removeItem("x_gchat:" + groupId);
    setGroupSettings(p => { const n = { ...p }; delete n[groupId]; saveJSON("x_groupSettings", n); return n; });
    setActiveGroup(null);
    setScreen("messages");
    toast("群聊已删除");
  };
  const groupSysLine = (groupId, text) => pGChat(groupId, p => [...p, { role: "system", content: text, ts: Date.now() }]);
  // 旁观模式下，加/踢人归到群里某个现有成员名下
  const specActor = (groupId, memberIds) => {
    if (!gsFor(groupId).spectate) return null;
    const pool = (memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  };
  const addGroupMember = (groupId, charId) => {
    const g = groups.find(x => x.id === groupId); if (!g || (g.memberIds || []).includes(charId)) return;
    const who = characters.find(c => c.id === charId);
    const actor = specActor(groupId, g.memberIds);
    updateGroup(groupId, { memberIds: [...(g.memberIds || []), charId] });
    groupSysLine(groupId, (actor ? actor.name : "你") + "把" + (who ? who.name : "新成员") + "拉进了群聊");
  };
  const kickGroupMember = (groupId, charId) => {
    const g = groups.find(x => x.id === groupId); if (!g) return;
    const who = characters.find(c => c.id === charId);
    const remain = (g.memberIds || []).filter(id => id !== charId);
    const actor = specActor(groupId, remain);
    updateGroup(groupId, { memberIds: remain });
    groupSysLine(groupId, (actor ? actor.name : "你") + "把" + (who ? who.name : "某人") + "移出了群聊");
  };
  // 群聊自动总结进记忆库（阈值触发，仿单聊 maybeSummarize）
  const maybeSummarizeGroup = async groupId => {
    const g = groups.find(x => x.id === groupId); if (!g) return;
    const gs = gsFor(groupId);
    // 记忆分区：不互通的群不自动往全局记忆库总结（记忆只留在本群，靠上下文条数+入群前上文续场）
    if (!gs.memoryInterop) return;
    const thresh = gs.sumThresh || 150, buffer = gs.sumBuffer || 20;
    const msgs = (groupChatsRef.current[groupId] || []).filter(m => m.role === "user" || m.role === "assistant" || m.role === "narration");
    const lastSum = gs.lastSummarizedCount || 0;
    if (msgs.length - lastSum < thresh) return;
    const toSum = msgs.slice(lastSum, msgs.length - buffer);
    if (!toSum.length || !active) return;
    try {
      const summary = await summarizeGroup(active, { profile }, toSum);
      if (summary && summary.trim()) addMemEntry({ text: summary.trim(), tags: ["群聊"], charIds: (g.memberIds || []).slice(), source: "auto" });
      saveGroupSettings(groupId, { lastSummarizedCount: msgs.length - buffer });
      toast("群聊已存入记忆库");
    } catch (e) {/* silent */}
  };

  // ---- 拉黑 / block ----
  const setBlockFor = (charId, patch) => setBlocks(p => {
    const cur = p[charId] || {};
    const merged = { ...cur, ...patch };
    const n = { ...p };
    if (merged.iBlocked || merged.theyBlocked) n[charId] = merged; else delete n[charId];
    saveJSON("x_blocks", n);
    return n;
  });
  const toggleBlock = charId => {
    const cur = blocksRef.current[charId] || {};
    if (cur.iBlocked) { setBlockFor(charId, { iBlocked: false }); toast("已解除拉黑"); }
    else {
      setBlockFor(charId, { iBlocked: true });
      pChat(charId, p => [...p, { role: "system", kind: "system", content: "你拉黑了 TA", ts: Date.now() }]);
      toast("已拉黑");
    }
  };
  // 我拉黑 TA 后按「回复」：TA 依人设/心情 碎碎念 / 生气 / 发解除申请
  const blockedReaction = async charId => {
    if (laneBusy("c:" + charId) || !active) { if (!active) toast("请先配置 API"); return; }
    const char = characters.find(c => c.id === charId); if (!char) return;
    startLane("c:" + charId);
    try {
      const raw = await callAI(active, buildBundle(ctxFor(char)) + "\n\n【场景】用户把你拉黑了——你发的消息 Ta 暂时收不到，而你知道自己被拉黑了。完全代入「" + char.name + "」，按人设、此刻心情、对用户的好感，选一种反应：mutter=自言自语碎碎念(委屈/不在乎/嘴硬)；angry=生气骂几句；appeal=想和好、发一条『解除拉黑申请』并给理由。短句多气泡。\n【输出】只输出 JSON：{\"mode\":\"mutter|angry|appeal\",\"say\":[\"气泡1\",\"气泡2\"],\"reason\":\"appeal 时的申请理由，否则 null\"}", [{ role: "user", content: "（你被拉黑了）" }], { maxTokens: 500 });
      const d = extractJSON(raw) || {};
      const says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
      const tag = d.mode === "angry" ? char.name + "（气愤）：" : char.name + "（自言自语）：";
      says.forEach((w, i) => setTimeout(() => pChat(charId, p => [...p, { role: "system", kind: "system", content: tag + w, ts: Date.now() }]), 250 + i * 650));
      if (d.mode === "appeal") setTimeout(() => pChat(charId, p => [...p, { role: "assistant", kind: "unblock_req", from: "char", cid: "ub_" + Date.now(), status: "pending", reason: d.reason || "想和你和好", content: "[解除拉黑申请]", ts: Date.now(), read: false }]), 250 + says.length * 650);
    } catch (e) { toast("失败：" + e.message); } finally { endLane("c:" + charId); }
  };
  // 我处理 TA 发来的解除申请
  const respondUnblockFromChar = (charId, cid, accept) => {
    pChat(charId, p => p.map(m => m.cid === cid ? { ...m, status: accept ? "accepted" : "declined" } : m));
    if (accept) { setBlockFor(charId, { iBlocked: false }); toast("已和好，解除拉黑"); setTimeout(() => pChat(charId, p => [...p, { role: "assistant", content: "……谢谢你愿意听我说。", ts: Date.now(), read: false }]), 300); }
    else { toast("已拒绝"); setTimeout(() => blockedReaction(charId), 400); }
  };
  // TA 拉黑我期间，我点某条消息的感叹号→发解除申请（该消息作为诉说），TA 依人设决定
  const sendMyUnblockReq = async (charId, pleaText) => {
    const char = characters.find(c => c.id === charId); if (!char) return;
    if (!active) { toast("请先配置 API"); return; }
    const cid = "ubm_" + Date.now();
    pChat(charId, p => [...p, { role: "user", kind: "unblock_req", from: "me", cid, status: "pending", content: "[解除拉黑申请] " + (pleaText || ""), plea: pleaText || "", ts: Date.now(), read: true }]);
    startLane("c:" + charId);
    try {
      const raw = await callAI(active, buildBundle(ctxFor(char)) + "\n\n【场景】你之前把用户拉黑了。现在用户发来一条『解除拉黑申请』，诉说内容：「" + (pleaText || "（没说什么）") + "」。完全代入「" + char.name + "」，依据人设、你当初为何拉黑、以及这段诉说是否打动你，决定接不接受。气量大/被说动就 accept；还在气头上/理由不够就拒绝。用即时通讯口吻回几句。\n【输出】只输出 JSON：{\"accept\":true或false,\"say\":[\"气泡1\",\"气泡2\"]}", [{ role: "user", content: pleaText || "（申请解除拉黑）" }], { maxTokens: 800 });
      const d = extractJSON(raw) || {};
      pChat(charId, p => p.map(m => m.cid === cid ? { ...m, status: d.accept ? "accepted" : "declined" } : m));
      const says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
      if (d.accept) { setBlockFor(charId, { theyBlocked: false }); toast("TA 接受了，解除拉黑"); }
      else toast("TA 拒绝了，可继续尝试");
      says.forEach((w, i) => setTimeout(() => pChat(charId, p => d.accept
        ? [...p, { role: "assistant", content: w, ts: Date.now(), read: false }]
        : [...p, { role: "system", kind: "system", content: char.name + "：" + w, ts: Date.now() }]), 300 + i * 650));
    } catch (e) { toast("失败：" + e.message); } finally { endLane("c:" + charId); }
  };
  const clearChat = (charId, wipeMem) => {
    pChat(charId, () => []);
    setChatSettings(p => { const n = { ...p, [charId]: { ...(p[charId] || {}), lastSummarizedCount: 0 } }; saveJSON("x_chatSettings", n); return n; });
    // 清聊天=这个角色重新开始：实时状态/心声历史/心声计数都清掉，资产档案也重置（下次进钱包重新推演生成）
    setStates(p => { const n = { ...p }; delete n[charId]; saveJSON("x_states", n); return n; });
    setStateHist(p => { const n = { ...p }; delete n[charId]; saveJSON("x_stateHist", n); return n; });
    if (thoughtCtrRef.current[charId]) { delete thoughtCtrRef.current[charId]; try { saveJSON("x_thoughtCtr", thoughtCtrRef.current); } catch (e) {} }
    setCharWallet(p => { if (!p[charId]) return p; const n = { ...p }; delete n[charId]; saveJSON("x_charWallet", n); charWalletRef.current = n; return n; });
    if (wipeMem) {
      setMemFor(charId, "");
      const next = memLibRef.current.map(e => {
        if (e.locked) return e;
        if (e.charIds && e.charIds.includes(charId)) { const rest = e.charIds.filter(id => id !== charId); return rest.length ? { ...e, charIds: rest } : null; }
        return e;
      }).filter(Boolean);
      saveMemLib(next);
    }
    setChatSettingsOpen(false);
    toast(wipeMem ? "已清除聊天并忘却记忆" : "已清除聊天记录");
  };

  // ---- 日历 / calendar ----
  const saveCalendar = next => { setCalendar(next); saveJSON("x_calendar", next); };
  const cloneCal = prev => ({ world: { ...(prev.world || {}) }, chars: { ...(prev.chars || {}) }, mine: { ...(prev.mine || {}) } });
  const calBucket = (n, view) => view === "world" ? n.world : view === "mine" ? n.mine : (n.chars[view] = { ...(n.chars[view] || {}) });
  const saveCalEvent = (view, dateKey, title, note) => {
    if (!title || !title.trim()) return;
    setCalendar(prev => {
      const ev = { id: "ev_" + Date.now() + "_" + Math.floor(Math.random() * 1000), title: title.trim(), note: (note || "").trim() };
      const n = cloneCal(prev);
      const b = calBucket(n, view);
      b[dateKey] = [...(b[dateKey] || []), ev];
      saveJSON("x_calendar", n);
      return n;
    });
  };
  const delCalEvent = (view, dateKey, id) => setCalendar(prev => {
    const n = cloneCal(prev);
    const bucket = calBucket(n, view);
    if (bucket[dateKey]) { bucket[dateKey] = bucket[dateKey].filter(e => e.id !== id); if (!bucket[dateKey].length) delete bucket[dateKey]; }
    saveJSON("x_calendar", n);
    return n;
  });
  // 经期
  const savePeriodSettings = patch => setPeriod(p => { const n = { ...p, ...patch }; saveJSON("x_period", n); return n; });
  // 点某天：若这天已是某段的开始/结束→取消它；否则若有「已开始未结束」的段且这天在其后→记为结束；否则新开一段
  const recordPeriodStart = dateKey => setPeriod(p => {
    let periods = periodList(p).map(x => ({ start: x.start, end: x.end || null }));
    const dt = pKeyDate(dateKey);
    const asStart = periods.findIndex(x => x.start === dateKey);
    const asEnd = periods.findIndex(x => x.end === dateKey);
    if (asStart >= 0) periods.splice(asStart, 1);
    else if (asEnd >= 0) periods[asEnd].end = null; // 取消结束，重新变成进行中
    else {
      const open = periods.filter(x => !x.end && pKeyDate(x.start) < dt).sort((a, b) => pKeyDate(b.start) - pKeyDate(a.start))[0];
      if (open) open.end = dateKey; else periods.push({ start: dateKey, end: null });
    }
    periods.sort((a, b) => pKeyDate(a.start) - pKeyDate(b.start));
    const n = { ...p, periods }; delete n.starts; // 迁移掉旧字段
    saveJSON("x_period", n);
    return n;
  });
  const genCalMonth = async (view, year, month, promptText) => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, calendar: true }));
    try {
      const who = view === "world" ? "这个世界里所有人都知道的公共大事（节日、活动、纪念日、季节性事件、集体事件等）" : "「" + ((characters.find(c => c.id === view) || {}).name || "某角色") + "」个人的私人日程（贴合 TA 的人设、职业、生活）";
      const ctx = view === "world" ? { char: { id: "__cal", name: "世界", persona: "" }, chars: characters, rels, profile, timeAware: false } : ctxFor(characters.find(c => c.id === view) || { id: view, name: "角色" });
      const monthName = year + "年" + (month + 1) + "月";
      const d = await runProbe(active, ctx, {
        instruction: "为 " + monthName + " 生成一整月的日历事件——" + who + "。**至少 4 条、8-15 条为宜**，分散在当月不同日期。每条：day(该月第几天，1-" + new Date(year, month + 1, 0).getDate() + " 的整数) / title(简短事件名) / note(一句补充，可空)。" + (promptText && promptText.trim() ? "特别要求：" + promptText.trim() + "。" : ""),
        schemaHint: "{\"items\":[{\"day\":8,\"title\":\"事件名\",\"note\":\"补充\"}]}",
        maxTokens: 1500
      });
      const items = (d && Array.isArray(d.items) ? d.items : []).filter(x => x && x.title && Number(x.day) >= 1);
      if (!items.length) { toast("没有生成内容"); return; }
      setCalendar(prev => {
        const n = cloneCal(prev);
        const put = (dk, ev) => { const b = calBucket(n, view); b[dk] = [...(b[dk] || []), ev]; };
        items.forEach((x, i) => { const day = Math.min(new Date(year, month + 1, 0).getDate(), Math.max(1, Math.round(Number(x.day)))); put(year + "-" + (month + 1) + "-" + day, { id: "ev_" + Date.now() + "_" + i, title: String(x.title).slice(0, 40), note: (x.note || "").slice(0, 80) }); });
        saveJSON("x_calendar", n);
        return n;
      });
      toast("已生成 " + items.length + " 条");
    } catch (e) { toast("生成失败：" + e.message); } finally { setGen(g => ({ ...g, calendar: false })); }
  };

  // ---- probes ----
  // ============================================================
  // 行程 Lifestyle —— x_schedules[charId][dayKey]=dayPlan；当天首开给所有人生成，过去可点(懒生成)，未来锁
  // ============================================================
  const saveSchedDay = (charId, dayKey, plan) => setSchedules(p => {
    const cur = p[charId] || {};
    const n = { ...p, [charId]: { ...cur, [dayKey]: plan } };
    schedulesRef.current = n;
    saveJSON("x_schedules", n);
    return n;
  });
  const genScheduleDay = async (char, dayKey) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    const today = schedDayKey(new Date());
    const retro = dayKey < today;
    const dp = schedDateParts(dayKey);
    setGen(g => ({ ...g, sched: char.id + "|" + dayKey }));
    try {
      // 角色若在别的时区，「此刻几点」按 TA 当地算（异地：日程照 TA 的作息时区推演，时间字段一律填 TA 当地时刻）
      const tzShiftMin = schedTzShiftMin(char);
      const charNow = new Date(Date.now() + tzShiftMin * 60000);
      const nowStr = String(charNow.getHours()).padStart(2, "0") + ":" + String(charNow.getMinutes()).padStart(2, "0");
      const tzNote = tzShiftMin ? "。注意：TA 在别的时区（此刻 TA 当地约 " + nowStr + "），seqs 里的 time 一律填【TA 当地时刻】、按 TA 当地作息安排（睡觉/上班/吃饭都照 TA 那边的钟）" : "";
      const when = retro
        ? "这是【已经过去的】" + dp.md + "（" + dp.dowZh + "）——回溯推演 Ta 那天实际是怎么过的" + tzNote
        : "这是【今天】" + dp.md + "（" + dp.dowZh + "），现在时间约 " + nowStr + "——推演 Ta 今天一整天会怎么过、以及【此刻及之前】的实际执行情况" + tzNote;
      const devRule = retro
        ? "【偏差 deviation】其中 0-2 段可以是「偏差」：原计划被打断或改变，尤其受最近和用户的对话、用户的要求、或 Ta 那天的心情影响。"
        : "【偏差 deviation】偏差=计划被实际打断/改变，只可能发生在【时间已过去（早于此刻 " + nowStr + "）】的时段；此刻之后（未来）还没发生的时段，deviation 一律必须为 null，绝不要给未来时段编造偏差。已过去的时段里最多 0-2 段是偏差，尤其受最近和用户的对话/心情影响（如用户抱怨犯困，Ta 提前收工去做饭）。";
      // 碎碎念改成【回溯】：今天还没过完，不写今天的（否则像能看到未来）。
      // 生成今天日程的同时，顺手根据聊天记录把【昨天】的碎碎念补上——一次调用搞定，不进聊天prompt、也不多花 api。
      const yKey = schedDayKey(new Date(Date.now() - 86400000));
      const yPlan = (schedulesRef.current[char.id] || {})[yKey] || null;
      const needY = !retro && yPlan && !((yPlan.murmurs || []).length); // 只在生成今天、且昨天有日程还没写过碎碎念时补
      const ydp = needY ? schedDateParts(yKey) : null;
      const murmurRule = retro
        ? "\n【碎碎念 murmurs】另给 2-4 条第一人称、当天当下的碎碎念，各带一个 time，像那天随手记下的念头，可回看。"
        : (needY
            ? "\n【昨日碎碎念 yesterdayMurmurs】今天还没过完，别写今天的碎碎念。改为回看【昨天（" + ydp.md + " " + ydp.dowZh + "）】：结合你和用户昨天的对话、以及你昨天的经历，补 2-4 条【昨天当时】第一人称、各带一个 time 的碎碎念（像昨天随手记下的念头）。"
            : "\n【碎碎念】今天还没过完，先别写碎碎念（留到明天回看时再补今天的）。");
      const murmurSchema = retro
        ? ",\"murmurs\":[{\"time\":\"11:20\",\"text\":\"碎碎念一句\"}]"
        : (needY ? ",\"yesterdayMurmurs\":[{\"time\":\"11:20\",\"text\":\"昨天的碎碎念\"}]" : "");
      const d = await runProbe(bgActive, { ...ctxFor(char), worldbook: loreFor(char, "lifestyle") }, {
        instruction: "推演「" + char.name + "」一天的行程时间线。" + when + "。给 5-9 段，从早到晚，贴合身份/性格/世界观，有生活质感和具体地点。每段 type 从 [coffee,work,create,meal,rest,social,out,sleep,other] 里选最贴切的一个。\n【必须有就寝段】时间线一定要一路排到 Ta【睡觉】——最后放一段 type=\"sleep\" 的就寝（title 写清几点睡下，如「23:40 洗漱后睡了」），按 Ta 的身份/性格定就寝点（熬夜型晚睡、规律型早睡），别只排到晚上就断掉。\nload 是这天的负荷（HIGH LOAD / NORMAL / LIGHT）；estTime 是当天被安排占用的总小时数（数字）。\n" + devRule + "偏差段填 deviation:{\"plan\":\"原计划一句\",\"reason\":\"变更原因一句(点出和用户的关系)\",\"actual\":\"实际去向，如 工作室 → 厨房\"}；其余段 deviation 为 null。" + murmurRule,
        schemaHint: "{\"load\":\"HIGH LOAD\",\"estTime\":22,\"seqs\":[{\"time\":\"08:00\",\"title\":\"起床，晨间咖啡\",\"location\":\"家里卧室/厨房\",\"type\":\"coffee\",\"deviation\":null},{\"time\":\"23:40\",\"title\":\"洗漱后睡了\",\"location\":\"卧室\",\"type\":\"sleep\",\"deviation\":null}]" + murmurSchema + "}",
        maxTokens: 4000
      });
      const plan = {
        load: d.load || "NORMAL",
        estTime: Number(d.estTime) || null,
        seqs: (Array.isArray(d.seqs) ? d.seqs : []).map((s, i) => ({ seq: i + 1, time: s.time || "", title: s.title || "", location: s.location || "", type: s.type || "other", deviation: s.deviation && (s.deviation.plan || s.deviation.reason) ? s.deviation : null })),
        // 今天先不留碎碎念（明天回看时补）；回溯的过去日才当场写
        murmurs: retro ? (Array.isArray(d.murmurs) ? d.murmurs : []).filter(m => m && m.text) : [],
        generatedAt: Date.now()
      };
      saveSchedDay(char.id, dayKey, plan);
      // 回填昨天的碎碎念
      if (needY && Array.isArray(d.yesterdayMurmurs)) {
        const ym = d.yesterdayMurmurs.filter(m => m && m.text);
        if (ym.length) saveSchedDay(char.id, yKey, { ...yPlan, murmurs: ym });
      }
      return true;
    } catch (e) {
      toast(char.name + " 行程推演失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, sched: null }));
    }
  };
  // 当天首次打开小手机：给所有还没有今日行程的角色自动生成（不用手动点进去）。
  // 按「谁缺今天的行程」来补，而不是每天只跑一整轮——这样当天新加进来的角色也会自动补上。
  const schedGenAllToday = async () => {
    if (schedRunRef.current) return; // 防并发：同一次生成过程里别重复触发
    if (!active) return;
    const today = schedDayKey(new Date());
    const todo = characters.filter(c => !(schedulesRef.current[c.id] || {})[today]);
    if (!todo.length) return;
    schedRunRef.current = true;
    try {
      for (const c of todo) await genScheduleDay(c, today);
    } finally {
      schedRunRef.current = false;
    }
  };
  const genSnoop = async char => {
    setGen(g => ({
      ...g,
      snoop: true
    }));
    setSelPhone(char.id);
    try {
      const d = await runProbe(bgActive, { ...ctxFor(char), worldbook: loreFor(char, "subjects") }, {
        instruction: "推演此刻「" + char.name + "」手机屏幕的真实状态，依据当下对话与心境，分模块。通知可带 detail 字段供点开细看。",
        schemaHint: "{\"notifications\":[{\"from\":\"来源\",\"preview\":\"摘要\",\"time\":\"14:20\",\"detail\":\"点开后的完整内容(可选)\"}],\"searches\":[\"搜索1\"],\"apps\":[{\"name\":\"应用\",\"detail\":\"在做什么\"}],\"wallpaper\":\"锁屏壁纸一句话\"}"
      });
      setSnoops(p => {
        const n = {
          ...p,
          [char.id]: {
            ...d,
            generatedAt: Date.now()
          }
        };
        saveJSON("x_snoops", n);
        return n;
      });
    } catch (e) {
      toast("刷新失败：" + e.message);
    } finally {
      setGen(g => ({
        ...g,
        snoop: false
      }));
    }
  };
  const genCarry = async char => {
    setGen(g => ({
      ...g,
      carry: true
    }));
    setSelPhone(char.id);
    try {
      const d = await runProbe(bgActive, ctxFor(char), {
        instruction: "推演此刻「" + char.name + "」随身携带的物品（4-7 件），反映身份、习惯与心境，可有透露心事的小物。物品可带 detail 供点开细看。",
        schemaHint: "{\"items\":[{\"name\":\"物品\",\"note\":\"简述\",\"detail\":\"点开后的细节(可选)\"}]}"
      });
      setCarries(p => {
        const n = {
          ...p,
          [char.id]: {
            ...d,
            generatedAt: Date.now()
          }
        };
        saveJSON("x_carries", n);
        return n;
      });
    } catch (e) {
      toast("刷新失败：" + e.message);
    } finally {
      setGen(g => ({
        ...g,
        carry: false
      }));
    }
  };
  // ---- 日记（Diary）----
  const scheduleTextFor = (char, dayKey) => {
    const key = dayKey || schedDayKey(new Date());
    const s = (schedules[char.id] || {})[key];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return "";
    return s.seqs.map(it => (it.time || "") + " " + (it.title || "") + (it.location ? "（" + it.location + "）" : "") + (it.deviation ? "［偏差：" + (it.deviation.reason || "") + "］" : "")).join("\n");
  };
  // 日记写的是【昨天】——那天已经过完，角色在【那天晚上睡前】写下当天的日记（对写的人来说那天就是"今天"）。
  // 时刻定在那晚 22:xx，别沿用手动刷新的当前时刻（否则会显示成 6号7:20 这种刷新时间）。一天一篇，按目标日去重。
  const diaryTargetTs = () => { const d = new Date(Date.now() - 86400000); d.setHours(22, Math.floor(Math.random() * 50), 0, 0); return d.getTime(); };
  const diaryWroteFor = (id, dayTs) => (diariesRef.current[id] || []).some(e => diarySameDay(e.ts, dayTs));
  const genDiary = async (charId, opts = {}) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    if (diaryBusy[charId]) return;
    if (!active) { if (opts.manual) toast("请先到设置配置 API"); return; }
    const targetTs = diaryTargetTs();
    const targetKey = schedDayKey(new Date(targetTs));
    if (diaryWroteFor(charId, targetTs)) { if (opts.manual) toast("昨天的日记已经写过了"); return; }
    setDiaryBusy(b => ({ ...b, [charId]: true }));
    try {
      const mood = moods[charId];
      // 素材只截【目标那一天】的聊天（0点~24点），别让最近3天的旧事跨天被反复回炉
      const dayStart = new Date(targetTs); dayStart.setHours(0, 0, 0, 0);
      const ds = dayStart.getTime(), de = ds + 86400000;
      const dayMsgs = (chatsRef.current[charId] || []).filter(m => !m.recalled && m.content && (m.ts || 0) >= ds && (m.ts || 0) < de);
      const dayChatText = dayMsgs.map(m => (m.role === "user" ? (profile.name || "用户") : char.name) + ": " + m.content).join("\n");
      // 上一篇日记（目标日之前最近的一篇）——喂给模型当「别重复」参照
      const prevD = (diariesRef.current[charId] || []).filter(e => (e.ts || 0) < targetTs).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      const prevDiary = prevD ? ((prevD.titleZh || prevD.titleEn || "") + "｜" + (prevD.paras || []).map(p => p.text).join(" ").slice(0, 220)) : "";
      const ctx = { ...ctxFor(char), moodLabel: mood && (mood.label || mood) || null, worldbook: loreFor(char, "diary"), recentChat: dayChatText };
      const dateStr = new Date(targetTs).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
      const d = await generateDiary(active, ctx, { scheduleText: scheduleTextFor(char, targetKey), dateStr: dateStr, noChatMaterial: dayMsgs.length < 2, prevDiary: prevDiary });
      const entry = {
        id: "d_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        ts: targetTs,
        no: Math.floor(Math.random() * 9000) + 1000,
        titleEn: d.titleEn || "Untitled",
        titleZh: d.titleZh || "",
        location: d.location || "",
        coords: d.coords && d.coords !== "null" ? d.coords : null,
        weather: d.weather || "",
        timeStr: d.timeStr || "",
        paras: Array.isArray(d.paras) ? d.paras.filter(p => p && p.text).map(p => ({ text: String(p.text), secret: !!p.secret })) : [],
        signature: d.signature || "",
        mood: d.mood || "",
        source: opts.manual ? "manual" : "auto"
      };
      if (!entry.paras.length) throw new Error("内容为空");
      setDiaries(p => {
        const n = { ...p, [charId]: [entry, ...(p[charId] || [])] };
        saveJSON("x_diaries", n);
        return n;
      });
    } catch (e) {
      if (opts.manual) toast("生成失败：" + e.message);
    } finally {
      setDiaryBusy(b => ({ ...b, [charId]: false }));
    }
  };
  const delDiaryEntry = (charId, entryId) => setDiaries(p => {
    const n = { ...p, [charId]: (p[charId] || []).filter(e => e.id !== entryId) };
    saveJSON("x_diaries", n);
    return n;
  });
  const saveDiaryFields = (charId, fields) => pC(p => p.map(c => c.id === charId ? { ...c, ...fields } : c));
  // 用户自己写日记（存 x_diaries["__me"]），时间/天气/城市由 compose 组件抓本地后传进来
  const addMyDiaryEntry = data => {
    const paras = (data.body || "").split(/\n+/).map(s => s.trim()).filter(Boolean).map(text => ({ text, secret: false }));
    if (!paras.length) { toast("写点什么再保存"); return null; }
    const entry = {
      id: "d_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      ts: Date.now(),
      no: Math.floor(Math.random() * 9000) + 1000,
      title: (data.title || "").trim(),
      location: data.location || "", coords: data.coords || null, weather: data.weather || "",
      timeStr: data.timeStr || "", paras, comments: [], source: "me"
    };
    setDiaries(p => {
      const n = { ...p, __me: [entry, ...(p.__me || [])] };
      saveJSON("x_diaries", n);
      return n;
    });
    return entry.id;
  };
  // 让选中的角色给「我的某篇日记」评论：按实时心情+关系/好感度，逐个生成，不互评
  const genDiaryCommentsFor = async (entryId, charIds) => {
    if (!active) { toast("请先到设置配置 API"); return; }
    const entry = (diariesRef.current.__me || []).find(e => e.id === entryId);
    if (!entry) return;
    const entryText = (entry.title ? entry.title + "\n" : "") + (entry.paras || []).map(p => p.text).join("\n");
    setDiaryCommenting(entryId);
    try {
      for (const cid of charIds) {
        const char = characters.find(c => c.id === cid);
        if (!char) continue;
        const mood = moods[cid];
        const ctx = { ...ctxFor(char), moodLabel: mood && (mood.label || mood) || null };
        let text;
        try { text = await generateDiaryComment(active, ctx, entryText); } catch (e) { toast(char.name + " 评论失败"); continue; }
        if (!text) continue;
        const comment = { id: "cm_" + Date.now() + "_" + cid, charId: cid, name: char.name, text, ts: Date.now() };
        setDiaries(p => {
          const arr = (p.__me || []).map(e => e.id === entryId ? { ...e, comments: [...(e.comments || []), comment] } : e);
          const n = { ...p, __me: arr };
          saveJSON("x_diaries", n);
          return n;
        });
      }
    } finally {
      setDiaryCommenting(null);
    }
  };
  // 打开日记 app 时：给还没写【昨天】日记的角色补上（每个角色一次 API，顺序执行避免并发轰炸）。
  // 相当于「每天刷新前一天的」——当时不在线也没关系，下次进来自动补齐；一天一篇，写过就跳过。
  const autoDiaryRun = async () => {
    if (diaryRunRef.current) return;
    diaryRunRef.current = true;
    if (!active) return;
    const targetTs = diaryTargetTs();
    for (const c of characters) {
      if (diaryWroteFor(c.id, targetTs)) continue;
      await genDiary(c.id, { manual: false });
    }
  };
  useEffect(() => {
    if (screen === "diary") autoDiaryRun();
    else diaryRunRef.current = false; // 离开后下次再进重新判定
  }, [screen]);
  // #5 论坛/朋友圈/悄悄话「刷不出来」：打开对应屏时自动补一条（4h 冷却，既首访即有内容、又不每次进都轰 API）
  const ambientRunRef = useRef({});
  const autoAmbientRun = async kind => {
    if (!active || ambientRunRef.current[kind]) return;
    ambientRunRef.current[kind] = true;
    const ts = loadJSON("x_ambientTs", {});
    if (Date.now() - (ts[kind] || 0) < 4 * 3600000) return;
    ts[kind] = Date.now(); saveJSON("x_ambientTs", ts);
    try {
      if (kind === "forum") { const bs = ["吐槽", "日常", "求助"]; await genForumBoard(bs[Math.floor(Math.random() * bs.length)]); }
      else if (kind === "moments") { if (characters.length) await genMoment(characters[Math.floor(Math.random() * characters.length)]); }
      else if (kind === "whisper") { const ps = characters.filter(c => couples[c.id] && couples[c.id].status === "together"); if (ps.length) await genWhisper(ps[Math.floor(Math.random() * ps.length)]); }
    } catch (e) {/* 静默 */}
  };
  // ---- 角色动态：主屏红点通知 + 保底触发 ----
  const notifyApp = key => setAppNotif(p => { const n = { ...p, [key]: (p[key] || 0) + 1 }; appNotifRef.current = n; saveJSON("x_appNotif", n); return n; });
  const clearAppNotif = key => setAppNotif(p => { if (!p[key]) return p; const n = { ...p, [key]: 0 }; appNotifRef.current = n; saveJSON("x_appNotif", n); return n; });
  const autoForumForChar = async char => {
    if (!active || (forumOffRef.current || []).includes(char.id)) return;
    try {
      // 调出「距上次发帖之后」和用户的往来当素材；没有就让 TA 按人设编一件贴合的小事
      const lastForumTs = (ambientCountRef.current[char.id] || {}).lastForumTs || 0;
      const sinceChat = (chatsRef.current[char.id] || [])
        .filter(m => !m.recalled && m.kind !== "ooc" && m.kind !== "system" && m.content && (m.ts || 0) > lastForumTs)
        .slice(-12).map(m => (m.role === "user" ? (profile.name || "用户") : char.name) + "：" + m.content).join("\n");
      const d = await runProbe(active, ctxFor(char), {
        instruction: "以「" + char.name + "」的身份去论坛随手发一个帖（吐槽/日常/求助 三选一）。内容写你**最近（上次发帖之后）真实发生或萦绕心头的事**——今天行程里的事、最近和用户聊到/经历的、心情起伏都行；实在没有值得说的，就按你的人设编一件贴合的小事。像真人发帖，别客服腔、别报流水账。" + (sinceChat ? "\n\n【你和用户最近的往来（可当素材，别照抄原话）】\n" + sinceChat : ""),
        schemaHint: "{\"board\":\"吐槽/日常/求助 之一\",\"title\":\"标题\",\"body\":\"正文2-4句\"}"
      });
      // 模型可能回「吐槽」也可能回「吐槽吧」，统一归到四版块的正式名（否则帖子 board 不在 FORUM_BOARDS，版块/关注页都筛不到）
      const bmap = { "吐槽": "吐槽吧", "日常": "日常吧", "求助": "求助吧" };
      const board = bmap[String((d && d.board) || "").replace(/吧$/, "")] || "日常吧";
      if (d && d.title) { postCharToForum(char, board, { title: String(d.title), body: String(d.body || "") }, "auto"); notifyApp("forum"); toast(char.name + " 在论坛发了帖"); }
    } catch (e) {}
  };
  const forceAmbient = async (char, type) => {
    try {
      if (type === "moment") { await genMoment(char); notifyApp("moments"); toast(char.name + " 发了条朋友圈"); }
      else if (type === "whisper") { await genWhisper(char); notifyApp("whisper"); toast(char.name + " 给你留了句悄悄话"); }
      else if (type === "forum") { await autoForumForChar(char); }
    } catch (e) {}
  };
  // 每轮私聊回复后调用：三类动态计数 + 到阈值强制发一条（posted=这条回复已自发的类型，就不重复强制）
  const tickAmbient = (charId, posted) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    posted = posted || {};
    const isCouple = couples[charId] && couples[charId].status === "together";
    const cur = ambientCountRef.current[charId] || { moment: 0, whisper: 0, forum: 0, lastForumTs: Date.now() };
    const n = {
      moment: posted.moment ? 0 : (cur.moment || 0) + 1,
      whisper: posted.whisper ? 0 : (cur.whisper || 0) + 1,
      forum: posted.forum ? 0 : (cur.forum || 0) + 1,
      lastForumTs: posted.forum ? Date.now() : (cur.lastForumTs || Date.now())
    };
    const due = [];
    if (isCouple && n.whisper >= 15) due.push("whisper");
    if (n.moment >= 30) due.push("moment");
    if ((n.forum >= 50 || Date.now() - (n.lastForumTs || Date.now()) >= 3 * 86400000) && !(forumOffRef.current || []).includes(charId)) due.push("forum");
    due.forEach(k => { if (k === "whisper") n.whisper = 0; else if (k === "moment") n.moment = 0; else { n.forum = 0; n.lastForumTs = Date.now(); } });
    const np = { ...ambientCountRef.current, [charId]: n };
    ambientCountRef.current = np; setAmbientCount(np); saveJSON("x_ambientCount", np);
    due.forEach(k => forceAmbient(char, k));
  };
  useEffect(() => {
    if (screen === "forum") { autoAmbientRun("forum"); clearAppNotif("forum"); } else ambientRunRef.current.forum = false;
    if (screen === "us") { autoAmbientRun("whisper"); clearAppNotif("whisper"); } else ambientRunRef.current.whisper = false;
    if (screen === "messages") { autoAmbientRun("moments"); clearAppNotif("moments"); } else ambientRunRef.current.moments = false;
  }, [screen]);
  // 打开 app 当天第一次就给所有人生成今日行程（每天一次）
  useEffect(() => {
    if (active && characters.length) schedGenAllToday();
  }, [active, characters.length]);

  // ---- 查手机：每个 app 独立生成/刷新 ----
  const relatedNames = char => {
    const set = new Set();
    for (const o of characters) {
      if (o.id === char.id) continue;
      if (rels[char.id + "->" + o.id] || rels[o.id + "->" + char.id]) set.add(o.name);
    }
    return [...set];
  };
  const phoneKeyLabel = key => PHONE_LABEL[key] || (key === "video_day" ? "白天视频" : key === "video_night" ? "深夜视频" : key);
  const savePhoneApp = (charId, key, d) => {
    setPhones(p => {
      const cur = p[charId] || {};
      const entry = {
        ...d,
        _at: Date.now()
      };
      if (key === "wallet") { entry._startDate = ymd(new Date()); entry.extra = (cur.wallet && Number(cur.wallet.extra)) || 0; } // 记账起点；保留转账等外部收支
      const n = {
        ...p,
        [charId]: {
          ...cur,
          [key]: entry
        }
      };
      saveJSON("x_phone", n);
      return n;
    });
  };
  // 调整角色钱包余额（改 wallet.baseBalance，用于转账）
  // 改我的钱包并记一条流水（delta 正=进账/负=支出）
  const changeWallet = (delta, label, kind) => {
    const d = Math.round(Number(delta) * 100) / 100;
    if (!d) return;
    setWallet(w => {
      const n = Math.round((w + d) * 100) / 100;
      saveJSON("x_wallet", n);
      setWalletLog(log => {
        const entry = { id: "wl_" + Date.now() + "_" + Math.floor(Math.random() * 1000), ts: Date.now(), delta: d, after: n, label: label || (d > 0 ? "进账" : "支出"), kind: kind || "misc" };
        const nl = [entry, ...log];
        saveJSON("x_walletLog", nl);
        return nl;
      });
      return n;
    });
  };
  // 手动改余额到指定值（记一条调整流水）
  const setWalletTo = target => {
    const tv = Math.round(Number(target) * 100) / 100;
    if (isNaN(tv)) return;
    changeWallet(tv - wallet, "手动调整余额", "manual");
  };
  const CHAR_DEFAULT_BAL = 6000; // 角色未生成钱包档案时的默认余额（转账/代付/亲属卡扣款用）
  // 宽松解析金额：模型可能给 "¥38,400"、"3.8万"、字符串等 → 都抠成数字
  const numClean = v => {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v == null ? "" : v).replace(/[,，\s¥￥$元]/g, "");
    let mult = 1;
    if (/万/.test(s)) { mult = 10000; s = s.replace(/万/g, ""); }
    if (/k/i.test(s)) { mult = 1000; s = s.replace(/k/ig, ""); }
    const n = parseFloat((s.match(/-?\d+(\.\d+)?/) || [])[0]);
    return isFinite(n) ? n * mult : 0;
  };
  const r2 = n => Math.round(Number(n) * 100) / 100;
  const charBalanceOf = id => {
    const w = charWalletRef.current[id];
    return w && w.balance != null ? Number(w.balance) : CHAR_DEFAULT_BAL;
  };
  // 改角色钱包余额并记一条流水（delta 正=进账 负=支出）。钱包没生成过也会隐式建档（余额从默认起算），首次点进钱包 app 会正式生成资产档案并 rebase。
  const adjustCharBalance = (charId, delta, label, kind) => {
    const d = r2(delta);
    if (!d) return;
    setCharWallet(p => {
      const cur = p[charId] || { init: false, balance: CHAR_DEFAULT_BAL, ledger: [], createdTs: Date.now() };
      const base = cur.balance != null ? Number(cur.balance) : CHAR_DEFAULT_BAL;
      const bal = r2(base + d);
      const entry = { id: "cw_" + Date.now() + "_" + Math.floor(Math.random() * 1000), ts: Date.now(), delta: d, after: bal, label: label || (d > 0 ? "进账" : "支出"), kind: kind || "transfer" };
      const n = { ...p, [charId]: { ...cur, balance: bal, ledger: [entry, ...(cur.ledger || [])] } };
      saveJSON("x_charWallet", n);
      charWalletRef.current = n;
      return n;
    });
  };
  // 手动把角色余额改成指定值（记一条调整流水）
  const setCharWalletTo = (charId, target) => {
    const tv = r2(target);
    if (isNaN(tv)) return;
    adjustCharBalance(charId, tv - charBalanceOf(charId), "手动调整余额", "manual");
  };
  // 生成/推演角色财务档案（首开与刷新共用），返回 prof 或 null
  const genWalletProfile = async char => {
    if (!active) return null;
    try {
      return await runProbe(bgActive, ctxFor(char), {
        instruction: "推演「" + char.name + "」的财务档案。**收入来源与全部金额必须严格依据 TA 的人设、职业、身份和社会阶层来定，贴合 TA 真实的谋生方式。** incomes（1-3 项，name+category+amount 数字，category 从 TA 实际谋生方式来：工资/自由职业/接单/做生意/兼职/学生生活费/退休金/稿费/打赏 等；只有明确富家子弟/继承人/家境优渥时才可出现「家族供养/信托」，否则绝不默认套用家族收入，普通人就普通收入甚至拮据）；monthlyIncome 月收入合计；fixedMonthly 每月固定支出；baseBalance 当前存款余额（作为钱包初始余额）；investAssets 理财持有资产（普通人可能很少或为 0）；notes 各部分批注（income/savings/invest/spending，每条一句符合人设的旁白）。所有金额纯数字不带符号，务必与身份匹配、不要人人都很有钱。**【币种铁律】这是微信钱包，全部金额一律用【人民币】计价，就算 TA 在国外留学/工作/生活也照人民币的量级来（普通留学生月生活费/打工收入换算成人民币通常几千，别写成几十万那种日元/韩元量级的数字）——当作全世界都用微信、一切都以人民币结算。**",
        schemaHint: "{\"incomes\":[{\"name\":\"公司月薪\",\"category\":\"工资\",\"amount\":11000}],\"monthlyIncome\":11000,\"fixedMonthly\":6800,\"baseBalance\":38400,\"investAssets\":15000,\"notes\":{\"income\":\"...\",\"savings\":\"...\",\"invest\":\"...\",\"spending\":\"...\"}}",
        // notes(4段批注)在 JSON 最后，思考型模型截断先丢它→放宽 token 防「刷新后批注没了」
        maxTokens: 4000
      });
    } catch (e) {
      toast(char.name + " 资产生成失败：" + e.message);
      return null;
    }
  };
  // 首次点进某角色的钱包：生成资产档案，把初始存款设为 running balance 起点（已有转账流水会 rebase 到新起点上）
  const initCharWallet = async char => {
    const ex = charWalletRef.current[char.id];
    if (ex && ex.init) return true;
    setGen(g => ({ ...g, cwallet: char.id }));
    try {
      let prof = await genWalletProfile(char);
      let base = prof ? numClean(prof.baseBalance) : 0;
      // 没抠出存款（解析失败/被截断）→ 再试一次，别让仨角色都掉到默认 6000
      if (!base) { const prof2 = await genWalletProfile(char); if (prof2 && numClean(prof2.baseBalance)) { prof = prof2; base = numClean(prof2.baseBalance); } }
      // 还是没有：从月收入推一个（几个月存款），实在没有才用带随机的默认（避免人人 6000 整）
      if (!base) { const mi = prof ? numClean(prof.monthlyIncome) : 0; base = mi ? Math.round(mi * (1.5 + Math.random() * 3)) : CHAR_DEFAULT_BAL + Math.floor(Math.random() * 9000); }
      setCharWallet(p => {
        const cur = p[char.id] || { ledger: [], createdTs: Date.now() };
        const prior = (cur.ledger || []).filter(e => e.kind !== "init"); // 首开前已发生的转账等
        const initEntry = { id: "cw_init_" + Date.now(), ts: cur.createdTs || Date.now(), delta: base, after: base, label: "初始资产 · 存款", kind: "init" };
        // reflow：oldest→newest 重算 after，让 running balance 从初始存款开始一致
        const asc = [initEntry, ...prior.slice().reverse()];
        let bal = 0;
        const reflow = asc.map(e => { bal = r2(bal + e.delta); return { ...e, after: bal }; });
        const n = { ...p, [char.id]: {
          init: true,
          balance: bal,
          incomes: ((prof && prof.incomes) || []).map(x => ({ ...x, amount: numClean(x.amount) })),
          monthlyIncome: prof ? numClean(prof.monthlyIncome) : 0,
          fixedMonthly: prof ? numClean(prof.fixedMonthly) : 0,
          investAssets: prof ? numClean(prof.investAssets) : 0,
          notes: (prof && prof.notes) || {},
          ledger: reflow.reverse(),
          // 设成前一天，这样初始化当天的日常消费也会被 catchUp 补上（否则设立那天永远空白）
          lastDailyKey: schedDayKey((function () { const d = new Date(); d.setDate(d.getDate() - 1); return d; })()),
          createdTs: cur.createdTs || Date.now()
        } };
        saveJSON("x_charWallet", n);
        charWalletRef.current = n;
        return n;
      });
      return true;
    } finally {
      setGen(g => ({ ...g, cwallet: null }));
    }
  };
  // 重新生成资产档案：收入/固定支出/理财/批注全部重推，并把存款（baseBalance）也重新推演——
  // 之前只更新静态档案、不动余额，所以「刷新」看起来资产没完全变。这里连初始存款一起重置，
  // 把已发生的转账等流水 rebase 到新的初始存款上（保留流水，只换起点）。
  const refreshCharAssets = async char => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, cwallet: char.id }));
    try {
      let prof = await genWalletProfile(char);
      if (!prof) return;
      let base = numClean(prof.baseBalance);
      if (!base) { const prof2 = await genWalletProfile(char); if (prof2 && numClean(prof2.baseBalance)) { prof = prof2; base = numClean(prof2.baseBalance); } }
      if (!base) { const mi = numClean(prof.monthlyIncome); base = mi ? Math.round(mi * (1.5 + Math.random() * 3)) : CHAR_DEFAULT_BAL + Math.floor(Math.random() * 9000); }
      setCharWallet(p => {
        const cur = p[char.id]; if (!cur) return p;
        const prior = (cur.ledger || []).filter(e => e.kind !== "init"); // 保留转账等已发生流水
        const initEntry = { id: "cw_init_" + Date.now(), ts: cur.createdTs || Date.now(), delta: base, after: base, label: "初始资产 · 存款", kind: "init" };
        const asc = [initEntry, ...prior.slice().reverse()];
        let bal = 0;
        const reflow = asc.map(e => { bal = r2(bal + e.delta); return { ...e, after: bal }; });
        // 刷新时：新生成为空（截断/没给）就保留原来的，别用空覆盖掉好的批注/收入
        const newIncomes = (prof.incomes && prof.incomes.length) ? prof.incomes.map(x => ({ ...x, amount: numClean(x.amount) })) : (cur.incomes || []);
        const newNotes = (prof.notes && Object.keys(prof.notes).length) ? prof.notes : (cur.notes || {});
        const n = { ...p, [char.id]: { ...cur,
          balance: bal,
          incomes: newIncomes,
          monthlyIncome: numClean(prof.monthlyIncome) || cur.monthlyIncome || 0,
          fixedMonthly: numClean(prof.fixedMonthly) || cur.fixedMonthly || 0,
          investAssets: numClean(prof.investAssets) || cur.investAssets || 0,
          notes: newNotes,
          ledger: reflow.reverse()
        } };
        saveJSON("x_charWallet", n);
        charWalletRef.current = n;
        return n;
      });
      toast("已重新生成 " + char.name + " 的资产档案");
    } finally {
      setGen(g => ({ ...g, cwallet: null }));
    }
  };
  // 生成某天的日常消费（按当天日程），无 API/失败则用固定支出估算兜底
  const genDailySpend = async (char, dayKey, rec) => {
    const plan = (schedulesRef.current[char.id] || {})[dayKey];
    const schedText = plan && Array.isArray(plan.seqs) ? plan.seqs.map(s => (s.time || "") + " " + s.title + (s.location ? "（" + s.location + "）" : "")).join("；") : "";
    const fallback = () => {
      const est = Math.max(8, Math.round(((Number(rec.fixedMonthly) || 1800) / 30) * (0.5 + Math.random())));
      return { items: schedText ? "当日日常开销" : "日常开销", amount: est };
    };
    if (!active) return fallback();
    try {
      const dp = schedDateParts(dayKey);
      const d = await runProbe(active, ctxFor(char), {
        instruction: "推演「" + char.name + "」在 " + dp.md + "（" + dp.dowZh + "）这一天的【日常消费】。" + (schedText ? "这天 TA 的行程是：" + schedText + "。根据这些活动（吃饭/交通/买东西/娱乐/日用等）推算 TA 这天实际花了哪些钱。" : "根据 TA 的人设与生活水平推算这天的日常花销。") + " 给 items（一句话概括这天买了啥/花在哪，如「地铁+便利店午饭+咖啡」）和 amount（这天总花销，纯数字，贴合 TA 的收入与消费习惯，普通日子别太夸张，也可能是几乎没花钱的一天）。",
        schemaHint: "{\"items\":\"地铁+午饭+咖啡\",\"amount\":86}",
        maxTokens: 400
      });
      const amt = Number(d.amount);
      if (!isFinite(amt) || amt < 0) return fallback();
      return { items: String(d.items || "日常开销").slice(0, 40), amount: Math.abs(amt) };
    } catch (e) {
      return fallback();
    }
  };
  // 应用某一天：当天日常消费 + 若是 1 号则月度收支
  const applyWalletDay = async (char, dayKey) => {
    const rec = charWalletRef.current[char.id];
    if (!rec || !rec.init) return;
    const spend = await genDailySpend(char, dayKey, rec);
    const parts = schedParseKey(dayKey);
    const isFirst = parts.getDate() === 1;
    const dayTs = new Date(parts); dayTs.setHours(23, 0, 0, 0);
    const mk = (delta, label, kind, ts, after) => ({ id: "cw_" + ts + "_" + Math.floor(Math.random() * 1000), ts, delta, after, label, kind });
    setCharWallet(p => {
      const cur = p[char.id]; if (!cur) return p;
      let bal = Number(cur.balance) || 0;
      const chron = []; // 按时间顺序（老→新）
      if (isFirst) {
        const inc = r2((Number(cur.monthlyIncome) || 0) - (Number(cur.fixedMonthly) || 0));
        if (inc) { bal = r2(bal + inc); chron.push(mk(inc, "月度收支 · 工资到账 − 固定支出", "monthly", dayTs.getTime() - 1000, bal)); }
      }
      if (spend && spend.amount) { bal = r2(bal - Math.abs(spend.amount)); chron.push(mk(-Math.abs(spend.amount), "日常消费 · " + spend.items, "daily", dayTs.getTime(), bal)); }
      const n = { ...p, [char.id]: { ...cur, balance: bal, lastDailyKey: dayKey, ledger: [...chron.reverse(), ...(cur.ledger || [])] } };
      saveJSON("x_charWallet", n);
      charWalletRef.current = n;
      return n;
    });
  };
  // 补账：把 lastDailyKey 之后、到「今天23点已过则含今天否则到昨天」之间漏掉的每天日常消费补上（最多补 14 天）
  const catchUpWallet = async char => {
    const rec = charWalletRef.current[char.id];
    if (!rec || !rec.init) return;
    const now = new Date();
    // 补到今天（含今天）——每天的日常消费当天就结算显示，不再等到 23 点后
    const cutoffKey = schedDayKey(now);
    const lastKey = rec.lastDailyKey || schedDayKey(now);
    if (lastKey >= cutoffKey) return;
    const cursor = schedParseKey(lastKey);
    const stop = schedParseKey(cutoffKey);
    let guard = 0;
    while (cursor < stop && guard < 14) {
      cursor.setDate(cursor.getDate() + 1);
      guard++;
      await applyWalletDay(char, schedDayKey(cursor));
    }
  };
  // 转账：联动我的钱包和角色钱包，并在聊天里留一条转账消息
  // 我转给 TA：入队一张待处理转账卡，钱在 TA 接受后才动
  const sendTransfer = (charId, amount, note) => {
    const a = Math.round(Number(amount) * 100) / 100;
    if (a <= 0) return;
    if (wallet < a) {
      toast("余额不足");
      return;
    }
    const char = characters.find(c => c.id === charId);
    const tid = "tf_" + Date.now();
    pChat(charId, p => [...p, {
      role: "user",
      kind: "transfer",
      tid: tid,
      dir: "toChar",
      amount: a,
      note: note || "",
      status: "pending",
      content: "[转账] 你向 " + char.name + " 转了 ¥" + a + (note ? "（" + note + "）" : ""),
      ts: Date.now(),
      read: false
    }]);
    toast("转账已发出，等 TA 接受");
    setTimeout(() => autoRespondTransfer(charId, tid), 1600);
  };
  // TA 转给我（AI 在回复里决定）：入队待处理卡，我接受才入账
  const postCharTransfer = (charId, amount, note) => {
    const a = Math.round(Number(amount) * 100) / 100;
    if (a <= 0) return;
    const char = characters.find(c => c.id === charId);
    pChat(charId, p => [...p, {
      role: "assistant",
      turnId: "tf_" + Date.now(),
      kind: "transfer",
      tid: "tfc_" + Date.now(),
      dir: "toMe",
      amount: a,
      note: note || "",
      status: "pending",
      content: "[转账] " + char.name + " 向你转了 ¥" + a + (note ? "（" + note + "）" : ""),
      ts: Date.now(),
      read: false
    }]);
  };
  // 结算：accept=接受入账；false=退回（只提示不动钱）
  const respondTransfer = (charId, tid, accept) => {
    const char = characters.find(c => c.id === charId);
    const card = (chatsRef.current[charId] || []).find(m => m.kind === "transfer" && m.tid === tid);
    if (!card || card.status !== "pending") return;
    if (accept) {
      if (card.dir === "toChar") {
        changeWallet(-card.amount, "转账给 " + (char ? char.name : "对方"), "transfer");
        adjustCharBalance(charId, card.amount, "收到你的转账" + (card.note ? "（" + card.note + "）" : ""), "transfer");
      } else {
        changeWallet(card.amount, (char ? char.name : "对方") + " 转账给你", "transfer");
        adjustCharBalance(charId, -card.amount, "转账给你" + (card.note ? "（" + card.note + "）" : ""), "transfer");
      }
    }
    pChat(charId, p => p.map(m => m.kind === "transfer" && m.tid === tid ? {
      ...m,
      status: accept ? "accepted" : "returned"
    } : m));
    const nm = char ? char.name : "对方";
    const line = accept
      ? (card.dir === "toChar" ? nm + " 领取了你的转账 ¥" + card.amount : "你领取了 " + nm + " 的转账 ¥" + card.amount)
      : (card.dir === "toChar" ? nm + " 退回了你的转账 ¥" + card.amount : "你退回了 " + nm + " 的转账 ¥" + card.amount);
    pChat(charId, p => [...p, { role: "system", kind: "system", content: line, ts: Date.now() }]);
  };
  const autoRespondTransfer = (charId, tid) => respondTransfer(charId, tid, Math.random() < 0.85);
  // ---- 群聊转账（我转给群里某个指定成员）----
  const sendGroupTransfer = (groupId, memberId, amount, note) => {
    const a = Math.round(Number(amount) * 100) / 100;
    if (a <= 0) return;
    if (!groupClosed(groupId) && wallet < a) {
      toast("余额不足");
      return;
    }
    const member = characters.find(c => c.id === memberId);
    const tid = "gtf_" + Date.now();
    pushGroupRich(groupId, {
      role: "user",
      kind: "transfer",
      tid: tid,
      dir: "toChar",
      toId: memberId,
      toName: member ? member.name : "",
      amount: a,
      note: note || "",
      status: "pending",
      content: "[转账] 你向 " + (member ? member.name : "成员") + " 转了 ¥" + a + (note ? "（" + note + "）" : "")
    });
    toast("转账已发出，等 TA 接受");
    setTimeout(() => respondGroupTransfer(groupId, tid, Math.random() < 0.85), 1600);
  };
  const respondGroupTransfer = (groupId, tid, accept) => {
    const gc = groupChatsRef.current[groupId] || [];
    const card = gc.find(m => m.kind === "transfer" && m.tid === tid);
    if (!card || card.status !== "pending") return;
    if (accept && !groupClosed(groupId)) {
      changeWallet(-card.amount, "群转账给 " + (card.toName || "成员"), "transfer");
      adjustCharBalance(card.toId, card.amount, "收到群转账", "transfer");
    }
    const nm = card.toName || "对方";
    pGChat(groupId, p => p.map(m => m.kind === "transfer" && m.tid === tid ? { ...m, status: accept ? "accepted" : "returned" } : m).concat([{
      role: "system",
      content: nm + (accept ? " 收下了你的转账" : " 退回了你的转账"),
      ts: Date.now()
    }]));
    toast(accept ? nm + " 收下了转账" : nm + " 退回了转账");
  };
  // ---- 通话 / 视频（私聊单人 或 群聊多人；发一句回一句，即时）----
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  const startCall = (participants, mode, groupId, caller) => {
    const people = (participants || []).filter(Boolean);
    if (!people.length) return;
    // caller="me"（用户拨的）或某 charId（该角色主动打来、用户接听）——用于在通话里告诉角色是谁打的，别搞反
    setCall({ participants: people, mode: mode || "voice", groupId: groupId || null, caller: caller || "me", msgs: [], startTs: Date.now() });
  };
  const callSend = async text => {
    const cur = callRef.current;
    if (!cur || !text || !text.trim()) return;
    if (laneBusy("call")) return;
    const um = { role: "user", content: text.trim() };
    const withUser = [...cur.msgs, um];
    setCall(c => c ? { ...c, msgs: withUser } : c);
    callRef.current = { ...cur, msgs: withUser };
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    startLane("call");
    try {
      const people = cur.participants;
      const isVideo = cur.mode === "video";
      const modeZh = isVideo ? "视频通话" : "语音通话";
      // 去掉模型偶尔加的「名字：」开头前缀
      const stripName = s => String(s || "").replace(/^\s*[^\s:：]{1,14}[:：]\s*/, "").trim();
      // 解析失败时，从（可能被截断的）原文里抠出 say 数组的字符串，绝不把生 JSON/```json 当气泡吐出来
      const sayFallback = raw => {
        const txt = String(raw || "");
        const seg = (txt.match(/"say"\s*:\s*\[([\s\S]*?)(\]|$)/) || [])[1] || txt;
        let arr = (seg.match(/"((?:[^"\\]|\\.)*)"/g) || []).map(s => s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, " ")).map(stripName).filter(Boolean);
        if (!arr.length) { const t = stripName(txt.replace(/```(?:json)?/gi, "").replace(/["{}\[\]]/g, "").replace(/\bsay\b\s*:?/gi, "").replace(/\baction\b\s*:?/gi, "").trim()); if (t) arr = [t]; }
        return arr;
      };
      const pushMsg = line => setCall(c => c ? { ...c, msgs: [...c.msgs, line] } : c);
      const uName = profile.name || "用户";
      const callerIsChar = cur.caller && cur.caller !== "me"; // 角色主动打来、用户接的
      const callerName = callerIsChar ? ((people.find(p => p.id === cur.caller) || {}).name || "") : "";
      if (people.length <= 1) {
        // 1:1：口语化对话，可一次多说几句把话说完；视频另给动作/神态
        const char = people[0];
        const hist = withUser.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
        const whoCalled = callerIsChar ? "【谁打的这通电话】是【你】主动拨给 " + uName + " 的、Ta 接起来了——是你想找 Ta，别搞反成 Ta 打给你、更别问 Ta『不是你打给我的吗』。" : "【谁打的这通电话】是 " + uName + " 打给你的、你接了。";
        const sys = buildBundle(ctxFor(char)) + "\n\n【当前场景：" + modeZh + "中】你正和" + uName + "打电话。" + whoCalled + "用口语化短句自然对话，像真的在通话。**你可以一次说好几句（多个气泡），把想说的一次说完，别说一半。**" + (isVideo ? " 因为是视频通话对方能看到你，**每次都必须额外给一句此刻的动作/神态描写 action**（如 靠在沙发上笑、把镜头凑近、揉眼睛），不能省略。" : "") + "\n【输出】只输出 JSON：{\"say\":[\"气泡1\",\"气泡2\"]" + (isVideo ? ",\"action\":\"此刻动作神态一句(必填)\"" : "") + "}。say 里只放你说出口的话，不要加名字前缀、不要旁白、不要括号。";
        const raw = await callAI(active, sys, hist, { maxTokens: 2400 });
        const d = extractJSON(raw) || {};
        let says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
        says = says.map(stripName).filter(Boolean);
        if (!says.length) says = sayFallback(raw); // 解析失败也别吐生 JSON，正则抠出气泡
        if (isVideo && d.action) pushMsg({ role: "char", act: true, senderId: char.id, senderName: char.name, content: String(d.action).replace(/[（）()]/g, "").trim() });
        for (let i = 0; i < says.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 550));
          pushMsg({ role: "char", senderId: char.id, senderName: char.name, content: says[i] });
        }
      } else {
        // 群通话：多角色你一言我一语；视频每条可带 action
        const hist = withUser.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: (m.senderName ? m.senderName + "：" : "") + m.content }));
        const memberDesc = people.map(c => "【" + c.name + "】" + (c.persona || "").slice(0, 160)).join("\n\n");
        const relLines = people.map(c => directedRelationLines(c, rels, characters, profile)).join("\n");
        const cWorld = loreText(loreRef.current, { charIds: people.map(c => c.id), scope: "chat", text: hist.map(m => m.content).join("\n") });
        const sys = "这是一个多人" + modeZh + "，用户" + uName + "和以下角色都在通话里。角色们用口语化短句自然对话，会顺着彼此和用户的话接梗、插话、跑题，像真的多人语音那样。每个角色想多说几句就多给几条，把话说完。" + (callerIsChar && callerName ? "\n【谁发起的这通电话】是【" + callerName + "】主动拨给 " + uName + " 的、Ta 接了——" + callerName + " 清楚是自己打过去的，别搞反成 " + uName + " 打来的、别问『不是你打给我的吗』。" : "") + "\n\n【在场角色】\n" + memberDesc + "\n\n【角色间关系】\n" + relLines + (cWorld ? "\n\n【世界书】\n" + cWorld : "") + "\n\n【输出】只输出 JSON 数组，按发言先后：[{\"name\":\"角色名\",\"text\":\"这句话\"" + (isVideo ? ",\"action\":\"该角色此刻动作神态(视频可见,可选)\"" : "") + "}]，text 不要带名字前缀，一次 3~7 条，name 必须是在场角色之一。";
        const raw = await callAI(active, sys, hist, { maxTokens: 2400 });
        const arr = extractJSON(raw);
        if (Array.isArray(arr)) {
          for (let i = 0; i < arr.length; i++) {
            const spk = people.find(c => c.name === arr[i].name) || people[0];
            if (i > 0) await new Promise(r => setTimeout(r, 500));
            if (isVideo && arr[i].action) pushMsg({ role: "char", act: true, senderId: spk.id, senderName: spk.name, content: String(arr[i].action).replace(/[（）()]/g, "").trim() });
            pushMsg({ role: "char", senderId: spk.id, senderName: spk.name, content: stripName(arr[i].text) });
          }
        }
      }
    } catch (e) {
      toast("通话回复失败：" + (e.message || "重试"));
    } finally {
      endLane("call");
    }
  };
  const endCall = sec => {
    const cur = callRef.current;
    if (cur) {
      const s = Math.max(0, Math.round(Number(sec) || 0));
      const dur = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
      const label = (cur.mode === "video" ? "视频通话" : "语音通话") + " 已结束 · 时长 " + dur;
      const bubble = { role: "system", kind: "callend", callMode: cur.mode, dur: dur, content: label, ts: Date.now() };
      if (cur.groupId) pGChat(cur.groupId, p => [...p, bubble]);
      else if (cur.participants[0]) pChat(cur.participants[0].id, p => [...p, bubble]);
    }
    setCall(null);
  };
  // 随机坐标（位置 stamp 用）
  const makeCoords = () => {
    const lat = (Math.random() * 180 - 90).toFixed(4);
    const lng = (Math.random() * 360 - 180).toFixed(4);
    return Math.abs(lat) + "° " + (lat >= 0 ? "N" : "S") + ", " + Math.abs(lng) + "° " + (lng >= 0 ? "E" : "W");
  };
  // ---- 匿名箱 ----
  const pAnon = (charId, updater) => {
    setAnon(p => {
      const cur = p[charId] || {
        netname: "",
        bio: "",
        records: []
      };
      const n = {
        ...p,
        [charId]: updater(cur)
      };
      saveJSON("x_anon", n);
      return n;
    });
  };
  const delAnonRecord = (charId, ts) => pAnon(charId, cur => ({ ...cur, records: (cur.records || []).filter(r => r.ts !== ts) }));
  const openAnon = async char => {
    setAnonChar(char);
    if ((!anon[char.id] || !anon[char.id].netname) && active) {
      setAnonBusy(true);
      try {
        const d = await runProbe(active, ctxFor(char), {
          instruction: "为「" + char.name + "」设计 Ta 在匿名社交/树洞 App 上的马甲：符合性格的网名 netname、第一人称个人简介 bio（1-2 句，可与现实人设有反差），以及 Ta 会挑什么样的图作为主页背景的描述 bgDesc（一句画面感描述，如「深夜城市天台的霓虹倒影」「一只蜷着睡的橘猫」「褪色的旧船票特写」，贴合此刻心境）。",
          schemaHint: "{\"netname\":\"网名\",\"bio\":\"简介\",\"bgDesc\":\"主页背景图描述\"}"
        });
        pAnon(char.id, cur => ({
          ...cur,
          netname: d.netname || char.name,
          bio: d.bio || "",
          bgDesc: d.bgDesc || cur.bgDesc || ""
        }));
      } catch (e) {/* silent */} finally {
        setAnonBusy(false);
      }
    }
  };
  // 重新生成匿名马甲（网名+签名）：随此刻心情 / 角色成长变化
  const refreshAnonPersona = async char => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setAnonBusy(true);
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "重新为「" + char.name + "」设计 Ta【此刻】在匿名树洞的马甲：网名 netname、第一人称签名 bio（1-2 句），以及 Ta 此刻会挑什么样的图当主页背景的描述 bgDesc（一句画面感描述）。要贴合 Ta 此刻的心情与最近的经历/心境变化（char development）——心情或状态变了，网名、签名、背景图都随之改（可与现实人设反差、可中二/emo/洒脱，看当下）。给一套和以前不一样的新马甲。",
        schemaHint: "{\"netname\":\"网名\",\"bio\":\"签名\",\"bgDesc\":\"主页背景图描述\"}"
      });
      pAnon(char.id, cur => ({ ...cur, netname: d.netname || cur.netname || char.name, bio: d.bio || cur.bio || "", bgDesc: d.bgDesc || cur.bgDesc || "" }));
      toast("马甲已刷新");
    } catch (e) {
      toast("刷新失败：" + e.message);
    } finally {
      setAnonBusy(false);
    }
  };
  const genNetizenQ = async char => {
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    setAnonBusy(true);
    try {
      const nn = anon[char.id] && anon[char.id].netname || char.name;
      const d = await runProbe(active, ctxFor(char), {
        instruction: "有几个不同的匿名网友在树洞里向「" + char.name + "」（网名：" + nn + "）各提了一个问题。**务必一次生成正好 3-5 组（items 数组必须有 3 到 5 个元素，绝不能只给 1-2 组；宁可每组的问答都精简一点，也一定要凑齐至少 3 组）**：每组含这个网友的问题 question（好奇/八卦/深度/抬杠都行，风格各异）和「" + char.name + "」的回答 answer（符合人设与此刻心情，Ta 不知道对方是谁，别背教科书、别客服腔）。",
        schemaHint: "{\"items\":[{\"question\":\"问题\",\"answer\":\"回答\"},{\"question\":\"问题\",\"answer\":\"回答\"},{\"question\":\"问题\",\"answer\":\"回答\"}]}",
        maxTokens: 4200
      });
      let items = (d && Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : (d && d.question ? [d] : []))).filter(x => x && x.question);
      if (!items.length) throw new Error("没有生成内容");
      const base = Date.now();
      const recs = items.map((x, i) => ({ from: "netizen", q: x.question, a: x.answer || "", ts: base - i }));
      pAnon(char.id, cur => ({ ...cur, records: [...recs, ...(cur.records || [])] }));
    } catch (e) {
      toast("失败：" + e.message);
    } finally {
      setAnonBusy(false);
    }
  };
  const askAnon = async (char, q) => {
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    setAnonBusy(true);
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "有人匿名向「" + char.name + "」提问：「" + q + "」。Ta 不知道提问的其实是用户。以「" + char.name + "」身份真实作答 answer，符合人设。",
        schemaHint: "{\"answer\":\"回答\"}"
      });
      pAnon(char.id, cur => ({
        ...cur,
        records: [{
          from: "me",
          q,
          a: d.answer,
          ts: Date.now()
        }, ...(cur.records || [])]
      }));
    } catch (e) {
      toast("失败：" + e.message);
    } finally {
      setAnonBusy(false);
    }
  };
  const genPhoneApp = async (char, key) => {
    if (!active) {
      toast("请先到设置配置 API");
      return false;
    }
    setSelPhone(char.id);
    setGen(g => ({
      ...g,
      phoneApp: key
    }));
    try {
      const d = await runProbe(bgActive, { ...ctxFor(char), worldbook: loreFor(char, "subjects") }, phoneProbeSpec(key, char, relatedNames(char)));
      savePhoneApp(char.id, key, d);
      return true;
    } catch (e) {
      toast(phoneKeyLabel(key) + "生成失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({
        ...g,
        phoneApp: null
      }));
    }
  };
  const genPhoneAll = async char => {
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    setSelPhone(char.id);
    setGen(g => ({
      ...g,
      phoneApp: "__all__"
    }));
    // 视频拆成白天/深夜两次；其余按 app 生成
    const keys = PHONE_APPS.filter(a => !a.soon).reduce((acc, a) => acc.concat(a.key === "video" ? ["video_day", "video_night"] : [a.key]), []);
    let ok = 0;
    for (const key of keys) {
      try {
        const d = await runProbe(bgActive, { ...ctxFor(char), worldbook: loreFor(char, "subjects") }, phoneProbeSpec(key, char, relatedNames(char)));
        savePhoneApp(char.id, key, d);
        ok++;
      } catch (e) {/* 单个失败不中断其余 */}
    }
    setGen(g => ({
      ...g,
      phoneApp: null
    }));
    toast(ok === keys.length ? "已生成全部" : "完成 " + ok + "/" + keys.length + " 个，可单独重试");
  };

  // ---- moments ----
  const genMoment = async char => {
    setGen(g => ({
      ...g,
      moment: true
    }));
    try {
      const meName = profile.name || "我";
      const recentPosts = moments.filter(m => m.characterId === char.id).slice(0, 5).map(m => String(m.content || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const noRepeat = recentPosts.length
        ? "\n\n**【不许复读】TA 最近已经发过下面这些朋友圈，这一条【绝对不要】再写同一件事、同一种心情或雷同句式，换一件全新的事、一个新角度：**\n" + recentPosts.map((c, i) => (i + 1) + "、" + c.slice(0, 60)).join("\n")
        : "";
      const d = await runProbe(active, ctxFor(char), {
        instruction: "以「" + char.name + "」身份发一条朋友圈：心情/日常/感想，1-4句，有角色味道，不暴露隐藏剧情。**大约一半概率配一张图**——如果这条适合配图，就在 image 里写一句这张图的画面描述（如「窗台上的多肉，逆光」「深夜便利店的关东煮」），不配图就填 null。再生成认识的其他角色对这条的 0-3 条评论（评论者从关系网里挑）。**绝对不要替用户本人（" + meName + "）生成任何评论或回复——用户会自己去评论。**" + noRepeat,
        schemaHint: "{\"content\":\"朋友圈正文\",\"image\":\"配图描述或null\",\"comments\":[{\"author\":\"评论者名\",\"text\":\"评论\"}]}"
      });
      pMom(p => [{
        id: "m_" + Date.now(),
        characterId: char.id,
        content: d.content,
        image: d.image && String(d.image).toLowerCase() !== "null" ? String(d.image) : null,
        ts: Date.now(),
        liked: false,
        likeCount: 0,
        comments: (d.comments || []).filter(c => c && c.author && c.author !== meName && c.author !== "我" && c.author !== "用户")
      }, ...p]);
    } catch (e) {
      toast("失败：" + e.message);
    } finally {
      setGen(g => ({
        ...g,
        moment: false
      }));
    }
  };
  const likeMoment = id => pMom(p => p.map(m => m.id === id ? {
    ...m,
    liked: !m.liked,
    likeCount: (m.likeCount || 0) + (m.liked ? -1 : 1)
  } : m));
  const delMoment = id => pMom(p => p.filter(m => m.id !== id));
  // 朋友圈封面（me 或某角色）：存 x_momentsCover
  const setMomentCover = (key, uri) => setMomentsCover(p => { const n = { ...p, [key]: uri || "" }; saveJSON("x_momentsCover", n); return n; });
  const openMomProfile = (id, isMe) => { setMomTarget({ id, isMe: !!isMe }); setScreen("momprofile"); };
  const commentMoment = async (id, text) => {
    pMom(p => p.map(m => m.id === id ? {
      ...m,
      comments: [...(m.comments || []), {
        author: profile.name || "我",
        text
      }]
    } : m));
    const mom = moments.find(m => m.id === id);
    if (!active) return;
    const author = characters.find(c => c.id === (mom && mom.characterId));
    if (!author) return;
    // 候选回复者：发帖人 + 关系网里认识发帖人的其他角色（都可能插话）
    const others = characters.filter(c => c.id !== author.id && (rels[c.id + "->" + author.id] || rels[author.id + "->" + c.id]));
    const roster = [author, ...others.slice(0, 4)].map(c => c.remark || c.name);
    const meName = profile.name || "我";
    const fbAuthor = author.remark || author.name;
    // 兜底也别千篇一律的「看到啦」：贴着用户这条评论回一句短的
    const fallbackText = () => {
      const t = String(text || "").trim();
      const pool = [
        t ? "「" + (t.length > 12 ? t.slice(0, 12) + "…" : t) + "」——嗯，我看到了。" : "看到你评论啦。",
        "哈哈你这条我记下了。", "被你这么一说还真是。", "懂你意思，回头细说。", "谢啦，收到～"
      ];
      return pool[Math.floor(Math.random() * pool.length)];
    };
    try {
      const bundle = buildBundle(ctxFor(author));
      const system = bundle + "\n\n【场景】这是「" + author.name + "」发的朋友圈：「" + mom.content + "」。用户「" + meName + "」刚在下面评论了：「" + text + "」。可能回复的人（发帖人本人，或认识发帖人的共同好友都可能插话）：" + roster.join("、") + "。请生成他们对【用户这条评论「" + text + "」】的回复——**必须直接回应用户说的这句话的具体内容（像微信朋友圈里回复评论那样，接住 Ta 说的、有来有往），别答非所问、别自说自话。绝对不许用「看到啦」「收到」这种敷衍空话搪塞**；至少一条（保底），不一定是发帖人，谁最合适谁回，1-3 条，各自符合人设与关系，短句、有具体内容。\n只输出 JSON：{\"replies\":[{\"author\":\"回复者名\",\"text\":\"回复内容（直接回应用户那句的具体内容）\"}]}";
      const raw = await callAI(active, system, [{ role: "user", content: "针对用户评论「" + text + "」生成回复 JSON" }], { maxTokens: 900 });
      const d = extractJSON(raw) || {};
      // 容错解析：{replies:[...]} / 裸数组 / {reply} / {text}
      let reps = [];
      if (Array.isArray(d.replies)) reps = d.replies;
      else if (Array.isArray(d)) reps = d;
      else if (d.reply) reps = [typeof d.reply === "string" ? { author: fbAuthor, text: d.reply } : d.reply];
      else if (typeof d.text === "string") reps = [{ author: fbAuthor, text: d.text }];
      reps = reps.filter(r => r && r.text && String(r.text).trim() && String(r.text).toLowerCase() !== "null" && r.author !== meName && r.author !== "我" && r.author !== "用户");
      if (!reps.length) reps = [{ author: fbAuthor, text: fallbackText() }]; // 保底
      reps.forEach((r, i) => setTimeout(() => pMom(p => p.map(m => m.id === id ? { ...m, comments: [...(m.comments || []), { author: r.author, text: "回复 " + meName + "：" + r.text }] } : m)), 400 + i * 600));
    } catch (e) {
      setTimeout(() => pMom(p => p.map(m => m.id === id ? { ...m, comments: [...(m.comments || []), { author: fbAuthor, text: "回复 " + meName + "：" + fallbackText() }] } : m)), 400);
    }
  };
  // 我发一条朋友圈（可带图描述、可选可见范围）
  const postUserMoment = ({
    content,
    image,
    visibleTo
  }) => {
    const id = "m_" + Date.now();
    const mom = {
      id,
      mine: true,
      content,
      image: image || null,
      visibleTo: visibleTo || null,
      ts: Date.now(),
      liked: false,
      likeCount: 0,
      likers: [],
      comments: []
    };
    pMom(p => [mom, ...p]);
    reactToUserMoment(mom); // 自动生成点赞/评论
  };
  // 可见角色自动对我的朋友圈做真实反应：可能只赞/只评/已读不理/又赞又评，并会互相回复
  const reactToUserMoment = async mom => {
    if (!active) return;
    const canSee = mom.visibleTo && mom.visibleTo.length ? characters.filter(c => mom.visibleTo.includes(c.id)) : characters;
    if (!canSee.length) return;
    setGen(g => ({
      ...g,
      moment: true
    }));
    try {
      const meName = profile.name || "用户";
      const lines = canSee.map(c => {
        const aff = Math.round(affOf(c.id));
        const md = moods[c.id] && moods[c.id].label ? moods[c.id].label : "平静";
        const rel = rels[c.id + "->me"] ? rels[c.id + "->me"].label : "";
        return "- " + c.name + "：人设[" + String(c.persona || "").slice(0, 70) + "] 好感度" + aff + "/100 心情" + md + (rel ? " 对我关系[" + rel + "]" : "");
      }).join("\n");
      const system = "你在模拟朋友圈互动。「" + meName + "」发了一条朋友圈：「" + mom.content + "」" + (mom.image ? "（配图：" + mom.image + "）" : "") + "\n\n能看到的好友及其状态：\n" + lines + (worldbook && worldbook.trim() ? "\n\n【世界观】" + worldbook.slice(0, 400) : "") + "\n\n请根据每个人的性格、心情、好感度和这条内容，真实地决定 Ta 的反应：可能只点赞、只评论、又赞又评、或已读不理——不要所有人都反应，也不要千篇一律。**保底：至少要有一位好友留下评论互动（通常是好感度较高的那位），不要出现全部已读不理、无人评论的情况。**评论要符合各自人设与关系。有的人还会顺手回复别的好友的评论（replyTo 填被回复者名）。\n只输出 JSON：{\"reactions\":[{\"name\":\"名字\",\"liked\":true或false,\"comment\":\"评论或null\"}],\"replies\":[{\"name\":\"名字\",\"replyTo\":\"被回复的评论者\",\"text\":\"回复\"}]}";
      const raw = await callAI(active, system, [{
        role: "user",
        content: "开始"
      }], {
        // 900 太小：多个好友各评论+互相回复时 JSON 会被截断，导致最后的评论/回复缺半截。放宽 + 坏 JSON 修复兜底
        maxTokens: 3000
      });
      let d = extractJSON(raw);
      if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
      if (d) {
        const likers = (d.reactions || []).filter(r => r.liked).map(r => r.name);
        const comments = [];
        (d.reactions || []).forEach(r => {
          if (r.comment && String(r.comment).toLowerCase() !== "null") comments.push({
            author: r.name,
            text: r.comment
          });
        });
        // 保底：一个人都没互动时，让好感最高的可见角色至少点个赞
        if (!likers.length && !comments.length && canSee.length) {
          const top = canSee.slice().sort((a, b) => (affinities[b.id] || 50) - (affinities[a.id] || 50))[0];
          if (top) likers.push(top.name);
        }
        (d.replies || []).forEach(r => {
          if (r.text) comments.push({
            author: r.name,
            text: (r.replyTo ? "回复 " + r.replyTo + "：" : "") + r.text
          });
        });
        pMom(p => p.map(m => m.id === mom.id ? {
          ...m,
          likers: [...new Set([...(m.likers || []), ...likers])],
          likeCount: (m.likeCount || 0) + likers.length,
          comments: [...(m.comments || []), ...comments]
        } : m));
      }
    } catch (e) {/* silent */} finally {
      setGen(g => ({
        ...g,
        moment: false
      }));
    }
  };

  // ---- forum（仿贴吧）----
  // 帖子只有一份，躺在 forumPosts；版块页/关注页/角色主页都是对同一数组的筛选视图（见 FORUM_BOARDS）。
  // 刷新只 append，绝不覆盖已有帖。NPC 帖每版块有硬上限，角色帖永不清（authorType 区分）。
  const FORUM_NPC_CAP = 30;
  const forumBoardVoice = b => ({
    "吐槽吧": "「吐槽吧」：网友在这儿发牢骚、阴阳怪气、吐槽不爽。语气刻薄、损、带情绪、标题党，别正能量别说教。",
    "日常吧": "「日常吧」：网友分享兴趣、日常、和谁都无关的琐碎生活。语气松弛随意、有生活气，像随手一发。",
    "求助吧": "「求助吧」：网友来提问 / 求助，也有人认真回答。就事论事、具体、别空谈，标题多是疑问句。",
    "匿名吧": "「匿名吧」：不署名才敢说的话。真实、赤裸、卸下人设的一面，可以是秘密、软肋、见不得人的念头。别端着。"
  }[b] || "");
  // 随机互动数（赞/浏览/转发），据种子稳定生成，纯展示
  const forumCounts = (seed, replyCount) => { const hh = forumHash(seed); const rc = replyCount || (12 + hh % 480); return { replyCount: rc, likeCount: Math.floor(rc * (0.6 + (hh % 40) / 25)) + (hh % 40), viewCount: rc * (8 + hh % 90) + (hh % 600), rtCount: Math.floor(rc / (5 + hh % 14)) }; };
  // 角色贴吧资料（AI 生成一次存 forumCharMeta；没生成时用 charId 稳定兜底）
  // 兜底注册时间锚在固定过去点（不随 now 漂移，这样吧龄才会随真实时间增长）
  const FORUM_EPOCH = 1704067200000; // 2024-01-01
  const charForumMeta = c => { const m = (forumCharMetaRef.current[c.id]) || {}; const hh = forumHash(c.id); return { handle: m.handle || c.name, bio: m.bio != null ? m.bio : (c.motto || ""), joinTs: m.joinTs || (FORUM_EPOCH + (hh % 600) * 86400000), following: m.following != null ? m.following : (20 + hh % 380), followers: m.followers != null ? m.followers : (300 + (hh * 7) % 60000) }; };
  // 在逛论坛的角色（默认全部；被 forumOff 关掉的不算）
  const forumActiveChars = () => (characters || []).filter(c => !forumOffRef.current.includes(c.id));
  const forumCharList = () => forumActiveChars().map(c => "「" + c.name + "」（" + String(c.persona || "").slice(0, 36) + "）").join("；");
  const toggleForumChar = charId => setForumOff(prev => { const n = prev.includes(charId) ? prev.filter(x => x !== charId) : [...prev, charId]; saveJSON("x_forumOff", n); return n; });
  // NPC 主帖不绑定具体角色，用一个「论坛网友」合成 ctx（仍带世界书 + 去人机味总则）
  const forumWorldCtx = () => ({ char: { name: "论坛网友", persona: "你在推演这个世界里形形色色的普通网友，不是某个特定角色，风格各异。" }, chars: characters, rels, worldbook, profile, timeAware: prefs.timeAware });
  // runProbe 简单重试：单次结构化内容偶尔截断/解析失败，重试一次
  const runProbeRetry = async (p, ctx, probe) => { try { return await runProbe(p, ctx, probe); } catch (e) { return await runProbe(p, ctx, probe); } };
  // 写入帖子并对该版块做 NPC 硬上限清理（删最旧 NPC 帖，角色帖免疫）
  const appendForumPosts = (recs, board) => setForumPosts(prev => {
    let n = [...recs, ...prev];
    const npcInBoard = n.filter(x => x.board === board && x.authorType === "npc").sort((a, b) => b.ts - a.ts);
    if (npcInBoard.length > FORUM_NPC_CAP) {
      const kill = new Set(npcInBoard.slice(FORUM_NPC_CAP).map(x => x.id));
      n = n.filter(x => !kill.has(x.id));
    }
    saveJSON("x_forumPosts", n);
    return n;
  });
  // 版块刷新：生成 3-5 条 NPC 主帖（只主帖，不含评论——评论点进去才懒加载）
  const genForumBoard = async board => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, forum: board }));
    const anonB = board === "匿名吧";
    try {
      const d = await runProbeRetry(active, forumWorldCtx(), {
        instruction: forumBoardVoice(board) + " 生成 3-5 条不同网友刚发的新主帖（items 数组务必 3-5 条，别只给 1-2 条）。每条含 authorName（" + (anonB ? "匿名吧的中性马甲，如『匿名者』『三楼的猫』『id已隐藏』，别用真名" : "贴吧风格网名，风格各异") + "）、handle（一个和网名/说话风格搭的有趣英文或拼音短 id，别带 @ 符号）、title（标题）、body（楼主正文 2-4 句，贴合该吧语气）、replyCount（编一个几十到几千的回复数字，不必真实）。别所有帖一个腔调。",
        schemaHint: "{\"items\":[{\"authorName\":\"网名\",\"handle\":\"funny_id\",\"title\":\"标题\",\"body\":\"正文\",\"replyCount\":128}]}",
        maxTokens: 3400
      });
      let items = (d && Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : (d && d.title ? [d] : []))).filter(x => x && x.title);
      if (!items.length) throw new Error("没有生成内容");
      const base = Date.now();
      const recs = items.map((x, i) => ({
        id: "fp_" + base + "_" + i, authorId: "npc_" + base + "_" + i, authorType: "npc",
        authorName: x.authorName || "匿名网友", authorHandle: x.handle || x.authorName || "user",
        board, title: x.title, body: x.body || "",
        anon: anonB, triggerSource: "", ts: base - i,
        ...forumCounts((x.handle || x.title) + i, Number(x.replyCount))
      }));
      appendForumPosts(recs, board);
    } catch (e) { toast("刷新失败：" + e.message); }
    finally { setGen(g => ({ ...g, forum: null })); }
  };
  // 一条原始评论 → 楼层对象（回复者随机 NPC 或某个符合人设的角色，x.char=角色名则归到该角色）
  // post 传入时用于识别「楼主」：楼主不另开楼自问自答（顶楼命中→丢弃），楼主的追评正确署名+标记 isOp
  const buildForumFloor = (x, floorNo, base, idx, post) => {
    const opChar = post && post.authorType === "character" && !post.anon ? (characters || []).find(c => c.id === post.authorId) : null;
    const opName = opChar ? opChar.name : (post ? (post.authorName || "") : "");
    const looksOp = s => { s = String(s || "").trim().toLowerCase(); return s === "楼主" || s === "楼主本人" || s === "lz"; };
    const isOpOf = obj => obj.is_op === true || (opName && obj.char === opName) || looksOp(obj.char) || looksOp(obj.authorName);
    // 顶楼若是楼主本人（自问自答）→ 丢弃，让别的楼补位
    if (isOpOf(x)) return null;
    const cc = (characters || []).find(c => c.name === x.char);
    const meta = cc ? charForumMeta(cc) : null;
    return {
      id: "fc_" + base + "_" + idx,
      authorId: cc ? cc.id : ("npc_" + base + "_" + idx),
      authorType: cc ? "character" : "npc",
      authorName: cc ? cc.name : (x.authorName || "匿名网友"),
      authorHandle: cc ? meta.handle : (x.handle || x.authorName || "user"),
      floor: floorNo, content: x.content, ts: base + idx, likeCount: forumHash((x.content || "") + idx) % 300,
      replies: (Array.isArray(x.replies) ? x.replies : []).filter(r => r && r.content).map(r => {
        if (isOpOf(r)) {
          // 楼主本人回某条评论：正确署名（角色→真名，否则楼主网名），并打上「楼主」小标
          if (opChar) return { authorName: opChar.name, authorHandle: charForumMeta(opChar).handle, authorType: "character", authorId: opChar.id, content: r.content, isOp: true };
          return { authorName: opName || (post && post.authorName) || "楼主", authorHandle: (post && post.authorHandle) || opName || "lz", authorType: post && post.authorType === "me" ? "me" : "npc", authorId: post && post.authorType === "me" ? "me" : null, content: r.content, isOp: true };
        }
        const rc = (characters || []).find(c => c.name === r.char);
        return { authorName: rc ? rc.name : (r.authorName || "匿名网友"), authorHandle: rc ? charForumMeta(rc).handle : (r.handle || r.authorName || "user"), authorType: rc ? "character" : "npc", authorId: rc ? rc.id : null, content: r.content };
      })
    };
  };
  const forumCommentProbe = (post, n) => {
    const isSearch = /^搜索/.test(post.triggerSource || "");
    const opChar = post.authorType === "character" && !post.anon ? (characters || []).find(c => c.id === post.authorId) : null;
    const opName = opChar ? opChar.name : (post.authorType === "me" ? (forumMe.handle || profile.name || "我") : (post.authorName || "楼主"));
    // 逛论坛的角色池要排除楼主本人——楼主不会在自己帖下冒泡回复自己
    const poolChars = forumActiveChars().filter(c => !opChar || c.id !== opChar.id);
    const poolStr = poolChars.map(c => "「" + c.name + "」（" + String(c.persona || "").slice(0, 36) + "）").join("；");
    // 楼主规则：别自问自答、别把谁的名字写成「楼主」
    const opRule = "【楼主是" + (opChar ? "角色「" + opName + "」本人" : "网名「" + opName + "」") + "】楼里是【别人】来回复这个帖。"
      + (opChar ? "楼主「" + opName + "」**绝对不要在这里另开一楼回复自己、更不要自问自答（很不合理）**；除非是回复楼里某条具体评论，那种情况放进那条楼层的 replies 里、并把 is_op 设 true。" : "楼主一般不再单独开楼。")
      + " **任何一条楼层或追评的 authorName 都不许写成『楼主』『lz』这类词——路人各有自己的网名。**";
    const who = isSearch
      ? "**楼里全是路人网友**（每条给 authorName 网名马甲 + handle 有趣 id），**不要出现你认识的任何角色**——这是搜来的陌生话题吧，角色未必关心、也不该全知全能地冒出来。"
      : "**大多数楼是路人网友**（给 authorName 网名马甲 + handle 有趣 id）；只有当下面某个角色**此刻真的会关心这个话题**时，才偶尔（约 1/4 的楼）让 Ta 冒泡回帖或抬杠，符合人设与心情；**若没有角色会真正关心这个话题，就全用路人、别硬塞角色**（角色不是全知的，不该出现在 Ta 不关心的话题里）：" + (poolStr || "（暂无其他角色）") + "。若某楼是某角色发的，就在该楼填 char=角色名（不要再填 authorName）。";
    return {
      instruction: forumBoardVoice(post.board) + " " + opRule + " 帖子：标题「" + post.title + "」，正文「" + (post.body || "") + "」。楼下网友陆续回复。生成 " + n + " 楼回复（comments 数组务必凑满 " + n + " 条，宁可每条精简），贴合该吧语气、七嘴八舌别一个腔调。" + who + "部分楼可带 replies 楼中楼（1-3 条追评/接梗/对骂" + (isSearch ? "，也全是路人" : "，可以是路人或角色 char，或楼主回某条评论时 is_op=true") + "），大多数楼 replies 留空。",
      schemaHint: "{\"comments\":[{\"authorName\":\"网名\",\"handle\":\"id\",\"char\":\"（若是某角色发的填角色名，否则省略）\",\"content\":\"回复\",\"replies\":[{\"authorName\":\"网名\",\"char\":\"（角色名或省略）\",\"is_op\":false,\"content\":\"追评\"}]}]}",
      maxTokens: 5200
    };
  };
  // 评论懒加载：点进帖子若无缓存，生成 8-12 楼（含楼中楼），存缓存，再点不重复调 API
  const loadForumComments = async post => {
    if (forumCommentsRef.current[post.id]) return; // 已缓存
    if (!active) return;
    setGen(g => ({ ...g, forumC: post.id }));
    try {
      const d = await runProbeRetry(active, forumWorldCtx(), forumCommentProbe(post, "8-12"));
      let cs = (d && Array.isArray(d.comments) ? d.comments : (Array.isArray(d) ? d : [])).filter(x => x && x.content);
      if (!cs.length) cs = [{ authorName: "沙发", content: "（还没人接话）", replies: [] }];
      const base = Date.now();
      const list = cs.map((x, i) => buildForumFloor(x, i + 2, base, i, post)).filter(Boolean).map((f, i) => ({ ...f, floor: i + 2 }));
      setForumComments(prev => { const n = { ...prev, [post.id]: list }; saveJSON("x_forumComments", n); return n; });
    } catch (e) { toast("加载评论失败：" + e.message); }
    finally { setGen(g => ({ ...g, forumC: null })); }
  };
  // 更多回复：追加 5-8 楼（同样随机 NPC/角色），append 不覆盖
  const genMoreComments = async post => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, forumMore: post.id }));
    try {
      const d = await runProbeRetry(active, forumWorldCtx(), forumCommentProbe(post, "5-8"));
      let cs = (d && Array.isArray(d.comments) ? d.comments : (Array.isArray(d) ? d : [])).filter(x => x && x.content);
      if (!cs.length) throw new Error("没有更多");
      const base = Date.now();
      const start = (forumCommentsRef.current[post.id] || []).length + 2;
      const more = cs.map((x, i) => buildForumFloor(x, start + i, base, forumHash(post.id) % 9999 + i, post)).filter(Boolean).map((f, i) => ({ ...f, floor: start + i }));
      if (!more.length) throw new Error("没有更多");
      setForumComments(prev => { const n = { ...prev, [post.id]: [...(prev[post.id] || []), ...more] }; saveJSON("x_forumComments", n); return n; });
      bumpReplyBy(post.id, more.length);
    } catch (e) { toast(e.message); }
    finally { setGen(g => ({ ...g, forumMore: null })); }
  };
  // 角色发帖（可被未来「统一发布决策调度器」调用；本次也用于手动让某角色发帖）
  // 入参：角色、版块、内容对象 {title, body}。内部负责写 posts 表（authorType='character'）。
  const postCharToForum = (char, board, content, triggerSource) => {
    const anonB = board === "匿名吧";
    const base = Date.now();
    const rec = {
      id: "fp_" + base, authorId: char.id, authorType: "character",
      authorName: anonB ? (content.mask || "匿名者") : char.name,
      authorHandle: anonB ? (content.mask || "匿名者") : charForumMeta(char).handle,
      board, title: content.title, body: content.body || "",
      anon: anonB, triggerSource: triggerSource || "", ts: base,
      ...forumCounts(char.id + base, content.replyCount || (3 + forumHash(char.id) % 40))
    };
    setForumPosts(prev => { const n = [rec, ...prev]; saveJSON("x_forumPosts", n); return n; });
    return rec;
  };
  // 手动让某角色发一条帖（版块可选，默认按内容让 AI 自己归吧）
  const genCharForumPost = async (char, board) => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, forum: "char_" + char.id }));
    const anonB = board === "匿名吧";
    try {
      const d = await runProbeRetry(active, ctxFor(char), {
        instruction: "以「" + char.name + "」身份在贴吧「" + board + "」发一条帖（" + forumBoardVoice(board) + "）。内容和 Ta 最近的心情 / 对话 / 生活相关，但这是 Ta 不围着对方转的公开一面。" + (anonB ? "匿名吧不署真名，另给一个 Ta 会用的中性匿名马甲 mask。" : "") + " 给 title（标题）和 body（正文 2-4 句）。",
        schemaHint: anonB ? "{\"mask\":\"匿名马甲\",\"title\":\"标题\",\"body\":\"正文\"}" : "{\"title\":\"标题\",\"body\":\"正文\"}",
        maxTokens: 1200
      });
      if (!d || !d.title) throw new Error("没有生成内容");
      postCharToForum(char, board, { title: d.title, body: d.body, mask: d.mask }, "手动发帖");
      toast(char.name + " 发了一条到「" + board + "」");
    } catch (e) { toast("发帖失败：" + e.message); }
    finally { setGen(g => ({ ...g, forum: null })); }
  };
  const toggleForumFollow = charId => setForumFollows(prev => {
    const n = prev.includes(charId) ? prev.filter(x => x !== charId) : [...prev, charId];
    saveJSON("x_forumFollows", n);
    return n;
  });
  // 转发帖子到私聊：push 一张 forumshare 卡片，并触发角色反应。
  // 若这是【该角色本人】发在匿名吧的帖 → 让 Ta 按人设决定「承不承认是自己发的」。
  const forwardPostToChat = async (post, toChar) => {
    const isOwnAnon = post.anon && post.authorType === "character" && post.authorId === toChar.id;
    pChat(toChar.id, p => [...p, {
      role: "user", kind: "forumshare",
      post: { board: post.board, title: post.title, body: post.body, authorName: post.authorName, anon: !!post.anon },
      ts: Date.now(), read: false
    }]);
    toast("已转发给 " + (toChar.remark || toChar.name));
    if (!active) return;
    try {
      const react = await runProbe(active, ctxFor(toChar), {
        instruction: isOwnAnon
          ? "有人把贴吧「匿名吧」里的一条帖转发给你，问是不是你发的。这条帖【其实就是你自己匿名发的】：标题「" + post.title + "」，正文「" + (post.body || "") + "」。按你的人设决定要不要承认——爱面子/心虚/护着秘密的可能装傻、抵赖、转移话题；坦荡或想被戳穿的可能认。用你的口吻回应（1-3 句，可多气泡），别露出上帝视角。"
          : "有人把贴吧「" + post.board + "」的一条帖转发给你：标题「" + post.title + "」，正文「" + (post.body || "") + "」，作者显示为「" + post.authorName + "」。你只是被分享看到，按你的人设和此刻心情随口回应（1-3 句，可多气泡，可吐槽/共鸣/不感兴趣），这不是你发的。",
        schemaHint: "{\"say\":[\"气泡1\",\"气泡2\"]}",
        maxTokens: 900
      });
      const say = react && Array.isArray(react.say) ? react.say : (react && react.say ? [react.say] : []);
      if (say.length) pChat(toChar.id, p => [...p, ...say.map(s => ({ role: "assistant", content: String(s), ts: Date.now(), read: false }))]);
    } catch (e) {/* 转发卡已在，反应失败静默 */}
  };
  // 转发帖子到群聊：只 push 卡片（群反应可由用户点「让他们回复」触发）
  const forwardPostToGroup = (post, groupId) => {
    pGChat(groupId, p => [...p, {
      role: "user", kind: "forumshare", senderName: profile.name || "我",
      post: { board: post.board, title: post.title, body: post.body, authorName: post.authorName, anon: !!post.anon },
      ts: Date.now()
    }]);
    toast("已转发到群聊");
  };
  // ficshare 卡片的 content：让这篇文的 title/CP/作者/节选落进聊天历史，角色以后回看/重roll 才认得出是同一篇
  const ficShareContent = (s, note) => "[分享了一篇同人文]《" + s.title + "》｜CP：" + (s.cpText || "原创") + "｜作者：" + (s.author || "佚名") + (note ? "｜" + note : "") + (s.excerpt ? "｜开头：" + s.excerpt : "");
  // 转发同人文到私聊：push 一张 ficshare 卡片 + 角色随口读后感（Phase 2 才把新章 context 喂给角色）
  const forwardFicToChat = async (fic, toChar) => {
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const cpNames = (fic.cp || []).map(id => id === "me" ? (profile.name || "我") : (function () { const c = characters.find(x => x.id === id); return c ? c.name : null; })()).filter(Boolean);
    const share = { title: fic.title, author: fic.author || "佚名", tags: fic.tags || [], excerpt: String(excerpt).slice(0, 120), cpText: cpNames.length ? cpNames.join(" × ") : "原创" };
    // 元认知：这篇是不是以 TA 为主角写的；TA 认不认识文里配对的另一位
    const cpIds = fic.cp || [];
    const isStar = cpIds.indexOf(toChar.id) >= 0;
    pChat(toChar.id, p => [...p, { role: "user", kind: "ficshare", fic: share, content: ficShareContent(share, isStar ? "这篇是写你的" : ""), ts: Date.now(), read: false }]);
    toast("已转发给 " + (toChar.remark || toChar.name));
    if (!active) return;
    let instruction;
    if (isStar) {
      const partnerTok = cpIds.find(id => id !== toChar.id);
      let partnerDesc, partnerKnown = false;
      if (!partnerTok) {
        partnerDesc = "文里给你配对的另一位是个原创角色（一个你不认识的虚构人物）";
      } else if (partnerTok === "me") {
        partnerDesc = "文里给你配对的另一位，正是【此刻在跟你聊天的对方（" + (profile.name || "对方") + "）】——你当然认得，这篇写的就是你和 TA"; partnerKnown = true;
      } else {
        const pc = characters.find(c => c.id === partnerTok);
        const r1 = rels[toChar.id + "->" + partnerTok], r2 = rels[partnerTok + "->" + toChar.id];
        if (pc && (r1 || r2)) { partnerDesc = "文里给你配对的另一位是「" + pc.name + "」，你认识 TA（你俩的关系：" + ((r1 && r1.label) || (r2 && r2.label) || "相识") + "）"; partnerKnown = true; }
        else if (pc) { partnerDesc = "文里给你配对的另一位是「" + pc.name + "」——但【你根本不认识这个人】，你会纳闷一个陌生人凭什么被写来跟你凑成一对"; }
        else { partnerDesc = "文里给你配对的另一位你不认识"; }
      }
      instruction = "有人给你转发了一篇【以你（" + toChar.name + "）为主角写的同人文】——是读者站在旁观／上帝视角，把你当成小说人物来写的。篇名《" + share.title + "》，" + partnerDesc + "。开头节选「" + share.excerpt + "」。\n" +
        "关键：你【读到一篇写你自己的同人文】，要有那种被人偷看、被编排、被摆布的微妙自觉——可以惊讶、好笑、脸红、别扭、不爽、防备、或好奇 TA 们怎么会这么写你。按你的人设和此刻心情真实反应（1-3 句，可多气泡）。" +
        (partnerKnown ? "你认得文里配对的那位，可以就此调侃、否认、在意、或追问。" : "你不认识文里硬凑给你的那个人，可以吐槽『这谁啊』『凭什么跟我组CP』。") +
        "别复述全文、别客服腔、别装作不知道这是在写你。";
    } else {
      instruction = "有人把一篇同人文转发给你：篇名《" + share.title + "》，CP「" + share.cpText + "」，作者「" + share.author + "」，开头节选「" + share.excerpt + "」。这篇【不是写你的】，你只是被分享看到，按你的人设和此刻心情随口回应（1-3 句，可多气泡，可好奇/吐槽/共鸣/害羞/不感兴趣/追问），别客服腔、别复述全文。";
    }
    try {
      const react = await runProbe(active, ctxFor(toChar), { instruction: instruction, schemaHint: "{\"say\":[\"气泡1\",\"气泡2\"]}", maxTokens: 900 });
      const say = react && Array.isArray(react.say) ? react.say : (react && react.say ? [react.say] : []);
      if (say.length) pChat(toChar.id, p => [...p, ...say.map(s => ({ role: "assistant", content: String(s), ts: Date.now(), read: false }))]);
    } catch (e) {/* 卡已在，反应失败静默 */}
  };
  // 塔罗「给角色算一卦」转发给对应角色：把这一卦发进 Ta 的私聊，让 Ta 读后反应
  const forwardTarotToChat = async (session) => {
    const toChar = characters.find(c => c.id === session.charId);
    if (!toChar) { toast("找不到这个角色"); return; }
    const cardsTxt = (session.cards || []).map((c, i) => ((session.spread || [])[i] ? session.spread[i] + "：" : "") + c.name + (c.rev ? "（逆位）" : "（正位）")).join("；");
    const readTxt = (session.reads || []).map(r => (r.pos ? r.pos + "—" : "") + r.text).join("\n");
    const summary = session.summary || "";
    const shareText = "【塔罗 · 我替你算了一卦】\n" + cardsTxt + (summary ? "\n\n" + summary : "");
    pChat(toChar.id, p => [...p, { role: "user", content: shareText, ts: Date.now(), read: false }]);
    toast("已把这一卦转发给 " + (toChar.remark || toChar.name));
    if (!active) return;
    const instruction = "有人（用户）替你算了一卦塔罗，把结果发给你看了。抽到的牌与解读：\n牌：" + cardsTxt + "\n解读：\n" + readTxt + (summary ? "\n收束：" + summary : "") +
      "\n\n你【读到一份替你自己算的命卦】，按你的人设和此刻心情真实反应（信或不信、在意哪一句、被说中了还是嗤之以鼻、追问、或借机说点心里话都行，1-3 句可多气泡），别客服腔、别复述全文。";
    try {
      const react = await runProbe(active, ctxFor(toChar), { instruction: instruction, schemaHint: "{\"say\":[\"气泡1\",\"气泡2\"]}", maxTokens: 900 });
      const say = react && Array.isArray(react.say) ? react.say : (react && react.say ? [react.say] : []);
      if (say.length) pChat(toChar.id, p => [...p, ...say.map(s => ({ role: "assistant", content: String(s), ts: Date.now(), read: false }))]);
    } catch (e) {/* 卡已在，反应失败静默 */}
  };
  const forwardFicToGroup = (fic, group) => {
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const cpNames = (fic.cp || []).map(id => { const c = characters.find(x => x.id === id); return c ? c.name : null; }).filter(Boolean);
    const share = { title: fic.title, author: fic.author || "佚名", tags: fic.tags || [], excerpt: String(excerpt).slice(0, 120), cpText: cpNames.length ? cpNames.join(" × ") : "原创" };
    pGChat(group.id, p => [...p, { role: "user", kind: "ficshare", senderName: profile.name || "我", fic: share, content: ficShareContent(share), ts: Date.now() }]);
    toast("已转发到群聊");
  };
  // 追更：把新章推给曾被转发看过这篇的角色，让 Ta 读后随口反应
  const notifyChapterToChars = async (fic, chapter, chapNo, charIds) => {
    const chs = (charIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
    if (!chs.length) return;
    const excerpt = String((chapter && chapter.content) || "").slice(0, 120);
    chs.forEach(ch => { const ufShare = { title: fic.title + "（更新·第" + chapNo + "章）", author: fic.author || "佚名", excerpt: excerpt, cpText: "" }; pChat(ch.id, p => [...p, { role: "user", kind: "ficshare", fic: ufShare, content: ficShareContent(ufShare, "你之前看过这篇"), ts: Date.now(), read: false }]); });
    toast("新章已同步给读过的角色");
    if (!active) return;
    const starIds = fic.cp || [];
    for (const ch of chs) {
      const isStar = starIds.indexOf(ch.id) >= 0;
      try {
        const react = await runProbe(active, ctxFor(ch), {
          instruction: "你之前被分享看过的那篇同人文《" + fic.title + "》更新了第" + chapNo + "章，你刚读完，开头是「" + excerpt + "」。" + (isStar ? "（这篇是【以你为主角写的】，你清楚自己正被人当小说人物编排，读新章时带着这份被写的自觉——好气又好笑/在意剧情怎么写你/想知道后面被安排成什么样。）" : "") + "按你的人设和此刻心情随口说两句读后感/催更/吐槽（1-2 句，可多气泡），别复述剧情、别客服腔。",
          schemaHint: "{\"say\":[\"气泡1\"]}", maxTokens: 700
        });
        const say = react && Array.isArray(react.say) ? react.say : (react && react.say ? [react.say] : []);
        if (say.length) pChat(ch.id, p => [...p, ...say.map(s => ({ role: "assistant", content: String(s), ts: Date.now(), read: false }))]);
      } catch (e) {/* 静默 */}
    }
  };
  // 私信：刷新收到 NPC 的私信（可能是帖子里认识的、也可能是喷子）
  const refreshForumPMs = async () => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, forumPM: "refresh" }));
    try {
      const meName = profile.name || "对方";
      const meDesc = (profile.persona || profile.tagline || "").trim();
      // 收集用户在贴吧的真实动态：自己发的（非匿名）帖 + 自己写的评论/回复
      const myPosts = (forumPosts || []).filter(p => p.authorId === "me" && !p.anon).slice(0, 6);
      const myComments = [];
      Object.values(forumComments || {}).forEach(floors => (floors || []).forEach(f => {
        if (f.authorId === "me" && f.content) myComments.push(f.content);
        (f.replies || []).forEach(r => { if (r.authorId === "me" && r.content) myComments.push(r.content); });
      }));
      const actLines = [];
      myPosts.forEach(p => actLines.push("· 发帖《" + p.title + "》" + (p.body ? "：" + String(p.body).slice(0, 70) : "") + "（在" + p.board + "）"));
      myComments.slice(0, 8).forEach(c => actLines.push("· 评论过：" + String(c).slice(0, 60)));
      const hasActivity = actLines.length > 0;
      const baseRule = "**你们是陌生人，别默认对方性别**——绝对不要用『老哥』『哥们』『兄弟』这种默认男性的称呼；除非人设明确写了性别，否则一律用中性称呼（直接叫网名、或用『你』『lz』『朋友』）。**大多数是正常网友**（attitude 填 friendly 或 curious）；**最多只安排一个杠精喷子**（attitude 填 troll），别一窝蜂全是找茬的。每条含 npcName（对方网名）、tagline（对方一句话简介/画风）、attitude、opening（第一句私信）。风格各异、别都一个腔调。";
      const sourceBlock = hasActivity
        ? "收私信的人叫「" + meName + "」。这些网友是**看了 TA 在贴吧的真实动态**来私信的——每条 opening 必须**针对下面某一条具体的帖子或评论**来搭话（共鸣、请教、约稿、抬杠、补充等），**别凭空捏造 TA 没说过的话题**：\n" + actLines.join("\n") + "\n"
        : "收私信的人叫「" + meName + "」，TA **还没在贴吧发过帖、也没评论过**。所以这些网友是**逛到 TA 的主页**来的——请**根据 TA 的主页资料**搭话（聊 TA 的网名、签名或人设气质），**别编造 TA 发过的帖子/评论**：网名「" + (forumMe.handle || meName) + "」，签名/简介「" + (forumMe.bio || profile.tagline || meDesc || "（没写）").slice(0, 80) + "」。\n";
      const d = await runProbeRetry(active, forumWorldCtx(), {
        instruction: "贴吧里有 3-5 个陌生网友私信了你（items 数组务必 3-5 条，别只给 1-2 条）。" + sourceBlock + baseRule,
        schemaHint: "{\"items\":[{\"npcName\":\"网名\",\"tagline\":\"简介\",\"attitude\":\"friendly\",\"opening\":\"第一句私信\"},{\"npcName\":\"网名\",\"tagline\":\"简介\",\"attitude\":\"curious\",\"opening\":\"第一句私信\"},{\"npcName\":\"网名\",\"tagline\":\"简介\",\"attitude\":\"friendly\",\"opening\":\"第一句私信\"}]}",
        maxTokens: 3600
      });
      let items = (d && Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : [])).filter(x => x && x.opening);
      if (!items.length) throw new Error("没有新私信");
      const base = Date.now();
      const threads = items.map((x, i) => ({
        id: "pm_" + base + "_" + i, npcName: x.npcName || "神秘网友", tagline: x.tagline || "",
        attitude: x.attitude || "curious",
        messages: [{ from: "npc", text: x.opening, ts: base + i }], updatedTs: base + i, unread: true
      }));
      // 只保留最新 10 个会话（按更新时间），旧的删掉
      setForumPMs(prev => { const n = [...threads, ...prev].sort((a, b) => b.updatedTs - a.updatedTs).slice(0, 10); saveJSON("x_forumPMs", n); return n; });
      toast("收到 " + threads.length + " 条新私信");
    } catch (e) { toast(e.message); }
    finally { setGen(g => ({ ...g, forumPM: null })); }
  };
  const markPMRead = threadId => setForumPMs(prev => { const n = prev.map(t => t.id === threadId ? { ...t, unread: false } : t); saveJSON("x_forumPMs", n); return n; });
  const sendForumPM = async (threadId, text) => {
    const th = forumPMsRef.current.find(t => t.id === threadId);
    if (!th) return;
    setForumPMs(prev => { const n = prev.map(t => t.id === threadId ? { ...t, messages: [...t.messages, { from: "me", text, ts: Date.now() }], updatedTs: Date.now() } : t); saveJSON("x_forumPMs", n); return n; });
    if (!active) return;
    setGen(g => ({ ...g, forumPM: threadId }));
    try {
      const convo = [...th.messages, { from: "me", text }].map(m => (m.from === "me" ? "我" : th.npcName) + "：" + m.text).join("\n");
      const d = await runProbeRetry(active, forumWorldCtx(), {
        instruction: "你在贴吧扮演一个网名叫「" + th.npcName + "」的陌生网友（画风：" + (th.tagline || "普通网友") + "，态度：" + th.attitude + "）。这是你和对方的私信记录：\n" + convo + "\n\n以「" + th.npcName + "」的身份回复对方最新这句（1-3 句，可多气泡）。" + (th.attitude === "troll" ? "你是个杠精/喷子，阴阳怪气、抬杠、可以对骂，别怂但也别脏到没法看。" : "保持你自己的画风，真实自然，别客服腔。"),
        schemaHint: "{\"say\":[\"气泡1\",\"气泡2\"]}",
        maxTokens: 800
      });
      const say = d && Array.isArray(d.say) ? d.say : (d && d.say ? [d.say] : []);
      if (say.length) { const base = Date.now(); setForumPMs(prev => { const n = prev.map(t => t.id === threadId ? { ...t, messages: [...t.messages, ...say.map((s, i) => ({ from: "npc", text: String(s), ts: base + i }))], updatedTs: base } : t); saveJSON("x_forumPMs", n); return n; }); }
    } catch (e) { toast("对方没回应：" + e.message); }
    finally { setGen(g => ({ ...g, forumPM: null })); }
  };
  // 帖子回复数 +N
  const bumpReplyBy = (postId, n) => setForumPosts(prev => { const nn = prev.map(p => p.id === postId ? { ...p, replyCount: (p.replyCount || 0) + n } : p); saveJSON("x_forumPosts", nn); return nn; });
  // 我开新楼评论 → 随后刷 4-6 条回我的（含楼主本人）挂到这层楼中楼
  const addForumFloor = (post, text) => {
    const base = Date.now();
    const fid = "fc_me_" + base;
    const floorNo = ((forumCommentsRef.current[post.id] || []).length) + 2;
    const floor = { id: fid, authorId: "me", authorType: "me", authorName: forumMe.handle || profile.name || "我", authorHandle: forumMe.handle || profile.name || "me", floor: floorNo, content: text, ts: base, likeCount: 0, replies: [] };
    setForumComments(prev => { const n = { ...prev, [post.id]: [...(prev[post.id] || []), floor] }; saveJSON("x_forumComments", n); return n; });
    bumpReplyBy(post.id, 1);
    genRepliesToMe(post, fid, text);
  };
  // 我回复楼中楼 → 随后刷 4-6 条回我的（含楼主本人）挂到同一层
  const addForumSubReply = (post, floorId, text) => {
    setForumComments(prev => {
      const list = (prev[post.id] || []).map(f => f.id === floorId ? { ...f, replies: [...(f.replies || []), { authorName: forumMe.handle || profile.name || "我", authorHandle: forumMe.handle || profile.name || "me", authorType: "me", authorId: "me", content: text }] } : f);
      const n = { ...prev, [post.id]: list }; saveJSON("x_forumComments", n); return n;
    });
    bumpReplyBy(post.id, 1);
    genRepliesToMe(post, floorId, text);
  };
  // 生成 4-6 条回复「我这条评论」的（务必含楼主本人；其余路人或在逛论坛的角色），挂到 floorId 的楼中楼
  const genRepliesToMe = async (post, floorId, myText) => {
    if (!active) return;
    setGen(g => ({ ...g, forumReplyMe: floorId }));
    try {
      const oc = post.authorType === "character" && !post.anon ? (characters || []).find(c => c.id === post.authorId) : null;
      const opName = oc ? oc.name : post.authorName;
      const opDesc = oc ? ("楼主是角色「" + opName + "」本人（Ta 会以自己的人设回应）") : ("楼主网名「" + opName + "」");
      const isSearch = /^搜索/.test(post.triggerSource || "");
      const others = isSearch
        ? "其余全是路人网友（authorName+handle），**不要出现你认识的任何角色**——搜来的陌生话题，角色未必关心、不该全知全能地冒出来。"
        : "其余是路人网友，或下面这些正在逛论坛的角色里、此刻**真的会关心这个话题**的一位（用 char 字段填角色名，符合 Ta 人设/心情；**没有角色会关心就全用路人、别硬塞**）：" + (forumCharList() || "（暂无角色）") + "。";
      const d = await runProbeRetry(active, forumWorldCtx(), {
        instruction: forumBoardVoice(post.board) + " 帖子：标题「" + post.title + "」正文「" + (post.body || "") + "」。" + opDesc + "。有人（网名「" + (forumMe.handle || profile.name || "我") + "」）刚在楼里回复了一条：「" + myText + "」。楼下 4-6 个人来回复 TA 这条（items 务必 4-6 条）。**其中必须恰有一条是楼主本人的回复**（那条 is_op 设 true）。" + others + "每条含 content，以及（路人给 authorName+handle／角色给 char），is_op 只有楼主那条为 true。语气各异，可搭话/抬杠/共鸣，别一个腔调。",
        schemaHint: "{\"items\":[{\"authorName\":\"网名\",\"handle\":\"id\",\"char\":\"（角色名或省略）\",\"is_op\":false,\"content\":\"回复\"}]}",
        maxTokens: 2800
      });
      let items = (d && Array.isArray(d.items) ? d.items : []).filter(x => x && x.content);
      if (!items.length) return;
      const looksOp = s => { s = String(s || "").trim().toLowerCase(); return s === "楼主" || s === "楼主本人" || s === "lz"; };
      const reps = items.map(x => {
        if (x.is_op === true || (opName && x.char === opName) || looksOp(x.char) || looksOp(x.authorName)) {
          if (oc) return { authorName: oc.name, authorHandle: charForumMeta(oc).handle, authorType: "character", authorId: oc.id, content: x.content, isOp: true };
          return { authorName: post.authorName, authorHandle: post.authorHandle || post.authorName, authorType: post.authorType === "me" ? "me" : "npc", authorId: post.authorType === "me" ? "me" : null, content: x.content, isOp: true };
        }
        const cc = forumActiveChars().find(c => c.name === x.char);
        if (cc) return { authorName: cc.name, authorHandle: charForumMeta(cc).handle, authorType: "character", authorId: cc.id, content: x.content };
        return { authorName: x.authorName || "匿名网友", authorHandle: x.handle || x.authorName || "user", authorType: "npc", authorId: null, content: x.content };
      });
      setForumComments(prev => {
        const list = (prev[post.id] || []).map(f => f.id === floorId ? { ...f, replies: [...(f.replies || []), ...reps] } : f);
        const n = { ...prev, [post.id]: list }; saveJSON("x_forumComments", n); return n;
      });
      bumpReplyBy(post.id, reps.length);
    } catch (e) {/* silent */ }
    finally { setGen(g => ({ ...g, forumReplyMe: null })); }
  };
  // 我发帖
  const postMyForum = (board, title, body) => {
    const anonB = board === "匿名吧";
    const base = Date.now();
    const rec = { id: "fp_me_" + base, authorId: "me", authorType: "me", authorName: anonB ? "匿名者" : (forumMe.handle || profile.name || "我"), authorHandle: anonB ? "匿名者" : (forumMe.handle || profile.name || "me"), board, title, body: body || "", anon: anonB, triggerSource: "我发帖", ts: base, replyCount: 0, likeCount: 0, viewCount: 0, rtCount: 0 };
    setForumPosts(prev => { const n = [rec, ...prev]; saveJSON("x_forumPosts", n); return n; });
    toast("已发布到「" + board + "」");
  };
  // 搜索：随机刷到四版块之外的吧（据全局聊天/世界话题），board 由 AI 起名
  const genForumSearch = async query => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, forumSearch: true }));
    try {
      const recentAll = Object.values(chatsRef.current || {}).flat().filter(m => m && m.content).slice(-30).map(m => m.content).join(" ").slice(0, 300);
      const d = await runProbeRetry(active, forumWorldCtx(), {
        instruction: "用户在贴吧搜索框" + (query ? "搜了「" + query + "」" : "没输关键词，随便逛逛") + "。挑一个贴合的贴吧（board 字段，如『足球吧』『考研吧』『猫吧』『追星吧』等，" + (query ? "围绕这个关键词" : "结合这个世界/最近聊天可能涉及的热门话题，别老是同一个吧") + "，**不要**用吐槽吧/日常吧/求助吧/匿名吧这四个）。在这个吧里生成 3-5 条网友主帖。每条含 authorName、handle（有趣 id）、title、body、replyCount。" + (recentAll ? "（最近聊天片段可作话题灵感，别照抄：" + recentAll + "）" : ""),
        schemaHint: "{\"board\":\"某某吧\",\"items\":[{\"authorName\":\"网名\",\"handle\":\"id\",\"title\":\"标题\",\"body\":\"正文\",\"replyCount\":88}]}",
        maxTokens: 3400
      });
      const board = (d && d.board) || (query ? query + "吧" : "水吧");
      let items = (d && Array.isArray(d.items) ? d.items : []).filter(x => x && x.title);
      if (!items.length) throw new Error("没搜到内容");
      const base = Date.now();
      const recs = items.map((x, i) => ({ id: "fp_" + base + "_" + i, authorId: "npc_" + base + "_" + i, authorType: "npc", authorName: x.authorName || "匿名网友", authorHandle: x.handle || x.authorName || "user", board, title: x.title, body: x.body || "", anon: false, triggerSource: "搜索:" + (query || "随机"), ts: base - i, ...forumCounts((x.handle || x.title) + i, Number(x.replyCount)) }));
      setForumPosts(prev => { const n = [...recs, ...prev]; saveJSON("x_forumPosts", n); return n; });
    } catch (e) { toast(e.message); }
    finally { setGen(g => ({ ...g, forumSearch: false })); }
  };
  // 首次进角色主页：AI 生成一次 Ta 的贴吧资料（handle/签名/关注·粉丝数），存 forumCharMeta
  const ensureCharForumMeta = async c => {
    if (forumCharMetaRef.current[c.id] && forumCharMetaRef.current[c.id].handle) return;
    if (!active) return;
    try {
      const d = await runProbe(active, ctxFor(c), {
        instruction: "为「" + c.name + "」设计 Ta 的贴吧个人资料：handle（贴吧 id，一个贴合人设/说话风格的有趣英文或拼音短 id，别带 @）、bio（一句话签名，贴人设、可以有点态度）、followers（粉丝数，按 Ta 的身份/影响力给个合理数字，普通人几十到几千、有名气的才上万）、following（关注数）。",
        schemaHint: "{\"handle\":\"id\",\"bio\":\"签名\",\"followers\":1234,\"following\":88}",
        maxTokens: 500
      });
      const hh = forumHash(c.id);
      const meta = { handle: d.handle || c.name, bio: d.bio != null ? d.bio : (c.motto || ""), followers: Number(d.followers) || (300 + (hh * 7) % 60000), following: Number(d.following) || (20 + hh % 380), joinTs: (forumCharMetaRef.current[c.id] || {}).joinTs || (FORUM_EPOCH + (hh % 600) * 86400000) };
      setForumCharMeta(prev => { const n = { ...prev, [c.id]: meta }; saveJSON("x_forumCharMeta", n); return n; });
    } catch (e) {/* silent, 用兜底 */ }
  };
  const editForumMe = patch => setForumMe(prev => { const n = { ...prev, joinTs: prev.joinTs || (Date.now() - 90 * 86400000), ...patch }; saveJSON("x_forumMe", n); return n; });

  // ---- couple（多角色；邀请走聊天卡片，角色自行回应接受/婉拒）----
  const setCoupleFor = (charId, val) => setCouples(p => {
    const n = { ...p };
    if (val) n[charId] = val; else delete n[charId];
    saveJSON("x_couples", n);
    return n;
  });
  // 情侣空间详情页自定义（背景 / 头像覆盖）；图片经 resizeImageFile 缩小
  const saveCoupleProfile = (charId, patch) => setCoupleProfile(p => {
    const n = { ...p, [charId]: Object.assign({}, p[charId], patch) };
    saveJSON("x_coupleProfile", n);
    return n;
  });
  const setCoupleImg = async (charId, field, file) => {
    if (!file) { saveCoupleProfile(charId, { [field]: null }); return; }
    try { const url = await resizeImageFile(file, field === "bg" ? 900 : 400, 0.82); saveCoupleProfile(charId, { [field]: url }); }
    catch (e) { toast("图片处理失败"); }
  };
  // 自定义「在一起」的起始日（第几天/时间轴起点跟着变）；dateStr = "YYYY-MM-DD"
  const setCoupleSince = (charId, dateStr) => {
    const parts = (dateStr || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0]) return;
    const ts = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getTime();
    setCouples(p => {
      const cur = p[charId];
      if (!cur || cur.status !== "together") return p;
      const n = { ...p, [charId]: { ...cur, since: ts } };
      saveJSON("x_couples", n);
      return n;
    });
    toast("在一起起始日已更新 💗");
  };
  // 解除情侣关系：mode 'sudden'(无预兆，直接扣5) | 'fight'(吵架时，按聊天/人设/心情扣5~10)；专属数据不删；角色主动反应
  const unlinkCouple = async (char, mode) => {
    const cid = char.id;
    if (!couples[cid] || couples[cid].status !== "together") return;
    const before = affOf(cid);
    setCoupleFor(cid, null); // 解除（情侣空间数据按 charId 存、不删，复合后还在）
    let deduct = 5;
    if (active) {
      setGen(g => ({ ...g, coupleUnlink: cid }));
      try {
        const scene = mode === "fight"
          ? "你们最近有摩擦、正闹别扭甚至吵架，用户此刻赌气把你们的「情侣空间」解除了。依据你们最近的对话、你的人设和此刻心情，做出真实反应（可能生气、失望、想挽留、或冷淡），并给这次解除对好感的打击程度打一个分（deduct，整数 5~10，越是被伤到越高）。"
          : "用户上一秒还在和你聊别的、毫无预兆就把你们的「情侣空间」解除了。你有点错愕、受伤，**主动**开口问 TA 怎么了 / 是不是发生了什么 / 为什么突然这样。";
        const bundle = buildBundle(ctxFor(char));
        const raw = await callAI(active, bundle + "\n\n【场景】" + scene + " 完全代入「" + char.name + "」，用即时通讯口吻回几句真心话（短句多气泡）。\n【输出】只输出 JSON：{\"deduct\":整数,\"say\":[\"气泡1\",\"气泡2\"]}", [{ role: "user", content: "（解除了情侣空间）" }], { maxTokens: 600 });
        const d = extractJSON(raw) || {};
        if (mode === "fight" && typeof d.deduct === "number") deduct = Math.max(5, Math.min(10, Math.round(d.deduct)));
        const say = Array.isArray(d.say) && d.say.length ? d.say : ["……你把我们的情侣空间解除了？"];
        say.forEach((s, i) => setTimeout(() => pChat(cid, p => [...p, { role: "assistant", content: String(s), ts: Date.now(), read: false }]), 400 + i * 700));
      } catch (e) {/* 失败也照常解除+扣分 */} finally { setGen(g => ({ ...g, coupleUnlink: null })); }
    }
    const after = Math.max(0, before - deduct);
    setAff(cid, after);
    setCoupleBreakup(p => { const n = { ...p, [cid]: { ts: Date.now(), deducted: deduct, affAfter: after } }; saveJSON("x_coupleBreakup", n); return n; });
    toast("已解除情侣关系 · 好感 −" + deduct);
  };
  const sendCoupleInvite = async char => {
    if (!active) { toast("请先到设置配置 API"); return; }
    if (couples[char.id]) { toast(couples[char.id].status === "together" ? "你们已经在一起了" : "邀请已发出，等 TA 回应"); return; }
    // 解除冷却 + 复合门槛
    const bk = coupleBreakup[char.id];
    if (bk) {
      const daysSince = (Date.now() - bk.ts) / 86400000;
      if (daysSince < 7) { toast("刚解除还不到一周，再等等吧（还差 " + Math.ceil(7 - daysSince) + " 天）"); return; }
      const need = bk.affAfter + bk.deducted / 2;
      if (affOf(char.id) < need) { toast("TA 还没准备好复合——好感要至少加回被扣的一半（当前 " + Math.round(affOf(char.id)) + " / 需 " + Math.ceil(need) + "）"); return; }
    }
    const cid = "ci_" + Date.now();
    setCoupleFor(char.id, { status: "pending", since: null });
    // 往聊天里发一张情侣邀请卡
    pChat(char.id, p => [...p, { role: "user", kind: "couple_invite", cid, status: "pending", content: "[情侣邀请] 想和你在一起", ts: Date.now(), read: true }]);
    toast("邀请已送到和 " + char.name + " 的聊天");
    // 角色延迟回应
    setTimeout(async () => {
      try {
        const bundle = buildBundle(ctxFor(char));
        const raw = await callAI(active, bundle + "\n\n【场景】用户刚刚向你发出「情侣邀请」，想和你正式在一起。完全代入「" + char.name + "」，依据你的人设、你们的关系、对用户的好感度，决定接受还是婉拒——好感高且关系贴合才接受，否则婉拒（不必强行答应）。用即时通讯口吻回几句真心话（短句多气泡）。\n【输出】只输出 JSON：{\"accept\":true或false,\"say\":[\"气泡1\",\"气泡2\"]}", [{ role: "user", content: "（回应情侣邀请）" }], { maxTokens: 500 });
        const d = extractJSON(raw) || {};
        respondCoupleInvite(char.id, cid, !!d.accept, Array.isArray(d.say) ? d.say : []);
      } catch (e) {
        // 失败：撤销 pending，卡片标记为无回应
        setCoupleFor(char.id, null);
        pChat(char.id, p => p.map(m => m.cid === cid ? { ...m, status: "failed" } : m));
        toast("邀请回应失败：" + e.message);
      }
    }, 1600);
  };
  const respondCoupleInvite = (charId, cid, accept, say) => {
    pChat(charId, p => p.map(m => m.cid === cid ? { ...m, status: accept ? "accepted" : "declined" } : m));
    const char = characters.find(c => c.id === charId);
    // 角色回几句
    (say && say.length ? say : [accept ? "好，我愿意。" : "对不起，现在还不行。"]).forEach((w, i) => {
      setTimeout(() => pChat(charId, p => [...p, { role: "assistant", content: w, ts: Date.now(), read: false }]), 300 + i * 700);
    });
    if (accept) {
      setCoupleBreakup(p => { if (!p[charId]) return p; const n = { ...p }; delete n[charId]; saveJSON("x_coupleBreakup", n); return n; });
      const now = new Date();
      setCoupleFor(charId, { status: "together", since: now.getTime() });
      // 在一起纪念日写进日历（该角色视角）
      saveCalEvent(charId, now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate(), "♥ 和 " + (char ? char.name : "TA") + " 在一起", "情侣纪念日");
      toast((char ? char.name : "TA") + " 接受了 ♥");
    } else {
      setCoupleFor(charId, null);
      toast((char ? char.name : "TA") + " 婉拒了邀请");
    }
  };
  const genWhisper = async char => {
    setGen(g => ({
      ...g,
      whisper: true
    }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们已是恋人。以「" + char.name + "」身份，在你俩私密的「便签墙」上悄悄贴一张给用户的小纸条——写一句恋爱向、藏着心意、想对 Ta 说却又没在聊天里直接说出口的悄悄话（不是脑内碎碎念的心声，是想让 Ta 悄悄收到的情话/在乎），真挚贴人设，1-2句、别太长。",
        schemaHint: "{\"whisper\":\"给 Ta 的悄悄情话\"}"
      });
      // 贴到便签墙（authorId=角色，默认盖着，点开才看得到），不再进无处可见的 whispers 数组
      setCoupleNotes(p => {
        const n = [{
          id: "note_" + Date.now(),
          characterId: char.id,
          authorId: char.id,
          content: String(d.whisper || "").trim(),
          style: Math.floor(Math.random() * 5),
          createdAt: Date.now(),
          replies: []
        }, ...p];
        saveJSON("x_coupleNotes", n);
        return n;
      });
    } catch (e) {
      toast("失败：" + e.message);
    } finally {
      setGen(g => ({
        ...g,
        whisper: false
      }));
    }
  };

  // 情侣空间·问答小本：用户答完一题后，让角色顺着用户的回答答同一题（不是各答各的）
  const answerCoupleQA = async (char, item) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleQA: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。用户在你俩的「情侣问答小本」里回答了一道题，现在轮到你以「" + char.name + "」的身份回答同一道题。真挚、贴合人设，**顺着用户的回答接话**（呼应 TA 说的，不是各答各的），2-4 句，别喊口号，答完整别中途断。\n【题目】" + item.question + "\n【用户的回答】" + (item.myAnswer || "（TA 没写）"),
        schemaHint: "{\"answer\":\"你的回答\"}",
        maxTokens: 1400
      });
      setCoupleQA(p => {
        const n = [{
          id: "qa_" + Date.now(),
          characterId: char.id,
          qid: item.qid,
          question: item.question,
          myAnswer: item.myAnswer || "",
          charAnswer: d.answer || "",
          source: item.source || "题库",
          answeredAt: Date.now()
        }, ...p];
        saveJSON("x_coupleQA", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleQA: false }));
    }
  };
  // 问答小本：编辑我的答案 / 删除该题（删了它会回到未答池）/ 重生成 TA 的答案（截断可 reroll）
  const editCoupleQA = (id, myAnswer) => setCoupleQA(p => {
    const n = p.map(e => e.id === id ? { ...e, myAnswer: (myAnswer || "").trim() } : e);
    saveJSON("x_coupleQA", n);
    return n;
  });
  const removeCoupleQA = id => setCoupleQA(p => {
    const n = p.filter(e => e.id !== id);
    saveJSON("x_coupleQA", n);
    return n;
  });
  const rerollCoupleQA = async (char, entry) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleQA: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。用户在你俩的「情侣问答小本」里回答了一道题，请以「" + char.name + "」的身份重新回答同一道题——真挚、贴合人设、顺着用户的回答接话，2-4 句，别喊口号，答完整别中途断。\n【题目】" + entry.question + "\n【用户的回答】" + (entry.myAnswer || "（TA 没写）"),
        schemaHint: "{\"answer\":\"你的回答\"}",
        maxTokens: 1400
      });
      setCoupleQA(p => {
        const n = p.map(e => e.id === entry.id ? { ...e, charAnswer: d.answer || "", answeredAt: Date.now() } : e);
        saveJSON("x_coupleQA", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleQA: false }));
    }
  };
  const saveQATitle = (charId, title) => setCoupleQATitle(p => {
    const n = { ...p, [charId]: title };
    saveJSON("x_coupleQATitle", n);
    return n;
  });

  // 情侣空间·双向便签（悄悄话串）：我贴→TA 自动回一张；可在串里继续留言，TA 每条都回
  // 便签结构 {id,characterId,authorId:'user'|charId,content,style,createdAt,replies:[{authorId,content,ts}]}
  const genCoupleNoteReply = async (char, noteId, threadText) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleNote: true }));
    try {
      const d = await runProbe(bgActive, ctxFor(char), {
        instruction: "你们是恋人，在只属于你俩的私密便签墙上一来一回写悄悄话。顺着下面的对话，以「" + char.name + "」身份回**最新一句**，短、贴人设、有温度，别超过 30 字，别喊口号、别复述。\n【便签对话】\n" + (threadText || ""),
        schemaHint: "{\"note\":\"你的回复\"}"
      });
      setCoupleNotes(p => {
        const n = p.map(nt => nt.id !== noteId ? nt : { ...nt, replies: [...(nt.replies || []), { authorId: char.id, content: (d.note || "").trim(), ts: Date.now() }] });
        saveJSON("x_coupleNotes", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleNote: false }));
    }
  };
  // 我贴一张新便签 → 立刻存 → TA 自动回一张悄悄话
  const addCoupleNote = (char, content, style) => {
    const c = (content || "").trim();
    if (!c) return;
    const id = "note_" + Date.now();
    setCoupleNotes(p => {
      const n = [{ id, characterId: char.id, authorId: "user", content: c, style: style || 0, createdAt: Date.now(), replies: [] }, ...p];
      saveJSON("x_coupleNotes", n);
      return n;
    });
    genCoupleNoteReply(char, id, "我：" + c);
  };
  // 我在某张便签的悄悄话串里继续留言 → TA 回
  const addCoupleNoteReply = (char, noteId, content, threadText) => {
    const c = (content || "").trim();
    if (!c) return;
    setCoupleNotes(p => {
      const n = p.map(nt => nt.id !== noteId ? nt : { ...nt, replies: [...(nt.replies || []), { authorId: "user", content: c, ts: Date.now() }] });
      saveJSON("x_coupleNotes", n);
      return n;
    });
    genCoupleNoteReply(char, noteId, (threadText || "") + "\n我：" + c);
  };
  const removeCoupleNote = id => setCoupleNotes(p => {
    const n = p.filter(x => x.id !== id);
    saveJSON("x_coupleNotes", n);
    return n;
  });
  // 保存某角色的自定义问答题库（arr = 题目字符串数组）
  const saveCoupleQACustom = (charId, arr) => setCoupleQACustom(p => {
    const n = { ...p, [charId]: arr.filter(s => s && s.trim()).map(s => s.trim()) };
    saveJSON("x_coupleQACustom", n);
    return n;
  });
  // 情侣空间·心情打卡：让角色留一条此刻心情（右上刷新触发；未来接调度器每日/随机）
  // 心情打卡：每天一次，我选一个心情 → TA 也为今天选一个心情 + 一句话；一天一条 {date,myMood,charMood,charText}
  const COUPLE_MOOD_KEYS = ["relax:轻松", "surprise:惊喜", "gloomy:郁闷", "sad:难过", "happy:开心", "irritated:烦躁", "proud:骄傲", "cozy:舒畅", "amazed:惊讶"];
  const moodLabelOf = k => { const s = COUPLE_MOOD_KEYS.find(x => x.split(":")[0] === k); return s ? s.split(":")[1] : k; };
  const checkinCoupleMood = async (char, myMood) => {
    const today = ymd(new Date());
    // 同步：我的心情一次性写进所有「在一起」的情侣空间今日记录（纯本地、不花 API）
    const partnerIds = Object.keys(couples).filter(id => couples[id] && couples[id].status === "together");
    const syncIds = partnerIds.includes(char.id) ? partnerIds : partnerIds.concat([char.id]);
    setCoupleMood(p => {
      let n = p;
      syncIds.forEach(cid => {
        const ex = n.find(m => m.characterId === cid && m.date === today);
        n = ex
          ? n.map(m => (m.characterId === cid && m.date === today) ? { ...m, myMood } : m)
          : [{ id: "mood_" + Date.now() + "_" + cid, characterId: cid, date: today, myMood, charMood: null, charText: "", createdAt: Date.now() }, ...n];
      });
      saveJSON("x_coupleMood", n);
      return n;
    });
    if (!active) { toast(syncIds.length > 1 ? "已打卡并同步到 " + syncIds.length + " 个情侣空间（配置 API 后 TA 会选心情）" : "已打卡（配置 API 后 TA 也会选心情）"); return true; }
    setGen(g => ({ ...g, coupleMood: true }));
    try {
      // 一次调用生成【所有在一起的恋人】今天的心情（省次数：N 位一次出，别每个空间各刷一次）
      const partners = syncIds.map(id => characters.find(c => c.id === id)).filter(Boolean);
      const validKeys = COUPLE_MOOD_KEYS.map(s => s.split(":")[0]);
      const roster = partners.map((c, i) => (i + 1) + ". 「" + c.name + "」人设：" + (c.persona || "（无设定）").replace(/\s+/g, " ").slice(0, 260)).join("\n");
      const sys = ANTI_CLICHE +
        "\n\n今天用户在 TA 各位恋人的「心情打卡」里都选了心情「" + moodLabelOf(myMood) + "」。请【为下面每一位恋人】各自今天选一个心情、并各留一句【≤20 字】的话——各贴各自人设与此刻状态，可自然呼应用户的心情，别喊口号、别几位写成一个腔调。心情只能从这些英文 key 里挑一个：" + validKeys.join("、") +
        "\n\n【恋人们（按此顺序，各写各的）】\n" + roster +
        "\n\n【输出】只输出 JSON：{\"moods\":[{\"name\":\"恋人名\",\"mood\":\"英文key\",\"text\":\"一句≤20字的话\"}]}，每位恋人一条，顺序同上。";
      const raw = await callAI(bgActive, sys, [{ role: "user", content: "各自选今天的心情，写满每一位。" }], { maxTokens: Math.min(8000, 2000 + partners.length * 700) });
      const parsed = extractJSON(raw) || {};
      const arr = Array.isArray(parsed.moods) ? parsed.moods : [];
      const byName = {};
      arr.forEach(m => { if (m && m.name) byName[String(m.name).trim()] = m; });
      setCoupleMood(p => {
        let n = p;
        partners.forEach((c, i) => {
          const hit = byName[c.name] || arr[i]; // 先按名字配，配不上按顺序兜底
          if (!hit) return;
          const cm = validKeys.includes(hit.mood) ? hit.mood : "relax";
          n = n.map(m => (m.characterId === c.id && m.date === today) ? { ...m, charMood: cm, charText: String(hit.text || "").trim() } : m);
        });
        saveJSON("x_coupleMood", n);
        return n;
      });
      toast(partners.length > 1 ? "已打卡，" + partners.length + " 位恋人的心情一次都生成好了" : "已打卡");
      return true;
    } catch (e) {
      toast("心情生成失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleMood: false }));
    }
  };
  // 情侣空间·恋爱时间轴：我手动加里程碑（不走 API）+ 角色写一条「感慨」（生成）
  const addTimelineEvent = (char, date, title, content) => {
    if (!date || !(title || "").trim()) return;
    setCoupleTimeline(p => {
      const n = [{ id: "tl_" + Date.now(), characterId: char.id, date: date, type: "里程碑", title: title.trim(), content: (content || "").trim(), byCharacter: false, createdAt: Date.now() }, ...p];
      saveJSON("x_coupleTimeline", n);
      return n;
    });
    // 里程碑联动主界面日历（写进该角色视角，dateKey 用 calKey 格式：月 1-based、不补零）
    const pp = String(date).split("-");
    if (pp.length === 3) saveCalEvent(char.id, (+pp[0]) + "-" + (+pp[1]) + "-" + (+pp[2]), "💛 " + title.trim(), "里程碑");
  };
  const removeTimelineEvent = id => setCoupleTimeline(p => {
    const n = p.filter(x => x.id !== id);
    saveJSON("x_coupleTimeline", n);
    return n;
  });
  const genTimelineMusing = async char => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleTL: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。以「" + char.name + "」身份，为你俩的恋爱时间轴写一条此刻的「感慨」——一个短标题（≤10 字）+ 一两句话（≤40 字），贴人设与当下心情，别喊口号。",
        schemaHint: "{\"title\":\"短标题\",\"content\":\"一两句话\"}"
      });
      setCoupleTimeline(p => {
        const n = [{ id: "tl_" + Date.now(), characterId: char.id, date: ymd(new Date()), type: "感慨", title: (d.title || "").trim(), content: (d.content || "").trim(), byCharacter: true, createdAt: Date.now() }, ...p];
        saveJSON("x_coupleTimeline", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleTL: false }));
    }
  };
  // 情侣空间·纪念日倒计时：加/删；可选联动日历
  const addAnniv = (char, name, month, day, yearlyRepeat, linkCalendar) => {
    if (!(name || "").trim() || !month || !day) return;
    const mo = Math.max(1, Math.min(12, +month)), dy = Math.max(1, Math.min(31, +day));
    setCoupleAnniv(p => {
      const n = [{ id: "an_" + Date.now(), characterId: char.id, name: name.trim(), month: mo, day: dy, yearlyRepeat: !!yearlyRepeat, createdAt: Date.now() }, ...p];
      saveJSON("x_coupleAnniv", n);
      return n;
    });
    if (linkCalendar) { saveCalEvent(char.id, new Date().getFullYear() + "-" + mo + "-" + dy, name.trim(), "情侣纪念日"); toast("已加进日历"); }
  };
  const removeAnniv = id => setCoupleAnniv(p => {
    const n = p.filter(x => x.id !== id);
    saveJSON("x_coupleAnniv", n);
    return n;
  });
  // 情侣空间·情书：7 天硬门槛（距上一封 <7 天不生成）
  // 按情书设置解析这封信的字体/纸张（auto=随机字体）
  const letterStyleFor = char => {
    const cfg = coupleLetterCfg[char.id] || {};
    const fontKeys = ["serif", "kai", "round", "sans"];
    const paperKeys = ["cream", "kraft", "pink", "blue", "mint"];
    const font = (!cfg.font || cfg.font === "auto") ? fontKeys[Math.floor(Math.random() * fontKeys.length)] : cfg.font;
    const paper = (!cfg.paper || cfg.paper === "auto") ? paperKeys[Math.floor(Math.random() * paperKeys.length)] : cfg.paper;
    return { font, paper };
  };
  const genCoupleLetter = async char => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    // 手动硬门槛：距上一封「TA 发的」情书 ≥3 天（被删的已不在数组、自动不算）
    const last = coupleLetters.filter(l => l.characterId === char.id && l.authorId !== "user").sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last && Date.now() - last.createdAt < 3 * 86400000) {
      const days = Math.ceil((3 * 86400000 - (Date.now() - last.createdAt)) / 86400000);
      toast("距 TA 上一封情书还差 " + days + " 天，情书要慢慢来～");
      return false;
    }
    setGen(g => ({ ...g, coupleLetter: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。以「" + char.name + "」身份，给用户写一封**情书**——正式、真挚、有分量（不是日常小纸条）。一个标题 + 一段完整的信（150-300 字，贴人设，可回顾你们的点滴、说心里话，结尾落款），别喊口号、别写成流水账。信要写完整，别中途断。",
        schemaHint: "{\"title\":\"情书标题\",\"body\":\"信的正文\"}",
        maxTokens: 2600
      });
      const st = letterStyleFor(char);
      setCoupleLetters(p => {
        const n = [{ id: "lt_" + Date.now(), characterId: char.id, authorId: char.id, title: (d.title || "").trim(), body: (d.body || "").trim(), isRead: false, createdAt: Date.now(), font: st.font, paper: st.paper, replies: [] }, ...p];
        saveJSON("x_coupleLetters", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleLetter: false }));
    }
  };
  // TA 回信（一次多条气泡）
  const genLetterReply = async (char, letterId, context, isNewLetter) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleLetter: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人，在情书里一来一回。" + (isNewLetter ? "用户刚给你写了一封情书，你读完后回应" : "顺着下面的情书往来，回应最新一句") + "。以「" + char.name + "」身份真挚回应，可以分成 2-4 条短消息（气泡），贴人设、别喊口号、别复述。\n【情书往来】\n" + (context || ""),
        schemaHint: "{\"bubbles\":[\"气泡1\",\"气泡2\"]}",
        maxTokens: 1400
      });
      const bubbles = Array.isArray(d.bubbles) ? d.bubbles.filter(Boolean) : (d.bubbles ? [String(d.bubbles)] : []);
      setCoupleLetters(p => {
        const n = p.map(l => l.id !== letterId ? l : { ...l, replies: [...(l.replies || []), ...bubbles.map(b => ({ authorId: char.id, content: String(b).trim(), ts: Date.now() }))] });
        saveJSON("x_coupleLetters", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleLetter: false }));
    }
  };
  // 我给 TA 写一封情书 → 存 → TA 自动回（多气泡）
  const addMyLetter = (char, title, body, style) => {
    const tt = (title || "").trim(), bd = (body || "").trim();
    if (!bd) { toast("信的内容不能为空"); return; }
    const base = letterStyleFor(char);
    const st = { paper: (style && style.paper) || base.paper, font: (style && style.font && style.font !== "auto") ? style.font : base.font };
    const id = "lt_" + Date.now();
    setCoupleLetters(p => {
      const n = [{ id, characterId: char.id, authorId: "user", title: tt, body: bd, isRead: true, createdAt: Date.now(), font: st.font, paper: st.paper, replies: [] }, ...p];
      saveJSON("x_coupleLetters", n);
      return n;
    });
    genLetterReply(char, id, "【" + (tt || "无题") + "】\n" + bd, true);
  };
  // 情书下我留言 → TA 回
  const replyToLetter = (char, letterId, myText, threadText) => {
    const c = (myText || "").trim();
    if (!c) return;
    setCoupleLetters(p => {
      const n = p.map(l => l.id !== letterId ? l : { ...l, replies: [...(l.replies || []), { authorId: "user", content: c, ts: Date.now() }] });
      saveJSON("x_coupleLetters", n);
      return n;
    });
    genLetterReply(char, letterId, (threadText || "") + "\n我：" + c, false);
  };
  const saveLetterCfg = (charId, cfg) => setCoupleLetterCfg(p => {
    const n = { ...p, [charId]: cfg };
    saveJSON("x_coupleLetterCfg", n);
    return n;
  });
  const markLetterRead = id => setCoupleLetters(p => {
    const n = p.map(l => l.id === id ? { ...l, isRead: true } : l);
    saveJSON("x_coupleLetters", n);
    return n;
  });
  const removeCoupleLetter = id => setCoupleLetters(p => {
    const n = p.filter(l => l.id !== id);
    saveJSON("x_coupleLetters", n);
    return n;
  });
  // 情侣空间·甜蜜值每日打卡：每天一次，随机 +0.1~1
  const checkinSweet = char => {
    const today = ymd(new Date());
    setCoupleSweet(p => {
      const cur = p[char.id] || { value: 0, last: null };
      if (cur.last === today) { toast("今天已经打过甜蜜卡啦 💗"); return p; }
      const add = Math.round((0.1 + Math.random() * 0.9) * 10) / 10;
      const n = { ...p, [char.id]: { value: Math.round((cur.value + add) * 10) / 10, last: today } };
      saveJSON("x_coupleSweet", n);
      toast("甜蜜值 +" + add + " 💗");
      return n;
    });
  };
  // 一起听（展示型）：改数据统一走 saveListen；图片经 resizeImageFile 缩小再存
  const saveListen = updater => setListen(p => {
    const n = typeof updater === "function" ? updater(p) : updater;
    saveJSON("x_listen", n);
    return n;
  });
  const setListenDisc = async file => {
    if (!file) { saveListen(p => ({ ...p, disc: null })); return; }
    try { const url = await resizeImageFile(file, 500, 0.82); saveListen(p => ({ ...p, disc: url })); }
    catch (e) { toast("图片处理失败"); }
  };
  const addListenSong = async (title, artist, coverFile) => {
    const tt = (title || "").trim();
    if (!tt) return;
    let cover = null;
    if (coverFile) { try { cover = await resizeImageFile(coverFile, 500, 0.82); } catch (e) {} }
    saveListen(p => ({ ...p, songs: [{ id: "sg_" + Date.now(), title: tt, artist: (artist || "").trim(), cover: cover, ts: Date.now() }, ...(p.songs || [])].slice(0, 30) }));
  };
  const removeListenSong = id => { idbAudioDel(id); saveListen(p => ({ ...p, songs: (p.songs || []).filter(x => x.id !== id) })); };
  // ---- 全局播放器 handlers ----
  // 规整 Cookie：用户常只粘 MUSIC_U 的值、忘了前缀 → 自动补 "MUSIC_U="；去引号/结尾分号
  const normCookie = () => {
    let c = (neteaseCookie || "").trim().replace(/^["']|["']$/g, "").trim();
    if (!c) return "";
    if (!/MUSIC_U\s*=/i.test(c)) c = "MUSIC_U=" + c.replace(/;+\s*$/, "");
    return c;
  };
  const resolvePlayUrl = async song => {
    if (!song) return null;
    if (song.source === "local") { const blob = await idbAudioGet(song.id); return blob ? URL.createObjectURL(blob) : null; }
    if (song.source === "netease") {
      if (!neteaseApi) return null;
      // 带上账号 Cookie（若填了）→ 后端转发给网易云 → 能拿到 VIP 歌的真链接；没填就走匿名（免费/无版权歌）
      const cval = normCookie(); const ck = cval ? "&cookie=" + encodeURIComponent(cval) : "";
      try { const r = await fetch(neteaseApi + "/song/url/v1?level=exhigh&id=" + song.neteaseId + ck + "&timestamp=" + Date.now()); const d = await r.json(); let u = d && d.data && d.data[0] && d.data[0].url; if (!u) { const r2 = await fetch(neteaseApi + "/song/url?id=" + song.neteaseId + ck + "&timestamp=" + Date.now()); const d2 = await r2.json(); u = d2 && d2.data && d2.data[0] && d2.data[0].url; } return u ? String(u).replace(/^http:/, "https:") : null; } catch (e) { return null; }
    }
    return null;
  };
  // 歌曲可能来自：全部库(songs) / 某个歌单(playlists[].songs，各自独立存整份) / 临时正在放的搜索结果(nowSong)。
  // 三处都不互相依赖：从「全部」删歌不影响歌单；「现在播放」搜索结果不塞进「全部」。
  const resolveSong = id => {
    const L = listenRef.current || {};
    if (L.nowSong && L.nowSong.id === id) return L.nowSong;
    let s = (L.songs || []).find(x => x.id === id);
    if (s) return s;
    for (const pl of (L.playlists || [])) { const f = (pl.songs || []).find(x => x.id === id); if (f) return f; }
    return null;
  };
  const playSong = async (songOrId, queueIds) => {
    const L = listenRef.current || {};
    let song = (songOrId && typeof songOrId === "object") ? songOrId : resolveSong(songOrId);
    if (!song) return;
    if (!song.id) song = { ...song, id: "sg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) };
    const songId = song.id;
    const inLib = (L.songs || []).some(s => s.id === songId);
    const inPl = (L.playlists || []).some(pl => (pl.songs || []).some(s => s.id === songId));
    setPlayer(p => ({ ...p, songId: songId, loading: true, playing: false, err: null }));
    saveListen(p => {
      const hist = [{ id: song.id, title: song.title, artist: song.artist || "", partnerId: p.partnerId || null, ts: Date.now() }, ...(p.history || []).filter(x => x.id !== song.id)].slice(0, 30);
      const patch = { ...p, nowId: songId, history: hist };
      // 播放队列：①显式传了就用；②没传但当前歌本就在已存队列里（如退出小手机再回来续播歌单）→ 保留原队列，
      // 别塌成单曲；③从「全部」库放就整库当队列；④再否则(搜索结果单曲)就只这一首
      if (queueIds && queueIds.length) patch.nowQueue = queueIds;
      else if (p.nowQueue && p.nowQueue.length > 1 && p.nowQueue.includes(songId)) patch.nowQueue = p.nowQueue;
      else if (inLib) patch.nowQueue = (p.songs || []).map(s => s.id);
      else patch.nowQueue = [songId];
      // 不在库/歌单里的（搜索结果直接播放）→ 暂存为 nowSong，供 resolveSong 找到，但不进「全部」
      if (!inLib && !inPl) patch.nowSong = song; else patch.nowSong = (p.nowSong && p.nowSong.id === songId) ? null : p.nowSong;
      return patch;
    });
    const url = await resolvePlayUrl(song);
    if (playUrlRef.current) { URL.revokeObjectURL(playUrlRef.current); playUrlRef.current = null; }
    if (!url) { setPlayer(p => ({ ...p, loading: false, playing: false, err: song.source === "netease" ? "拿不到播放地址（多半 VIP/无版权）" : "音频丢了（可能清过缓存）" })); return; }
    if (song.source === "local") playUrlRef.current = url;
    const el = audioElRef.current;
    if (el) { el.src = url; el.play().then(() => setPlayer(p => ({ ...p, playing: true, loading: false }))).catch(() => setPlayer(p => ({ ...p, loading: false }))); }
  };
  const togglePlay = () => {
    const el = audioElRef.current; if (!el) return;
    if (!player.songId) { const q = listenRef.current.songs || []; if (q.length) playSong(q[0].id); return; }
    if (el.paused) { if (!el.getAttribute("src")) return playSong(player.songId, listenRef.current.nowQueue); el.play(); setPlayer(p => ({ ...p, playing: true })); }
    else { el.pause(); setPlayer(p => ({ ...p, playing: false })); }
  };
  // 队列优先用 nowQueue（播放歌单/播放搜索结果时设的），否则全库；上一首/下一首在队列里循环。
  // 关键：切歌时把当前队列一起传给 playSong，否则播放歌单里点下一首会把队列缩成单曲。
  const stepSong = dir => {
    const L = listenRef.current, all = L.songs || [];
    let q = (L.nowQueue && L.nowQueue.length ? L.nowQueue : all.map(s => s.id)).filter(id => !!resolveSong(id));
    if (!q.length) return;
    if ((L.playMode || "order") === "shuffle" && q.length > 1) {
      let n; do { n = q[Math.floor(Math.random() * q.length)]; } while (n === player.songId);
      playSong(n, q); return;
    }
    const i = Math.max(0, q.indexOf(player.songId));
    playSong(q[(i + dir + q.length) % q.length], q);
  };
  // ---- 下一首预取：iOS 锁屏/后台时，onEnded 里若还要 await 解析地址，那次 play() 会被当成
  // 「非用户续播」拦掉 → 卡住不换歌。所以提前把下一首地址备好，ended 时同步换 src+play() 才放得出。
  const nextUpRef = useRef({ id: null, url: null, song: null });
  const computeNextId = () => {
    const L = listenRef.current || {};
    const all = L.songs || [];
    const q = (L.nowQueue && L.nowQueue.length ? L.nowQueue : all.map(s => s.id)).filter(id => !!resolveSong(id));
    if (!q.length) return null;
    const mode = L.playMode || "order";
    if (mode === "one") return player.songId || q[0];
    if (mode === "shuffle" && q.length > 1) { let n; do { n = q[Math.floor(Math.random() * q.length)]; } while (n === player.songId); return n; }
    const i = Math.max(0, q.indexOf(player.songId));
    return q[(i + 1 + q.length) % q.length];
  };
  const preloadNext = async () => {
    const id = computeNextId();
    if (!id) { nextUpRef.current = { id: null, url: null, song: null }; return; }
    if (nextUpRef.current.id === id && nextUpRef.current.url) return; // 已备好
    const song = resolveSong(id);
    if (!song) return;
    const url = await resolvePlayUrl(song);
    if (url) nextUpRef.current = { id, url, song };
  };
  // 播放结束自动下一首：单曲循环重播；否则用预取好的地址同步续播（后台/锁屏也能切），没预取到才退回异步路径
  const advanceSong = () => {
    const L = listenRef.current || {};
    const mode = L.playMode || "order";
    const el = audioElRef.current;
    if (mode === "one" && player.songId && el) { try { el.currentTime = 0; const pr = el.play(); if (pr && pr.catch) pr.catch(() => {}); setPlayer(p => ({ ...p, playing: true })); return; } catch (e) {} }
    const nu = nextUpRef.current;
    if (el && nu && nu.url && nu.song) {
      const song = nu.song, songId = nu.id;
      if (song.source === "local") { if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current); playUrlRef.current = nu.url; }
      el.src = nu.url;
      const pr = el.play(); if (pr && pr.then) pr.then(() => setPlayer(p => ({ ...p, playing: true, loading: false }))).catch(() => setPlayer(p => ({ ...p, loading: false })));
      setPlayer(p => ({ ...p, songId, playing: true, loading: false, err: null, t: 0 }));
      saveListen(p => {
        const hist = [{ id: song.id, title: song.title, artist: song.artist || "", partnerId: p.partnerId || null, ts: Date.now() }, ...(p.history || []).filter(x => x.id !== song.id)].slice(0, 30);
        return { ...p, nowId: songId, history: hist };
      });
      nextUpRef.current = { id: null, url: null, song: null };
      setTimeout(preloadNext, 400);
      return;
    }
    stepSong(1);
  };
  // 顺序 → 单曲循环 → 随机 → 顺序
  const cyclePlayMode = () => saveListen(p => { const order = ["order", "one", "shuffle"]; const cur = p.playMode || "order"; return { ...p, playMode: order[(order.indexOf(cur) + 1) % 3] }; });
  const seekPlayer = frac => { const el = audioElRef.current; if (el && el.duration) el.currentTime = Math.max(0, Math.min(1, frac)) * el.duration; };
  // 悬浮球上的叉：立刻停播 + 收起悬浮（player.songId 清空 → 悬浮不显示）。再进一起听点歌才会重新唤起。
  const stopPlayer = () => {
    const el = audioElRef.current;
    if (el) { el.pause(); el.removeAttribute("src"); try { el.load(); } catch (e) {} }
    if (playUrlRef.current) { URL.revokeObjectURL(playUrlRef.current); playUrlRef.current = null; }
    setPlayer(p => ({ ...p, songId: null, playing: false, t: 0, dur: 0, loading: false, err: null }));
  };
  // ---- Media Session：锁屏/后台控制 + 让 iOS 把这当正经播放器 ----
  // 关键：不接 Media Session 时，锁屏/切到后台后 iOS 会挂起页面 JS，一首放完 onEnded 不跑、
  // 也不让程序化续播 → 就卡在原地不换下一首。接上 metadata + 动作句柄后系统才会持续给它跑，能后台自动切歌。
  // 句柄只注册一次，内部走 ref 调最新的控制函数，避免闭包过期。
  const mediaCtlRef = useRef({});
  mediaCtlRef.current = {
    play: () => { const el = audioElRef.current; if (el && el.paused) togglePlay(); },
    pause: () => { const el = audioElRef.current; if (el && !el.paused) togglePlay(); },
    next: () => stepSong(1),
    prev: () => stepSong(-1),
    seekTo: sec => { const el = audioElRef.current; if (el && el.duration) seekPlayer(sec / el.duration); }
  };
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
    set("play", () => mediaCtlRef.current.play());
    set("pause", () => mediaCtlRef.current.pause());
    set("previoustrack", () => mediaCtlRef.current.prev());
    set("nexttrack", () => mediaCtlRef.current.next());
    set("seekto", d => { if (d && typeof d.seekTime === "number") mediaCtlRef.current.seekTo(d.seekTime); });
    return () => ["play", "pause", "previoustrack", "nexttrack", "seekto"].forEach(a => set(a, null));
  }, []);
  // 当前曲目信息 + 播放态同步给系统（锁屏显示 + 维持后台会话）
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const cur = resolveSong(player.songId);
    if (cur && typeof MediaMetadata !== "undefined") {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cur.title || "未知",
          artist: cur.artist || "",
          artwork: cur.cover ? [{ src: cur.cover, sizes: "512x512", type: "image/png" }] : []
        });
      } catch (e) {}
    }
    try { navigator.mediaSession.playbackState = player.songId ? (player.playing ? "playing" : "paused") : "none"; } catch (e) {}
  }, [player.songId, player.playing]);
  // 歌一开始放就预取下一首地址，供 onEnded 后台同步续播（见 advanceSong / preloadNext）
  useEffect(() => {
    if (!player.songId || !player.playing) return;
    nextUpRef.current = { id: null, url: null, song: null };
    const tid = setTimeout(() => { preloadNext(); }, 600);
    return () => clearTimeout(tid);
  }, [player.songId, player.playing]);
  // fav / 封面 / 改名：在「全部」库、所有歌单、nowSong 里凡是同 id 的都改（保持各处一份数据一致）
  const patchSongEverywhere = (id, patch) => saveListen(p => ({
    ...p,
    songs: (p.songs || []).map(s => s.id === id ? { ...s, ...patch } : s),
    playlists: (p.playlists || []).map(pl => ({ ...pl, songs: (pl.songs || []).map(s => s.id === id ? { ...s, ...patch } : s) })),
    nowSong: p.nowSong && p.nowSong.id === id ? { ...p.nowSong, ...patch } : p.nowSong
  }));
  const toggleFav = id => {
    const s = resolveSong(id);
    const nowFav = !(s && s.fav);
    const inLib = (listenRef.current.songs || []).some(x => x.id === id);
    // 收藏一首还没进库的歌（搜索结果直接播的只暂存在 nowSong、不在 songs 里）→ 顺手加进「全部」，
    // 否则收藏列表(favs=songs.filter(fav))看不到它、且 nowSong 是临时的换首歌就丢了
    if (nowFav && !inLib && s) {
      saveListen(p => ({
        ...p,
        songs: [{ ...s, fav: true }, ...(p.songs || [])],
        nowSong: (p.nowSong && p.nowSong.id === id) ? { ...p.nowSong, fav: true } : p.nowSong
      }));
      return;
    }
    patchSongEverywhere(id, { fav: nowFav });
  };
  const renameSong = (id, title) => { const tt = (title || "").trim(); if (tt) patchSongEverywhere(id, { title: tt }); };
  const setSongCover = async (songId, file) => {
    if (!file) return;
    try { const url = await resizeImageFile(file, 500, 0.82); patchSongEverywhere(songId, { cover: url }); }
    catch (e) { toast("图片处理失败"); }
  };
  // 命名歌单（放「我的」）：各歌单独立存整份歌对象，和「全部」库无依赖
  const cloneSong = s => ({ ...s, id: (s.id || "sg_") + "_pl" + Math.random().toString(36).slice(2, 6) });
  const createPlaylist = (name, songObjs, extra) => { const id = "pl_" + Date.now(); saveListen(p => ({ ...p, playlists: [{ id, name: (name || "新歌单").trim() || "新歌单", songs: (songObjs || []).map(cloneSong), ts: Date.now(), ...(extra || {}) }, ...(p.playlists || [])] })); return id; };
  const deletePlaylist = id => saveListen(p => ({ ...p, playlists: (p.playlists || []).filter(x => x.id !== id) }));
  const renamePlaylist = (id, name) => { const nm = (name || "").trim(); if (nm) saveListen(p => ({ ...p, playlists: (p.playlists || []).map(x => x.id === id ? { ...x, name: nm } : x) })); };
  const addToPlaylist = (plId, song) => { if (!song) return; saveListen(p => ({ ...p, playlists: (p.playlists || []).map(pl => pl.id === plId ? ((pl.songs || []).some(s => (song.neteaseId && s.neteaseId === song.neteaseId) || s.id === song.id) ? pl : { ...pl, songs: [...(pl.songs || []), cloneSong(song)] }) : pl) })); toast("已加入歌单"); };
  const removeFromPlaylist = (plId, songId) => saveListen(p => ({ ...p, playlists: (p.playlists || []).map(pl => pl.id === plId ? { ...pl, songs: (pl.songs || []).filter(s => s.id !== songId) } : pl) }));
  // 开关：让一起听的角色在聊天界面自行评论正在听的歌（关=不主动提，省 api）
  const setListenAutoComment = v => saveListen(p => ({ ...p, autoComment: !!v }));
  // 接受角色的「一起听」邀请：设为一起听对象 + 有指定歌就找/搜来放 + 跳到播放器
  const acceptListenInvite = async (charId, songTitle) => {
    setListenPartner(charId);
    const tt = (songTitle || "").trim();
    if (tt) {
      const lib = listenRef.current.songs || [];
      let hit = lib.find(s => s.title && (s.title === tt || s.title.includes(tt) || tt.includes(s.title)));
      if (hit) playSong(hit.id);
      else if (neteaseApi) {
        try { const r = await fetch(neteaseApi + "/search?keywords=" + encodeURIComponent(tt) + "&limit=1"); const d = await r.json(); const s = d && d.result && d.result.songs && d.result.songs[0]; if (s) playSong(resultToSong({ id: s.id, name: s.name, artist: (s.artists || s.ar || []).map(a => a.name).filter(Boolean).join(" / "), cover: (s.album || s.al || {}).picUrl })); } catch (e) {}
      }
    }
    goListen();
  };
  // 自动感知音乐（item 6）：开了"让 TA 聊歌"且正在看该角色私聊时，换歌会让 TA 自动就着新歌说一句（消耗一次回复；关掉开关就不动 api）
  const lastAutoSongRef = useRef(null);
  useEffect(() => {
    const L = listenRef.current || {};
    if (!L.autoComment || !player.songId) { lastAutoSongRef.current = player.songId; return; }
    if (player.songId === lastAutoSongRef.current) return;
    const prev = lastAutoSongRef.current;
    lastAutoSongRef.current = player.songId;
    if (prev == null) return; // 首次加载不触发
    if (screen === "thread" && activeChar && activeChar.id === L.partnerId) {
      const cid = activeChar.id;
      setTimeout(() => { if (!laneBusy("c:" + cid)) replyNow(cid, null, null, { proactive: true }); }, 900);
    }
  }, [player.songId]);
  // 网易云外链：贴链接/分享文案/裸ID → 抠 id，用官方 outchain iframe 播放（无需登陆；VIP/版权歌可能放不了）
  const addNeteaseSong = (input, title, artist) => {
    const nid = parseNeteaseId(input);
    if (!nid) { toast("没认出网易云歌曲链接或ID"); return; }
    saveListen(p => ({ ...p, songs: [{ id: "sg_" + Date.now(), source: "netease", neteaseId: nid, title: (title || "").trim() || ("网易云歌曲 " + nid), artist: (artist || "").trim(), ts: Date.now() }, ...(p.songs || []).filter(x => x.neteaseId !== nid)].slice(0, 40) }));
    toast("已添加");
  };
  // 本地音频：真文件 → 存 IndexedDB（持久），播放时取出建 objectURL
  const addLocalSong = async (file, title, artist) => {
    if (!file) return;
    const id = "sg_" + Date.now();
    try { await idbAudioPut(id, file); } catch (e) { toast("音频存储失败"); return; }
    saveListen(p => ({ ...p, songs: [{ id, source: "local", title: (title || "").trim() || file.name.replace(/\.[^.]+$/, ""), artist: (artist || "").trim(), ts: Date.now() }, ...(p.songs || [])].slice(0, 40) }));
    toast("已添加");
  };
  const setListenPartner = charId => saveListen(p => ({ ...p, partnerId: charId }));
  const saveNeteaseApi = url => { const u = (url || "").trim().replace(/\/+$/, ""); setNeteaseApi(u); saveJSON("x_neteaseApi", u); toast(u ? "已连搜索接口" : "已清空"); };
  const saveNeteaseCookie = ck => { const c = (ck || "").trim(); setNeteaseCookie(c); saveJSON("x_neteaseCookie", c); toast(c ? "已保存 Cookie（可放 VIP 了）" : "已清空 Cookie"); };
  // 测试网易云登录/VIP 状态
  const testNeteaseLogin = async () => {
    if (!neteaseApi) { toast("先填接口地址"); return; }
    const cval = normCookie();
    if (!cval) { toast("先填 Cookie"); return; }
    try {
      // 用 /user/account 更可靠地反映登录态（/login/status 在 serverless 偶尔认不出）
      const r = await fetch(neteaseApi + "/user/account?cookie=" + encodeURIComponent(cval) + "&timestamp=" + Date.now());
      const d = await r.json();
      const prof = (d && d.profile) || (d && d.data && d.data.profile) || null;
      const vip = (d && d.account && d.account.vipType) || 0;
      if (prof && prof.nickname) toast("已登录：" + prof.nickname + (vip ? " · VIP" : " · 非VIP"));
      else toast("未登录（Cookie 失效或没粘全，重抓一份 MUSIC_U）");
    } catch (e) { toast("测试失败：接口没响应"); }
  };
  // 网易云搜索结果 → 播放器歌对象
  const resultToSong = s => ({ id: "sg_" + Date.now() + "_" + s.id + "_" + Math.random().toString(36).slice(2, 5), source: "netease", neteaseId: String(s.id), title: s.name || ("网易云 " + s.id), artist: s.artist || "", cover: s.cover || null, ts: Date.now() });
  // 搜索结果：直接现在播放（临时，不塞进「全部」）/ 加进「全部」库 / 加进某个歌单
  const playNeteaseResult = s => playSong(resultToSong(s));
  const addNeteaseResult = s => saveListen(p => ({ ...p, songs: [resultToSong(s), ...(p.songs || []).filter(x => x.neteaseId !== String(s.id))].slice(0, 60) }));
  const addResultToPlaylist = (plId, s) => addToPlaylist(plId, resultToSong(s));
  // 根据角色人设造一张歌单：让角色推歌名 → 逐首去网易云搜到真曲(可直接听) → 建独立歌单归到 charId（不进「全部」库）
  const genCharPlaylist = async char => {
    if (!char) return;
    if (!active) { toast("请先到设置配置 API"); return; }
    if (!neteaseApi) { toast("先在下方配一个网易云搜索接口，才能拉到能播的歌"); return; }
    setGen(g => ({ ...g, charPlaylist: char.id }));
    try {
      // 已有歌单：新生成【往里加】不覆盖、跳过重复。先拿到已有的歌，既让模型别再推、也在入库时去重。
      const existingPl = (listenRef.current.playlists || []).find(x => x.charId === char.id);
      const existingSongs = (existingPl && existingPl.songs) || [];
      const existingIds = new Set(existingSongs.map(s => s.neteaseId).filter(Boolean));
      const existingTitles = existingSongs.map(s => s.title).filter(Boolean);
      const avoidStr = existingTitles.length ? "\n**这张歌单里已经有这些歌了，别再推荐它们、也别推重复的，给全新的：** " + existingTitles.slice(0, 50).join("、") : "";
      // 用干净上下文：去掉手机在听/最近听歌/朋友圈等会污染推荐的字段（否则角色只会照抄用户刚搜的、或查手机里那两首）
      const cleanCtx = Object.assign({}, ctxFor(char), { phoneNote: "", listenLog: "", momentLog: "", forumEcho: "", giftLog: "", recentChat: "" });
      // 解析：可能是 {songs:[...]}、裸数组、{list/data/result:[...]}；元素可能是对象或"歌名 - 歌手"字符串
      const parseWants = rec => {
        let raw = rec && Array.isArray(rec.songs) ? rec.songs : Array.isArray(rec) ? rec : (rec && (rec.list || rec.data || rec.result || rec.tracks)) || [];
        return (Array.isArray(raw) ? raw : []).map(w => {
          if (typeof w === "string") { const parts = w.replace(/^\d+[.、)\s]+/, "").split(/\s*[-–—/]\s*/); return { title: (parts[0] || "").replace(/^《|》$/g, "").trim(), artist: (parts[1] || "").trim() }; }
          return { title: String((w && (w.title || w.name || w.song)) || "").trim(), artist: String((w && (w.artist || w.singer || w.by)) || "").trim() };
        }).filter(s => s.title);
      };
      const probeOnce = async nudge => {
        try {
          const rec = await runProbe(active, cleanCtx, {
            instruction: "你是「" + char.name + "」。**完全按你自己的人设、成长背景、性格和音乐口味**，一次性列出 **15 首**你自己私下真会单曲循环、真实存在、能在主流平台搜到的歌（华语/欧美/日韩都行，别编造不存在的歌，风格可多样）。**别照抄任何你手机里在听/最近听过/用户刚搜过或已有的歌，要发自内心喜欢的。songs 数组要尽量凑满 15 个元素。**" + avoidStr + (nudge || "") + " 只给歌，别写解释别写序号。",
            schemaHint: "{\"songs\":[{\"title\":\"某首歌\",\"artist\":\"某歌手\"}]}（songs 尽量给 15 个元素）", maxTokens: 2200
          });
          return parseWants(rec);
        } catch (e) { return []; }
      };
      // 多要一些候选（网易云搜不到会掉一部分），不够就再刷一两轮凑
      let wants = await probeOnce("");
      let tries = 0;
      while (wants.length < 12 && tries < 2) {
        tries++;
        const more = await probeOnce("上次给少了，这次再多给一些不一样的歌，把 15 首凑够。");
        const seen = new Set(wants.map(s => s.title));
        more.forEach(s => { if (s.title && !seen.has(s.title)) { seen.add(s.title); wants.push(s); } });
      }
      wants = wants.slice(0, 18);
      if (!wants.length) { toast("没生成出歌，重试下"); return; }
      const searchOne = async kw => {
        try { const r = await fetch(neteaseApi + "/search?keywords=" + encodeURIComponent(kw) + "&limit=1&timestamp=" + Date.now()); const d = await r.json(); return (d && d.result && d.result.songs && d.result.songs[0]) || null; } catch (e) { return null; }
      };
      const added = [];
      for (const w of wants) {
        if (added.length >= 14) break;
        let hit = await searchOne((w.title + " " + (w.artist || "")).trim());
        if (!hit) hit = await searchOne(w.title); // 带歌手搜不到 → 只用歌名再试
        if (!hit) continue;
        const nid = String(hit.id);
        if (added.some(a => a.neteaseId === nid) || existingIds.has(nid)) continue; // 跳过本轮重复 + 歌单里已有的
        const cover = ((hit.album || hit.al || {}).picUrl) || null;
        const artist = (hit.artists || hit.ar || []).map(a => a.name).filter(Boolean).join(" / ") || (w.artist || "");
        added.push({ id: "sg_" + Date.now() + "_" + nid, source: "netease", neteaseId: nid, title: hit.name || w.title, artist, cover, ts: Date.now() });
      }
      if (!added.length) { toast("网易云没搜到这些歌（换个接口或稍后再试）"); return; }
      // 往已有歌单里【追加】新歌、按 neteaseId + 歌名歌手去重；没有就新建
      let freshCount = 0;
      saveListen(p => {
        const pls = p.playlists || [];
        const existing = pls.find(x => x.charId === char.id);
        if (existing) {
          const haveIds = new Set((existing.songs || []).map(s => s.neteaseId).filter(Boolean));
          const haveKeys = new Set((existing.songs || []).map(s => (String(s.title) + "|" + String(s.artist)).toLowerCase()));
          const fresh = added.filter(s => !(s.neteaseId && haveIds.has(s.neteaseId)) && !haveKeys.has((String(s.title) + "|" + String(s.artist)).toLowerCase()));
          freshCount = fresh.length;
          const merged = Object.assign({}, existing, { songs: [...(existing.songs || []), ...fresh], cover: existing.cover || (added[0] && added[0].cover) || null, ts: Date.now() });
          return { ...p, playlists: [merged, ...pls.filter(x => x.charId !== char.id)] };
        }
        freshCount = added.length;
        return { ...p, playlists: [{ id: "pl_" + Date.now(), name: char.name + "的歌单", charId: char.id, cover: added[0].cover || null, songs: added, ts: Date.now() }, ...pls] };
      });
      if (!existingSongs.length) toast(char.name + " 的歌单好了 · " + added.length + " 首");
      else if (freshCount) toast("给 " + char.name + " 的歌单又添了 " + freshCount + " 首" + (added.length - freshCount > 0 ? "（跳过 " + (added.length - freshCount) + " 首重复）" : ""));
      else toast("这轮推的歌都已经在歌单里了，没新增");
    } catch (e) { toast("生成失败：" + (e.message || "重试")); }
    finally { setGen(g => ({ ...g, charPlaylist: null })); }
  };
  // TA 主动贴一张（右上刷新触发；未来接调度器）
  const genCoupleNote = async char => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleNote: true }));
    try {
      const d = await runProbe(bgActive, ctxFor(char), {
        instruction: "你们是恋人。以「" + char.name + "」身份，在你俩私密的「便签墙」上悄悄贴一张小纸条给用户——一句恋爱向、藏着心意、想对 TA 说却没在聊天里直接说出口的悄悄话（不是脑内碎碎念的心声，是想让 TA 悄悄收到的情话/在乎），贴合人设与此刻心情，别喊口号，别超过 25 字。",
        schemaHint: "{\"note\":\"给 TA 的悄悄情话\"}"
      });
      setCoupleNotes(p => {
        const n = [{ id: "note_" + Date.now(), characterId: char.id, authorId: char.id, content: (d.note || "").trim(), style: Math.floor(Math.random() * 5), createdAt: Date.now(), replies: [] }, ...p];
        saveJSON("x_coupleNotes", n);
        return n;
      });
      return true;
    } catch (e) {
      toast("失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, coupleNote: false }));
    }
  };

  // ============================================================
  // 购物 Shopping —— 商品流生成 / 购物车 / 结算(购买·送礼·代付·亲属卡) / 待发货待收货
  // ============================================================
  // 各品类送达用时（分钟区间）——外卖约半小时，实物几小时到一两天
  const CAT_DELIVER = { food: [25, 35], beauty: [180, 360], digital: [240, 480], fashion: [180, 360], adult: [240, 480], recommend: [180, 360], furniture: [720, 1440] };
  const deliverMsForCat = cat => { const r = CAT_DELIVER[cat] || [180, 360]; return Math.round((r[0] + Math.random() * (r[1] - r[0])) * 60000); };
  const saveOrders = updater => setOrders(p => {
    const n = typeof updater === "function" ? updater(p) : updater;
    ordersRef.current = n;
    saveJSON("x_shopOrders", n);
    return n;
  });
  const addOrder = o => saveOrders(p => [{
    id: "od_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
    status: "shipping",
    arriveTs: Date.now() + deliverMsForCat(o.cat),
    ts: Date.now(),
    fromCharId: null,
    payLabel: "",
    cat: null,
    ...o
  }, ...p]);
  const promoteOrders = () => {
    const now = Date.now();
    let changed = false;
    const n = ordersRef.current.map(o => {
      if (o.status === "shipping" && o.arriveTs <= now) {
        changed = true;
        return { ...o, status: "receiving" };
      }
      return o;
    });
    if (changed) saveOrders(n);
  };
  // 我送给角色的礼物到点：入 TA 的随身物品(永久) + TA 才 cue 到收到、做出反应
  const promoteGifts = () => {
    const now = Date.now();
    const due = giftOutRef.current.filter(g => g.arriveTs <= now);
    if (!due.length) return;
    const rest = giftOutRef.current.filter(g => g.arriveTs > now);
    giftOutRef.current = rest;
    setGiftOut(rest); saveJSON("x_giftOut", rest);
    due.forEach(g => {
      // 标记聊天里的礼物卡已送达
      pChat(g.charId, p => p.map(m => m.kind === "gift" && m.giftId === g.id ? { ...m, delivered: true } : m));
      // 永久存进 TA 的随身物品
      setCarryGifts(prev => {
        const list = prev[g.charId] || [];
        const n = { ...prev, [g.charId]: [{ id: g.id, name: g.name, receivedTs: now }, ...list] };
        carryGiftsRef.current = n; saveJSON("x_carryGifts", n);
        return n;
      });
      charReceiveGiftReact(g.charId, g.name);
    });
  };
  useEffect(() => {
    promoteOrders(); promoteGifts();
    const iv = setInterval(() => { promoteOrders(); promoteGifts(); }, 4000);
    return () => clearInterval(iv);
  }, []);

  // 生成商品流（AI 推荐）。append=true 追加「继续看」
  const genShop = async (cat, keyword, append) => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setShopBusy(true);
    try {
      const label = (typeof SHOP_CATS !== "undefined" ? SHOP_CATS.find(c => c.key === cat) : null);
      const topic = keyword && keyword.trim() ? "用户搜索关键词「" + keyword.trim() + "」" : "「" + (label ? label.zh : cat) + "」分类";
      const d = await runProbe(bgActive, { char: { id: "__shop", name: "购物", persona: "" }, chars: characters, rels, profile, timeAware: false }, {
        instruction: "你是一个综合购物 App 的推荐引擎（类似淘宝）。围绕" + topic + "，**务必推荐正好 6 件商品（items 数组必须有 6 个元素，缺一不可）**。每件：name(有画面感的具体商品名) / price(纯数字人民币，符合该品类的合理价位，有高有低) / desc(一句卖点或描述) / sales(销量文案，如「2万+人付款」「8000+人付款」)。要贴合该分类，别跑题。",
        schemaHint: "{\"items\":[{\"name\":\"川味经典红油抄手\",\"price\":38,\"desc\":\"地道成都风味\",\"sales\":\"2万+人付款\"}]}",
        maxTokens: 3500
      });
      const items = ((d && d.items) || []).map((it, i) => ({
        uid: "p_" + Date.now() + "_" + i + "_" + Math.floor(Math.random() * 10000),
        name: it.name || "商品",
        price: Math.max(1, Math.round(Number(it.price)) || (10 + Math.floor(Math.random() * 190))),
        desc: it.desc || "",
        sales: it.sales || "",
        cat
      }));
      setShopFeed(prev => {
        const n = { ...prev, [cat]: append ? [...(prev[cat] || []), ...items] : items };
        saveJSON("x_shopFeed", n);
        return n;
      });
    } catch (e) {
      toast("刷新失败：" + e.message);
    } finally {
      setShopBusy(false);
    }
  };

  const addToCart = product => setCart(p => {
    const n = [...p, { uid: "c_" + Date.now() + "_" + Math.floor(Math.random() * 10000), name: product.name, price: product.price, cat: product.cat, desc: product.desc }];
    saveJSON("x_shopCart", n);
    return n;
  });
  const removeCartUids = uids => setCart(p => {
    const set = new Set(uids);
    const n = p.filter(x => !set.has(x.uid));
    saveJSON("x_shopCart", n);
    return n;
  });

  // 送礼物给角色（结算送礼 / 待收货转赠 共用）：礼物按品类送达用时「在路上」，到点 promoteGifts 里 TA 才 cue 到、并永久存进 TA 随身物品
  const sendGiftToChar = (charId, itemName, cat) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const giftId = "gf_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const arriveTs = Date.now() + deliverMsForCat(cat);
    pChat(charId, p => [...p, { role: "user", kind: "gift", dir: "toChar", giftId, arriveTs, delivered: false, item: { name: itemName }, content: "[礼物] 送给你：" + itemName, ts: Date.now(), read: true }]);
    setGiftOut(p => { const n = [...p, { id: giftId, charId, name: itemName, arriveTs, cat: cat || null }]; giftOutRef.current = n; saveJSON("x_giftOut", n); return n; });
    toast("礼物已下单，送给 " + (char.remark || char.name) + "，在路上");
  };
  // 礼物送达后，TA 才 cue 到收到并做出反应
  const charReceiveGiftReact = async (charId, itemName) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !active) return;
    try {
      const bundle = buildBundle(ctxFor(char));
      const system = bundle + "\n\n【任务】你刚刚收到了用户之前送你的一份礼物「" + itemName + "」（快递/礼物刚送到你手上）。完全代入「" + char.name + "」，用即时通讯口吻主动跟用户说你收到了、并自然回应，短句多气泡，依据人设与好感表达（惊喜/害羞/淡定/调侃都行），别旁白别括号动作。\n【输出】只输出 JSON：{\"word\":[\"气泡1\",\"气泡2\"],\"affinityDelta\":整数(-3到5)}";
      const raw = await callAI(active, system, [{ role: "user", content: "[收到礼物：" + itemName + "]" }]);
      const d = extractJSON(raw) || { word: ["收到你的礼物了，谢谢…"] };
      const words = Array.isArray(d.word) ? d.word.filter(Boolean) : [String(d.word)];
      const turnId = "t_" + Date.now();
      for (let i = 0; i < words.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400));
        pChat(charId, p => [...p, { role: "assistant", content: words[i], ts: Date.now(), read: false, turnId }]);
      }
      if (typeof d.affinityDelta === "number") bumpAff(charId, d.affinityDelta, (moods[charId] || {}).label);
    } catch (e) {/* silent */}
  };
  // 角色主动买东西送我（replyNow embed）：进我的待发货，走同一套送达逻辑
  const postCharGift = (charId, name) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !name) return;
    pChat(charId, p => [...p, { role: "assistant", kind: "gift", dir: "toMe", item: { name }, content: "[礼物] " + char.name + " 给你寄了：" + name, ts: Date.now(), read: false, turnId: "gf_" + Date.now() }]);
    addOrder({ name, price: 0, fromCharId: charId, cat: null, payLabel: (char.remark || char.name) + " 送的" });
  };

  // 代付：把清单发给角色/群聊，角色按人设+好感+余额决定要不要付
  const requestPayLater = (items, total, target) => {
    const pid = "pl_" + Date.now();
    const card = { kind: "paylater", pid, items: items.map(x => ({ name: x.name, price: x.price })), total, status: "pending" };
    if (target.type === "group") {
      pushGroupRich(target.id, { role: "user", ...card, content: "[代付请求] 合计 ¥" + total });
      setTimeout(() => decideGroupPayLater(target.id, pid, items, total), 1400);
    } else {
      pChat(target.id, p => [...p, { role: "user", ...card, content: "[代付请求] 合计 ¥" + total, ts: Date.now(), read: true }]);
      setTimeout(() => decidePayLater(target.id, pid, items, total), 1400);
    }
    toast("代付请求已发出，等对方决定");
  };
  const finishPayLater = (charId, items, total, char) => {
    adjustCharBalance(charId, -total, "代付 · " + items.map(x => x.name).join("、").slice(0, 18), "shop");
    items.forEach(it => addOrder({ name: it.name, price: it.price, cat: it.cat, fromCharId: charId, payLabel: (char ? char.name : "对方") + " 代付" }));
  };
  const decidePayLater = async (charId, pid, items, total) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !active) return;
    const bal = charBalanceOf(charId);
    try {
      const bundle = buildBundle(ctxFor(char));
      const system = bundle + "\n\n【任务】用户把一份购物清单发给你，请求你「代付」——用你自己的钱帮 Ta 结账。清单：" + items.map(x => x.name + " ¥" + x.price).join("、") + "，合计 ¥" + total + "。你当前余额约 ¥" + Math.round(bal) + "。请完全代入「" + char.name + "」，依据人设、对用户的好感、你们的关系、以及你的经济状况，决定要不要帮 Ta 付。愿意就 agree:true；不愿意/嫌贵/想逗 Ta/囊中羞涩就 agree:false。无论同不同意都用即时通讯口吻回几句(say)，短句多气泡。\n【输出】只输出 JSON：{\"agree\":true或false,\"say\":[\"气泡1\",\"气泡2\"]}";
      const raw = await callAI(active, system, [{ role: "user", content: "[代付请求] " + items.map(x => x.name).join("、") + " 合计 ¥" + total }]);
      const d = extractJSON(raw) || { agree: false, say: ["……让我想想。"] };
      const agree = !!d.agree && bal >= total;
      pChat(charId, p => p.map(m => m.kind === "paylater" && m.pid === pid ? { ...m, status: agree ? "paid" : "declined" } : m));
      if (agree) finishPayLater(charId, items, total, char);
      const words = Array.isArray(d.say) ? d.say.filter(Boolean) : [String(d.say || "")];
      const turnId = "t_" + Date.now();
      for (let i = 0; i < words.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400));
        pChat(charId, p => [...p, { role: "assistant", content: words[i], ts: Date.now(), turnId }]);
      }
      toast(agree ? char.name + " 帮你付了款" : char.name + " 没有帮你付");
    } catch (e) {
      pChat(charId, p => p.map(m => m.kind === "paylater" && m.pid === pid ? { ...m, status: "declined" } : m));
      toast("代付失败：" + e.message);
    }
  };
  const decideGroupPayLater = async (groupId, pid, items, total) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || !active) return;
    const members = (group.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
    if (!members.length) return;
    try {
      const roster = members.map(m => m.name + "(余额约¥" + Math.round(charBalanceOf(m.id)) + ")").join("、");
      const bundle = buildBundle(ctxFor(members[0]));
      const system = bundle + "\n\n【场景】这是一个群聊，成员：" + roster + "。用户在群里发了一份购物清单请人「代付」。清单：" + items.map(x => x.name + " ¥" + x.price).join("、") + "，合计 ¥" + total + "。请推演群里的反应：可能有人愿意帮付、有人起哄、有人拒绝。最终最多一人真正代付（payerName 填那个人的名字；没人付就填 null，要付的人余额需≥合计）。say 是群里你来我往的几句对话，每条注明说话人。\n【输出】只输出 JSON：{\"payerName\":\"名字或null\",\"say\":[{\"name\":\"成员名\",\"text\":\"内容\"}]}";
      const raw = await callAI(active, system, [{ role: "user", content: "[代付请求] " + items.map(x => x.name).join("、") + " 合计 ¥" + total }]);
      const d = extractJSON(raw) || { payerName: null, say: [] };
      const say = Array.isArray(d.say) ? d.say : [];
      for (let i = 0; i < say.length; i++) {
        const spk = members.find(m => m.name === (say[i].name || "").trim()) || members[0];
        if (i > 0) await new Promise(r => setTimeout(r, 500));
        pushGroupRich(groupId, { role: "char", senderId: spk.id, senderName: spk.name, content: String(say[i].text || "").trim() });
      }
      const payer = d.payerName && String(d.payerName).toLowerCase() !== "null" ? members.find(m => m.name === String(d.payerName).trim()) : null;
      const ok = payer && charBalanceOf(payer.id) >= total;
      pGChat(groupId, p => p.map(m => m.kind === "paylater" && m.pid === pid ? { ...m, status: ok ? "paid" : "declined" } : m));
      if (ok) {
        finishPayLater(payer.id, items, total, payer);
        pushGroupRich(groupId, { role: "system", senderName: "系统", content: payer.name + " 帮你付了这单（¥" + total + "）" });
      }
      toast(ok ? payer.name + " 帮你付了款" : "群里没人帮你付");
    } catch (e) {
      pGChat(groupId, p => p.map(m => m.kind === "paylater" && m.pid === pid ? { ...m, status: "declined" } : m));
      toast("代付失败：" + e.message);
    }
  };

  // 用某角色的亲属卡付款（刷 TA 的钱）
  const payWithKinship = (charId, items, total) => {
    const card = kinshipCardsRef.current.find(c => c.charId === charId);
    const char = characters.find(c => c.id === charId);
    if (!card) { toast("没有这张亲属卡"); return; }
    const remaining = (card.limit || 0) - (card.used || 0);
    if (remaining < total) { toast("亲属卡额度不足（剩 ¥" + remaining + "）"); return; }
    // 扣角色余额 + 记卡账单，然后异步生成 TA 对这笔的评论
    adjustCharBalance(charId, -total, "亲属卡消费 · " + items.map(x => x.name).join("、").slice(0, 16), "kinship");
    const entryId = "kl_" + Date.now();
    updateKinshipCard(charId, cd => ({
      ...cd,
      used: Math.round(((cd.used || 0) + total) * 100) / 100,
      ledger: [{ id: entryId, ts: Date.now(), amount: total, item: items.map(x => x.name).join("、"), source: "shop", comment: "" }, ...(cd.ledger || [])]
    }));
    items.forEach(it => addOrder({ name: it.name, price: it.price, cat: it.cat, fromCharId: null, payLabel: "刷了 " + (char ? char.name : "对方") + " 的亲属卡" }));
    toast("已用 " + (char ? char.name : "对方") + " 的亲属卡付款");
    genKinshipComment(charId, entryId, items.map(x => x.name).join("、"), total);
  };

  // 使用（待收货→我的物品）：记谁送的 + 入库日期
  const receiveUse = orderId => {
    const o = ordersRef.current.find(x => x.id === orderId);
    if (!o) return;
    saveOrders(p => p.filter(x => x.id !== orderId));
    setInventory(inv => {
      const n = [{ id: "iv_" + Date.now() + "_" + Math.floor(Math.random() * 10000), name: o.name, fromCharId: o.fromCharId || null, addedTs: Date.now() }, ...inv];
      saveJSON("x_inventory", n);
      return n;
    });
    toast("已入库「" + o.name + "」");
  };
  // 转赠（待收货→送给角色）
  const receiveGift = (orderId, charId) => {
    const o = ordersRef.current.find(x => x.id === orderId);
    if (!o) return;
    saveOrders(p => p.filter(x => x.id !== orderId));
    sendGiftToChar(charId, o.name, o.cat);
  };
  // 结算入口
  const checkout = (uids, mode, target) => {
    const set = new Set(uids);
    const items = cart.filter(x => set.has(x.uid));
    if (!items.length) { toast("请先选择商品"); return; }
    const total = Math.round(items.reduce((s, x) => s + (Number(x.price) || 0), 0) * 100) / 100;
    if (mode === "buy") {
      if (wallet < total) { toast("余额不足"); return; }
      changeWallet(-total, "购物 " + items.map(x => x.name).join("、").slice(0, 18), "shop");
      items.forEach(it => addOrder({ name: it.name, price: it.price, cat: it.cat }));
      removeCartUids(uids);
      toast("下单成功 · " + items.length + " 件，等待发货");
    } else if (mode === "kinship") {
      if (!target || target.type !== "char") { toast("请选择亲属卡"); return; }
      payWithKinship(target.id, items, total);
      removeCartUids(uids);
    } else if (mode === "gift") {
      if (!target || target.type !== "char") { toast("请选择送礼对象"); return; }
      if (wallet < total) { toast("余额不足"); return; }
      changeWallet(-total, "送礼 " + items.map(x => x.name).join("、").slice(0, 18), "shop");
      items.forEach(it => sendGiftToChar(target.id, it.name, it.cat));
      removeCartUids(uids);
    } else if (mode === "paylater") {
      if (!target) { toast("请选择代付对象"); return; }
      requestPayLater(items, total, target);
      removeCartUids(uids);
    }
  };

  // ============================================================
  // 亲属卡 Kinship Card —— 发放(embed 进 replyNow) / 加额度 / 每卡账单 / 角色评论
  // ============================================================
  const saveKinship = updater => setKinshipCards(p => {
    const n = typeof updater === "function" ? updater(p) : updater;
    kinshipCardsRef.current = n;
    saveJSON("x_kinshipCards", n);
    return n;
  });
  const updateKinshipCard = (charId, fn) => saveKinship(p => p.map(c => c.charId === charId ? fn(c) : c));
  const hasKinship = charId => kinshipCardsRef.current.some(c => c.charId === charId);
  // 角色发放亲属卡（replyNow 里 embed，或加额度）
  const issueKinship = (charId, limit, note) => {
    const char = characters.find(c => c.id === charId);
    const lim = Math.max(0, Math.round(Number(limit) || 0));
    if (!char || lim <= 0) return;
    if (hasKinship(charId)) return; // 一角色一张
    const cardId = "kc_" + Date.now();
    saveKinship(p => [...p, { charId, cardId, cardName: (char.name || "") + " 的亲属卡", limit: lim, used: 0, ledger: [], issuedTs: Date.now(), note: note || "" }]);
    pChat(charId, p => [...p, { role: "assistant", kind: "kinship", cardId, charId, limit: lim, note: note || "", content: "[亲属卡] " + char.name + " 给了你一张亲属卡，额度 ¥" + lim, ts: Date.now(), read: false, turnId: "kc_" + Date.now() }]);
    toast(char.name + " 给了你一张亲属卡（额度 ¥" + lim + "）");
  };
  // 我在卡上/聊天里要求加额度 → 角色按人设 + 自己余额决定
  const requestKinshipRaise = async (charId, askAmount) => {
    const char = characters.find(c => c.id === charId);
    const card = kinshipCardsRef.current.find(c => c.charId === charId);
    if (!char || !card || !active) { toast("无法加额度"); return; }
    const ask = Math.max(0, Math.round(Number(askAmount) || 0));
    const bal = charBalanceOf(charId);
    pChat(charId, p => [...p, { role: "user", content: "（在亲属卡上向 " + char.name + " 申请把额度加" + (ask ? " ¥" + ask : "") + "）", ts: Date.now(), read: true }]);
    toast("已向 " + char.name + " 申请加额度");
    try {
      const bundle = buildBundle(ctxFor(char));
      const system = bundle + "\n\n【任务】你之前给了用户一张亲属卡（当前额度 ¥" + card.limit + "，已用 ¥" + (card.used || 0) + "）。现在 Ta 申请给这张卡加额度" + (ask ? "（希望加 ¥" + ask + "）" : "") + "。你余额约 ¥" + Math.round(bal) + "。完全代入「" + char.name + "」，依据人设、好感、你的经济状况决定加多少（可以爽快加、可以少加、可以拒绝加 0、可以借机撒娇/说条件）。addLimit 是你决定新增的额度数字（不加就 0）。say 用即时通讯口吻回几句。\n【输出】只输出 JSON：{\"addLimit\":数字,\"say\":[\"气泡1\"]}";
      const raw = await callAI(active, system, [{ role: "user", content: "[申请加额度]" + (ask ? " 希望加 ¥" + ask : "") }]);
      const d = extractJSON(raw) || { addLimit: 0, say: ["……再说吧。"] };
      const add = Math.max(0, Math.round(Number(d.addLimit) || 0));
      if (add > 0) updateKinshipCard(charId, cd => ({ ...cd, limit: Math.round(((cd.limit || 0) + add) * 100) / 100 }));
      const words = Array.isArray(d.say) ? d.say.filter(Boolean) : [String(d.say || "")];
      const turnId = "t_" + Date.now();
      for (let i = 0; i < words.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400));
        pChat(charId, p => [...p, { role: "assistant", content: words[i], ts: Date.now(), turnId }]);
      }
      toast(add > 0 ? char.name + " 把额度加了 ¥" + add : char.name + " 没有加额度");
    } catch (e) { toast("加额度失败：" + e.message); }
  };
  // 角色对某笔亲属卡消费的评论（购物刷卡后异步生成）
  const genKinshipComment = async (charId, entryId, itemText, amount) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !active) return;
    try {
      const bundle = buildBundle(ctxFor(char));
      const system = bundle + "\n\n【任务】用户刷了你给 Ta 的亲属卡，买了「" + itemText + "」花了 ¥" + amount + "。完全代入「" + char.name + "」，写一句你看到这笔花销时的真实反应/想法（宠溺、心疼钱、吐槽、无所谓、暗爽都行，贴合人设与好感），一两句，纯文本不要 JSON。";
      const raw = await callAI(active, system, [{ role: "user", content: "[亲属卡消费] " + itemText + " ¥" + amount }]);
      const comment = String(raw || "").replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 120);
      if (comment) updateKinshipCard(charId, cd => ({ ...cd, ledger: (cd.ledger || []).map(l => l.id === entryId ? { ...l, comment } : l) }));
    } catch (e) {/* silent */}
  };

  // ============================================================
  // 随身物品 Carry —— 翻角色随身携带的东西（像查手机，各版块 AI 刷新）+ 收到的礼物永久区
  // ============================================================
  const saveCarrySection = (charId, key, d) => setCarry(p => {
    const cur = p[charId] || {};
    const n = { ...p, [charId]: { ...cur, [key]: d } };
    saveJSON("x_carry", n);
    return n;
  });
  // ---- 表情包字典 ----
  const saveEmotePacks = next => { emotePacksRef.current = next; saveJSON("x_emotePacks", next); return next; };
  const addEmotePack = name => setEmotePacks(p => saveEmotePacks([...p, { id: "ep_" + Date.now(), name: name || ("新字典 " + (p.length + 1)), global: false, charIds: [], emotes: [] }]));
  const updateEmotePack = (id, patch) => setEmotePacks(p => saveEmotePacks(p.map(x => x.id === id ? { ...x, ...patch } : x)));
  const deleteEmotePack = id => setEmotePacks(p => saveEmotePacks(p.filter(x => x.id !== id)));
  const toggleEmotePackChar = (id, charId) => setEmotePacks(p => saveEmotePacks(p.map(x => {
    if (x.id !== id) return x;
    const has = (x.charIds || []).includes(charId);
    return { ...x, charIds: has ? x.charIds.filter(c => c !== charId) : [...(x.charIds || []), charId] };
  })));
  // 解析批量导入：支持「关键词: url」「关键词 url」同行，也支持关键词一行、url 下一行
  const parseEmoteImport = text => {
    const urlRe = /(https?:\/\/\S+)/;
    const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = []; let pending = null;
    for (const line of lines) {
      const m = line.match(urlRe);
      if (m) {
        let kw = line.slice(0, m.index).replace(/[:：\s]+$/, "").trim();
        if (!kw) kw = pending || "";
        pending = null;
        out.push({ id: "em_" + Date.now() + "_" + Math.floor(Math.random() * 100000), keyword: kw || "表情", url: m[1] });
      } else { pending = line.replace(/[:：]\s*$/, "").trim(); }
    }
    return out;
  };
  const importEmotes = (packId, text) => {
    const items = parseEmoteImport(text);
    if (!items.length) { toast("没解析到「关键词 + 链接」，检查格式"); return 0; }
    setEmotePacks(p => saveEmotePacks(p.map(x => x.id === packId ? { ...x, emotes: [...(x.emotes || []), ...items] } : x)));
    toast("导入了 " + items.length + " 个表情");
    return items.length;
  };
  const deleteEmotes = (packId, ids) => setEmotePacks(p => {
    const set = new Set(ids);
    return saveEmotePacks(p.map(x => x.id === packId ? { ...x, emotes: (x.emotes || []).filter(e => !set.has(e.id)) } : x));
  });
  // 某角色可用的表情（全局包 + 绑定了 TA 的包），供聊天注入与用户选择器
  const emotesForChar = charId => {
    const out = [];
    (emotePacksRef.current || []).forEach(pk => { if (pk.global || (pk.charIds || []).includes(charId)) (pk.emotes || []).forEach(e => out.push(e)); });
    return out;
  };
  // 群聊可用表情：所有成员可用表情的并集（按 id 去重）
  const emotesForGroup = memberIds => {
    const map = new Map();
    (memberIds || []).forEach(id => emotesForChar(id).forEach(e => map.set(e.id, e)));
    return [...map.values()];
  };
  // 只含「加入我的表情库」的包（pack.mine !== false）——供我自己发送的选择器用；AI 注入仍用全量
  const emotesForCharMine = charId => {
    const out = [];
    (emotePacksRef.current || []).forEach(pk => { if (pk.mine !== false && (pk.global || (pk.charIds || []).includes(charId))) (pk.emotes || []).forEach(e => out.push(e)); });
    return out;
  };
  const emotesForGroupMine = memberIds => {
    const map = new Map();
    (memberIds || []).forEach(id => emotesForCharMine(id).forEach(e => map.set(e.id, e)));
    return [...map.values()];
  };
  const genCarrySection = async (char, key) => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setSelCarry(char.id);
    setGen(g => ({ ...g, carrySec: key }));
    try {
      const d = await runProbe(bgActive, ctxFor(char), carryProbeSpec(key, char));
      saveCarrySection(char.id, key, d);
      return true;
    } catch (e) {
      toast(key + " 生成失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, carrySec: null }));
    }
  };
  // 收到的礼物：角色对某件礼物的想法/批注（点开时懒生成）
  const genGiftThought = async (charId, giftId, name) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, giftThought: giftId }));
    try {
      const bundle = buildBundle(ctxFor(char));
      const system = bundle + "\n\n【任务】用户之前送了你一份礼物「" + name + "」，你收下了、一直随身留着。完全代入「" + char.name + "」，写一段你对这份礼物的私人想法/批注：它对你意味着什么、你怎么看送礼的人、平时怎么对待它。1~3 句，真挚贴人设，纯文本不要 JSON。";
      const raw = await callAI(active, system, [{ role: "user", content: "[礼物：" + name + "]" }], { maxTokens: 900 });
      const thought = String(raw || "").replace(/^["'\s]+|["'\s]+$/g, "");
      if (thought) setCarryGifts(prev => {
        const list = (prev[charId] || []).map(g => g.id === giftId ? { ...g, thought } : g);
        const n = { ...prev, [charId]: list };
        carryGiftsRef.current = n; saveJSON("x_carryGifts", n);
        return n;
      });
    } catch (e) { toast("生成失败：" + e.message); }
    finally { setGen(g => ({ ...g, giftThought: null })); }
  };
  const genCarryAll = async char => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setSelCarry(char.id);
    setGen(g => ({ ...g, carrySec: "__all__" }));
    const keys = CARRY_SECTIONS.filter(s => !s.gifts).map(s => s.key);
    for (const key of keys) {
      try {
        const d = await runProbe(bgActive, ctxFor(char), carryProbeSpec(key, char));
        saveCarrySection(char.id, key, d);
      } catch (e) {/* skip */}
    }
    setGen(g => ({ ...g, carrySec: null }));
  };

  const saveRel = (key, label, note) => setRels(p => {
    const n = {
      ...p
    };
    if (!label.trim()) delete n[key];else n[key] = {
      label: label.trim(),
      note: (note || "").trim()
    };
    saveJSON("x_rels", n);
    return n;
  });
  const relSummaryFor = char => {
    const l = directedRelationLines(char, rels, characters, profile);
    return l && l !== "（暂无已设定的关系）" ? l : "";
  };

  // ---- geo ----
  const doRequestGeo = async () => {
    toast("正在定位…");
    const g = await requestGeo();
    setGeo(g);
    saveJSON("x_geo", g);
    if (g.error) toast("定位失败：" + g.error);else toast("已定位：" + g.label);
  };

  // ---- export / import ----
  const doExport = () => {
    const dump = {};
    Object.keys(localStorage).filter(k => k.startsWith("x_")).forEach(k => {
      dump[k] = localStorage.getItem(k);
    });
    const blob = new Blob([JSON.stringify({
      __archive: 1,
      exportedAt: Date.now(),
      data: dump
    }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "archive-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出备份");
  };
  const doImport = file => {
    const r = new FileReader();
    r.onload = e => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch (err) {
        toast("导入失败：文件损坏或不是备份文件");
        return;
      }
      if (!parsed.__archive || !parsed.data) {
        toast("文件格式不对");
        return;
      }
      // 先清本地 x_ 键
      Object.keys(localStorage).filter(k => k.startsWith("x_")).forEach(k => localStorage.removeItem(k));
      // 逐键写入：单键失败（多半是超了浏览器单站点 ~5MB 上限）不整体中断，记下漏掉的，尽量恢复其余
      const failed = [];
      Object.entries(parsed.data).forEach(([k, v]) => {
        try { localStorage.setItem(k, v); }
        catch (err) { failed.push({ k, size: (v || "").length }); }
      });
      if (failed.length) {
        // 按占用从大到小，方便一眼看出是谁把空间撑爆（多半是含大量图片的键）
        failed.sort((a, b) => b.size - a.size);
        const KB = n => Math.round(n / 1024);
        const list = failed.slice(0, 6).map(f => "· " + f.k + "（约 " + KB(f.size) + "KB）").join("\n");
        window.alert(
          "已尽量恢复，但有 " + failed.length + " 项没装下——这台设备/这个网址的浏览器本地存储约 5MB 上限，这份备份超了。\n\n" +
          "没恢复的（占用最大的几项）：\n" + list +
          (failed.length > 6 ? "\n…等共 " + failed.length + " 项" : "") +
          "\n\n这些多半是含大量图片的数据（头像/壁纸/朋友圈图/表情包）。要全恢复，需在这台设备上清掉图片或分批导入。\n（注意：一起读的书正文、语音音频存在浏览器 IndexedDB，本就不进备份文件，换设备要重传。）"
        );
        setTimeout(() => location.reload(), 400);
      } else {
        toast("导入成功，正在重载…");
        setTimeout(() => location.reload(), 800);
      }
    };
    r.readAsText(file);
  };

  // ---- routing ----
  let body = null;
  if (!loaded) body = /*#__PURE__*/React.createElement(Empty, {
    text: "加载中…"
  });else if (screen === "home") body = /*#__PURE__*/React.createElement(Home, {
    now: now,
    characters: characters,
    profile: profile,
    wallpaper: wallpaper,
    unread: unreadTotal,
    calendar: calendar,
    period: period,
    listen: listen,
    player: player,
    homeCard: homeCard,
    notif: appNotif,
    mapStatus: mapStatusAll(),
    userGeo: prefs.geoAware && geo && typeof geo.lat === "number" ? geo : null,
    onOpenApp: k => k === "listen" ? goListen() : setScreen(k),
    onOpenChar: c => {
      setActiveChar(c);
      setScreen("cast");
      setEditingChar(null);
    },
    onEditProfile: () => setProfileOpen(true),
    onEditCard: () => setCardOpen(true),
    onSoon: zh => toast("「" + zh + "」还在施工中 · 敬请期待 🚧")
  });else if (screen === "map") body = (window.MapKit ? h(window.MapKit.CharMap, {
    characters: characters,
    status: mapStatusAll(),
    profile: profile,
    userGeo: prefs.geoAware && geo && typeof geo.lat === "number" ? geo : null,
    mode: mapMode,
    onSetMode: m => { setMapMode(m); saveJSON("x_mapMode", m); },
    onSetHome: (charId, home) => pC(p => p.map(c => c.id === charId ? { ...c, home: home || undefined } : c)),
    onBack: goHome
  }) : h(Empty, { text: "地图组件没加载出来", sub: "需要联网加载地图库，检查网络后重开" }));else if (screen === "cast") body = /*#__PURE__*/React.createElement(Cast, {
    characters: characters,
    onBack: goHome,
    onEdit: c => {
      setEditingChar(c);
      setScreen("castForm");
    },
    onAdd: () => {
      setEditingChar(null);
      setScreen("castForm");
    },
    onOpenChar: c => {
      setEditingChar(c);
      setScreen("castForm");
    }
  });else if (screen === "castForm") body = /*#__PURE__*/React.createElement(CastForm, {
    initial: editingChar,
    onBack: () => setScreen("cast"),
    onSave: saveChar,
    onDelete: delChar
  });else if (screen === "messages") body = /*#__PURE__*/React.createElement(Messages, {
    characters: characters,
    groups: groups,
    chats: chats,
    groupChats: groupChats,
    moments: moments,
    profile: profile,
    unreadMap: unreadMap,
    onBack: goHome,
    onOpenThread: c => {
      setActiveChar(c);
      clearUnread(c.id);
      setScreen("thread");
    },
    onOpenGroup: g => {
      setActiveGroup(g);
      clearUnread(g.id);
      setScreen("gthread");
    },
    pinned: pinnedChats,
    onTogglePin: togglePinChat,
    onNewGroup: () => setNewGroupOpen(true),
    onOpenContact: c => {
      setActiveChar(c);
      setScreen("contact");
    },
    onGenMoment: genMoment,
    genMoment: gen.moment,
    onLikeMoment: likeMoment,
    onCommentMoment: commentMoment,
    onDelMoment: delMoment,
    onOpenMomProfile: openMomProfile,
    onEditProfile: () => setProfileOpen(true),
    onOpenWallet: () => setScreen("wallet"),
    onOpenFavorites: () => setScreen("favorites"),
    walletBalance: wallet,
    friendGroups: friendGroups,
    onSaveGroups: saveFriendGroups,
    onPostMoment: postUserMoment
  });else if (screen === "momprofile") body = h(MomentsProfile, {
    isMe: !!(momTarget && momTarget.isMe),
    character: momTarget && !momTarget.isMe ? characters.find(c => c.id === momTarget.id) : null,
    profile: profile,
    characters: characters,
    moments: moments,
    cover: (momTarget && momTarget.isMe) ? momentsCover.me : (momTarget ? momentsCover[momTarget.id] : ""),
    signature: (momTarget && momTarget.isMe) ? (profile.tagline || "") : (momTarget ? ((anon[momTarget.id] && anon[momTarget.id].bio) || "") : ""),
    gen: gen.moment,
    friendGroups: friendGroups,
    onSetCover: uri => setMomentCover(momTarget && momTarget.isMe ? "me" : (momTarget && momTarget.id), uri),
    onDelMoment: delMoment,
    onLikeMoment: likeMoment,
    onCommentMoment: commentMoment,
    onPostMoment: postUserMoment,
    onBack: () => { setMomTarget(null); setScreen("messages"); }
  });else if (screen === "wallet") body = h(MyWallet, {
    balance: wallet,
    log: walletLog,
    cards: kinshipCards,
    characters: characters,
    onBack: () => setScreen("messages"),
    onSetBalance: setWalletTo,
    onOpenCard: charId => { setActiveCardId(charId); setScreen("kincard"); }
  });else if (screen === "kincard") body = h(KinshipBill, {
    card: kinshipCards.find(c => c.charId === activeCardId),
    character: characters.find(c => c.id === activeCardId),
    onBack: () => setScreen("wallet"),
    onRaise: ask => requestKinshipRaise(activeCardId, ask)
  });else if (screen === "thread" && activeChar) body = /*#__PURE__*/React.createElement(ChatThread, {
    character: activeChar,
    characters: characters,
    messages: chats[activeChar.id] || [],
    sending: sending,
    onBack: () => setScreen("messages"),
    onSend: txt => pushUser(activeChar.id, txt),
    onReply: extraText => {
      const b = blocks[activeChar.id] || {};
      if (b.iBlocked) return blockedReaction(activeChar.id);
      if (b.theyBlocked) { toast("TA 拉黑了你，点消息旁的 ! 申请解除"); return; }
      return replyNow(activeChar.id, extraText);
    },
    block: blocks[activeChar.id] || null,
    onSendUnblockReq: plea => sendMyUnblockReq(activeChar.id, plea),
    onRespondUnblock: (cid, accept) => respondUnblockFromChar(activeChar.id, cid, accept),
    profile: profile,
    disp: { myAvatar: !!settingsFor(activeChar.id).showMyAvatar, time: !!settingsFor(activeChar.id).showTime, timeSec: !!settingsFor(activeChar.id).timeSec, read: settingsFor(activeChar.id).showRead !== false, chatBg: settingsFor(activeChar.id).chatBg || "" },
    onOpenState: () => { setStateCardChar(null); setStateCardGroup(false); setStateCardOpen(true); },
    schedNow: schedNowBriefFor(activeChar),
    onOpenSched: () => { setSelSched(activeChar.id); setScreen("lifestyle"); },
    onLongPress: handleMsgAction,
    onOpenSettings: () => setChatSettingsOpen(true),
    toast: toast,
    onSendRich: msg => pChat(activeChar.id, p => [...p, msg]),
    onStartCall: m => startCall([activeChar], m, null, "me"),
    onAcceptCall: m => { pChat(activeChar.id, p => p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "accepted" } : x)); startCall([activeChar], m.mode, null, activeChar.id); },
    onDeclineCall: m => { pChat(activeChar.id, p => [...p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "declined" } : x), { role: "system", kind: "system", content: "你拒绝了 TA 的" + (m.mode === "video" ? "视频" : "语音") + "通话邀请", ts: Date.now() }]); },
    onAcceptListen: acceptListenInvite,
    emotes: emotesForCharMine(activeChar.id),
    onManageEmotes: () => setScreen("emotes"),
    myBalance: wallet,
    onSendTransfer: (amount, note) => sendTransfer(activeChar.id, amount, note),
    onRespondTransfer: (tid, accept) => respondTransfer(activeChar.id, tid, accept),
    makeCoords: makeCoords,
    onOpenAnon: () => openAnon(activeChar),
    onOpenMoments: () => openMomProfile(activeChar.id, false),
    onOffline: () => openOffline(activeChar),
    onOOC: text => oocReply(activeChar.id, text),
    onDeleteMessages: indices => {
      const set = new Set(indices);
      pChat(activeChar.id, p => p.filter((_, i) => !set.has(i)));
      toast("已删除 " + indices.length + " 条");
    },
    onForward: (msgs, toChar) => {
      const items = msgs.map(m => ({
        name: m.role === "user" ? profile.name || "我" : activeChar.name,
        text: m.content
      }));
      const content = "【转发的聊天记录】\n" + items.map(it => it.name + "：" + it.text).join("\n");
      pChat(toChar.id, p => [...p, {
        role: "user",
        content,
        forward: {
          from: activeChar.name,
          items
        },
        ts: Date.now(),
        read: false
      }]);
      toast("已转发给 " + (toChar.remark || toChar.name));
    }
  });else if (screen === "gthread" && activeGroup) body = h(GroupThread, {
    group: groups.find(g => g.id === activeGroup.id) || activeGroup,
    characters: characters,
    messages: groupChats[activeGroup.id] || [],
    sending: sending,
    profile: profile,
    meName: profile.name || "我",
    myBalance: wallet,
    settings: gsFor(activeGroup.id),
    onBack: () => setScreen("messages"),
    onSend: txt => pushGroupUser(activeGroup.id, txt),
    onReply: () => replyGroup(activeGroup.id),
    onContinue: () => replyGroup(activeGroup.id),
    onOOC: txt => oocGroup(activeGroup.id, txt),
    onMsgAction: (act, idx) => handleGroupMsgAction(activeGroup.id, act, idx),
    onDeleteMessages: indices => deleteGroupMsgs(activeGroup.id, indices),
    onSaveSettings: patch => saveGroupSettings(activeGroup.id, patch),
    onOpenMemberState: memberId => { const c = characters.find(x => x.id === memberId); if (c) { setStateCardChar(c); setStateCardGroup(true); setStateCardOpen(true); } },
    onStartPoll: (title, options, anon) => startPoll(activeGroup.id, title, options, anon),
    onGenVotes: idx => genPollVotes(activeGroup.id, idx),
    onVote: (idx, optIdx) => castVote(activeGroup.id, idx, optIdx, profile.name || "我"),
    onSendRedPacket: (total, count, message) => sendRedPacket(activeGroup.id, total, count, message),
    onClaim: idx => claimRedPacket(activeGroup.id, idx),
    onSummarize: () => summarizeGroupToMem(activeGroup.id),
    onAddMember: charId => addGroupMember(activeGroup.id, charId),
    onKickMember: charId => kickGroupMember(activeGroup.id, charId),
    onDeleteGroup: () => deleteGroup(activeGroup.id),
    onOffline: () => openGroupOffline(activeGroup),
    emotes: emotesForGroupMine(activeGroup.memberIds),
    onManageEmotes: () => setScreen("emotes"),
    onSendRich: msg => pushGroupRich(activeGroup.id, { read: false, ...msg }),
    onStartCall: (mode, memberIds) => {
      const ids = Array.isArray(memberIds) ? memberIds : [memberIds];
      const people = ids.map(id => characters.find(c => c.id === id)).filter(Boolean);
      startCall(people, mode, activeGroup.id, "me");
    },
    onAcceptCall: m => { pGChat(activeGroup.id, p => p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "accepted" } : x)); const inv = characters.find(c => c.id === m.senderId); startCall(inv ? [inv] : groupMembers(activeGroup), m.mode, activeGroup.id, m.senderId || "me"); },
    onDeclineCall: m => { pGChat(activeGroup.id, p => [...p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "declined" } : x), { role: "system", kind: "system", content: "你拒绝了" + (m.senderName || "TA") + "的通话邀请", ts: Date.now() }]); },
    onSendTransfer: (memberId, amount, note) => sendGroupTransfer(activeGroup.id, memberId, amount, note),
    onRespondTransfer: (tid, accept) => respondGroupTransfer(activeGroup.id, tid, accept),
    makeCoords: makeCoords,
    toast: toast
  });else if (screen === "contact" && activeChar) body = /*#__PURE__*/React.createElement(ContactDetail, {
    character: activeChar,
    affinity: Math.round(affOf(activeChar.id)),
    onBack: () => setScreen("messages"),
    onChat: () => {
      clearUnread(activeChar.id);
      setScreen("thread");
    },
    onSaveRemark: saveRemark,
    onOpenState: () => { setStateCardChar(null); setStateCardGroup(false); setStateCardOpen(true); },
    directives: directives[activeChar.id] || [],
    onRemoveDirective: dirId => removeDirective(activeChar.id, dirId)
  });else if (screen === "ties") body = /*#__PURE__*/React.createElement(Ties, {
    characters: characters,
    rels: rels,
    profile: profile,
    onBack: goHome,
    onSave: saveRel
  });else if (screen === "lifestyle") body = h(Lifestyle, {
    characters: characters,
    schedules: schedules,
    selId: selSched,
    busyKey: gen.sched,
    onBack: goHome,
    onSel: setSelSched,
    onGenDay: genScheduleDay
  });else if (screen === "phone") body = /*#__PURE__*/React.createElement(PhoneCarry, {
    characters: characters,
    phones: phones,
    selId: selPhone,
    busyKey: gen.phoneApp,
    onBack: goHome,
    onSel: setSelPhone,
    onGenApp: genPhoneApp,
    onGenAll: genPhoneAll,
    profile: profile
  });else if (screen === "carry") body = h(Carry, {
    characters: characters,
    carry: carry,
    carryGifts: carryGifts,
    selId: selCarry,
    busyKey: gen.carrySec,
    giftBusy: gen.giftThought,
    onBack: goHome,
    onSel: setSelCarry,
    onGen: genCarrySection,
    onGenAll: genCarryAll,
    onGenGiftThought: genGiftThought
  });else if (screen === "cwallet") body = h(CharWallet, {
    characters: characters,
    charWallet: charWallet,
    selId: selCWallet,
    busyKey: gen.cwallet,
    hasApi: !!active,
    onBack: goHome,
    onSel: setSelCWallet,
    onInit: initCharWallet,
    onCatchUp: catchUpWallet,
    onSetBalance: setCharWalletTo,
    onRefresh: refreshCharAssets
  });else if (screen === "emotes") body = h(EmoteMatrix, {
    packs: emotePacks,
    characters: characters,
    onBack: () => setScreen(activeChar ? "thread" : activeGroup ? "gthread" : "home"),
    onAddPack: addEmotePack,
    onUpdatePack: updateEmotePack,
    onDeletePack: deleteEmotePack,
    onToggleChar: toggleEmotePackChar,
    onImport: importEmotes,
    onDeleteEmotes: deleteEmotes
  });else if (screen === "favorites") body = h(Favorites, {
    favorites: favorites,
    characters: characters,
    onBack: () => setScreen("messages"),
    onDelete: delFavorite
  });else if (screen === "forum") body = /*#__PURE__*/React.createElement(Forum, {
    characters: characters,
    profile: profile,
    posts: forumPosts,
    comments: forumComments,
    follows: forumFollows,
    pms: forumPMs,
    groups: groups,
    gen: gen,
    forumMe: forumMe,
    charMetaOf: charForumMeta,
    forumOff: forumOff,
    onToggleForumChar: toggleForumChar,
    onBack: goHome,
    onGenBoard: genForumBoard,
    onGenSearch: genForumSearch,
    onLoadComments: loadForumComments,
    onMoreComments: genMoreComments,
    onReplyFloor: addForumFloor,
    onReplySub: addForumSubReply,
    onPostMine: postMyForum,
    onGenCharPost: genCharForumPost,
    onToggleFollow: toggleForumFollow,
    onForwardToChat: forwardPostToChat,
    onForwardToGroup: forwardPostToGroup,
    onRefreshPMs: refreshForumPMs,
    onSendPM: sendForumPM,
    onMarkPMRead: markPMRead,
    onEditMe: editForumMe,
    onEnsureCharMeta: ensureCharForumMeta
  });else if (screen === "shop") body = h(Shop, {
    wallet: wallet,
    cart: cart,
    orders: orders,
    inventory: inventory,
    characters: characters,
    groups: groups,
    kinshipCards: kinshipCards,
    feed: shopFeed,
    busy: shopBusy,
    onBack: goHome,
    onGen: genShop,
    onAddCart: addToCart,
    onRemoveCart: uid => removeCartUids([uid]),
    onCheckout: checkout,
    onReceiveUse: receiveUse,
    onReceiveGift: receiveGift,
    toast: toast
  });else if (screen === "us") body = /*#__PURE__*/React.createElement(Us, {
    characters: characters,
    couples: couples,
    whispers: whispers,
    onBack: goHome,
    onInvite: sendCoupleInvite,
    onUnlink: unlinkCouple,
    onGenWhisper: genWhisper,
    onAddAnniversary: (partnerId, name, mo, day) => { saveCalEvent(partnerId, new Date().getFullYear() + "-" + mo + "-" + day, name, "情侣纪念日"); toast("纪念日已加进日历"); },
    onSetSince: setCoupleSince,
    profile: profile,
    coupleProfile: coupleProfile,
    onSetCoupleImg: setCoupleImg,
    gen: gen.whisper,
    coupleQA: coupleQA,
    onAnswerQA: answerCoupleQA,
    onEditQA: editCoupleQA,
    onRemoveQA: removeCoupleQA,
    onRerollQA: rerollCoupleQA,
    qaGen: gen.coupleQA,
    coupleQATitle: coupleQATitle,
    onSaveQATitle: saveQATitle,
    coupleNotes: coupleNotes,
    onAddNote: addCoupleNote,
    onAddNoteReply: addCoupleNoteReply,
    onRemoveNote: removeCoupleNote,
    onGenNote: genCoupleNote,
    noteGen: gen.coupleNote,
    coupleQACustom: coupleQACustom,
    coupleMood: coupleMood,
    onCheckinMood: checkinCoupleMood,
    moodGen: gen.coupleMood,
    coupleTimeline: coupleTimeline,
    onAddTimeline: addTimelineEvent,
    onRemoveTimeline: removeTimelineEvent,
    onGenTimeline: genTimelineMusing,
    tlGen: gen.coupleTL,
    coupleAnniv: coupleAnniv,
    onAddAnniv: addAnniv,
    onRemoveAnniv: removeAnniv,
    coupleLetters: coupleLetters,
    coupleLetterCfg: coupleLetterCfg,
    onGenLetter: genCoupleLetter,
    onAddMyLetter: addMyLetter,
    onReplyLetter: replyToLetter,
    onReadLetter: markLetterRead,
    onRemoveLetter: removeCoupleLetter,
    onSaveLetterCfg: saveLetterCfg,
    letterGen: gen.coupleLetter,
    coupleSweet: coupleSweet,
    onCheckinSweet: checkinSweet
  });else if (screen === "lore") body = h(WorldBook, {
    entries: loreEntries,
    characters: characters,
    onBack: goHome,
    onSave: e => saveLore([e].concat(loreRef.current.filter(x => x.id !== e.id))),
    onDelete: id => saveLore(loreRef.current.filter(x => x.id !== id))
  });else if (screen === "study") body = h(StudyApp, {
    active: active,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "read") body = h(ReadTogether, {
    active: active,
    bgActive: bgActive, // 批注/讲解/总结走便宜后台池；讨论(实时对话)仍用主 active
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    toast: toast,
    onAddMemory: (text, charId) => addMemEntry({ text: text, charIds: charId ? [charId] : [], source: "read", tags: ["一起读"] }),
    onBack: () => setScreen("home")
  });else if (screen === "debate") body = h(Debate, {
    active: active,
    characters: characters,
    profile: profile,
    worldbook: loreText(loreEntries, { scope: "debate" }),
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "dream") body = h(Dream, {
    active: active,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    rels: rels,
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "tarot") body = h(Tarot, {
    active: active,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    rels: rels,
    affinities: affinities,
    moods: moods,
    toast: toast,
    onForwardToChat: forwardTarotToChat,
    onBack: () => setScreen("home")
  });else if (screen === "ledger") body = h(Ledger, {
    active: bgActive,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    moods: moods,
    affinities: affinities,
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "pomodoro") body = h(Pomodoro, {
    active: bgActive,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    moods: moods,
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "games") body = h(Games, {
    active: active,
    bgActive: bgActive,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
    moods: moods,
    // 注入最近聊天抓人设用（只读，不写回记忆）
    recentChatFor: (charId) => (chatsRef.current[charId] || []).filter(m => !m.recalled && m.content).slice(-16).map(m => (m.role === "user" ? (profile.name || "用户") : (characters.find(c => c.id === charId) || {}).name || "TA") + ": " + m.content).join("\n"),
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "fanfic") body = h(FanficApp, {
    active: active,
    characters: characters,
    profile: profile,
    groups: groups,
    worldbook: worldbook,
    toast: toast,
    onForwardToChat: forwardFicToChat,
    onForwardToGroup: forwardFicToGroup,
    onNotifyChapter: notifyChapterToChars,
    onBack: () => setScreen("home")
  });else if (screen === "weekly") body = h(WeeklyApp, {
    active: active,
    characters: characters,
    groups: groups,
    profile: profile,
    worldbook: worldbook,
    toast: toast,
    onBack: () => setScreen("home")
  });else if (screen === "memlib") body = h(MemoryLib, {
    entries: memLib,
    characters: characters,
    focusChar: activeChar,
    busy: sending,
    cfg: memCfg,
    oldMemories: memories,
    onBack: () => setScreen(activeChar ? "thread" : "home"),
    onAdd: addMemEntry,
    onUpdate: updateMemEntry,
    onDelete: deleteMemEntry,
    onExtract: activeChar ? () => extractMemForChar(activeChar.id) : null,
    onSaveCfg: saveMemCfg,
    onImportOld: importOldMemoryToLib,
    onBackfillEmotion: backfillMemEmotion,
    emoBusy: emoBusy
  });else if (screen === "diary") body = h(Diary, {
    characters: characters,
    diaries: diaries,
    profile: profile,
    genBusy: diaryBusy,
    commentingId: diaryCommenting,
    onBack: () => setScreen("home"),
    onGen: genDiary,
    onDelEntry: delDiaryEntry,
    onSaveFields: saveDiaryFields,
    onAddMyEntry: addMyDiaryEntry,
    onGenComments: genDiaryCommentsFor,
    toast: toast
  });else if (screen === "listen") body = h(ListenTogether, {
    listen: listen,
    characters: characters,
    onBack: exitListen,
    onSetDisc: setListenDisc,
    onSetCover: setSongCover,
    onAddNetease: addNeteaseSong,
    onAddLocal: addLocalSong,
    onPlaySong: playSong,
    onRemoveSong: removeListenSong,
    onSetPartner: setListenPartner,
    apiBase: neteaseApi,
    onSetApiBase: saveNeteaseApi,
    cookie: neteaseCookie,
    onSetCookie: saveNeteaseCookie,
    onTestLogin: testNeteaseLogin,
    onAddNeteaseResult: addNeteaseResult,
    onPlayResult: playNeteaseResult,
    onAddResultToPlaylist: addResultToPlaylist,
    onCreatePlaylist: createPlaylist,
    onDeletePlaylist: deletePlaylist,
    onRenamePlaylist: renamePlaylist,
    onAddToPlaylist: addToPlaylist,
    onRemoveFromPlaylist: removeFromPlaylist,
    onRenameSong: renameSong,
    onGenCharPlaylist: genCharPlaylist,
    onSetAutoComment: setListenAutoComment,
    player: player,
    onTogglePlay: togglePlay,
    onStep: stepSong,
    onSeek: seekPlayer,
    onToggleFav: toggleFav,
    playMode: listen.playMode || "order",
    onCyclePlayMode: cyclePlayMode,
    gen: gen.listen,
    genCharPl: gen.charPlaylist
  });else if (screen === "calendar") body = h(Calendar, {
    characters: characters,
    calendar: calendar,
    period: period,
    busy: !!gen.calendar,
    onBack: goHome,
    onSaveEvent: saveCalEvent,
    onDelEvent: delCalEvent,
    onGenMonth: genCalMonth,
    onSavePeriod: savePeriodSettings,
    onRecordPeriod: recordPeriodStart
  });else if (screen === "config") body = /*#__PURE__*/React.createElement(Config, {
    apiProfiles: apiProfiles,
    activeId: activeId,
    bgApiId: bgApiId,
    onSetBgApi: setBgApi,
    characters: characters,
    coupleQACustom: coupleQACustom,
    onSaveCustomQA: saveCoupleQACustom,
    onSaveApi: (list, id) => {
      setApiProfiles(list);
      setActiveId(id);
      saveJSON("x_api", list);
      saveJSON("x_activeApi", id);
    },
    theme: theme,
    onSaveTheme: th => {
      setTheme(th);
      saveJSON("x_theme", th);
      toast("主题已保存");
    },
    wallpaper: wallpaper,
    onSaveWallpaper: w => {
      setWallpaper(w);
      saveJSON("x_wallpaper", w);
      toast(w ? "壁纸已更新" : "已恢复默认背景");
    },
    prefs: prefs,
    onSavePrefs: p => {
      setPrefs(p);
      saveJSON("x_prefs", p);
    },
    geo: geo,
    onRequestGeo: doRequestGeo,
    onBack: goHome,
    onExport: doExport,
    onImport: doImport,
    onClearAll: () => {
      Object.keys(localStorage).filter(k => k.startsWith("x_")).forEach(k => localStorage.removeItem(k));
      location.reload();
    },
    toast: toast
  });
  return /*#__PURE__*/React.createElement(ThemeContext.Provider, {
    value: theme
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full flex flex-col relative overflow-hidden",
    style: {
      // 主屏时把壁纸铺到根节点（含顶部 safe-area 刘海区），Home 自身透明 → 壁纸一路遮到顶，无白边
      background: (screen === "home" && wallpaper) ? "center/cover no-repeat url(" + wallpaper + ")" : theme.bg,
      height: "100vh" // 100vh=large viewport，撑到物理屏底（不用 100dvh/fixed，dvh 只到 WebKit 可视区会露白）
    }
  }, isStandalone ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: "env(safe-area-inset-top)"
    },
    className: "shrink-0"
  }) : null, /*#__PURE__*/React.createElement(DevBadges, null), /*#__PURE__*/React.createElement("audio", {
    ref: audioElRef,
    style: { display: "none" },
    onTimeUpdate: e => setPlayer(p => ({ ...p, t: e.target.currentTime || 0, dur: e.target.duration || 0 })),
    onEnded: advanceSong
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-h-0 relative"
  }, body), (player.songId && screen !== "listen") ? h(MiniPlayer, {
    song: resolveSong(player.songId),
    playing: player.playing,
    loading: player.loading,
    onOpen: goListen,
    onToggle: togglePlay,
    onNext: () => stepSong(1),
    onClose: stopPlayer
  }) : null, (() => {
    const scc = stateCardChar || activeChar;
    return stateCardOpen && scc && /*#__PURE__*/React.createElement(StateCard, {
      character: scc,
      affinity: Math.round(affOf(scc.id)),
      mood: moods[scc.id],
      state: states[scc.id],
      history: stateHist[scc.id] || [],
      hideWearAction: stateCardGroup,
      onClose: () => { setStateCardOpen(false); setStateCardChar(null); setStateCardGroup(false); }
    });
  })(), editMsg && /*#__PURE__*/React.createElement(MsgEditSheet, {
    init: editMsg.content,
    onCancel: () => setEditMsg(null),
    onSave: nv => { editMsg.onSave(nv); setEditMsg(null); }
  }), chatSettingsOpen && activeChar && /*#__PURE__*/React.createElement(ChatSettings, {
    character: activeChar,
    settings: settingsFor(activeChar.id),
    memory: memories[activeChar.id],
    onSave: s => {
      saveRemark(activeChar.id, s.remark);
      pC(p => p.map(c => c.id === activeChar.id ? {
        ...c,
        patSig: s.patSig
      } : c));
      setChatSettings(p => {
        const n = {
          ...p,
          [activeChar.id]: {
            ...settingsFor(activeChar.id),
            ctxN: s.ctxN,
            sumThresh: s.sumThresh,
            sumBuffer: s.sumBuffer,
            autoMoment: s.autoMoment,
            proactive: s.proactive,
            proactiveMin: s.proactiveMin,
            showMyAvatar: s.showMyAvatar,
            showTime: s.showTime,
            timeSec: s.timeSec,
            showRead: s.showRead,
            selfP: s.selfP,
            userP: s.userP,
            describeMe: s.describeMe,
            chatBg: s.chatBg
          }
        };
        saveJSON("x_chatSettings", n);
        return n;
      });
      setActiveChar(c => ({
        ...c,
        remark: s.remark,
        patSig: s.patSig
      }));
      setChatSettingsOpen(false);
      toast("已保存");
    },
    onClose: () => setChatSettingsOpen(false),
    onClearMemory: () => {
      setMemFor(activeChar.id, "");
      toast("已清空记忆");
    },
    onClearChat: wipeMem => clearChat(activeChar.id, wipeMem),
    iBlocked: !!(blocks[activeChar.id] && blocks[activeChar.id].iBlocked),
    onToggleBlock: () => toggleBlock(activeChar.id),
    memLibCount: memLib.filter(e => !e.charIds || e.charIds.length === 0 || e.charIds.includes(activeChar.id)).length,
    onOpenMemLib: () => {
      setChatSettingsOpen(false);
      setScreen("memlib");
    },
    onExtractMem: () => extractMemForChar(activeChar.id)
  }), newGroupOpen && /*#__PURE__*/React.createElement(NewGroupSheet, {
    characters: characters,
    onCreate: createGroup,
    onClose: () => setNewGroupOpen(false)
  }), profileOpen && /*#__PURE__*/React.createElement(ProfileSheet, {
    profile: profile,
    onSave: p => {
      setProfile(p);
      saveJSON("x_profile", p);
      setProfileOpen(false);
      toast("已保存");
    },
    onClose: () => setProfileOpen(false)
  }), cardOpen && h(HomeCardSheet, {
    card: homeCard,
    onSave: c => { setHomeCard(c); saveJSON("x_homeCard", c); setCardOpen(false); toast("名片已保存"); },
    onClose: () => setCardOpen(false)
  }), call && h(CallScreen, {
    participants: call.participants,
    mode: call.mode,
    msgs: call.msgs,
    sending: sending,
    minimized: !!call.min,
    onMinimize: () => setCall(c => c ? { ...c, min: true } : c),
    onRestore: () => setCall(c => c ? { ...c, min: false } : c),
    onSend: txt => callSend(txt),
    onHangup: sec => endCall(sec)
  }), anonChar && h(AnonBox, {
    char: anonChar,
    data: anon[anonChar.id],
    busy: anonBusy,
    onGenNetizen: () => genNetizenQ(anonChar),
    onRefreshPersona: () => refreshAnonPersona(anonChar),
    onDelRecord: ts => delAnonRecord(anonChar.id, ts),
    onAsk: q => askAnon(anonChar, q),
    onClose: () => setAnonChar(null)
  }), offlineChar && h(OfflineMode, {
    char: offlineChar,
    profile: profile,
    sessions: offlines[offlineChar.id] || [],
    activeSession: (offlines[offlineChar.id] || []).find(s => !s.endTs) || null,
    sending: sending,
    settings: osFor(offlineChar.id),
    onSaveSettings: patch => saveOfflineSettings(offlineChar.id, patch),
    onStart: opts => startOffline(offlineChar.id, opts),
    onSend: txt => offlineSend(offlineChar.id, txt),
    onReply: txt => offlineReply(offlineChar.id, txt),
    onAddNote: n => offlineAddNote(offlineChar.id, n),
    onChangeStyle: patch => offlineSetStyle(offlineChar.id, patch),
    onEditMsg: (mid, txt) => offlineEditMsg(offlineChar.id, mid, txt),
    onRerollMsg: mid => offlineRerollMsg(offlineChar.id, mid),
    onDelMsg: mid => offlineDelMsg(offlineChar.id, mid),
    onEnd: () => endOffline(offlineChar.id),
    onClose: () => setOfflineChar(null)
  }), offlineGroup && h(GroupOfflineMode, {
    group: offlineGroup,
    profile: profile,
    members: (offlineGroup.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean),
    sessions: groupOfflines[offlineGroup.id] || [],
    activeSession: (groupOfflines[offlineGroup.id] || []).find(s => !s.endTs) || null,
    sending: sending,
    onStart: opts => startGroupOffline(offlineGroup.id, opts),
    onSend: txt => groupOfflineSend(offlineGroup.id, txt),
    onReply: txt => groupOfflineReply(offlineGroup.id, txt),
    onAddNote: n => groupOfflineAddNote(offlineGroup.id, n),
    onChangeStyle: patch => groupOfflineSetStyle(offlineGroup.id, patch),
    onEditMsg: (mid, txt) => groupOfflineEditMsg(offlineGroup.id, mid, txt),
    onRerollMsg: mid => groupOfflineRerollMsg(offlineGroup.id, mid),
    onDelMsg: mid => groupOfflineDelMsg(offlineGroup.id, mid),
    onOOC: txt => groupOfflineOOC(offlineGroup.id, txt),
    onEnd: () => endGroupOffline(offlineGroup.id),
    onClose: () => setOfflineGroup(null),
    settings: osFor("g_" + offlineGroup.id),
    onSaveSettings: patch => saveOfflineSettings("g_" + offlineGroup.id, patch)
  }), /*#__PURE__*/React.createElement(Toast, {
    msg: toastMsg
  })));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));

// 启动时：若已登录且云端存档更新，静默拉回并重载（换设备场景）
if (window.Cloud && window.Cloud.ready()) {
  window.Cloud.autoPull().then(r => { if (r && r.applied) location.reload(); });
}
