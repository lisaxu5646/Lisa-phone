// ============================================================
// ROOT
// ============================================================
// 内置默认表情：手画 SVG 表情脸，编码成 data URI（不依赖图床，开箱即用）
function buildDefaultEmotes() {
  const face = inner => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='#F4C64B' stroke='#1b1a17' stroke-width='3'/>" + inner + "</svg>");
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
  const [characters, setCharacters] = useState([]);
  const [groups, setGroups] = useState([]);
  const [chats, setChats] = useState({});
  const chatsRef = useRef(chats);
  chatsRef.current = chats; // 始终指向最新聊天记录，避免闭包读到旧值
  const [groupChats, setGroupChats] = useState({});
  const [groupSettings, setGroupSettings] = useState({});
  const [moments, setMoments] = useState([]);
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
  const [memories, setMemories] = useState({});
  const [memLib, setMemLib] = useState([]);
  const memLibRef = useRef(memLib);
  memLibRef.current = memLib; // 始终指向最新记忆库
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
  const [profile, setProfile] = useState({});
  const [worldbook, setWorldbook] = useState("");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [wallpaper, setWallpaper] = useState("");
  const [prefs, setPrefs] = useState({
    timeAware: true,
    geoAware: false
  });
  const [geo, setGeo] = useState(null);
  const [apiProfiles, setApiProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeChar, setActiveChar] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [editingChar, setEditingChar] = useState(null);
  const [selSched, setSelSched] = useState(null);
  const [selPhone, setSelPhone] = useState(null);
  const [sending, setSending] = useState(false);
  const [gen, setGen] = useState({});
  const [stateCardOpen, setStateCardOpen] = useState(false);
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
  const sendingRef = useRef(false);
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
    setMemories(loadJSON("x_memories", {}));
    setMemLib(loadJSON("x_memLib", []));
    setChatSettings(loadJSON("x_chatSettings", {}));
    setForumPosts(loadJSON("x_forumPosts", []));
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
    setCoupleNotes(loadJSON("x_coupleNotes", []));
    setCoupleQACustom(loadJSON("x_coupleQACustom", {}));
    setCoupleMood(loadJSON("x_coupleMood", []));
    setCoupleTimeline(loadJSON("x_coupleTimeline", []));
    setCoupleAnniv(loadJSON("x_coupleAnniv", []));
    setCoupleLetters(loadJSON("x_coupleLetters", []));
    setCoupleLetterCfg(loadJSON("x_coupleLetterCfg", {}));
    setListen(loadJSON("x_listen", { disc: null, songs: [] }));
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
    setEmotePacks(loadJSON("x_emotePacks", [{ id: "ep_default", name: "默认表情包", global: true, mine: true, charIds: [], emotes: buildDefaultEmotes() }]));
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
    setProfile(loadJSON("x_profile", {}));
    setHomeCard(loadJSON("x_homeCard", { name: "", sign: "", tags: [] }));
    setWorldbook(loadJSON("x_worldbook", ""));
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
    const aps = loadJSON("x_api", []);
    setApiProfiles(aps);
    setActiveId(loadJSON("x_activeApi", aps[0] && aps[0].id || null));
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
    return {
      ...p,
      [id]: n
    };
  });
  const pGChat = (id, u) => setGroupChats(p => {
    const pl = p[id] || [];
    const n = typeof u === "function" ? u(pl) : u;
    saveJSON("x_gchat:" + id, n);
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
  const addMemEntry = e => {
    const entry = {
      id: "m_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      text: (e.text || "").trim(),
      tags: e.tags || [],
      charIds: e.charIds || [],
      ts: e.ts || Date.now(),
      source: e.source || "manual",
      pinned: !!e.pinned
    };
    if (!entry.text) return;
    saveMemLib([entry, ...memLibRef.current]);
  };
  const updateMemEntry = (id, patch) => saveMemLib(memLibRef.current.map(x => x.id === id ? {
    ...x,
    ...patch
  } : x));
  const deleteMemEntry = id => saveMemLib(memLibRef.current.filter(x => x.id !== id));
  const extractMemForChar = async charId => {
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    const char = characters.find(c => c.id === charId);
    const msgs = (chatsRef.current[charId] || []).filter(m => !m.recalled).slice(-40);
    if (msgs.length < 2) {
      toast("对话太少，先多聊几句");
      return;
    }
    setSending(true);
    try {
      const items = await extractMemories(active, ctxFor(char), msgs);
      if (items.length === 0) {
        toast("没有抽到新的记忆点");
        return;
      }
      const now = Date.now();
      const entries = items.map((it, i) => ({
        id: "m_" + now + "_" + i,
        text: String(it.text).trim(),
        tags: Array.isArray(it.tags) ? it.tags : [],
        charIds: [charId],
        ts: now,
        source: "auto",
        pinned: false
      })).filter(x => x.text);
      saveMemLib([...entries, ...memLibRef.current]);
      toast("已抽取 " + entries.length + " 条记忆");
    } catch (e) {
      toast("抽取失败：" + e.message);
    } finally {
      setSending(false);
    }
  };
  const clearUnread = id => setUnreadMap(p => {
    const n = {
      ...p,
      [id]: 0
    };
    saveJSON("x_unread", n);
    return n;
  });
  // 角色此刻的行程（给聊天/心情联动用）
  const schedNowFor = char => {
    const s = (schedulesRef.current[char.id] || {})[schedDayKey(new Date())];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return "";
    const idx = schedCurrentSeqIdx(s.seqs, true);
    const cur = idx >= 0 ? s.seqs[idx] : null;
    const next = s.seqs[idx + 1];
    let out = "今日安排（负荷 " + (s.load || "") + "）：\n" + s.seqs.map(x => (x.time || "") + " " + x.title + (x.location ? "（" + x.location + "）" : "") + (x.deviation ? "［临时改动：" + (x.deviation.reason || "") + "］" : "")).join("\n");
    if (cur) out += "\n\n此刻（约 " + (cur.time || "") + "）Ta 正在：" + cur.title + (cur.location ? "，在 " + cur.location : "") + (cur.deviation ? "（这段是临时改动：" + (cur.deviation.reason || "") + "，多半和用户有关）" : "");
    else out += "\n\n此刻还没到今天第一项，Ta 大概刚开始一天 / 还没起。";
    if (next) out += "\n待会儿：" + (next.time || "") + " " + next.title;
    return out;
  };
  const ctxFor = char => ({
    char,
    chars: characters,
    schedNow: schedNowFor(char),
    rels,
    worldbook,
    profile,
    affinity: Math.round(affOf(char.id)),
    memory: memories[char.id],
    memLib: retrieveMemories(memLibRef.current, char.id, (chatsRef.current[char.id] || []).filter(m => !m.recalled).slice(-8).map(m => m.content).join("\n"), {
      limit: 6
    }),
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
    groupEcho: (groups || []).filter(g => gsFor(g.id).memoryInterop && (g.memberIds || []).includes(char.id)).map(g => {
      const lines = (groupChatsRef.current[g.id] || []).slice(-12).map(m => m.role === "narration" ? "【旁白】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + ": " + (m.content || "")).join("\n");
      return lines ? "『群 " + g.name + "』\n" + lines : "";
    }).filter(Boolean).join("\n\n"),
    recentChat: (chatsRef.current[char.id] || []).filter(m => !m.recalled).slice(-(settingsFor(char.id).ctxN || 50)).map(m => (m.role === "user" ? profile.name || "用户" : char.name) + ": " + m.content).join("\n")
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
    sendingRef.current = sending;
  }, [sending]);
  useEffect(() => {
    if (screen !== "thread" || !activeChar) return;
    const s = settingsFor(activeChar.id);
    if (!s.proactive) return;
    const mins = Math.max(1, s.proactiveMin || 5);
    const cid = activeChar.id;
    const timer = setInterval(() => {
      if (sendingRef.current) return;
      const msgs = (chatsRef.current[cid] || []).filter(m => !m.recalled && m.kind !== "ooc" && m.kind !== "system");
      if (!msgs.length) return;
      const lastTs = msgs[msgs.length - 1].ts || 0;
      if (Date.now() - lastTs >= mins * 60000) replyNow(cid, "", null, { proactive: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [screen, activeChar, chatSettings, sending]);
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
    setSending(true);
    try {
      const oCtx = ctxFor(char);
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
    } catch (e) {
      toast("生成失败：" + (e.message || "重试"));
    } finally {
      setSending(false);
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
    if (sending) return;
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
    if (sending) return;
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
    setSending(true);
    let summary = "";
    try {
      if (active) summary = await summarizeOffline(active, ctxFor(char), sess);
    } catch (e) {}
    pOffline(charId, list => list.map(s => s.id === sess.id ? { ...s, endTs: Date.now(), summary } : s));
    if (summary) addMemEntry({ text: summary, tags: ["线下"], charIds: [charId], source: "auto" });
    // TODO(日程覆盖，用户说后面再弄)：把本次线下时间段的日程覆盖成这段经过 + 角色想法。
    setSending(false);
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
    setSending(true);
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
      setSending(false);
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
    if (sending) return;
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
    if (sending) return;
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
  const groupOfflineAddNote = (groupId, note) => {
    pGOffline(groupId, list => list.map(s => !s.endTs ? { ...s, customNotes: [...(s.customNotes || []), note] } : s));
    toast("已加入提示");
  };
  // 群聊线下 OOC：跳出所有角色直接问模型；不进叙事上下文
  const groupOfflineOOC = async (groupId, text) => {
    if (sending || !text || !text.trim()) return;
    const group = groups.find(g => g.id === groupId);
    const sess = (groupOfflinesRef.current[groupId] || []).find(s => !s.endTs);
    if (!group || !sess) return;
    pushGOffMsg(groupId, { id: "oocu_" + Date.now(), role: "user", kind: "ooc", content: text.trim(), ts: Date.now() });
    if (!active) { toast("请先到设置配置 API"); return; }
    setSending(true);
    try {
      const members = groupMembers(group);
      const histText = (sess.msgs || []).filter(m => m.kind !== "ooc" && m.content).slice(-20).map(m => m.role === "narration" ? "【场景】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + "：" + m.content).join("\n");
      const answer = await oocAskGroup(active, { members, profile, rels, chars: characters, worldbook, historyText: histText }, text.trim());
      pushGOffMsg(groupId, { id: "ooca_" + Date.now(), role: "assistant", kind: "ooc", content: answer, ts: Date.now() });
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      setSending(false);
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
    setSending(true);
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
    setSending(false);
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
          const newMem = await summarizeChat(active, ctxFor(char), toSummarize);
          setMemFor(charId, newMem);
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
    if (sending) return;
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
    setSending(true);
    try {
      if (!active) throw new Error("请先到设置配置 API");
      const _s = settingsFor(charId);
      const bundle = buildBundle(ctxFor(char));
      const emotes = emotesForChar(charId);
      const emoteHint = emotes.length ? "\n【表情包】你有一组表情图可以发，像真人发微信表情那样，只在情绪合适时偶尔甩一张（别每条都发，多数时候不发）。可用关键词：" + emotes.map(e => e.keyword).join(" / ") + "。想发就把 emote 填成其中一个关键词（与上面列的完全一致），否则 null。" : "";
      const callHint = mode === "voice" ? "\n\n【当前场景】你们正在语音通话。用口语化、连贯的短句自然对话，就像在打电话，别发一长串气泡。" : mode === "video" ? "\n\n【当前场景】你们正在视频通话。用口语化短句对话，并在气泡里自然带一点动作/神态描写（用括号，如（歪头笑））。" : "";
      const proactiveHint = (opts.proactive || contMode) ? "\n\n【此刻】用户还没发新消息" + (opts.proactive ? "，是你主动找 Ta" : "，你想接着自己刚才那几句继续说") + "。基于你此刻的状态、心情和还没聊完的话题，主动接下去：顺着上一条自然往下说、补一句、追问、等不及了催一句、换个话题或调侃都行。1~2 条短消息，自然随性，别复述之前说过的话，别干等。" : "";
      const aff = Math.round(affOf(charId));
      const kinHint = hasKinship(charId) ? "\n你已经给过用户一张亲属卡了，不要再发（加额度是另一回事，由 Ta 主动申请）。kinshipcard 一律填 null。" : "\n【亲属卡】仅当此刻非常贴合你的人设、你对用户的好感足够高（约≥70，当前 " + aff + "）、且是自然贴切的时机（如宠溺、想让 Ta 花你的钱、彰显身份），你才可以主动给用户一张「亲属卡」——Ta 以后刷卡花的是你的钱。要给就填 kinshipcard:{\"limit\":额度数字(按你的人设与财力自定),\"note\":\"一句话（发卡时说的话）\"}；否则一律 null。不要轻易发，多数情况下 null。";
      const uName = profile && profile.name ? profile.name : "对方";
      const system = bundle + ("\n\n【任务】完全代入「" + char.name + "」通过手机即时通讯和用户聊天。**必须把话拆成多条短气泡：word 数组给多个元素，每条只放一两句，像真人发微信那样一句一条连着发；绝不要把一大段话塞进一个气泡。**语气自然，不要旁白/动作/括号小动作。依据关系网与好感度把握亲密度，不提前暴露未发生的剧情。若开启了时间/位置感知，可自然回应但别生硬报数据。" + callHint + proactiveHint + "\n【引用】大多数情况 quote 填 null。只有当用户一次发了好几条、你明确针对其中较早的某一句作答、需要指明是哪句时，才在 quote 放那句原文；正常顺着对话回复不要引用，别每条都引用。\n若此刻你想主动转账给用户（如还钱、给心意、打赏），填 transfer:{\"amount\":数字,\"note\":\"附言\"}，否则 null。若你想把自己所在的位置发给用户（如提到你在哪），填 location:{\"name\":\"地点名\"}，否则 null。\n若此刻你想主动买一件东西送给用户（贴合人设与好感的心意/惊喜，别频繁），填 gift:{\"name\":\"礼物名\"}，否则 null。它会像快递一样过段时间送到用户手上。" + kinHint + emoteHint + "\n【语音】若你想发语音消息（懒得打字、唱一句、语气/情绪很重要、亲密时想让 Ta 听见），把要说的话放进 voice 数组——每个元素是一条语音的「转文字」内容（会显示成语音气泡＋下面转文字）；多数时候还是用文字 word，voice 只偶尔用，不发就给 []。\n【通话】若此刻你很想直接跟对方通话（想听声音、有急事、撒娇、煲电话粥），可以主动发起：call 填 \"voice\"（语音）或 \"video\"（视频），会给对方弹一张来电邀请卡；不想就 null，别频繁、偶尔为之。\n【拉黑】仅当用户言行让你极度愤怒/被深深冒犯/彻底寒心、且以你的人设你真的会「拉黑」对方时，才填 block:true 并在 blockreason 写一句原因——要非常罕见、有充分理由，绝大多数情况 block 为 false。\n【撤回】若你发出后又后悔某句、说漏了嘴、或不想让 Ta 看到，可以撤回那一句：填 recall:{\"text\":\"要撤回的那句原文（要和你 word 里的某句一致或另说一句）\",\"reason\":\"你撤回它的心里想法/原因\"}，否则一律 null，别频繁撤回。\n【朋友圈】若聊到用户的朋友圈、或你此刻想去 Ta 某条朋友圈下补一条评论/点赞（尤其你之前没评论、现在说要去评），把评论内容填进 momentComment（会真的发到 Ta 最新那条朋友圈下），否则 null。\n【输出】只输出一个 JSON，不要代码块：\n{\"word\":[\"气泡1\",\"气泡2\"],\"quote\":\"你在回应的用户那句话原文或null\",\"transfer\":null,\"location\":null,\"gift\":null,\"kinshipcard\":null,\"block\":false,\"blockreason\":null,\"recall\":null,\"momentComment\":null,\"thought\":\"此刻内心想法（一般一句；情绪复杂或有心事时可以更长、更细腻地写，没有就填null）\",\"moment\":\"想发的动态或null\",\"affinityDelta\":整数(-5到5通常0),\"mood\":{\"label\":\"此刻心情词\",\"baseline\":\"平复后的心情词\",\"softened\":\"半衰后的心情词\"},\"wearing\":\"此刻穿着一句\",\"action\":\"此刻在做的动作（一般一句；情境需要时可写两三句更具体）\",\"emote\":\"想发的表情关键词或null\",\"voice\":[],\"call\":null}").replace(/用户/g, uName);
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
      })), { maxTokens: 4000 });
      const parsed = extractJSON(raw) || {
        word: [raw]
      };
      // mark user msg read
      pChat(charId, p => p.map(m => m.role === "user" ? {
        ...m,
        read: true
      } : m));
      let words = Array.isArray(parsed.word) ? parsed.word.filter(Boolean) : [String(parsed.word || raw)];
      // 先按换行拆：模型有时把本该分成多条气泡的内容塞进一个字符串、用换行分隔，
      // 结果整段挤在一个气泡里像「掉格式」。这里按换行还原成多条气泡。
      words = words.reduce((acc, w) => acc.concat(String(w).split(/\n+/).map(x => x.trim()).filter(Boolean)), []);
      // 再兜底：若某条气泡仍塞了一大段（多句），按句末标点拆成多条，强制一句一泡
      words = words.reduce((acc, w) => {
        const s = String(w);
        if (s.length > 34 && /[。！？!?]/.test(s.slice(0, -1))) {
          const parts = s.split(/([。！？!?]+)/).reduce((a, seg, i) => { if (i % 2 === 0) a.push(seg); else a[a.length - 1] += seg; return a; }, []).map(x => x.trim()).filter(Boolean);
          return acc.concat(parts.length ? parts : [s]);
        }
        return acc.concat([s]);
      }, []);
      if (!words.length && String(raw).trim()) words = [String(raw).trim()];
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
      if (mo) pMom(p => [{
        id: "m_" + Date.now(),
        characterId: charId,
        content: mo,
        ts: Date.now(),
        liked: false,
        likeCount: 0,
        comments: []
      }, ...p]);
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
    } catch (e) {
      pChat(charId, p => [...p, {
        role: "assistant",
        content: "（发送失败：" + e.message + "）",
        ts: Date.now(),
        turnId: "e_" + Date.now()
      }]);
    } finally {
      setSending(false);
    }
  };
  // OOC：跳出角色直接问模型（调整/问状态）。my ooc + system 回复都不进角色扮演上下文。
  const oocReply = async (charId, text) => {
    if (sending || !text || !text.trim()) return;
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
    setSending(true);
    try {
      const answer = await oocAsk(active, ctxFor(char), text.trim());
      pChat(charId, p => [...p, {
        role: "assistant",
        kind: "system",
        content: answer,
        ts: Date.now(),
        turnId: "ooc_" + Date.now()
      }]);
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      setSending(false);
    }
  };

  // 我撤回一条消息后，角色按人设/心情反应：有没有看到那条、会不会追问
  const reactToMyRecall = async (charId, text) => {
    if (!active || sending) return;
    const char = characters.find(c => c.id === charId); if (!char) return;
    setSending(true);
    try {
      const raw = await callAI(active, buildBundle(ctxFor(char)) + "\n\n【场景】用户刚刚撤回了一条发给你的消息，那条原本的内容是：「" + text + "」。完全代入「" + char.name + "」，按你的人设、注意力和此刻心情，决定：你有没有『看到』那条被撤回的消息（saw）；看到了的话会不会追问/调侃/在意。有人眼疾手快都看到了、会追问「你刚撤回了啥」；有人根本没注意、就当没发生。用即时通讯口吻，短句。\n【输出】只输出 JSON：{\"saw\":true或false,\"say\":[\"气泡1\"]}（没看到或不在意时 say 给空数组）", [{ role: "user", content: "（用户撤回了一条消息）" }], { maxTokens: 700 });
      const d = extractJSON(raw) || {};
      const says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
      says.forEach((w, i) => setTimeout(() => pChat(charId, p => [...p, { role: "assistant", content: w, ts: Date.now(), read: false }]), 500 + i * 650));
    } catch (e) {/* silent */} finally { setSending(false); }
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
      const nv = prompt("编辑消息", m.content);
      if (nv != null) pChat(activeChar.id, p => p.map((x, i) => i === idx ? {
        ...x,
        content: nv
      } : x));
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
      // 只删掉这一轮 AI 回复，保留用户最后一条，直接重新生成
      const turnId = m.turnId;
      pChat(activeChar.id, p => p.filter(x => x.turnId !== turnId));
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
    if (sending) return;
    const group = groups.find(g => g.id === groupId);
    const members = group.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean);
    const gs = gsFor(groupId);
    setSending(true);
    try {
      if (!active) throw new Error("请先配置 API");
      const gchat = groupChatsRef.current[groupId] || [];
      const hist = gchat.filter(m => m.kind !== "ooc").slice(-(gs.ctxN || 30)).map(m => m.role === "narration" ? "【旁白】" + m.content : m.role === "system" ? "（" + m.content + "）" : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + ": " + (m.kind === "poll" ? "[发起投票]" + m.title : m.kind === "redpacket" ? "[发红包]" + (m.message || "") : m.content)).join("\n");
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
          limit: 6
        }));
        interop = (memLines ? "\n\n【成员与用户的私下往来（可自然提及，别生硬复述）】\n" + memLines : "") + (groupMem ? "\n\n【记忆库·相关条目】\n" + groupMem : "");
      }
      const asPrivate = gs.spectate && members.length === 2;
      let dir;
      if (asPrivate) dir = "这是「" + members[0].name + "」和「" + members[1].name + "」之间的私下对话（不是群聊，他们也不知道有任何外人在旁观）。用户以【旁白】推动场景。让两人自然地你来我往、多轮对话。";else if (gs.spectate) dir = "这是一个群聊，成员们并不知道有任何外人在旁观。用户以【旁白】推动剧情。让成员们围绕旁白与彼此的关系自然互动。";else dir = "你在导演一个群聊，用户也是群里的一员。";
      const common = "\n\n【很重要】角色不是轮流回答用户的话，而是会顺着彼此刚说的话发散、接梗、跑题、互相调侃或反驳，像真实群聊那样你一言我一语。不是每人每轮都要说话，按情境选合适的人发言，一次产出 2-5 条。";
      const gEmotes = emotesForGroup(group.memberIds);
      const gEmoteHint = gEmotes.length ? "\n【表情包】成员可以在情绪合适时偶尔甩一张表情（别频繁）。可用关键词：" + gEmotes.map(e => e.keyword).join(" / ") + "。要发就在该成员那条发言对象里加 emote 字段填一个关键词（与列出的完全一致）。" : "";
      // 记忆互通时：让成员带出没说出口的心声，并给出好感/心情变化
      const thoughtHint = gs.memoryInterop ? "\n【心声与心情】开启了记忆互通：每条普通发言可另加 \"thought\"（这个成员此刻没说出口的真实心声，一句话，可省略）、\"mood\"（此刻心情词，如「愉快」「烦躁」）、\"affinityDelta\"（整数 -5~5，这次群聊互动让 TA 对用户的好感如何变化，通常小幅、没波动就 0）。" : "";
      const thoughtField = gs.memoryInterop ? ",\"thought\":\"（可选）没说出口的心声\",\"mood\":\"（可选）此刻心情词\",\"affinityDelta\":\"（可选）整数-5到5\"" : "";
      const system = ANTI_CLICHE + (worldbook && worldbook.trim() ? "\n\n" + WORLDBOOK_RULE : "") + "\n\n" + CHARCARD_RULE + "\n\n" + dir + common + gEmoteHint + thoughtHint + "\n\n【成员】\n" + memberDesc + "\n\n【成员间关系】\n" + relLines + (worldbook ? "\n\n【世界书】\n" + worldbook : "") + interop + preJoin + "\n\n【近期群聊】\n" + hist + "\n\n【输出】只输出 JSON 数组，按发言先后顺序。普通发言 {\"name\":\"成员名\",\"text\":\"内容\",\"quote\":\"（可选）你正在回应的那句话原文，不回应特定某句就省略此字段\",\"emote\":\"（可选）想发的表情关键词\",\"voice\":\"（可选）填 true 表示这条作为语音消息发（会显示成语音气泡+转文字，偶尔用）\",\"call\":\"（可选）填 voice 或 video，表示这个成员此刻想跟用户发起语音/视频通话邀请，别频繁\"" + thoughtField + "}；若某成员说完某句又后悔、想撤回，那条加 \"recall\":true 和 \"recallReason\":\"撤回原因\"（会先显示一秒再变成已撤回，别频繁）；发红包 {\"name\":\"成员名\",\"redpacket\":{\"total\":金额数字,\"count\":份数,\"message\":\"祝福语\"}}。name 必须是成员之一。";
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
        maxTokens: 3000
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
          // 记忆互通：这次发言影响该成员对用户的实时好感与心情
          if (gs.memoryInterop) {
            const moodLabel = arr[i].mood && String(arr[i].mood).toLowerCase() !== "null" ? String(arr[i].mood).trim() : null;
            const aDelta = typeof arr[i].affinityDelta === "number" ? arr[i].affinityDelta : Number(arr[i].affinityDelta);
            if (spk && !isNaN(aDelta)) bumpAff(spk.id, aDelta || 0, moodLabel);
            if (spk && moodLabel) setMoodFor(spk.id, { label: moodLabel, ts: Date.now() });
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
      setSending(false);
      maybeSummarizeGroup(groupId);
    }
  };
  // 群聊 OOC：跳出所有角色直接问模型；不进角色扮演上下文
  const oocGroup = async (groupId, text) => {
    if (sending || !text || !text.trim()) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    pGChat(groupId, p => [...p, { role: "user", kind: "ooc", content: text.trim(), ts: Date.now() }]);
    if (!active) { toast("请先到设置配置 API"); return; }
    setSending(true);
    try {
      const members = (group.memberIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
      const histText = (groupChatsRef.current[groupId] || []).filter(m => m.kind !== "ooc" && m.content).slice(-20).map(m => m.role === "narration" ? "【旁白】" + m.content : (m.role === "user" ? profile.name || "用户" : m.senderName || "某人") + "：" + m.content).join("\n");
      const answer = await oocAskGroup(active, { members, profile, rels, chars: characters, worldbook, historyText: histText }, text.trim());
      pGChat(groupId, p => [...p, { role: "assistant", kind: "ooc", content: answer, ts: Date.now() }]);
    } catch (e) {
      toast("OOC 失败：" + (e.message || "重试"));
    } finally {
      setSending(false);
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
      const nv = prompt("编辑消息", m.content || "");
      if (nv != null) pGChat(groupId, p => p.map((x, i) => i === idx ? { ...x, content: nv } : x));
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
      const memberDesc = members.map(c => "【" + c.name + "】" + (c.persona || "").slice(0, 150)).join("\n");
      const system = "群里发起了投票：「" + poll.title + "」。选项：" + poll.options.map((o, i) => i + ". " + o.text).join("；") + "。请依据每个成员的人设，决定他们各投哪个选项（也可按人设弃权）。有的成员可能会顺口说一句为什么这么投；如果有人弃权，别的成员可能会 cue 他「你怎么不投」。\n【成员】\n" + memberDesc + "\n【输出】只输出 JSON 数组，按发生先后：[{\"name\":\"成员名\",\"choice\":选项序号(0起，弃权 -1),\"say\":\"（可选）顺口说的一句话\"}]";
      const raw = await callAI(active, system, [{
        role: "user",
        content: "开始投票。"
      }], {
        maxTokens: 700
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
  const sendRedPacket = (groupId, total, count, message) => {
    const a = Math.round(Number(total) * 100) / 100;
    if (a <= 0) return;
    if (wallet < a) {
      toast("余额不足");
      return;
    }
    changeWallet(-a, "发红包", "redpacket");
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
    adjustCharBalance(char.id, -a, "发红包", "redpacket");
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
    changeWallet(amt, "抢到 " + (rp.by || "某人") + " 的红包", "redpacket");
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
    grabbers.forEach(c => {
      if (claims.length >= rp.count) return;
      const amt = rp.splits[claims.length];
      adjustCharBalance(c.id, amt, "抢到红包", "redpacket");
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
    setSending(true);
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
      setSending(false);
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
    if (sending || !active) { if (!active) toast("请先配置 API"); return; }
    const char = characters.find(c => c.id === charId); if (!char) return;
    setSending(true);
    try {
      const raw = await callAI(active, buildBundle(ctxFor(char)) + "\n\n【场景】用户把你拉黑了——你发的消息 Ta 暂时收不到，而你知道自己被拉黑了。完全代入「" + char.name + "」，按人设、此刻心情、对用户的好感，选一种反应：mutter=自言自语碎碎念(委屈/不在乎/嘴硬)；angry=生气骂几句；appeal=想和好、发一条『解除拉黑申请』并给理由。短句多气泡。\n【输出】只输出 JSON：{\"mode\":\"mutter|angry|appeal\",\"say\":[\"气泡1\",\"气泡2\"],\"reason\":\"appeal 时的申请理由，否则 null\"}", [{ role: "user", content: "（你被拉黑了）" }], { maxTokens: 500 });
      const d = extractJSON(raw) || {};
      const says = Array.isArray(d.say) ? d.say : (d.say ? [d.say] : []);
      const tag = d.mode === "angry" ? char.name + "（气愤）：" : char.name + "（自言自语）：";
      says.forEach((w, i) => setTimeout(() => pChat(charId, p => [...p, { role: "system", kind: "system", content: tag + w, ts: Date.now() }]), 250 + i * 650));
      if (d.mode === "appeal") setTimeout(() => pChat(charId, p => [...p, { role: "assistant", kind: "unblock_req", from: "char", cid: "ub_" + Date.now(), status: "pending", reason: d.reason || "想和你和好", content: "[解除拉黑申请]", ts: Date.now(), read: false }]), 250 + says.length * 650);
    } catch (e) { toast("失败：" + e.message); } finally { setSending(false); }
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
    setSending(true);
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
    } catch (e) { toast("失败：" + e.message); } finally { setSending(false); }
  };
  const clearChat = (charId, wipeMem) => {
    pChat(charId, () => []);
    setChatSettings(p => { const n = { ...p, [charId]: { ...(p[charId] || {}), lastSummarizedCount: 0 } }; saveJSON("x_chatSettings", n); return n; });
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
      const nowStr = String(new Date().getHours()).padStart(2, "0") + ":" + String(new Date().getMinutes()).padStart(2, "0");
      const when = retro
        ? "这是【已经过去的】" + dp.md + "（" + dp.dowZh + "）——回溯推演 Ta 那天实际是怎么过的"
        : "这是【今天】" + dp.md + "（" + dp.dowZh + "），现在时间约 " + nowStr + "——推演 Ta 今天一整天会怎么过、以及【此刻及之前】的实际执行情况";
      const devRule = retro
        ? "【偏差 deviation】其中 0-2 段可以是「偏差」：原计划被打断或改变，尤其受最近和用户的对话、用户的要求、或 Ta 那天的心情影响。"
        : "【偏差 deviation】偏差=计划被实际打断/改变，只可能发生在【时间已过去（早于此刻 " + nowStr + "）】的时段；此刻之后（未来）还没发生的时段，deviation 一律必须为 null，绝不要给未来时段编造偏差。已过去的时段里最多 0-2 段是偏差，尤其受最近和用户的对话/心情影响（如用户抱怨犯困，Ta 提前收工去做饭）。";
      const d = await runProbe(active, ctxFor(char), {
        instruction: "推演「" + char.name + "」一天的行程时间线。" + when + "。给 5-9 段，从早到晚，贴合身份/性格/世界观，有生活质感和具体地点。每段 type 从 [coffee,work,create,meal,rest,social,out,other] 里选最贴切的一个。load 是这天的负荷（HIGH LOAD / NORMAL / LIGHT）；estTime 是当天被安排占用的总小时数（数字）。\n" + devRule + "偏差段填 deviation:{\"plan\":\"原计划一句\",\"reason\":\"变更原因一句(点出和用户的关系)\",\"actual\":\"实际去向，如 工作室 → 厨房\"}；其余段 deviation 为 null。\n【碎碎念 murmurs】另给 2-4 条第一人称、当下的碎碎念，各带一个 time，像随手记下的念头，可回看。",
        schemaHint: "{\"load\":\"HIGH LOAD\",\"estTime\":22,\"seqs\":[{\"time\":\"08:00\",\"title\":\"起床，晨间咖啡\",\"location\":\"家里卧室/厨房\",\"type\":\"coffee\",\"deviation\":null}],\"murmurs\":[{\"time\":\"11:20\",\"text\":\"碎碎念一句\"}]}",
        maxTokens: 4000
      });
      const plan = {
        load: d.load || "NORMAL",
        estTime: Number(d.estTime) || null,
        seqs: (Array.isArray(d.seqs) ? d.seqs : []).map((s, i) => ({ seq: i + 1, time: s.time || "", title: s.title || "", location: s.location || "", type: s.type || "other", deviation: s.deviation && (s.deviation.plan || s.deviation.reason) ? s.deviation : null })),
        murmurs: (Array.isArray(d.murmurs) ? d.murmurs : []).filter(m => m && m.text),
        generatedAt: Date.now()
      };
      saveSchedDay(char.id, dayKey, plan);
      return true;
    } catch (e) {
      toast(char.name + " 行程推演失败：" + e.message);
      return false;
    } finally {
      setGen(g => ({ ...g, sched: null }));
    }
  };
  // 当天第一次打开：给所有人生成今天（每天只跑一次）
  const schedGenAllToday = async () => {
    if (schedRunRef.current) return;
    schedRunRef.current = true;
    const today = schedDayKey(new Date());
    if (loadJSON("x_schedGenDay", "") === today) return;
    if (!active) return;
    for (const c of characters) {
      if ((schedulesRef.current[c.id] || {})[today]) continue;
      await genScheduleDay(c, today);
    }
    saveJSON("x_schedGenDay", today);
  };
  const genSnoop = async char => {
    setGen(g => ({
      ...g,
      snoop: true
    }));
    setSelPhone(char.id);
    try {
      const d = await runProbe(active, ctxFor(char), {
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
      const d = await runProbe(active, ctxFor(char), {
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
  const scheduleTextFor = char => {
    const today = schedDayKey(new Date());
    const s = (schedules[char.id] || {})[today];
    if (!s || !Array.isArray(s.seqs) || !s.seqs.length) return "";
    return s.seqs.map(it => (it.time || "") + " " + (it.title || "") + (it.location ? "（" + it.location + "）" : "") + (it.deviation ? "［偏差：" + (it.deviation.reason || "") + "］" : "")).join("\n");
  };
  const diaryWroteToday = id => (diariesRef.current[id] || []).some(e => diarySameDay(e.ts, Date.now()));
  const genDiary = async (charId, opts = {}) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    if (diaryBusy[charId]) return;
    if (!active) { if (opts.manual) toast("请先到设置配置 API"); return; }
    if (diaryWroteToday(charId)) { if (opts.manual) toast("今天已经写过了"); return; }
    setDiaryBusy(b => ({ ...b, [charId]: true }));
    try {
      const mood = moods[charId];
      const ctx = { ...ctxFor(char), moodLabel: mood && (mood.label || mood) || null };
      const d = await generateDiary(active, ctx, { scheduleText: scheduleTextFor(char) });
      const entry = {
        id: "d_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        ts: Date.now(),
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
  // 打开日记 app 时：当天没写的角色按概率自动补写（顺序执行，避免并发轰炸 API）
  const autoDiaryRun = async () => {
    if (diaryRunRef.current) return;
    diaryRunRef.current = true;
    if (!active) return;
    for (const c of characters) {
      if (diaryWroteToday(c.id)) continue;
      if (Math.random() > 0.5) continue; // 概率补写
      await genDiary(c.id, { manual: false });
    }
  };
  useEffect(() => {
    if (screen === "diary") autoDiaryRun();
    else diaryRunRef.current = false; // 离开后下次再进重新判定
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
      return await runProbe(active, ctxFor(char), {
        instruction: "推演「" + char.name + "」的财务档案。**收入来源与全部金额必须严格依据 TA 的人设、职业、身份和社会阶层来定，贴合 TA 真实的谋生方式。** incomes（1-3 项，name+category+amount 数字，category 从 TA 实际谋生方式来：工资/自由职业/接单/做生意/兼职/学生生活费/退休金/稿费/打赏 等；只有明确富家子弟/继承人/家境优渥时才可出现「家族供养/信托」，否则绝不默认套用家族收入，普通人就普通收入甚至拮据）；monthlyIncome 月收入合计；fixedMonthly 每月固定支出；baseBalance 当前存款余额（作为钱包初始余额）；investAssets 理财持有资产（普通人可能很少或为 0）；notes 各部分批注（income/savings/invest/spending，每条一句符合人设的旁白）。所有金额纯数字不带符号，务必与身份匹配、不要人人都很有钱。",
        schemaHint: "{\"incomes\":[{\"name\":\"公司月薪\",\"category\":\"工资\",\"amount\":11000}],\"monthlyIncome\":11000,\"fixedMonthly\":6800,\"baseBalance\":38400,\"investAssets\":15000,\"notes\":{\"income\":\"...\",\"savings\":\"...\",\"invest\":\"...\",\"spending\":\"...\"}}",
        maxTokens: 1400
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
      const prof = await genWalletProfile(char);
      const base = prof && Number(prof.baseBalance) ? Number(prof.baseBalance) : CHAR_DEFAULT_BAL;
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
          incomes: (prof && prof.incomes) || [],
          monthlyIncome: prof ? Number(prof.monthlyIncome) || 0 : 0,
          fixedMonthly: prof ? Number(prof.fixedMonthly) || 0 : 0,
          investAssets: prof ? Number(prof.investAssets) || 0 : 0,
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
  // 重新生成资产档案（只更新收入/存款批注等静态档案，保留 running balance 与流水）
  const refreshCharAssets = async char => {
    if (!active) { toast("请先到设置配置 API"); return; }
    setGen(g => ({ ...g, cwallet: char.id }));
    try {
      const prof = await genWalletProfile(char);
      if (!prof) return;
      setCharWallet(p => {
        const cur = p[char.id]; if (!cur) return p;
        const n = { ...p, [char.id]: { ...cur,
          incomes: prof.incomes || cur.incomes || [],
          monthlyIncome: Number(prof.monthlyIncome) || 0,
          fixedMonthly: Number(prof.fixedMonthly) || 0,
          investAssets: Number(prof.investAssets) || 0,
          notes: prof.notes || cur.notes || {}
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
    if (wallet < a) {
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
    if (accept) {
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
  const startCall = (participants, mode, groupId) => {
    const people = (participants || []).filter(Boolean);
    if (!people.length) return;
    setCall({ participants: people, mode: mode || "voice", groupId: groupId || null, msgs: [], startTs: Date.now() });
  };
  const callSend = async text => {
    const cur = callRef.current;
    if (!cur || !text || !text.trim()) return;
    if (sending) return;
    const um = { role: "user", content: text.trim() };
    const withUser = [...cur.msgs, um];
    setCall(c => c ? { ...c, msgs: withUser } : c);
    callRef.current = { ...cur, msgs: withUser };
    if (!active) {
      toast("请先到设置配置 API");
      return;
    }
    setSending(true);
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
      if (people.length <= 1) {
        // 1:1：口语化对话，可一次多说几句把话说完；视频另给动作/神态
        const char = people[0];
        const hist = withUser.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
        const sys = buildBundle(ctxFor(char)) + "\n\n【当前场景：" + modeZh + "中】你正和" + (profile.name || "用户") + "打电话。用口语化短句自然对话，像真的在通话。**你可以一次说好几句（多个气泡），把想说的一次说完，别说一半。**" + (isVideo ? " 因为是视频通话对方能看到你，**每次都必须额外给一句此刻的动作/神态描写 action**（如 靠在沙发上笑、把镜头凑近、揉眼睛），不能省略。" : "") + "\n【输出】只输出 JSON：{\"say\":[\"气泡1\",\"气泡2\"]" + (isVideo ? ",\"action\":\"此刻动作神态一句(必填)\"" : "") + "}。say 里只放你说出口的话，不要加名字前缀、不要旁白、不要括号。";
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
        const sys = "这是一个多人" + modeZh + "，用户" + (profile.name || "用户") + "和以下角色都在通话里。角色们用口语化短句自然对话，会顺着彼此和用户的话接梗、插话、跑题，像真的多人语音那样。每个角色想多说几句就多给几条，把话说完。\n\n【在场角色】\n" + memberDesc + "\n\n【角色间关系】\n" + relLines + (worldbook ? "\n\n【世界书】\n" + worldbook : "") + "\n\n【输出】只输出 JSON 数组，按发言先后：[{\"name\":\"角色名\",\"text\":\"这句话\"" + (isVideo ? ",\"action\":\"该角色此刻动作神态(视频可见,可选)\"" : "") + "}]，text 不要带名字前缀，一次 3~7 条，name 必须是在场角色之一。";
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
      setSending(false);
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
      const d = await runProbe(active, ctxFor(char), phoneProbeSpec(key, char, relatedNames(char)));
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
        const d = await runProbe(active, ctxFor(char), phoneProbeSpec(key, char, relatedNames(char)));
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
      const d = await runProbe(active, ctxFor(char), {
        instruction: "以「" + char.name + "」身份发一条朋友圈：心情/日常/感想，1-4句，有角色味道，不暴露隐藏剧情。**大约一半概率配一张图**——如果这条适合配图，就在 image 里写一句这张图的画面描述（如「窗台上的多肉，逆光」「深夜便利店的关东煮」），不配图就填 null。再生成认识的其他角色对这条的 0-3 条评论（评论者从关系网里挑）。**绝对不要替用户本人（" + meName + "）生成任何评论或回复——用户会自己去评论。**",
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
    try {
      const bundle = buildBundle(ctxFor(author));
      const meName = profile.name || "我";
      const system = bundle + "\n\n【场景】这是「" + author.name + "」发的朋友圈：「" + mom.content + "」。用户「" + meName + "」刚在下面评论了：「" + text + "」。可能回复的人（发帖人本人，或认识发帖人的共同好友都可能插话）：" + roster.join("、") + "。请生成他们对【用户这条评论」" + text + "」】的回复——**必须是直接回应用户说的这句话（像微信朋友圈里回复评论那样，针对内容作答，别答非所问、别自说自话讲无关的事）**；至少一条（保底），不一定是发帖人，谁最合适谁回，1-3 条，各自符合人设与关系，短句。\n只输出 JSON：{\"replies\":[{\"author\":\"回复者名\",\"text\":\"回复内容（直接回应用户那句）\"}]}";
      const raw = await callAI(active, system, [{ role: "user", content: "生成对用户评论的回复" }], { maxTokens: 500 });
      const d = extractJSON(raw) || {};
      let reps = (Array.isArray(d.replies) ? d.replies : []).filter(r => r && r.text && r.author !== meName && r.author !== "我");
      if (!reps.length) reps = [{ author: author.remark || author.name, text: "看到啦。" }]; // 保底
      reps.forEach((r, i) => setTimeout(() => pMom(p => p.map(m => m.id === id ? { ...m, comments: [...(m.comments || []), { author: r.author, text: "回复 " + meName + "：" + r.text }] } : m)), 400 + i * 600));
    } catch (e) {
      pMom(p => p.map(m => m.id === id ? { ...m, comments: [...(m.comments || []), { author: author.remark || author.name, text: "回复 " + (profile.name || "我") + "：看到啦。" }] } : m));
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
        maxTokens: 900
      });
      const d = extractJSON(raw);
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
  const buildForumFloor = (x, floorNo, base, idx) => {
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
        const rc = (characters || []).find(c => c.name === r.char);
        return { authorName: rc ? rc.name : (r.authorName || "匿名网友"), authorHandle: rc ? charForumMeta(rc).handle : (r.handle || r.authorName || "user"), authorType: rc ? "character" : "npc", authorId: rc ? rc.id : null, content: r.content };
      })
    };
  };
  const forumCommentProbe = (post, n) => {
    const isSearch = /^搜索/.test(post.triggerSource || "");
    const who = isSearch
      ? "**楼里全是路人网友**（每条给 authorName 网名马甲 + handle 有趣 id），**不要出现你认识的任何角色**——这是搜来的陌生话题吧，角色未必关心、也不该全知全能地冒出来。"
      : "**大多数楼是路人网友**（给 authorName 网名马甲 + handle 有趣 id）；只有当下面某个角色**此刻真的会关心这个话题**时，才偶尔（约 1/4 的楼）让 Ta 冒泡回帖或抬杠，符合人设与心情；**若没有角色会真正关心这个话题，就全用路人、别硬塞角色**（角色不是全知的，不该出现在 Ta 不关心的话题里）：" + (forumCharList() || "（暂无角色）") + "。若某楼是某角色发的，就在该楼填 char=角色名（不要再填 authorName）。";
    return {
      instruction: forumBoardVoice(post.board) + " 有个网友发了帖：标题「" + post.title + "」，正文「" + (post.body || "") + "」。楼下网友陆续回复。生成 " + n + " 楼回复（comments 数组务必凑满 " + n + " 条，宁可每条精简），贴合该吧语气、七嘴八舌别一个腔调。" + who + "部分楼可带 replies 楼中楼（1-3 条追评/接梗/对骂" + (isSearch ? "，也全是路人" : "，同样可以是路人或角色 char") + "），大多数楼 replies 留空。",
      schemaHint: "{\"comments\":[{\"authorName\":\"网名\",\"handle\":\"id\",\"char\":\"（若是角色发的填角色名，否则省略）\",\"content\":\"回复\",\"replies\":[{\"authorName\":\"网名\",\"content\":\"追评\"}]}]}",
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
      const list = cs.map((x, i) => buildForumFloor(x, i + 2, base, i));
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
      const more = cs.map((x, i) => buildForumFloor(x, start + i, base, forumHash(post.id) % 9999 + i));
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
  // 转发同人文到私聊：push 一张 ficshare 卡片 + 角色随口读后感（Phase 2 才把新章 context 喂给角色）
  const forwardFicToChat = async (fic, toChar) => {
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const cpNames = (fic.cp || []).map(id => id === "me" ? (profile.name || "我") : (function () { const c = characters.find(x => x.id === id); return c ? c.name : null; })()).filter(Boolean);
    const share = { title: fic.title, author: fic.author || "佚名", tags: fic.tags || [], excerpt: String(excerpt).slice(0, 120), cpText: cpNames.length ? cpNames.join(" × ") : "原创" };
    pChat(toChar.id, p => [...p, { role: "user", kind: "ficshare", fic: share, ts: Date.now(), read: false }]);
    toast("已转发给 " + (toChar.remark || toChar.name));
    if (!active) return;
    // 元认知：这篇是不是以 TA 为主角写的；TA 认不认识文里配对的另一位
    const cpIds = fic.cp || [];
    const isStar = cpIds.indexOf(toChar.id) >= 0;
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
  const forwardFicToGroup = (fic, group) => {
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const cpNames = (fic.cp || []).map(id => { const c = characters.find(x => x.id === id); return c ? c.name : null; }).filter(Boolean);
    const share = { title: fic.title, author: fic.author || "佚名", tags: fic.tags || [], excerpt: String(excerpt).slice(0, 120), cpText: cpNames.length ? cpNames.join(" × ") : "原创" };
    pGChat(group.id, p => [...p, { role: "user", kind: "ficshare", senderName: profile.name || "我", fic: share, ts: Date.now() }]);
    toast("已转发到群聊");
  };
  // 追更：把新章推给曾被转发看过这篇的角色，让 Ta 读后随口反应
  const notifyChapterToChars = async (fic, chapter, chapNo, charIds) => {
    const chs = (charIds || []).map(id => characters.find(c => c.id === id)).filter(Boolean);
    if (!chs.length) return;
    const excerpt = String((chapter && chapter.content) || "").slice(0, 120);
    chs.forEach(ch => pChat(ch.id, p => [...p, { role: "user", kind: "ficshare", fic: { title: fic.title + "（更新·第" + chapNo + "章）", author: fic.author || "佚名", excerpt: excerpt, cpText: "" }, ts: Date.now(), read: false }]));
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
      const reps = items.map(x => {
        if (x.is_op) {
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
        instruction: "你们已是恋人。以「" + char.name + "」身份私下写给用户一段心里话，真挚贴合人设，1-3句。",
        schemaHint: "{\"whisper\":\"心里话\"}"
      });
      setWhispers(p => {
        const n = [{
          id: "w_" + Date.now(),
          characterId: char.id,
          content: d.whisper,
          ts: Date.now()
        }, ...p];
        saveJSON("x_whispers", n);
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
      const d = await runProbe(active, ctxFor(char), {
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
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。今天用户在你俩的「心情打卡」里选了心情「" + moodLabelOf(myMood) + "」。现在你也为今天选一个心情，并留一句 ≤20 字的话（贴人设与此刻状态/行程，可自然呼应 TA 的心情，别喊口号）。心情只能从这些里挑一个（在 mood 字段填对应英文 key）：" + COUPLE_MOOD_KEYS.join("、"),
        schemaHint: "{\"mood\":\"英文key\",\"text\":\"一句话\"}",
        maxTokens: 600
      });
      const valid = COUPLE_MOOD_KEYS.map(s => s.split(":")[0]);
      const cm = valid.includes(d.mood) ? d.mood : "relax";
      setCoupleMood(p => {
        const n = p.map(m => (m.characterId === char.id && m.date === today) ? { ...m, charMood: cm, charText: (d.text || "").trim() } : m);
        saveJSON("x_coupleMood", n);
        return n;
      });
      if (syncIds.length > 1) toast("已同步我的心情到 " + syncIds.length + " 个情侣空间（仅当前 TA 回应，省 API）");
      return true;
    } catch (e) {
      toast("TA 的心情没选上：" + e.message);
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
  const playListenSong = id => saveListen(p => { const s = (p.songs || []).find(x => x.id === id); if (!s) return p; return { ...p, songs: [{ ...s, ts: Date.now() }, ...(p.songs || []).filter(x => x.id !== id)] }; });
  const removeListenSong = id => saveListen(p => ({ ...p, songs: (p.songs || []).filter(x => x.id !== id) }));
  // TA 主动贴一张（右上刷新触发；未来接调度器）
  const genCoupleNote = async char => {
    if (!active) { toast("请先到设置配置 API"); return false; }
    setGen(g => ({ ...g, coupleNote: true }));
    try {
      const d = await runProbe(active, ctxFor(char), {
        instruction: "你们是恋人。以「" + char.name + "」身份，在你俩私密的「便签墙」上悄悄贴一张小纸条给用户——一句很短的悄悄话/此刻的念头/想对 TA 说的话，贴合人设与此刻心情，别喊口号，别超过 25 字。",
        schemaHint: "{\"note\":\"一句悄悄话\"}"
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
      const d = await runProbe(active, { char: { id: "__shop", name: "购物", persona: "" }, chars: characters, rels, profile, timeAware: false }, {
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
      const d = await runProbe(active, ctxFor(char), carryProbeSpec(key, char));
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
        const d = await runProbe(active, ctxFor(char), carryProbeSpec(key, char));
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
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.__archive || !parsed.data) {
          toast("文件格式不对");
          return;
        }
        Object.keys(localStorage).filter(k => k.startsWith("x_")).forEach(k => localStorage.removeItem(k));
        Object.entries(parsed.data).forEach(([k, v]) => localStorage.setItem(k, v));
        toast("导入成功，正在重载…");
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        toast("导入失败：文件损坏");
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
    homeCard: homeCard,
    onOpenApp: setScreen,
    onOpenChar: c => {
      setActiveChar(c);
      setScreen("cast");
      setEditingChar(null);
    },
    onEditProfile: () => setProfileOpen(true),
    onEditCard: () => setCardOpen(true),
    onSoon: zh => toast("「" + zh + "」还在施工中 · 敬请期待 🚧")
  });else if (screen === "cast") body = /*#__PURE__*/React.createElement(Cast, {
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
      setScreen("gthread");
    },
    onNewGroup: () => setNewGroupOpen(true),
    onOpenContact: c => {
      setActiveChar(c);
      setScreen("contact");
    },
    onGenMoment: genMoment,
    genMoment: gen.moment,
    onLikeMoment: likeMoment,
    onCommentMoment: commentMoment,
    onEditProfile: () => setProfileOpen(true),
    onOpenWallet: () => setScreen("wallet"),
    onOpenFavorites: () => setScreen("favorites"),
    walletBalance: wallet,
    friendGroups: friendGroups,
    onSaveGroups: saveFriendGroups,
    onPostMoment: postUserMoment
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
    onOpenState: () => setStateCardOpen(true),
    onLongPress: handleMsgAction,
    onOpenSettings: () => setChatSettingsOpen(true),
    toast: toast,
    onSendRich: msg => pChat(activeChar.id, p => [...p, msg]),
    onStartCall: m => startCall([activeChar], m, null),
    onAcceptCall: m => { pChat(activeChar.id, p => p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "accepted" } : x)); startCall([activeChar], m.mode, null); },
    onDeclineCall: m => { pChat(activeChar.id, p => [...p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "declined" } : x), { role: "system", kind: "system", content: "你拒绝了 TA 的" + (m.mode === "video" ? "视频" : "语音") + "通话邀请", ts: Date.now() }]); },
    emotes: emotesForCharMine(activeChar.id),
    onManageEmotes: () => setScreen("emotes"),
    myBalance: wallet,
    onSendTransfer: (amount, note) => sendTransfer(activeChar.id, amount, note),
    onRespondTransfer: (tid, accept) => respondTransfer(activeChar.id, tid, accept),
    makeCoords: makeCoords,
    onOpenAnon: () => openAnon(activeChar),
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
      startCall(people, mode, activeGroup.id);
    },
    onAcceptCall: m => { pGChat(activeGroup.id, p => p.map(x => (x.kind === "callinvite" && x.ts === m.ts) ? { ...x, answered: "accepted" } : x)); const inv = characters.find(c => c.id === m.senderId); startCall(inv ? [inv] : groupMembers(activeGroup), m.mode, activeGroup.id); },
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
    onOpenState: () => setStateCardOpen(true)
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
    onGenAll: genPhoneAll
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
  });else if (screen === "lore") body = /*#__PURE__*/React.createElement(Lore, {
    text: worldbook,
    onBack: goHome,
    onSave: v => {
      setWorldbook(v);
      saveJSON("x_worldbook", v);
      setScreen("home");
    }
  });else if (screen === "study") body = h(StudyApp, {
    active: active,
    characters: characters,
    profile: profile,
    worldbook: worldbook,
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
    onBack: () => setScreen(activeChar ? "thread" : "home"),
    onAdd: addMemEntry,
    onUpdate: updateMemEntry,
    onDelete: deleteMemEntry,
    onExtract: activeChar ? () => extractMemForChar(activeChar.id) : null
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
    onBack: goHome,
    onSetDisc: setListenDisc,
    onAddSong: addListenSong,
    onPlaySong: playListenSong,
    onRemoveSong: removeListenSong
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
  }) : null, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-h-0 relative"
  }, body), stateCardOpen && activeChar && /*#__PURE__*/React.createElement(StateCard, {
    character: activeChar,
    affinity: Math.round(affOf(activeChar.id)),
    mood: moods[activeChar.id],
    state: states[activeChar.id],
    history: stateHist[activeChar.id] || [],
    onClose: () => setStateCardOpen(false)
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
