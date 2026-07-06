// ============================================================
// 同人文（fanfic）—— Phase 1
// feed / 批量生成 / 追更 / 书评 + RP(穿进同人文) 最小 stub。
// 数据走 localStorage（x_fanfic_tabs / x_fanfic_fics / x_fanfic_cps），
//   全部 x_ 前缀，自动跟随现有 saves 整包云同步。
// 生成管线：system(反八股 + 角色卡准则 + 亲密反模板 + 同人文反陈词滥调)
//   + 选中 CP 角色卡 + 当前 tab 世界观(world book) + 生成指令，
//   一次批量出 N 篇；extractJSON/repairJSON 容错 + 自动重试（不动全局 callAI）。
// ============================================================
(function () {
  const useState = React.useState, useEffect = React.useEffect;

  // ---- 内置 prompt 块 -------------------------------------------------
  // 同人文专用「反陈词滥调」第五节：ban 掉网文/翻译腔里烂大街的意象词。
  // 只焊进本模块的 prose 生成，不进全局。
  const FANFIC_ANTI_CLICHE =
    "【同人文 · 反陈词滥调（写 prose 时持续生效，优先级同去人机味）】\n" +
    "· 禁用这批被写烂的意象词及其近义堆砌：形容皮肤/身体用「白玉／羊脂／凝脂／欺霜赛雪／白皙如瓷」；形容头发用「瀑布般／如瀑／墨色的瀑布」；缠绕纠缠一律不用「藤蔓／藤蔓般缠绕／attach 藤蔓」；还有「琉璃／碎钻／星辰大海／灵魂深处／宿命／劫」这类空转大词。\n" +
    "· 【尤其禁掉这批同人烂梗动作/称呼，一次都别出现】：把头/脸「埋进颈窝／埋在颈间／蹭颈窝」、把对方或自己比作「小兽／幼兽／大型犬／奶狗／小奶猫」、「低吼一声／喉间溢出／闷哼／黏腻的气音」、「危险地眯起眼／勾唇一笑／挑眉」、「收紧的手臂／禁锢／圈进怀里／扣住后颈」、「耳尖泛红／红透了耳根」。要写亲密与情绪，请另找只属于这两个人、这个场景的具体动作。\n" +
    "· 别写「不知是不是错觉」「仿佛过了一个世纪」「时间仿佛静止」「空气都凝固了」这类填充句。\n" +
    "· 感官与比喻要落在这两个人此刻的具体处境上（这间屋子、这件衣服、他手边的东西），不要通用言情模板。\n" +
    "· 台词要有人味、有停顿、有言外之意，别让人物开口就是散文腔或宣言腔。";
  // 尾部再压一遍（放输出指令后，利用模型对结尾的注意力）——item：整篇再加一次八股提醒
  const FANFIC_ANTI_CLICHE_TAIL =
    "\n\n【落笔前再自检一遍】通篇不许出现：埋进颈窝、小兽/幼兽/大型犬、低吼一声/喉间溢出、勾唇/挑眉、圈进怀里/扣住后颈、耳尖泛红，以及白玉凝脂、如瀑长发、藤蔓般缠绕、星辰大海、灵魂深处这类烂词。发现自己要写这些，就换成此情此景独有的具体细节。";

  // world book 亲密场景「设定层」补充（拼进当前 tab 世界观之后）——中文比喻词表走「可用」方向，
  // 上面 FANFIC_ANTI_CLICHE 走「禁用」方向，两头夹。
  const INTIMACY_WORLDNOTE =
    "【亲密场景写作设定层】写到亲密/情欲时：动作与反应必须『非这两个人不可』，" +
    "优先写角色专属的小动作、口癖、他在意的具体细节；收尾落在一句符合他声纹的话或只属于他俩的细节上，" +
    "别用『埋进颈窝深吸气／忍不住求饶／热流直冲天灵盖』这类通用模板收尾。尺度贴合本世界观基调，别自我阉割也别为露骨而露骨。";

  // ---- 预设世界观 tab（首启种子）------------------------------------
  // mixed:true 的「推荐」= 从其它版块类别随机抽来写（每篇随机挑一个世界观）
  const SEED_TABS = [
    { id: "tab_reco", name: "推荐", desc: "综合推荐——从所有世界观类别里随机抽取来写，冷暖甜虐各种题材混着来。", seed: true, mixed: true },
    { id: "tab_urban", name: "都市", desc: "现代都市背景。写字楼、地铁、深夜便利店、微信消息。写实、生活质感，情感张力藏在日常缝隙里。", seed: true },
    { id: "tab_campus", name: "校园", desc: "校园背景。教室、操场、晚自习、社团。青涩、克制、有少年感，别写得像成年人办公室恋爱。", seed: true },
    { id: "tab_apoc", name: "末世", desc: "末世/废土背景。资源匮乏、丧尸或灾变、幸存者据点。危险与依赖并存，感情在生死边缘发生，冷硬底色。", seed: true },
    { id: "tab_abo", name: "ABO", desc: "ABO 世界观。Alpha/Beta/Omega 三分性别、信息素、易感期/发情期、标记。设定内自洽，信息素与本能是核心张力。", seed: true },
    { id: "tab_endless", name: "无限流", desc: "无限流。主角被卷入一个个副本/试炼世界，规则残酷、通关或死。悬疑惊悚打底，感情在极限处境里淬出来。", seed: true },
    { id: "tab_ancient", name: "古风", desc: "古风架空。朝堂、江湖、深宅、边关。\n【文风必须真的古】要有半文半白的古白话语感（近《红楼》《金瓶》话本、明清世情小说的腔调），不是套了古装的现代小说：\n· 叙述与对白都用文白相间的句子，多用四字短语、对仗与留白；句子偏短，忌长句欧化从句。\n· 称谓、器物、时辰、礼数都用古时说法（妾身/在下/郎君/娘子、更漏/时辰、案几/罗帐/袖中、拱手/敛衽），第一/第二人称少用「你我」多用身份称谓。\n· 严禁现代词与翻译腔：像「感觉/情绪/状态/氛围/空气/时间仿佛静止/心脏/大脑/紧张/放松/关系/沟通/瞬间/画面」这类词一律换成古意表达或删去。\n· 情感靠动作、景物、器物与欲言又止来递，隐忍克制，别直白宣泄、别现代心理描写。", seed: true },
    { id: "tab_era", name: "年代", desc: "年代文。上世纪某个年代（六七十年代/九十年代）背景，粮票、大院、国营厂、书信。质朴、有时代颗粒感。", seed: true },
    { id: "tab_hk", name: "港片", desc: "港片质感。八九十年代香港，警匪、江湖义气、霓虹与雨夜、茶餐厅。粤味台词、宿命感、江湖儿女的克制深情。", seed: true }
  ];

  // ---- 存储 ----------------------------------------------------------
  const K_TABS = "x_fanfic_tabs";
  const K_FICS = "x_fanfic_fics";
  const K_CPS = "x_fanfic_cps";
  const K_CFG = "x_fanfic_cfg"; // 生成设置：预设文风 + 每篇 max token

  // 文风做成多个自定义预设，可多选任意切换；perFic=每篇/每章目标 token（放宽，别老骗刷下一章）
  const CFG_DEFAULT = { styles: [], activeStyleIds: [], perFic: 4200 };
  function loadCfg() {
    const c = loadJSON(K_CFG, null) || {};
    if (c.style && !c.styles) { c.styles = [{ id: "st_legacy", label: "我的文风", text: c.style }]; c.activeStyleIds = ["st_legacy"]; delete c.style; }
    return Object.assign({}, CFG_DEFAULT, c);
  }
  function saveCfg(c) { saveJSON(K_CFG, c); }
  function activeStyleText(cfg) {
    const ids = cfg.activeStyleIds || [];
    return (cfg.styles || []).filter(function (s) { return ids.indexOf(s.id) >= 0; }).map(function (s) { return s.text; }).filter(Boolean).join("\n\n");
  }
  // 我的·作者主页资料（头像/昵称/id/背景 + 粉丝/关注；热度由我发布的篇目派生）
  const K_ME = "x_fanfic_me";
  function loadMe() { return loadJSON(K_ME, null); }
  function saveMe(m) { saveJSON(K_ME, m); }
  function meProfile(stored, profile) {
    return Object.assign({
      name: (profile && profile.name) || "我", handle: "", bio: (profile && profile.tagline) || "",
      avatar: (profile && profile.avatarImage) || null, bg: null, heat: 0, fans: 0, following: 0
    }, stored || {});
  }

  function loadTabs() {
    const stored = loadJSON(K_TABS, null);
    if (!stored || !Array.isArray(stored) || !stored.length) { saveJSON(K_TABS, SEED_TABS); return SEED_TABS.slice(); }
    // 补齐新增的预设版块（老用户 localStorage 里只存了旧的几个种子，新种子一直没出现——就是这个根因）
    const seedIds = SEED_TABS.map(function (s) { return s.id; });
    const custom = stored.filter(function (t) { return seedIds.indexOf(t.id) < 0; });
    const merged = SEED_TABS.concat(custom); // 所有当前种子（按定义顺序）在前 + 用户自定义在后
    if (merged.length !== stored.length) saveTabs(merged);
    return merged;
  }
  function saveTabs(list) { saveJSON(K_TABS, list); }
  function loadFics() { return loadJSON(K_FICS, []); }
  function saveFics(list) { saveJSON(K_FICS, list); }
  function loadCPs() { return loadJSON(K_CPS, []); }
  function saveCPs(list) { saveJSON(K_CPS, list); }

  function uid(pfx) { return (pfx || "f") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // 刷新语义（照贴吧）：清掉非保护的 npc fic；onShelf==true || source=="user" 一律保留。
  function protectedFic(f) { return f && (f.onShelf === true || f.source === "user"); }

  // ---- 泛读者人格（书评用，不碰角色卡）--------------------------------
  // 走朋友圈随机 NPC 那套「路人读者」，各种画风。
  const READER_VOICE =
    "你在扮演一批逛同人文的普通读者/太太粉，各种画风都有：考据党、颜狗、含泪嗑生死、只会打「啊啊啊」的、" +
    "阴阳怪气挑刺的、催更的、玩梗的、认真写长评的。别都一个腔调，别客服腔、别写得像编辑评语。用真实的同人圈黑话和语气。";

  // ---- 组生成 prompt --------------------------------------------------
  // cpChars: 已解析对象数组（0/1/2 个，元素可能是 meChar，带 isMe）
  function sideDesc(c) {
    if (c.isMe) return "「" + c.name + "」是读者本人（我）" + (c.persona && c.persona.trim() ? "，按这份面具人设来写：\n" + c.persona.trim() : "，没有填写人设——可自由发挥其性格，别硬套设定");
    return "「" + c.name + "」严格贴合角色卡：\n" + (c.persona && c.persona.trim() ? c.persona.trim() : "（暂无设定，可据名字合理发挥）");
  }
  function cpBlock(cpChars, opts) {
    opts = opts || {};
    if (!cpChars || !cpChars.length)
      return "【CP】未指定具体 CP——写原创向/群像向短篇，主角自拟，别硬凑现有角色。";
    if (cpChars.length === 1) {
      const c = cpChars[0];
      return "【CP：" + c.name + " × 原创对象】\n主角一方：" + sideDesc(c) + "\n另一方是一个由你设定的原创角色（自由发挥，贴合本世界观基调）。";
    }
    const a = cpChars[0], b = cpChars[1];
    const bothChars = !a.isMe && !b.isMe; // 两个都是角色（没有「我」）
    // 带上我：写成 A × 我 × B 三人同框
    if (bothChars && opts.includeMe) {
      const meName = opts.meName || "我";
      return "【CP：" + a.name + " × " + meName + "（读者本人/我） × " + b.name + "】\n这是三人同框：把『我』作为真正的第三方写进去，三个人彼此之间都有关系张力，别把『我』写成旁观者或工具人。\n· " + sideDesc(a) + "\n· 「" + meName + "」是读者本人（我）" + (opts.mePersona && opts.mePersona.trim() ? "，按这份面具人设来写：\n" + opts.mePersona.trim() : "，没填人设就自由发挥其性格") + "\n· " + sideDesc(b);
    }
    // 只他俩 CP：即便角色卡写了「我男朋友」，也不把「我」带进文里
    const soloTail = bothChars ? "\n【只写这两人】这是 " + a.name + " × " + b.name + " 的双人同人文，读者/『我』不出场、不作为角色写进去；就算某人的设定里写了 TA 是「我的男朋友/恋人」，本篇也只聚焦他们两人彼此，别把「我」拉进来凑三人。" : "";
    return "【CP：" + a.name + " × " + b.name + "】\n两位主角各自守住各自设定、别互相同化。\n· " + sideDesc(a) + "\n· " + sideDesc(b) + soloTail;
  }

  // 素材来源：把 CP 角色的私聊记录抽尾巴当写作素材（item 6：生成素材来源人设聊天）
  function chatMaterialFor(cpChars) {
    if (!cpChars || !cpChars.length) return "";
    const blocks = [];
    cpChars.forEach(function (c) {
      const log = loadJSON("x_chat:" + c.id, []);
      const tail = (log || []).filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && m.content; }).slice(-14);
      if (!tail.length) return;
      const lines = tail.map(function (m) { return (m.role === "assistant" ? c.name : "对方") + "：" + String(m.content).slice(0, 80); });
      blocks.push("· 和「" + c.name + "」的近期聊天（可提炼 TA 的说话习惯、你俩的相处质感、在意的事，化用进文里，别照抄）：\n" + lines.join("\n"));
    });
    return blocks.length ? "【素材来源 · 角色真实聊天记录】\n" + blocks.join("\n\n") : "";
  }

  function buildGenSystem(tab, cpChars, userName, worldbook, opts) {
    opts = opts || {};
    const parts = [];
    parts.push(ANTI_CLICHE);
    parts.push(CHARCARD_RULE);
    parts.push(INTIMATE_ANTI_CLICHE);
    parts.push(FANFIC_ANTI_CLICHE);
    parts.push(
      "【任务】你是一位很会写的同人文作者。写【纯线下叙事体】短篇同人文（第三人称或第二人称皆可，不是聊天、不是剧本，是成篇的散文小说）。" +
      "每篇自成一体、有起承转合、有真正推进的剧情和场景，落在具体细节与真实情绪上，别开头没铺垫就草草收尾。");
    // 世界观 = world book / 设定层。推荐(mixed)版：给出一整批世界观供每篇随机取
    if (tab.mixed && Array.isArray(opts.worldPool) && opts.worldPool.length) {
      parts.push("【世界观（综合推荐 · 每篇随机挑一个来写，彼此别扎堆重复）】\n" +
        opts.worldPool.map(function (w) { return "· " + w.name + "：" + (w.desc || ""); }).join("\n"));
    } else {
      parts.push("【本版世界观（设定层 · world book）：" + tab.name + "】\n" + (tab.desc || "（无额外设定）"));
    }
    parts.push(INTIMACY_WORLDNOTE);
    if (opts.style && opts.style.trim()) parts.push("【预设文风（作者本次的写作风格要求，优先满足）】\n" + opts.style.trim());
    if (worldbook && worldbook.trim()) parts.push("【全局世界书（可作背景参考，与本版世界观冲突时以本版为准）】\n" + worldbook.trim());
    parts.push(cpBlock(cpChars, opts));
    if (opts.chatMaterial && opts.chatMaterial.trim()) parts.push(opts.chatMaterial.trim());
    return parts.join("\n\n");
  }

  // ---- 批量生成 N 篇（容错 + 重试）------------------------------------
  // opts: { style, perFic, worldPool, chatMaterial }
  async function genBatch(active, tab, cpChars, n, userName, worldbook, opts) {
    opts = opts || {};
    const perFic = opts.perFic || CFG_DEFAULT.perFic;
    const minWords = Math.max(600, Math.round(perFic * 0.55)); // 大致字数下限
    const sys = buildGenSystem(tab, cpChars, userName, worldbook, opts) + "\n\n" +
      "【输出】只输出一个合法 JSON 数组，无 markdown 无多余文字。数组恰好 " + n + " 个元素（务必凑满 " + n + " 篇）：\n" +
      "[{\"title\":\"标题\",\"author\":\"作者笔名（同人圈作者马甲/太太笔名，别用真名别带@）\",\"tags\":[\"标签\",\"标签\"],\"body\":\"正文（成篇散文，务必写足、有剧情，约 " + minWords + " 字以上，分段用\\n\\n）\",\"endHook\":\"结尾锚点：一句话描述这篇结束在什么处境/悬念，供日后续写接续\"}]\n" +
      "每篇 title 别重复、别都一个套路；author 每篇各不同；tags 2-4 个（如『破镜重圆』『HE』『pwp』『情有独钟』等同人圈标签）。别为了凑数量把正文压短——宁可写满。" +
      FANFIC_ANTI_CLICHE_TAIL;
    const user = "写 " + n + " 篇" + (tab.mixed ? "（世界观每篇随机挑）" : "【" + tab.name + "】世界观下") + "的同人文。别都同一个梗、同一种基调，冷暖虐甜各来一点，每篇都要写出剧情别烂尾。";
    async function once(extra) {
      const raw = await callAI(active, sys + (extra || ""), [{ role: "user", content: user }], { maxTokens: Math.min(20000, 1200 + n * perFic) });
      let d = extractJSON(raw);
      if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && d.title) return [d]; // 模型只吐了一篇对象
      return null;
    }
    let arr = await once("");
    if (!arr || !arr.length) arr = await once("\n\n（上一次输出没能解析成合法 JSON 数组，请务必严格只输出 JSON 数组、别加任何解释文字。）");
    if (!arr || !arr.length) throw new Error("生成失败：模型没有返回可解析的篇目，可重试或换模型");
    return arr.filter(function (x) { return x && (x.title || x.body); }).slice(0, n).map(function (x) {
      return {
        title: String(x.title || "无题").slice(0, 60),
        author: String(x.author || "佚名").slice(0, 20),
        tags: Array.isArray(x.tags) ? x.tags.filter(Boolean).slice(0, 6).map(String) : [],
        body: String(x.body || "").trim(),
        endHook: String(x.endHook || "").trim()
      };
    });
  }

  // ---- 追更：append 一章（续写 = 前情摘要 + 上一章 endHook，不塞全文）----
  // opts: { style, perFic, chatMaterial }
  async function genNextChapter(active, fic, tab, cpChars, userName, worldbook, opts) {
    opts = opts || {};
    const perFic = opts.perFic || CFG_DEFAULT.perFic;
    const minWords = Math.max(600, Math.round(perFic * 0.55));
    const chapters = fic.chapters || [];
    const last = chapters[chapters.length - 1] || {};
    // 前情压缩摘要：标题 + tags + 每章 endHook 串起来（不塞全文，省 token）
    const priorHooks = chapters.map(function (c, i) {
      return "第" + (i + 1) + "章结束在：" + (c.endHook || "（无锚点）");
    }).join("\n");
    const sys = buildGenSystem(tab, cpChars, userName, worldbook, opts) + "\n\n" +
      "【当前任务：给一篇已在连载的同人文续写下一章】\n" +
      "篇名《" + fic.title + "》，标签：" + (fic.tags || []).join("、") + "。\n" +
      "【前情摘要（历章锚点，不含全文，你据此自然接续、保持人物与线索一致）】\n" + (priorHooks || "（这是第一章）") + "\n" +
      "【上一章的结尾锚点（从这里直接往下写）】\n" + (last.endHook || "（无，请自然开新章）") + "\n\n" +
      "【输出】只输出一个合法 JSON 对象，无 markdown：\n" +
      "{\"content\":\"这一章正文（成篇散文，承接上一章锚点往下推进、有实质剧情进展，约 " + minWords + " 字以上，分段用\\n\\n）\",\"endHook\":\"本章新的结尾锚点，供再下一章接续\"}" +
      FANFIC_ANTI_CLICHE_TAIL;
    const raw = await callAI(active, sys, [{ role: "user", content: "续写《" + fic.title + "》的下一章。" }], { maxTokens: Math.min(12000, perFic + 1500) });
    let d = extractJSON(raw);
    if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
    if (!d || !d.content) throw new Error("续写失败，可重试");
    return { content: String(d.content).trim(), endHook: String(d.endHook || "").trim() };
  }

  // ---- 书评：一次生成 N 条（NPC 泛读者 + 作者至少下场一次）------------
  async function genReviews(active, fic, tab, worldbook) {
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const authorName = fic.author || "作者";
    const sys = ANTI_CLICHE + "\n\n" + READER_VOICE + "\n\n" +
      "他们刚读完一篇发在【" + tab.name + "】同人版、作者笔名「" + authorName + "」的同人文《" + fic.title + "》（标签：" + (fic.tags || []).join("、") + "）。" +
      "下面是正文节选，据此写具体的书评/短评（可夸可挑刺可玩梗可催更），别泛泛，别剧透式复述剧情。\n" +
      "【正文节选】\n" + String(excerpt).slice(0, 1200) + "\n\n" +
      "【输出】只输出合法 JSON 数组，5-8 条书评：\n" +
      "[{\"author\":\"读者马甲（同人圈网名，别用真名，别带@）\",\"content\":\"书评正文\",\"replies\":[{\"author\":\"另一读者马甲\",\"content\":\"楼中楼回复\",\"isAuthor\":false}]}]\n" +
      "**其中必须至少有一条**（某条书评本身、或某条楼中楼回复）是作者「" + authorName + "」本人下场回复读者的——署名就写「" + authorName + "」、把那条的 isAuthor 设为 true，像作者回评那样（道谢/回应读者的梗/害羞解释/回怼黑评，符合太太本人语气）。其余 replies 大多留空，只 1-2 条带楼中楼。语气各异别雷同。";
    const raw = await callAI(active, sys, [{ role: "user", content: "给《" + fic.title + "》写书评，记得作者「" + authorName + "」要下场至少回一句。" }], { maxTokens: 3200 });
    let d = extractJSON(raw);
    if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
    return arr.filter(function (x) { return x && x.content; }).slice(0, 10).map(function (x) {
      return {
        id: uid("rv"),
        author: String(x.author || "路人读者").slice(0, 20),
        isAuthor: !!x.isAuthor || String(x.author || "") === authorName,
        content: String(x.content).trim(),
        replies: Array.isArray(x.replies) ? x.replies.filter(function (r) { return r && r.content; }).slice(0, 4).map(function (r) {
          return { id: uid("rp"), author: String(r.author || "路人读者").slice(0, 20), isAuthor: !!r.isAuthor || String(r.author || "") === authorName, content: String(r.content).trim() };
        }) : []
      };
    });
  }

  // ---- 我评论/回复 → 生成 NPC（含作者）的回复（item 3）--------------
  // 返回 [{id,author,content,isAuthor}]；挂到我那条书评/楼层的 replies 下
  async function genReplyToUser(active, fic, tab, myText, threadCtx) {
    const authorName = fic.author || "作者";
    const excerpt = ((fic.chapters || [])[0] || {}).content || fic.body || "";
    const sys = ANTI_CLICHE + "\n\n" + READER_VOICE + "\n\n" +
      "在同人文《" + fic.title + "》（作者「" + authorName + "」）的书评区，一个读者刚发了下面这条评论/回复，其他读者和作者本人陆续来接话。\n" +
      (threadCtx ? "【所在楼层的上文】\n" + threadCtx + "\n" : "") +
      "【正文节选（供理解在聊什么）】\n" + String(excerpt).slice(0, 700) + "\n" +
      "【读者刚发的这条】\n" + myText + "\n\n" +
      "【输出】只输出合法 JSON 数组，2-4 条回复这条评论的话（自然接话/共鸣/抬杠/补充/玩梗）：\n" +
      "[{\"author\":\"马甲\",\"content\":\"回复\",\"isAuthor\":false}]\n" +
      "**其中让作者「" + authorName + "」本人至少回一条**（那条 author 写「" + authorName + "」、isAuthor 设 true）。别都一个腔调，别客服腔。";
    const raw = await callAI(active, sys, [{ role: "user", content: "针对这条评论生成回复。" }], { maxTokens: 4000 });
    let d = extractJSON(raw);
    if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
    return arr.filter(function (x) { return x && x.content; }).slice(0, 5).map(function (x) {
      return { id: uid("rp"), author: String(x.author || "路人读者").slice(0, 20), isAuthor: !!x.isAuthor || String(x.author || "") === authorName, content: String(x.content).trim() };
    });
  }

  // ============================================================
  // 穿越（互动叙事 RP 引擎）—— 玩家穿进一篇收藏的同人文，AI 抛决策点、玩家自由输入行动
  // ============================================================
  const K_RP = "x_fanfic_rp"; // 存档数组
  function loadRP() { return loadJSON(K_RP, []); }
  function saveRP(list) { saveJSON(K_RP, list); }
  const RP_MODES = [
    { key: "left", label: "魂穿 · CP 左位", short: "魂穿左位" },
    { key: "right", label: "魂穿 · CP 右位", short: "魂穿右位" },
    { key: "passerby", label: "天降 · 路人 / 配角", short: "天降路人" },
    { key: "random", label: "天降 · 随机身份", short: "天降随机" }
  ];
  function rpModeLabel(key) { const m = RP_MODES.find(function (x) { return x.key === key; }); return m ? m.short : key; }
  // 玩家固定扮演谁（魂穿=某主角名；天降=session.playerIdentity.name）
  function rpPlayerName(mode, cpChars, identity) {
    const a = cpChars[0], b = cpChars[1];
    if (mode === "left") return a ? a.name : "左位主角";
    if (mode === "right") return b ? b.name : "右位主角";
    return identity && identity.name ? identity.name : null;
  }
  function rpOther(mode, cpChars) { // 魂穿时的"对方"（另一位主角）
    if (mode === "left") return cpChars[1] || null;
    if (mode === "right") return cpChars[0] || null;
    return null;
  }
  function rpRoleDesc(mode, cpChars, userName, identity) {
    const a = cpChars[0], b = cpChars[1];
    if (mode === "left") return "玩家【魂穿成主角「" + (a ? a.name : "左位主角") + "」】——顶着 TA 的身份、外壳、人际关系登场，但言行与选择完全由玩家真实决定，可以偏离 TA 的原设（这正是穿越的乐趣）。" + (b ? "另一位主角「" + b.name + "」是对方，由你（引擎）扮演的 NPC。" : "");
    if (mode === "right") return "玩家【魂穿成主角「" + (b ? b.name : "右位主角") + "」】——顶着 TA 的身份登场，但言行由玩家决定，可偏离原设。" + (a ? "另一位主角「" + a.name + "」是对方，由你扮演的 NPC。" : "");
    if (mode === "passerby") return identity && identity.name
      ? "玩家【天降成「" + identity.name + "」】——" + (identity.role || "一个闯入这个世界的路人 / 配角") + "。原著里本没有 TA，全程就是这个固定身份，【绝不会变成原著里的主角，也绝不是现实里操作游戏的那个人】。"
      : "玩家【天降成一个路人 / 配角】——原著里本没有 TA，作为闯入这个世界的新角色出现（开场给 TA 一个合理身份，之后固定不变）。";
    return identity && identity.name
      ? "玩家【天降身份：「" + identity.name + "」】——" + (identity.role || "一个合理有趣的身份") + "。全程固定，【绝不会变成原著主角，也绝不是现实里操作游戏的那个人】。"
      : "玩家【天降 · 随机身份】——开场为玩家安排一个合理又有趣的固定身份，一旦定下全程不变。";
  }
  const RP_RULES = "【引擎规则（严格遵守）】\n" +
    "1. 用第二人称称呼玩家（『你』）。你负责描写场景、推进剧情、演其他所有角色（各守人设声纹）。\n" +
    "2. 【身份绝对固定】玩家自始至终就是那一个人（见身份锚点），第二人称『你』永远指 TA；【绝对不许中途把玩家换成别的角色、也不许把 CP 两人的位置对调】。玩家魂穿的是哪一位，就一直是哪一位；另一位始终是『对方』、是你扮演的 NPC，绝不和玩家混同。\n" +
    "3. 绝不替玩家决定行动、不替玩家说话、不替玩家做选择。每一回合结尾都落在一个【需要玩家做出反应/抉择的处境】上，用叙事把玩家逼到要开口/行动的当口，然后停下——别用『选项A/B』『决策点：』这种标签，自然地把球交回玩家。\n" +
    "4. 玩家输入行动后，合理承接、展开后果、让相关角色按人设真实反应，推进一段（两三百字）再抛出下一个抉择处境。\n" +
    "5. 尊重玩家的选择哪怕大幅偏离原著——原著是底子不是铁轨，玩家在改写它；但人物性格与世界设定要连贯。\n" +
    "6. 只输出叙事正文，不要任何元信息、标题、格式标签，也别替玩家总结心情。";
  function rpStory(fic) { return (fic.chapters || []).map(function (c, i) { return "〔第" + (i + 1) + "章〕\n" + (c.content || ""); }).join("\n\n"); }
  function rpAnchorLine(mode, cpChars, identity) {
    const me = rpPlayerName(mode, cpChars, identity), other = rpOther(mode, cpChars);
    if (me) return "【身份锚点（全程不变）】玩家 = 「" + me + "」，第二人称『你』永远指 " + me + "。绝不把玩家换成原著里的别的角色，也绝不当成现实里操作游戏的那个人（哪怕上下文里出现过别的名字，也不许拿来套在玩家头上）。" + (other ? "另一位「" + other.name + "」是对方 / NPC，绝不和玩家对调或混同。" : "");
    return "【身份锚点（全程不变）】玩家 = 你在开场为其设定的那个天降身份，第二人称『你』永远指这个身份，中途绝不更换、绝不变成原著主角或现实用户本人。";
  }
  // 天降模式：先确定玩家这次的固定身份（一个具体名字），供全程锚定
  async function genRPIdentity(active, fic, tab, cpChars, mode, landing, userName, worldbook) {
    const sys = ANTI_CLICHE + "\n\n你在为一场穿越互动叙事【确定玩家这次的固定身份】。穿越方式：" + rpRoleDesc(mode, cpChars, userName, null) +
      "\n世界观：" + tab.name + "。降落点：「" + (landing && landing.label || "") + "」——" + (landing && landing.scene || "") +
      "\n【原著正文节选】\n" + rpStory(fic).slice(0, 2500) +
      "\n\n给玩家安排一个具体、贴合这个世界观的固定身份（" + (mode === "passerby" ? "一个原著里没有的路人 / 配角" : "一个合理有趣的身份，可与原著相关也可全新") + "）。这个身份不能是原著已有的两位主角、也不能叫『" + (userName || "用户") + "』。\n" +
      "只输出 JSON：{\"name\":\"这个身份的名字 / 称谓\",\"role\":\"一句话身份说明（职业 / 处境 / 和主角是什么关系或毫无关系）\"}";
    const raw = await callAI(active, sys, [{ role: "user", content: "定身份。" }], { maxTokens: 400 });
    let d = extractJSON(raw);
    if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
    if (d && d.name) return { name: String(d.name).slice(0, 20), role: String(d.role || "").slice(0, 90) };
    return { name: "无名路人", role: "一个刚好路过的陌生人" };
  }
  function buildRPSystem(fic, tab, cpChars, mode, userName, worldbook, style, identity) {
    const parts = [ANTI_CLICHE, CHARCARD_RULE, INTIMATE_ANTI_CLICHE, FANFIC_ANTI_CLICHE];
    parts.push("【穿越 · 互动叙事引擎】玩家『穿越』进了一篇同人文，你是这场互动叙事（类 CYOA 文字游戏）的引擎 / GM。");
    parts.push("【世界观：" + tab.name + "】\n" + (tab.desc || "（无额外设定）"));
    parts.push(cpBlock(cpChars));
    parts.push("【玩家的身份 / 穿越方式】" + rpRoleDesc(mode, cpChars, userName, identity));
    parts.push(rpAnchorLine(mode, cpChars, identity));
    if (style && style.trim()) parts.push("【文风】\n" + style.trim());
    parts.push("【原著正文（你的剧情底子；玩家的选择可改写走向，但人物设定要连贯）】\n" + rpStory(fic).slice(0, 6000));
    parts.push(RP_RULES);
    return parts.join("\n\n");
  }
  // 生成可选降落节点（3-4 个）
  async function genLandings(active, fic, tab, cpChars, mode, userName, worldbook) {
    const sys = ANTI_CLICHE + "\n\n你在为一场『穿进同人文』的互动叙事挑【降落节点】。玩家会这样进入：" + rpRoleDesc(mode, cpChars, userName) +
      "\n世界观：" + tab.name + "。\n【原著正文】\n" + rpStory(fic).slice(0, 5000) +
      "\n\n从原著里挑 3-4 个适合玩家空降切入、有戏剧张力的场景当可选起点（可以是原著已有的关键场景，也可以是其缝隙里合理的时刻）。\n" +
      "只输出合法 JSON 数组：[{\"label\":\"简短场景名（≤10字）\",\"scene\":\"用【完整的一两句话】说明这个节点是什么处境、在故事哪个位置，约 20-40 字，务必把话说完整、别断在半句\"}]";
    const raw = await callAI(active, sys, [{ role: "user", content: "给降落节点。" }], { maxTokens: 1600 });
    let d = extractJSON(raw);
    if (!d && typeof repairJSON === "function") { try { d = JSON.parse(repairJSON(raw)); } catch (e) {} }
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
    // 不硬截断成半句：只在超长时于句读处截，末尾补省略号
    const trimScene = function (s) {
      s = String(s || "").trim();
      if (s.length <= 60) return s;
      const cut = s.slice(0, 60);
      const m = cut.match(/^[\s\S]*[。！？…，、；]/);
      return (m ? m[0] : cut) + "…";
    };
    const out = arr.filter(function (x) { return x && x.label; }).slice(0, 4).map(function (x) { return { id: uid("ld"), label: String(x.label).slice(0, 16), scene: trimScene(x.scene) }; });
    if (!out.length) out.push({ id: uid("ld"), label: "从头开始", scene: "从故事最初的场景切入" });
    return out;
  }
  // 组 RP 对话 messages（transcript 尾巴 + 本次行动）
  function rpMessages(session, newAction) {
    const msgs = [];
    (session.transcript || []).slice(-10).forEach(function (e) {
      if (e.who === "nar") { const last = msgs[msgs.length - 1]; if (last && last.role === "assistant") last.content += "\n\n" + e.text; else msgs.push({ role: "assistant", content: e.text }); }
      else msgs.push({ role: "user", content: "【我的行动】" + e.text });
    });
    if (newAction != null) msgs.push({ role: "user", content: "【我的行动】" + newAction });
    return msgs;
  }
  // 开场：安置玩家进降落节点，收在第一个抉择处境
  async function genRPStart(active, session, fic, tab, cpChars, userName, worldbook, perFic) {
    const id = session.playerIdentity;
    const sys = buildRPSystem(fic, tab, cpChars, session.mode, userName, worldbook, session.style, id) +
      "\n\n【本场起点】玩家从这个节点空降：「" + session.landing.label + "」——" + session.landing.scene +
      "\n\n现在写【开场】：用两三段把玩家安置进这个场景（" + (id ? "玩家这次的固定身份是「" + id.name + "」（" + id.role + "），开场自然点明并让 TA 入场" : "以玩家的身份视角") + "），营造氛围、带出在场关键人物，最后自然收在一个需要玩家做出反应/抉择的处境上，然后停下等玩家开口。";
    const raw = await callAI(active, sys, [{ role: "user", content: "开始这场穿越。" }], { maxTokens: Math.min(4000, (perFic || 3000)) });
    return String(raw || "").trim();
  }
  // 玩家行动 → 推进 + 下一个抉择处境
  async function genRPTurn(active, session, fic, tab, cpChars, userName, worldbook, userAction, perFic) {
    const sys = buildRPSystem(fic, tab, cpChars, session.mode, userName, worldbook, session.style, session.playerIdentity) +
      "\n\n【本场起点】「" + session.landing.label + "」——" + session.landing.scene +
      "\n承接玩家最新的行动，推进剧情、让相关角色真实反应，写两三百字，再自然收在下一个需要玩家抉择的处境上停下。\n" + rpAnchorLine(session.mode, cpChars, session.playerIdentity) + "（切记：别把玩家换人、别对调 CP 位置、别把玩家当成现实用户本人。）";
    const raw = await callAI(active, sys, rpMessages(session, userAction), { maxTokens: Math.min(3000, (perFic || 2400)) });
    return String(raw || "").trim();
  }

  // 编个热度数字（稳定：按 id 派生），feed 展示用
  function ficHeat(seed) {
    let h2 = 0; const s = String(seed || "");
    for (let i = 0; i < s.length; i++) h2 = (h2 * 31 + s.charCodeAt(i)) >>> 0;
    return { kudos: 30 + h2 % 4000, hits: 500 + (h2 >> 3) % 90000 };
  }

  // ---- 暴露 --------------------------------------------------
  window.Fanfic = {
    loadTabs: loadTabs, saveTabs: saveTabs, loadFics: loadFics, saveFics: saveFics,
    loadCPs: loadCPs, saveCPs: saveCPs, loadCfg: loadCfg, saveCfg: saveCfg, activeStyleText: activeStyleText,
    loadMe: loadMe, saveMe: saveMe, meProfile: meProfile, protectedFic: protectedFic,
    chatMaterialFor: chatMaterialFor,
    genBatch: genBatch, genNextChapter: genNextChapter, genReviews: genReviews, genReplyToUser: genReplyToUser,
    loadRP: loadRP, saveRP: saveRP, genLandings: genLandings, genRPIdentity: genRPIdentity, genRPStart: genRPStart, genRPTurn: genRPTurn, rpModeLabel: rpModeLabel
  };

  // ============================================================
  // UI
  // ============================================================
  function fmtNum(n) { return n >= 10000 ? (n / 10000).toFixed(1) + "w" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
  // cp token：charId | "me"（我·面具人设）；空数组=原创向。
  function meChar(profile) { return { id: "me", name: (profile && profile.name) || "我", persona: (profile && profile.persona) || "", isMe: true }; }
  function cpLabel(cp, characters, userName) {
    if (!cp || !cp.length) return "原创向";
    const nameOf = function (tok) { if (tok === "me") return userName || "我"; const c = characters.find(function (x) { return x.id === tok; }); return c ? c.name : "原创"; };
    if (cp.length === 1) return nameOf(cp[0]) + " × 原创";
    return nameOf(cp[0]) + " × " + nameOf(cp[1]);
  }
  function cpChars(cp, characters, profile) {
    return (cp || []).map(function (tok) { return tok === "me" ? meChar(profile) : characters.find(function (c) { return c.id === tok; }); }).filter(Boolean);
  }

  // ---------- feed 卡片 ----------
  function FicCard(props) {
    const t = useTheme();
    const f = props.fic, characters = props.characters;
    const heat = f.stats || ficHeat(f.id);
    const chCount = (f.chapters || []).length;
    return h("button", {
      onClick: props.onOpen,
      className: "w-full text-left active:opacity-80 rounded-2xl px-4 py-3.5 mb-3",
      style: { background: t.bg2, border: "1px solid " + t.line }
    },
      h("div", { className: "flex items-start justify-between gap-2 mb-1.5" },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, lineHeight: 1.25, color: t.ink, fontWeight: 500 } }, f.title),
        f.source === "user"
          ? h("span", { style: { fontFamily: F_BODY, fontSize: 9.5, color: t.bg2, background: t.accent, borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" } }, "我写的")
          : null),
      h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.accent, marginBottom: 2 } }, cpLabel(f.cp, characters, props.userName)),
      h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 6 } }, "文 / " + (f.author || (f.source === "user" ? (props.userName || "我") : "佚名"))),
      h("div", { className: "line-clamp-2", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, lineHeight: 1.55, marginBottom: 8 } },
        (((f.chapters || [])[0] || {}).content || f.body || "").slice(0, 90)),
      h("div", { className: "flex items-center gap-2 flex-wrap" },
        (f.tags || []).slice(0, 3).map(function (tag, i) {
          return h("span", { key: i, style: { fontFamily: F_BODY, fontSize: 10, color: t.fog, border: "1px solid " + t.line, borderRadius: 999, padding: "1px 8px" } }, tag);
        }),
        h("span", { style: { flex: 1 } }),
        chCount > 1 ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, chCount + "章") : null,
        h("span", {
          onClick: function (e) { e.stopPropagation(); props.onLike && props.onLike(); },
          className: "active:opacity-60 flex items-center gap-1",
          style: { fontFamily: F_BODY, fontSize: 10.5, color: f.liked ? t.accent : t.fog }
        }, h(IHeart, { size: 12, color: f.liked ? t.accent : t.fog, filled: f.liked }), fmtNum(heat.kudos + (f.liked ? 1 : 0))),
        (f.reviews || []).length ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog } }, "评 " + (f.reviews || []).length) : null,
        f.onShelf ? h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.accent } }, "★") : null));
  }

  // ---------- 世界观 tab 栏（可横滑 + 末尾 +；自定义版块点已选再点=编辑）----------
  function TabBar(props) {
    const t = useTheme();
    return h("div", { className: "shrink-0 px-5 pb-2", style: { overflowX: "auto", WebkitOverflowScrolling: "touch" } },
      h("div", { style: { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 8, width: "max-content" } },
        props.tabs.map(function (tab) {
          const on = tab.id === props.activeId;
          return h("button", {
            key: tab.id,
            onClick: function () { if (on && !tab.seed) props.onEdit(tab); else props.onPick(tab.id); },
            onDoubleClick: function () { if (!tab.seed) props.onEdit(tab); },
            className: "shrink-0 active:opacity-70",
            style: {
              fontFamily: F_BODY, fontSize: 13.5, whiteSpace: "nowrap", padding: "5px 14px", borderRadius: 999,
              background: on ? t.ink : "transparent", color: on ? t.bg2 : t.sub, border: "1px solid " + (on ? t.ink : t.line)
            }
          }, tab.name, (on && !tab.seed) ? " ✎" : "");
        }),
        h("button", {
          onClick: props.onAdd, className: "shrink-0 active:opacity-60",
          style: { fontFamily: F_BODY, fontSize: 15, padding: "4px 12px", borderRadius: 999, color: t.fog, border: "1px dashed " + t.line }
        }, "+")));
  }

  // ---------- 生成配置弹窗（齿轮）----------
  function GenSheet(props) {
    const t = useTheme();
    const cfg0 = loadCfg();
    const styles = cfg0.styles || [];
    const [n, setN] = useState(3);
    const [sel, setSel] = useState([]); // 选中的 CP preset id 或角色 id（这里存最终 cp 数组）
    const [pickA, setPickA] = useState(""), [pickB, setPickB] = useState("");
    const [styleIds, setStyleIds] = useState(cfg0.activeStyleIds || []); // 本次生效的文风（默认=上次选的）
    const [includeMe, setIncludeMe] = useState(false); // 俩角色 CP 时：带上「我」写成 A×我×B
    function toggleStyle(id) { setStyleIds(function (prev) { return prev.indexOf(id) >= 0 ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]); }); }
    const cps = props.cps, characters = props.characters;
    // 最终 cp：优先用手动选（pickA/pickB，可为角色/我/原创空），否则用点选的 preset
    function chosenCP() {
      const manual = [pickA, pickB].filter(function (x) { return x; });
      if (manual.length) return manual;
      return sel;
    }
    // 两个都是角色（都不是「我」/原创）时才给「带上我」开关
    function twoRealChars() { const cc = chosenCP(); return cc.length === 2 && cc.every(function (x) { return x && x !== "me"; }); }
    return h("div", { className: "fixed inset-0 z-50 flex items-end", style: { background: "rgba(0,0,0,0.35)" }, onClick: props.onClose },
      h("div", { onClick: function (e) { e.stopPropagation(); }, className: "w-full rounded-t-3xl px-6 pt-5 pb-8", style: { background: t.bg, maxHeight: "82vh", overflowY: "auto" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 21, color: t.ink, marginBottom: 4 } }, "生成配置"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 18 } }, "【" + props.tab.name + "】世界观 × 选中 CP × 篇数 → 往本版 feed 出文"),

        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, marginBottom: 8 } }, "生成篇数　" + n + " 篇"),
        h("input", { type: "range", min: 1, max: 8, value: n, onChange: function (e) { setN(Number(e.target.value)); }, className: "w-full mb-6" }),

        // 本次文风（在「我的·生成设置」里建，这里按需勾选，可多选，不选=不限）
        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, marginBottom: 8 } }, "文风（本次生效，可多选，不选＝不限）"),
        styles.length ? h("div", { className: "flex flex-wrap gap-2 mb-6" },
          styles.map(function (s) {
            const on = styleIds.indexOf(s.id) >= 0;
            return h("button", { key: s.id, onClick: function () { toggleStyle(s.id); }, style: { fontFamily: F_BODY, fontSize: 12.5, padding: "5px 12px", borderRadius: 999, background: on ? t.accent : "transparent", color: on ? t.bg2 : t.sub, border: "1px solid " + (on ? t.accent : t.line) } }, s.label);
          })
        ) : h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 18 } }, "还没有文风预设，去「我的 → 生成设置」新建，之后每次在这里勾选。"),

        h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.sub, marginBottom: 8 } }, "选择预设好的 CP，或本次手动设置一对"),
        // 从 CP 预设名单里选
        cps.length ? h("div", { className: "flex flex-wrap gap-2 mb-3" },
          cps.map(function (cp) {
            const on = JSON.stringify(chosenCP()) === JSON.stringify(cp.cp);
            return h("button", {
              key: cp.id, onClick: function () { setPickA(""); setPickB(""); setSel(on ? [] : cp.cp); },
              style: { fontFamily: F_BODY, fontSize: 12.5, padding: "5px 12px", borderRadius: 999, background: on ? t.accent : "transparent", color: on ? t.bg2 : t.sub, border: "1px solid " + (on ? t.accent : t.line) }
            }, cp.label || cpLabel(cp.cp, characters, props.userName));
          })
        ) : h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 10 } }, "还没有 CP 预设，可在「我的」页添加，或下面本次手动设置一对："),

        // 本次手动设置一对（不进预设）：原创 / 我（面具人设）/ 角色
        h("div", { className: "flex items-center gap-2 mb-2" },
          h("select", { value: pickA, onChange: function (e) { setSel([]); setPickA(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } },
            h("option", { value: "" }, "原创角色"),
            h("option", { value: "me" }, "我（" + (props.userName || "我") + "）"),
            characters.map(function (c) { return h("option", { key: c.id, value: c.id }, c.name); })),
          h("span", { style: { fontFamily: F_BODY, color: t.fog } }, "×"),
          h("select", { value: pickB, onChange: function (e) { setSel([]); setPickB(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } },
            h("option", { value: "" }, "原创角色"),
            h("option", { value: "me" }, "我（" + (props.userName || "我") + "）"),
            characters.map(function (c) { return h("option", { key: c.id, value: c.id }, c.name); }))),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 6 } }, "选「我」时按你在设置里的面具人设来写，没填则自由发挥"),

        // 俩角色 CP：带不带上「我」（否则默认只写他俩，即便设定里写了 TA 是我男朋友也不把我带进去）
        twoRealChars() ? h("button", { onClick: function () { setIncludeMe(function (v) { return !v; }); }, className: "w-full active:opacity-80",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: includeMe ? "rgba(0,0,0,0.04)" : t.bg2, border: "1px solid " + (includeMe ? t.ink : t.line), borderRadius: 12, marginTop: 4, marginBottom: 14 } },
          h("div", { style: { textAlign: "left" } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, color: t.ink } }, includeMe ? "带上我（他俩 × 我 的三人）" : "只写他俩的 CP"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, includeMe ? "把「我」作为第三方写进文里" : "只聚焦这两个角色，就算设定写了 TA 是我男朋友也不把我带进去")),
          h("div", { style: { width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: "1px solid " + (includeMe ? t.ink : t.line), background: includeMe ? t.ink : "transparent", color: t.bg2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 } }, includeMe ? "✓" : "")) : null,

        h("div", { className: "flex items-center gap-3" },
          h("button", { onClick: function () { setN(3); setSel([]); setPickA(""); setPickB(""); setIncludeMe(false); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13.5, color: t.sub, padding: "10px 18px", borderRadius: 12, border: "1px solid " + t.line } }, "重置"),
          h("button", { onClick: function () { props.onConfirm(n, chosenCP(), styleIds, twoRealChars() && includeMe); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.bg2, background: t.ink, padding: "11px", borderRadius: 12 } }, "确定生成"))));
  }

  // ---------- 新建/编辑自定义世界观 tab ----------
  function TabSheet(props) {
    const t = useTheme();
    const editing = props.tab;
    const [name, setName] = useState(editing ? editing.name : "");
    const [desc, setDesc] = useState(editing ? editing.desc : "");
    return h("div", { className: "fixed inset-0 z-50 flex items-end", style: { background: "rgba(0,0,0,0.35)" }, onClick: props.onClose },
      h("div", { onClick: function (e) { e.stopPropagation(); }, className: "w-full rounded-t-3xl px-6 pt-5 pb-8", style: { background: t.bg } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 21, color: t.ink, marginBottom: 14 } }, editing ? "编辑世界观" : "新世界观"),
        h("input", { value: name, onChange: function (e) { setName(e.target.value); }, placeholder: "世界观名（如『民国』『星际』）", className: "w-full outline-none mb-3", style: { fontFamily: F_BODY, fontSize: 14, padding: "10px 12px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("textarea", { value: desc, onChange: function (e) { setDesc(e.target.value); }, placeholder: "世界观描述（= 生成时的设定层 / world book，越具体越好：背景、基调、这个世界的规则）", rows: 5, className: "w-full outline-none mb-4 resize-none", style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, padding: "10px 12px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { className: "flex items-center gap-3" },
          editing && !editing.seed ? h("button", { onClick: function () { props.onDelete(editing.id); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 13.5, color: t.accent, padding: "10px 16px", borderRadius: 12, border: "1px solid " + t.line } }, "删除") : null,
          h("button", { onClick: function () { if (name.trim()) props.onSave(editing ? editing.id : null, name.trim(), desc.trim()); }, className: "flex-1 active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.bg2, background: t.ink, padding: "11px", borderRadius: 12 } }, "保存"))));
  }

  // 作者署名 badge
  function authorTag(t) { return h("span", { style: { fontFamily: F_BODY, fontSize: 9, color: t.bg2, background: t.tint, borderRadius: 5, padding: "0px 5px", marginLeft: 5 } }, "作者"); }

  // ---------- 阅读页（含追更 + 书评）----------
  function Reader(props) {
    const t = useTheme();
    const f = props.fic;
    const [busy, setBusy] = useState("");         // 内联小操作（发书评/回复）
    const [busyChap, setBusyChap] = useState(false); // 追更（可与刷书评并行）
    const [busyRev, setBusyRev] = useState(false);   // 刷书评（可与追更并行）
    const [replyTo, setReplyTo] = useState(null); // review id
    const [replyText, setReplyText] = useState("");
    const [newComment, setNewComment] = useState("");
    const [fwdOpen, setFwdOpen] = useState(false);
    const [chapIdx, setChapIdx] = useState(0); // 章节翻页当前页
    const swipeRef = React.useRef(0);
    // 翻到/生成新章后跳到该章开头（别落在中间，省得往回翻）
    const chapRef = React.useRef(null);
    const firstChap = React.useRef(true);
    React.useEffect(function () {
      if (firstChap.current) { firstChap.current = false; return; }
      if (chapRef.current) chapRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    }, [chapIdx]);
    const chars = cpChars(f.cp, props.characters, props.profile);
    function goChap(to) { const chs = f.chapters || []; if (to >= 0 && to < chs.length) setChapIdx(to); }
    const authorName = f.author || (f.source === "user" ? (props.userName || "我") : "佚名");

    function genOpts() { const cfg = window.Fanfic.loadCfg(); return { style: window.Fanfic.activeStyleText(cfg), perFic: cfg.perFic, chatMaterial: window.Fanfic.chatMaterialFor(chars) }; }

    async function addChapter() {
      if (busyChap) return;
      setBusyChap(true);
      const newIdx = (f.chapters || []).length; // 新章的索引
      try {
        const ch = await window.Fanfic.genNextChapter(props.active, f, props.tab, chars, props.userName, props.worldbook, genOpts());
        props.onUpdate(f.id, function (fic) { fic.chapters = (fic.chapters || []).concat([ch]); fic.updatedAt = Date.now(); return fic; });
        setChapIdx(newIdx); // 翻到新章（useEffect 会跳到章首）
        props.toast && props.toast("已更新一章");
        // item 8：新章推给曾被转发看过这篇的角色（不麻烦的轻量版）
        if (props.onChapterShared && (f.sharedTo || []).length) props.onChapterShared(f, ch, newIdx + 1);
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusyChap(false);
    }
    async function loadReviews() {
      if (busyRev) return;
      setBusyRev(true);
      try {
        const rv = await window.Fanfic.genReviews(props.active, f, props.tab, props.worldbook);
        props.onUpdate(f.id, function (fic) { fic.reviews = (fic.reviews || []).concat(rv); return fic; });
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusyRev(false);
    }
    // 我发一条顶层书评 → 生成 NPC（含作者）回复挂它下面
    async function postComment() {
      const txt = newComment.trim(); if (!txt) return;
      const rvId = uid("rv");
      props.onUpdate(f.id, function (fic) { fic.reviews = (fic.reviews || []).concat([{ id: rvId, author: props.userName || "我", me: true, content: txt, replies: [] }]); return fic; });
      setNewComment("");
      if (!props.active) return;
      setBusy("myrev");
      try {
        const reps = await window.Fanfic.genReplyToUser(props.active, f, props.tab, txt, "");
        if (reps.length) props.onUpdate(f.id, function (fic) { (fic.reviews || []).forEach(function (r) { if (r.id === rvId) r.replies = (r.replies || []).concat(reps); }); return fic; });
        else props.toast && props.toast("读者们暂时没接话，点这条书评可再催一次");
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusy("");
    }
    // 我回复某条书评 → 也生成 NPC（含作者）回复
    async function sendReply(rvId) {
      const txt = replyText.trim(); if (!txt) return;
      const rv = (f.reviews || []).find(function (r) { return r.id === rvId; }) || {};
      const ctx = "「" + rv.author + "」：" + rv.content + (rv.replies || []).map(function (x) { return "\n「" + x.author + "」：" + x.content; }).join("");
      props.onUpdate(f.id, function (fic) {
        (fic.reviews || []).forEach(function (r) { if (r.id === rvId) r.replies = (r.replies || []).concat([{ id: uid("rp"), author: props.userName || "我", content: txt, me: true }]); });
        return fic;
      });
      setReplyText(""); setReplyTo(null);
      if (!props.active) return;
      setBusy("myrep");
      try {
        const reps = await window.Fanfic.genReplyToUser(props.active, f, props.tab, txt, ctx);
        if (reps.length) props.onUpdate(f.id, function (fic) { (fic.reviews || []).forEach(function (r) { if (r.id === rvId) r.replies = (r.replies || []).concat(reps); }); return fic; });
        else props.toast && props.toast("没人接话，稍后再试一次");
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusy("");
    }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, {
        zh: "阅读", en: props.tab.name, onBack: props.onBack,
        right: h("button", { onClick: function () { props.onToggleShelf(f.id); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: f.onShelf ? t.accent : t.fog } }, f.onShelf ? "★ 已收藏" : "☆ 收藏")
      }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 25, lineHeight: 1.25, color: t.ink, fontWeight: 500, marginBottom: 6 } }, f.title),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, cpLabel(f.cp, props.characters, props.userName)),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 8 } }, "文 / " + authorName),
        h("div", { className: "flex flex-wrap gap-1.5 mb-4" }, (f.tags || []).map(function (tag, i) {
          return h("span", { key: i, style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, border: "1px solid " + t.line, borderRadius: 999, padding: "1px 8px" } }, tag);
        })),
        // 点赞 / 转发
        h("div", { className: "flex items-center gap-4 mb-5" },
          h("button", { onClick: function () { props.onLike(f.id); }, className: "active:opacity-60 flex items-center gap-1.5", style: { fontFamily: F_BODY, fontSize: 12.5, color: f.liked ? t.accent : t.sub } },
            h(IHeart, { size: 16, color: f.liked ? t.accent : t.sub, filled: f.liked }), f.liked ? "已赞" : "点赞"),
          h("button", { onClick: function () { setFwdOpen(true); }, className: "active:opacity-60 flex items-center gap-1.5", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } },
            h(IRepeat, { size: 16, color: t.sub }), "转发")),
        // 章节（翻页，不再一路下滑；顶部+底部箭头 + 左右滑动）
        (function () {
          const chs = f.chapters || [];
          const idx = Math.min(Math.max(0, chapIdx), Math.max(0, chs.length - 1));
          const ch = chs[idx] || {};
          const btn = function (label, to, disabled) { return h("button", { onClick: function () { goChap(to); }, disabled: disabled, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: disabled ? t.line : t.sub, padding: "2px 4px" } }, label); };
          const pager = function (top) { return chs.length > 1 ? h("div", { className: "flex items-center justify-between " + (top ? "mb-4 pb-2" : "mt-5 pt-3"), style: (top ? { borderBottom: "1px solid " + t.line } : { borderTop: "1px solid " + t.line }) },
            btn("‹ 上一章", idx - 1, idx <= 0),
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 13, color: t.fog } }, "第 " + (idx + 1) + " / " + chs.length + " 章"),
            btn("下一章 ›", idx + 1, idx >= chs.length - 1)) : null; };
          return h("div", {
            ref: chapRef,
            className: "mb-6",
            style: { scrollMarginTop: 8 },
            onTouchStart: function (e) { swipeRef.current = e.touches[0].clientX; },
            onTouchEnd: function (e) { const dx = e.changedTouches[0].clientX - swipeRef.current; if (Math.abs(dx) < 50) return; if (dx < 0) goChap(idx + 1); else goChap(idx - 1); }
          },
            pager(true),
            h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontSize: 15, lineHeight: 1.9, color: t.ink, whiteSpace: "pre-wrap" } }, ch.content || ""),
            pager(false));
        })(),

        // 追更按钮
        h("button", { onClick: addChapter, disabled: busyChap, className: "w-full active:opacity-70 mb-8", style: { fontFamily: F_BODY, fontSize: 13.5, color: t.sub, padding: "11px", borderRadius: 12, border: "1px dashed " + t.line, opacity: busyChap ? 0.5 : 1 } },
          busyChap ? "续写中…" : "＋ 追更下一章"),

        // 书评区
        h("div", { className: "flex items-center justify-between mb-3" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, "书评 · " + (f.reviews || []).length),
          h("button", { onClick: loadReviews, disabled: busyRev, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, busyRev ? "召唤读者中…" : "刷出书评")),
        // 我直接写书评
        h("div", { className: "flex items-center gap-2 mb-4" },
          h("input", { value: newComment, onChange: function (e) { setNewComment(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") postComment(); }, placeholder: "写条书评…", className: "flex-1 outline-none", style: { fontFamily: F_BODY, fontSize: 12.5, padding: "8px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
          h("button", { onClick: postComment, disabled: busy === "myrev", className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent, padding: "0 4px" } }, busy === "myrev" ? "…" : "发表")),
        (f.reviews || []).length ? (f.reviews || []).map(function (r) {
          return h("div", { key: r.id, className: "mb-3 pb-3", style: { borderBottom: "1px solid " + t.line } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: r.me ? t.accent : (r.isAuthor ? t.tint : t.fog), marginBottom: 3 } }, r.author, r.isAuthor ? authorTag(t) : null),
            h("div", { style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, color: t.ink } }, r.content),
            (r.replies || []).map(function (rp) {
              return h("div", { key: rp.id, className: "mt-2 ml-3 pl-3", style: { borderLeft: "2px solid " + t.line } },
                h("span", { style: { fontFamily: F_BODY, fontSize: 11.5, color: rp.me ? t.accent : (rp.isAuthor ? t.tint : t.fog) } }, rp.author + "：", rp.isAuthor ? authorTag(t) : null),
                h("span", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub } }, rp.content));
            }),
            replyTo === r.id
              ? h("div", { className: "flex items-center gap-2 mt-2" },
                  h("input", { value: replyText, autoFocus: true, onChange: function (e) { setReplyText(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") sendReply(r.id); }, placeholder: "回复…", className: "flex-1 outline-none", style: { fontFamily: F_BODY, fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
                  h("button", { onClick: function () { sendReply(r.id); }, style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, "发送"))
              : h("button", { onClick: function () { setReplyTo(r.id); setReplyText(""); }, className: "mt-1.5 active:opacity-60", style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, "回复"));
        }) : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "8px 0" } }, "还没有书评，写一条或点「刷出书评」召唤一批读者。")),
      fwdOpen ? h(FwdSheet, { characters: props.characters, groups: props.groups, onClose: function () { setFwdOpen(false); },
        onPickChar: function (c) { setFwdOpen(false); props.onForwardToChat && props.onForwardToChat(f, c); },
        onPickGroup: function (g) { setFwdOpen(false); props.onForwardToGroup && props.onForwardToGroup(f, g); } }) : null);
  }

  // ---------- 转发选人 sheet ----------
  function FwdSheet(props) {
    const t = useTheme();
    return h("div", { className: "fixed inset-0 z-50 flex items-end", style: { background: "rgba(0,0,0,0.35)" }, onClick: props.onClose },
      h("div", { onClick: function (e) { e.stopPropagation(); }, className: "w-full rounded-t-3xl px-6 pt-5 pb-8", style: { background: t.bg, maxHeight: "70vh", overflowY: "auto" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginBottom: 14 } }, "转发给…"),
        (props.characters || []).map(function (c) {
          return h("button", { key: c.id, onClick: function () { props.onPickChar(c); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
            h(Avatar, { character: c, size: 34 }),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, c.remark || c.name));
        }),
        (props.groups || []).length ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, margin: "10px 0 4px" } }, "群聊") : null,
        (props.groups || []).map(function (g) {
          return h("button", { key: g.id, onClick: function () { props.onPickGroup(g); }, className: "w-full flex items-center gap-3 py-2.5 active:opacity-60" },
            h("div", { style: { width: 34, height: 34, borderRadius: 10, background: t.line, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_BODY, fontSize: 11, color: t.sub } }, "群"),
            h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, g.name));
        })));
  }

  // ---------- 发布（我手写发文）----------
  function Publish(props) {
    const t = useTheme();
    const [title, setTitle] = useState("");
    const [tags, setTags] = useState("");
    const [body, setBody] = useState("");
    const [cp, setCp] = useState([]);
    const [pickA, setPickA] = useState(""), [pickB, setPickB] = useState("");
    const [tabId, setTabId] = useState(props.tabs[0] && props.tabs[0].id);
    const characters = props.characters;
    function finalCP() { return [pickA, pickB].filter(function (x) { return x; }); }
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "发布同人文", en: "Publish", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 8 } }, "发到世界观"),
        h("select", { value: tabId, onChange: function (e) { setTabId(e.target.value); }, className: "w-full mb-4", style: { fontFamily: F_BODY, fontSize: 13.5, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } },
          props.tabs.map(function (tb) { return h("option", { key: tb.id, value: tb.id }, tb.name); })),
        h("input", { value: title, onChange: function (e) { setTitle(e.target.value); }, placeholder: "标题", className: "w-full outline-none mb-3", style: { fontFamily: F_DISPLAY, fontSize: 17, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { className: "flex items-center gap-2 mb-3" },
          h("select", { value: pickA, onChange: function (e) { setPickA(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } },
            h("option", { value: "" }, "原创角色"), h("option", { value: "me" }, "我（" + (props.userName || "我") + "）"), characters.map(function (c) { return h("option", { key: c.id, value: c.id }, c.name); })),
          h("span", { style: { color: t.fog } }, "×"),
          h("select", { value: pickB, onChange: function (e) { setPickB(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } },
            h("option", { value: "" }, "原创角色"), h("option", { value: "me" }, "我（" + (props.userName || "我") + "）"), characters.map(function (c) { return h("option", { key: c.id, value: c.id }, c.name); }))),
        h("input", { value: tags, onChange: function (e) { setTags(e.target.value); }, placeholder: "标签，用空格或逗号分隔（如 HE 破镜重圆）", className: "w-full outline-none mb-3", style: { fontFamily: F_BODY, fontSize: 13, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("textarea", { value: body, onChange: function (e) { setBody(e.target.value); }, placeholder: "正文…", rows: 12, className: "w-full outline-none mb-4 resize-none", style: { fontFamily: "'Noto Serif SC',serif", fontSize: 14.5, lineHeight: 1.8, padding: "11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("button", { onClick: function () {
          if (!title.trim() || !body.trim()) { props.toast && props.toast("标题和正文都要填"); return; }
          props.onPublish(tabId, title.trim(), finalCP(), tags.split(/[\s,，、]+/).filter(Boolean), body.trim());
        }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.bg2, background: t.ink, padding: "12px", borderRadius: 12 } }, "发布")));
  }

  // ---------- 我的页 hub（作者主页 + 我发布的 + CP管理 + 设置 + 穿越）----------
  function Mine(props) {
    const t = useTheme();
    const [sub, setSub] = useState(null); // null | "published" | "cp" | "settings"
    const [meEdit, setMeEdit] = useState(false);
    const me = props.me;
    const mine = (props.fics || []).filter(function (f) { return f.source === "user"; });
    // 热度 = 手动值优先；否则按我发布篇目的赞+评+章 汇总
    const derivedHeat = mine.reduce(function (s, f) { return s + ((f.stats && f.stats.kudos) || 0) + (f.liked ? 1 : 0) + (f.reviews || []).length * 5 + (f.chapters || []).length; }, 0);
    const heat = me.heat > 0 ? me.heat : derivedHeat;

    if (sub === "published") return h(MinePublished, { fics: mine, characters: props.characters, userName: props.userName, onBack: function () { setSub(null); }, onOpen: props.onOpenFic });
    if (sub === "cp") return h(MineCP, { cps: props.cps, characters: props.characters, userName: props.userName, toast: props.toast, onBack: function () { setSub(null); }, onAddCP: props.onAddCP, onDelCP: props.onDelCP });
    if (sub === "settings") return h(MineSettings, { onBack: function () { setSub(null); } });

    const row = function (label, desc, onClick) {
      return h("button", { onClick: onClick, className: "w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-2.5 active:opacity-70", style: { background: t.bg2, border: "1px solid " + t.line } },
        h("div", { className: "text-left" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 14, color: t.ink } }, label),
          desc ? h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 1 } }, desc) : null),
        h(IChevR, { size: 16, color: t.fog }));
    };
    const stat = function (num, lab) {
      return h("div", { className: "text-center" },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink } }, fmtNum(num)),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginTop: 1 } }, lab));
    };
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "我的", en: "Mine", onBack: props.onBack, right: h("button", { onClick: function () { setMeEdit(true); }, className: "active:opacity-60" }, h(IPencil, { size: 17, color: t.ink })) }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        // 作者主页卡：背景图 + 头像 + 昵称 + id + 简介 + 三个统计
        h("div", { className: "rounded-2xl overflow-hidden mb-5", style: { border: "1px solid " + t.line } },
          h("div", { style: { height: 92, background: me.bg ? "center/cover no-repeat url(\"" + me.bg + "\")" : "linear-gradient(120deg," + t.tint + "," + t.ink + ")" } }),
          h("div", { className: "px-4 pb-4", style: { background: t.bg2, marginTop: -28 } },
            h(Avatar, { character: { name: me.name, avatarImage: me.avatar, color: t.tint }, size: 56, radius: 16 }),
            h("div", { style: { fontFamily: F_DISPLAY, fontSize: 19, color: t.ink, marginTop: 8 } }, me.name),
            me.handle ? h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, "@" + me.handle) : null,
            me.bio ? h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginTop: 6, lineHeight: 1.5 } }, me.bio) : null,
            h("div", { className: "flex items-center gap-6 mt-3 pt-3", style: { borderTop: "1px solid " + t.line } },
              stat(heat, "热度"), stat(me.fans || 0, "粉丝"), stat(me.following || 0, "关注")))),

        row("穿越同人文", "选一篇以该 CP × 世界观开线上 RP", props.onEnterRP),
        row("我发布的", mine.length + " 篇 · 随时回看/追更", function () { setSub("published"); }),
        row("磕 CP 管理", (props.cps || []).length + " 对预设 · 增删改", function () { setSub("cp"); }),
        row("生成设置", "预设文风 · 篇幅", function () { setSub("settings"); })),
      meEdit ? h(MeEditSheet, { me: me, onClose: function () { setMeEdit(false); }, onSave: function (m) { props.onSaveMe(m); setMeEdit(false); } }) : null);
  }

  // 我发布的（列表 → 点开进 Reader）
  function MinePublished(props) {
    const t = useTheme();
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "我发布的", en: "Published", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-8" },
        props.fics.length ? props.fics.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (f) {
          return h(FicCard, { key: f.id, fic: f, characters: props.characters, userName: props.userName, onOpen: function () { props.onOpen(f.id); }, onLike: function () {} });
        }) : h(Empty, { text: "还没发布过", sub: "用底部 ＋ 写一篇，会出现在这里随时回看" })));
  }

  // CP 预设管理（独立页）
  function MineCP(props) {
    const t = useTheme();
    const [adding, setAdding] = useState(false);
    const [editId, setEditId] = useState(null);
    const [label, setLabel] = useState("");
    const [pickA, setPickA] = useState(""), [pickB, setPickB] = useState("");
    const characters = props.characters, cps = props.cps;
    function reset() { setAdding(false); setEditId(null); setLabel(""); setPickA(""); setPickB(""); }
    function open(cp) { setEditId(cp ? cp.id : null); setLabel(cp ? cp.label : ""); setPickA(cp ? (cp.cp[0] || "") : ""); setPickB(cp ? (cp.cp[1] || "") : ""); setAdding(true); }
    function save() {
      const cp = [pickA, pickB].filter(function (x) { return x; });
      if (!cp.length) { props.toast && props.toast("至少选一个（我 / 角色）"); return; }
      const obj = { id: editId || uid("cp"), label: label.trim() || cpLabel(cp, characters, props.userName), cp: cp };
      if (editId) { props.onDelCP(editId); }
      props.onAddCP(obj); reset();
    }
    const opt = function (v, lab) { return h("option", { value: v }, lab); };
    const picks = [opt("", "原创角色"), opt("me", "我（" + (props.userName || "我") + "）")].concat(characters.map(function (c) { return h("option", { key: c.id, value: c.id }, c.name); }));
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "磕 CP 管理", en: "Ships", onBack: props.onBack, right: h("button", { onClick: function () { adding ? reset() : open(null); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, adding ? "取消" : "＋ 加 CP") }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        adding ? h("div", { className: "rounded-2xl px-4 py-3 mb-4", style: { background: t.bg2, border: "1px solid " + t.line } },
          h("input", { value: label, onChange: function (e) { setLabel(e.target.value); }, placeholder: "备注名（可空，默认用名字）", className: "w-full outline-none mb-2", style: { fontFamily: F_BODY, fontSize: 13, padding: "7px 10px", borderRadius: 8, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
          h("div", { className: "flex items-center gap-2 mb-3" },
            h("select", { value: pickA, onChange: function (e) { setPickA(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: t.bg, color: t.ink, border: "1px solid " + t.line } }, picks),
            h("span", { style: { color: t.fog } }, "×"),
            h("select", { value: pickB, onChange: function (e) { setPickB(e.target.value); }, style: { flex: 1, fontFamily: F_BODY, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: t.bg, color: t.ink, border: "1px solid " + t.line } }, picks)),
          h("button", { onClick: save, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 13, color: t.bg2, background: t.ink, padding: "9px", borderRadius: 10 } }, editId ? "保存修改" : "保存 CP")) : null,
        cps.length ? cps.map(function (cp) {
          return h("div", { key: cp.id, className: "flex items-center justify-between rounded-xl px-4 py-3 mb-2", style: { background: t.bg2, border: "1px solid " + t.line } },
            h("button", { onClick: function () { open(cp); }, className: "text-left flex-1 active:opacity-60" },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, cp.label),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog } }, cpLabel(cp.cp, characters, props.userName))),
            h("button", { onClick: function () { setEditId(cp.id); open(cp); }, className: "active:opacity-60 mr-3", style: { fontFamily: F_BODY, fontSize: 12, color: t.sub } }, "编辑"),
            h("button", { onClick: function () { props.onDelCP(cp.id); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, "删除"));
        }) : h(Empty, { text: "还没有 CP 预设", sub: "加几对，生成时一键选" })));
  }

  // 生成设置（独立页）：多文风预设可多选切换 + 篇幅
  function MineSettings(props) {
    const t = useTheme();
    const [cfg, setCfg] = useState(window.Fanfic.loadCfg());
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState(""), [text, setText] = useState("");
    function patch(p) { const n = Object.assign({}, cfg, p); setCfg(n); window.Fanfic.saveCfg(n); }
    function addStyle() {
      if (!text.trim()) { props.toast && props.toast("文风内容不能为空"); return; }
      const s = { id: uid("st"), label: label.trim() || "文风" + ((cfg.styles || []).length + 1), text: text.trim() };
      patch({ styles: (cfg.styles || []).concat([s]), activeStyleIds: (cfg.activeStyleIds || []).concat([s.id]) });
      setAdding(false); setLabel(""); setText("");
    }
    function toggle(id) {
      const on = (cfg.activeStyleIds || []).indexOf(id) >= 0;
      patch({ activeStyleIds: on ? cfg.activeStyleIds.filter(function (x) { return x !== id; }) : (cfg.activeStyleIds || []).concat([id]) });
    }
    function del(id) { patch({ styles: (cfg.styles || []).filter(function (s) { return s.id !== id; }), activeStyleIds: (cfg.activeStyleIds || []).filter(function (x) { return x !== id; }) }); }
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "生成设置", en: "Settings", onBack: props.onBack }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        h("div", { className: "flex items-center justify-between mb-2" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, "预设文风"),
          h("button", { onClick: function () { setAdding(!adding); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, adding ? "取消" : "＋ 新建")),
        h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginBottom: 10 } }, "在这里建好文风预设；每次生成时在齿轮弹窗里按需勾选（可多选），随时换。"),
        adding ? h("div", { className: "rounded-2xl px-4 py-3 mb-4", style: { background: t.bg2, border: "1px solid " + t.line } },
          h("input", { value: label, onChange: function (e) { setLabel(e.target.value); }, placeholder: "文风名（如 冷冽白描 / 治愈慢热 / 港风）", className: "w-full outline-none mb-2", style: { fontFamily: F_BODY, fontSize: 13, padding: "7px 10px", borderRadius: 8, background: t.bg, color: t.ink, border: "1px solid " + t.line } }),
          h("textarea", { value: text, onChange: function (e) { setText(e.target.value); }, rows: 7, placeholder: "文风描述，越具体越好，想写多长写多长（无字数限制）：多用短句白描、冷色调意象、情绪藏在动作里、少直白抒情、禁用某些词……", className: "w-full outline-none resize-y mb-3", style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.6, padding: "9px 11px", borderRadius: 8, background: t.bg, color: t.ink, border: "1px solid " + t.line, minHeight: 120 } }),
          h("button", { onClick: addStyle, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 13, color: t.bg2, background: t.ink, padding: "9px", borderRadius: 10 } }, "保存文风")) : null,
        (cfg.styles || []).length ? (cfg.styles || []).map(function (s) {
          return h("div", { key: s.id, className: "rounded-xl px-4 py-3 mb-2", style: { background: t.bg2, border: "1px solid " + t.line } },
            h("div", { className: "flex items-center justify-between" },
              h("div", { style: { fontFamily: F_BODY, fontSize: 13.5, color: t.ink } }, s.label),
              h("button", { onClick: function () { del(s.id); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, "删除")),
            h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 4, lineHeight: 1.5 } }, s.text));
        }) : (adding ? null : h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, marginBottom: 8 } }, "还没有文风预设。")),

        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink, margin: "18px 0 8px" } }, "篇幅"),
        h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.sub, marginBottom: 6 } }, "每篇 / 每章约 " + cfg.perFic + " token（越高越长、越有剧情）"),
        h("input", { type: "range", min: 2000, max: 8000, step: 500, value: cfg.perFic, onChange: function (e) { patch({ perFic: Number(e.target.value) }); }, className: "w-full" })));
  }

  // 作者主页资料编辑
  function MeEditSheet(props) {
    const t = useTheme();
    const [m, setM] = useState(Object.assign({}, props.me));
    function set(k, v) { const o = {}; o[k] = v; setM(Object.assign({}, m, o)); }
    function pickImg(key) {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = function () { const f = inp.files[0]; if (!f) return; resizeImageFile(f, key === "bg" ? 1080 : 480, 0.82).then(function (d) { set(key, d); }); };
      inp.click();
    }
    return h("div", { className: "fixed inset-0 z-50 flex items-end", style: { background: "rgba(0,0,0,0.35)" }, onClick: props.onClose },
      h("div", { onClick: function (e) { e.stopPropagation(); }, className: "w-full rounded-t-3xl px-6 pt-5 pb-8", style: { background: t.bg, maxHeight: "86vh", overflowY: "auto" } },
        h("div", { style: { fontFamily: F_DISPLAY, fontSize: 20, color: t.ink, marginBottom: 14 } }, "编辑作者主页"),
        h("div", { className: "flex items-center gap-4 mb-4" },
          h("button", { onClick: function () { pickImg("avatar"); }, className: "active:opacity-70" }, h(Avatar, { character: { name: m.name, avatarImage: m.avatar, color: t.tint }, size: 56, radius: 16 })),
          h("button", { onClick: function () { pickImg("bg"); }, className: "flex-1 active:opacity-70", style: { height: 56, borderRadius: 12, background: m.bg ? "center/cover no-repeat url(\"" + m.bg + "\")" : t.bg2, border: "1px dashed " + t.line, fontFamily: F_BODY, fontSize: 11.5, color: t.fog } }, m.bg ? "换背景图" : "＋ 背景图")),
        h("input", { value: m.name, onChange: function (e) { set("name", e.target.value); }, placeholder: "昵称", className: "w-full outline-none mb-2", style: { fontFamily: F_BODY, fontSize: 14, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("input", { value: m.handle, onChange: function (e) { set("handle", e.target.value.replace(/^@/, "")); }, placeholder: "id（@handle，不带 @）", className: "w-full outline-none mb-2", style: { fontFamily: F_BODY, fontSize: 13, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("textarea", { value: m.bio, onChange: function (e) { set("bio", e.target.value); }, rows: 2, placeholder: "个人简介 / 太太的一句话", className: "w-full outline-none resize-none mb-2", style: { fontFamily: F_BODY, fontSize: 13, lineHeight: 1.5, padding: "9px 11px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 } },
          [["heat", "热度"], ["fans", "粉丝"], ["following", "关注"]].map(function (fld) {
            return h("div", { key: fld[0] },
              h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 3 } }, fld[1]),
              h("input", { type: "number", value: m[fld[0]] || 0, onChange: function (e) { set(fld[0], Number(e.target.value) || 0); }, className: "outline-none", style: { width: "100%", minWidth: 0, boxSizing: "border-box", fontFamily: F_BODY, fontSize: 13, padding: "8px 9px", borderRadius: 10, background: t.bg2, color: t.ink, border: "1px solid " + t.line } }));
          })),
        h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, color: t.fog, marginBottom: 14, marginTop: -6 } }, "热度留 0 则按你发布的篇目自动统计"),
        h("button", { onClick: function () { props.onSave(m); }, className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.bg2, background: t.ink, padding: "12px", borderRadius: 12 } }, "保存")));
  }

  // ---------- 穿越（互动叙事 RP）----------
  function RPApp(props) {
    const t = useTheme();
    const [view, setView] = useState("list"); // list | pick | setup | thread
    const [sessions, setSessions] = useState(function () { return window.Fanfic.loadRP(); });
    const [openId, setOpenId] = useState(null);
    const [newFic, setNewFic] = useState(null);
    const [mode, setMode] = useState("left");
    const [landings, setLandings] = useState(null);
    const [busy, setBusy] = useState("");
    const shelf = (props.fics || []).filter(function (f) { return window.Fanfic.protectedFic(f); });
    function persist(list) { setSessions(list); window.Fanfic.saveRP(list); }
    function tabOf(fic) { return (props.tabs || []).find(function (x) { return x.id === (fic && fic.tabId); }) || { name: "", desc: "" }; }
    function charsOf(fic) { return cpChars((fic && fic.cp) || [], props.characters, props.profile); }

    // 会话
    if (view === "thread") {
      const sess = sessions.find(function (s) { return s.id === openId; });
      if (!sess) { setView("list"); return null; }
      return h(RPThread, {
        session: sess, fic: (props.fics || []).find(function (f) { return f.id === sess.ficId; }),
        tab: (props.tabs || []).find(function (x) { return x.id === sess.tabId; }) || { name: "", desc: "" },
        active: props.active, characters: props.characters, profile: props.profile, userName: props.userName, worldbook: props.worldbook, toast: props.toast,
        onBack: function () { setSessions(window.Fanfic.loadRP()); setOpenId(null); setView("list"); },
        onUpdate: function (fn) { const list = window.Fanfic.loadRP().map(function (s) { return s.id === sess.id ? fn(Object.assign({}, s)) : s; }); persist(list); }
      });
    }

    // 选文
    if (view === "pick") {
      return h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: "选一篇穿越", en: "Choose", onBack: function () { setView("list"); } }),
        h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
          h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginBottom: 12 } }, "只能穿越【已收藏进书架】的篇目（去 feed 里点 ☆ 收藏）"),
          shelf.length ? shelf.map(function (f) {
            return h("button", { key: f.id, onClick: function () { setNewFic(f); setMode("left"); setLandings(null); setView("setup"); }, className: "w-full text-left active:opacity-80 rounded-xl px-4 py-3 mb-2", style: { background: t.bg2, border: "1px solid " + t.line } },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 15, color: t.ink } }, f.title),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.accent } }, cpLabel(f.cp, props.characters, props.userName)));
          }) : h(Empty, { text: "书架空空", sub: "先去收藏几篇再来穿越" })));
    }

    // 设定穿越方式 + 生成降落节点
    if (view === "setup") {
      const cpc = charsOf(newFic);
      const modeAvail = function (k) { if (k === "left") return true; if (k === "right") return true; return true; };
      async function makeLandings() {
        if (!props.active) { props.toast && props.toast("请先到设置配置 API"); return; }
        setBusy("land");
        try { const lds = await window.Fanfic.genLandings(props.active, newFic, tabOf(newFic), cpc, mode, props.userName, props.worldbook); setLandings(lds); }
        catch (e) { props.toast && props.toast(String(e.message || e)); }
        setBusy("");
      }
      function startSession(landing) {
        const cfg = window.Fanfic.loadCfg();
        const sess = { id: uid("rp"), ficId: newFic.id, ficTitle: newFic.title, tabId: newFic.tabId, cp: newFic.cp, mode: mode, landing: landing, style: window.Fanfic.activeStyleText(cfg), transcript: [], createdAt: Date.now(), updatedAt: Date.now() };
        persist([sess].concat(window.Fanfic.loadRP()));
        setOpenId(sess.id); setNewFic(null); setLandings(null); setView("thread");
      }
      return h("div", { className: "h-full flex flex-col" },
        h(Head, { zh: "穿越设定", en: "Step In", onBack: function () { setView("pick"); } }),
        h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 18, color: t.ink, marginBottom: 2 } }, newFic.title),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12, color: t.accent, marginBottom: 16 } }, cpLabel(newFic.cp, props.characters, props.userName)),
          h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 8 } }, "穿越方式"),
          h("div", { className: "grid grid-cols-2 gap-2 mb-6" }, RP_MODES.filter(function (m) { return modeAvail(m.key); }).map(function (m) {
            const on = mode === m.key;
            return h("button", { key: m.key, onClick: function () { setMode(m.key); setLandings(null); }, className: "text-left active:opacity-70", style: { padding: "10px 12px", borderRadius: 12, background: on ? t.ink : t.bg2, color: on ? t.bg2 : t.ink, border: "1px solid " + (on ? t.ink : t.line), fontFamily: F_BODY, fontSize: 13 } }, m.label);
          })),
          !landings ? h("button", { onClick: makeLandings, disabled: busy === "land", className: "w-full active:opacity-80", style: { fontFamily: F_BODY, fontSize: 14, color: t.bg2, background: t.accent, padding: "12px", borderRadius: 12, opacity: busy === "land" ? 0.6 : 1 } }, busy === "land" ? "推演降落点中…" : "生成降落节点")
            : h("div", null,
              h("div", { style: { fontFamily: F_BODY, fontSize: 12.5, color: t.sub, marginBottom: 8 } }, "选一个降落节点（从这一段开始）"),
              landings.map(function (ld) {
                return h("button", { key: ld.id, onClick: function () { startSession(ld); }, className: "w-full text-left active:opacity-80 rounded-xl px-4 py-3 mb-2", style: { background: t.bg2, border: "1px solid " + t.line } },
                  h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, ld.label),
                  h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, marginTop: 2, lineHeight: 1.5 } }, ld.scene));
              }),
              h("button", { onClick: function () { setLandings(null); }, className: "w-full active:opacity-60 mt-1", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog, padding: "8px" } }, "重新生成降落点"))));
    }

    // 存档列表
    const sorted = sessions.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "穿越", en: "Step Into Fic", onBack: props.onBack, right: h("button", { onClick: function () { setView("pick"); }, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.accent } }, "＋ 新穿越") }),
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-6 pb-10" },
        h("div", { style: { fontFamily: F_BODY, fontSize: 11.5, color: t.fog, lineHeight: 1.6, marginBottom: 14 } }, "选一篇收藏的同人文穿进去：AI 抛出处境，你输入自己的行动，剧情随你改写。每篇可开无限个存档，随时保存。"),
        sorted.length ? sorted.map(function (s) {
          return h("div", { key: s.id, className: "flex items-center rounded-xl px-4 py-3 mb-2", style: { background: t.bg2, border: "1px solid " + t.line } },
            h("button", { onClick: function () { setOpenId(s.id); setView("thread"); }, className: "text-left flex-1 active:opacity-70" },
              h("div", { style: { fontFamily: F_DISPLAY, fontSize: 14.5, color: t.ink } }, s.ficTitle),
              h("div", { style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, marginTop: 1 } }, window.Fanfic.rpModeLabel(s.mode) + " · " + (s.landing && s.landing.label || "") + " · " + ((s.transcript || []).filter(function (e) { return e.who === "me"; }).length) + " 步")),
            h("button", { onClick: function () { const list = window.Fanfic.loadRP().filter(function (x) { return x.id !== s.id; }); persist(list); }, className: "active:opacity-60 ml-2", style: { fontFamily: F_BODY, fontSize: 12, color: t.accent } }, "删除"));
        }) : h(Empty, { text: "还没有穿越存档", sub: "点右上「＋ 新穿越」开始" })));
  }

  // 穿越会话（互动叙事）
  function RPThread(props) {
    const t = useTheme();
    const s = props.session;
    const trans = s.transcript || [];
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [writing, setWriting] = useState(false); // 展开"写行动"输入
    const [reveal, setReveal] = useState(99);       // 最后一段叙事已显示的段落数（初次进来全显）
    const prevLen = React.useRef(trans.length);
    const taRef = React.useRef(null);
    function autoGrow() { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(130, el.scrollHeight) + "px"; } }
    const cpc = cpChars((props.fic && props.fic.cp) || [], props.characters, props.profile);
    const perFic = (window.Fanfic.loadCfg().perFic) || 3000;
    // 新叙事到来 → 只先露第一段，其余点击逐段展开
    React.useEffect(function () {
      if (trans.length > prevLen.current && trans[trans.length - 1] && trans[trans.length - 1].who === "nar") setReveal(1);
      prevLen.current = trans.length;
    }, [trans.length]);

    async function start() {
      if (!props.active || !props.fic) return;
      setBusy(true);
      try {
        let sess = s;
        // 天降模式：先确定玩家这次的固定身份（一个具体名字），全程锚定，避免被当成用户本人/主角
        if ((s.mode === "passerby" || s.mode === "random") && !s.playerIdentity) {
          const id = await window.Fanfic.genRPIdentity(props.active, props.fic, props.tab, cpc, s.mode, s.landing, props.userName, props.worldbook);
          props.onUpdate(function (ss) { ss.playerIdentity = id; return ss; });
          sess = Object.assign({}, s, { playerIdentity: id });
        }
        const text = await window.Fanfic.genRPStart(props.active, sess, props.fic, props.tab, cpc, props.userName, props.worldbook, perFic);
        props.onUpdate(function (ss) { ss.transcript = [{ who: "nar", text: text }]; ss.updatedAt = Date.now(); return ss; });
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusy(false);
    }
    React.useEffect(function () { if (trans.length === 0) start(); }, []);

    async function send() {
      const act = input.trim(); if (!act || busy) return;
      setInput(""); setWriting(false); setBusy(true);
      props.onUpdate(function (ss) { ss.transcript = (ss.transcript || []).concat([{ who: "me", text: act }]); ss.updatedAt = Date.now(); return ss; });
      try {
        const text = await window.Fanfic.genRPTurn(props.active, s, props.fic, props.tab, cpc, props.userName, props.worldbook, act, perFic);
        props.onUpdate(function (ss) { ss.transcript = (ss.transcript || []).concat([{ who: "nar", text: text }]); ss.updatedAt = Date.now(); return ss; });
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusy(false);
    }

    const lastIdx = trans.length - 1;
    const lastIsNar = lastIdx >= 0 && trans[lastIdx].who === "nar";
    const lastParas = lastIsNar ? trans[lastIdx].text.split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
    const moreToReveal = lastIsNar && reveal < lastParas.length;
    const canAct = !busy && lastIsNar && !moreToReveal; // 读完当前叙事才轮到我行动

    // 一段叙事正文
    function para(txt, key) { return h("p", { key: key, style: { fontFamily: "'Noto Serif SC',serif", fontSize: 15, lineHeight: 1.95, color: t.ink, whiteSpace: "pre-wrap", margin: "0 0 14px" } }, txt); }

    return h("div", { className: "h-full flex flex-col" },
      h(Head, { zh: "穿越中", en: window.Fanfic.rpModeLabel(s.mode), onBack: props.onBack }),
      !props.fic ? h("div", { className: "flex-1 flex items-center justify-center px-8 text-center", style: { fontFamily: F_BODY, fontSize: 13, color: t.fog } }, "原篇已不在（可能取消了收藏被清理），此存档无法继续。") :
      h("div", { className: "flex-1 min-h-0 overflow-y-auto px-7 pb-8", style: { background: t.bg } },
        // 书名/起点抬头
        h("div", { className: "text-center py-4 mb-2" },
          h("div", { style: { fontFamily: F_DISPLAY, fontSize: 17, color: t.ink } }, s.ficTitle),
          h("div", { style: { fontFamily: F_BODY, fontSize: 10.5, letterSpacing: "0.1em", color: t.fog, marginTop: 3 } }, window.Fanfic.rpModeLabel(s.mode) + " · " + (s.landing && s.landing.label || "") + (s.playerIdentity && s.playerIdentity.name ? " · 你是「" + s.playerIdentity.name + "」" : ""))),
        // 正文（叙事段落 + 我用羽毛笔写进去的行动），最后一段按 reveal 逐段显示
        trans.map(function (e, i) {
          if (e.who === "me") return h("div", { key: i, className: "my-5", style: { borderLeft: "2px solid " + t.accent, paddingLeft: 12 } },
            h("div", { style: { fontFamily: F_BODY, fontSize: 9.5, letterSpacing: "0.14em", color: t.accent, marginBottom: 3 } }, "✒ 你写下"),
            h("div", { style: { fontFamily: "'Noto Serif SC',serif", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.85, color: t.accent, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" } }, e.text));
          const paras = e.text.split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
          const showN = (i === lastIdx) ? Math.min(reveal, paras.length) : paras.length;
          return h("div", { key: i }, (showN ? paras.slice(0, showN) : [e.text]).map(function (p, j) { return para(p, j); }));
        }),
        busy ? h(Spinner, { label: trans.length ? "剧情推进中…" : "开场中…" }) : null,
        // 逐段展开
        moreToReveal ? h("button", { onClick: function () { setReveal(reveal + 1); }, className: "w-full active:opacity-60 mt-1 mb-2", style: { fontFamily: F_BODY, fontSize: 12.5, color: t.fog, padding: "10px" } }, "▾ 显示下一段（" + reveal + "/" + lastParas.length + "）") : null),
      // 底部：读完了才出现"写下你的行动"（羽毛笔），不做成常驻聊天框
      props.fic && canAct ? (writing
        ? h("div", { className: "shrink-0 flex items-end gap-2 px-4 py-3", style: { background: t.bg2, borderTop: "1px solid " + t.line } },
            h("span", { style: { color: t.accent, fontSize: 16, paddingBottom: 5 } }, "✒"),
            h("textarea", { ref: taRef, value: input, autoFocus: true, rows: 1, onChange: function (e) { setInput(e.target.value); autoGrow(); }, onKeyDown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }, placeholder: "写下你的行动 / 说的话…（Enter 发送，Shift+Enter 换行）", className: "flex-1 outline-none resize-none", style: { minWidth: 0, fontFamily: "'Noto Serif SC',serif", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.6, color: t.ink, background: "transparent", borderBottom: "1px solid " + t.line, padding: "4px 2px", maxHeight: 130, overflowY: "auto", wordBreak: "break-word" } }),
            h("button", { onClick: send, disabled: !input.trim(), className: "active:opacity-70 disabled:opacity-30 flex items-center justify-center shrink-0", style: { width: 38, height: 38, borderRadius: 999, background: t.accent } }, h(ISend, { size: 15, color: "#fff" })))
        : h("button", { onClick: function () { setWriting(true); }, className: "shrink-0 active:opacity-70 mx-4 mb-3 mt-1", style: { fontFamily: F_BODY, fontSize: 13.5, color: t.bg2, background: t.ink, padding: "12px", borderRadius: 12 } }, "✒ 写下你的行动")) : null);
  }

  // ---------- 底 nav ----------
  function BottomNav(props) {
    const t = useTheme();
    const items = [
      { key: "feed", label: "首页", G: IHome }, { key: "shelf", label: "书架", G: IShelf },
      { key: "publish", label: "发布", center: true }, { key: "rp", label: "穿越", G: IPortal }, { key: "mine", label: "我的", G: GUser }
    ];
    return h("div", { className: "shrink-0 flex items-end", style: { borderTop: "1px solid " + t.line, background: t.bg, paddingBottom: "env(safe-area-inset-bottom)" } },
      items.map(function (it) {
        const on = props.view === it.key;
        if (it.center) return h("button", { key: it.key, onClick: function () { props.onNav(it.key); }, className: "flex-1 flex items-center justify-center pt-1.5 pb-2" },
          h("div", { className: "flex items-center justify-center", style: { width: 40, height: 40, borderRadius: 999, background: t.ink } }, h(IPlus, { size: 20, color: t.bg2 })));
        return h("button", { key: it.key, onClick: function () { props.onNav(it.key); }, className: "flex-1 flex flex-col items-center gap-1 py-2 active:opacity-60", style: { color: on ? t.ink : t.fog } },
          h(it.G, { size: 20, color: on ? t.ink : t.fog }),
          h("span", { style: { fontFamily: F_BODY, fontSize: 10.5, fontWeight: on ? 600 : 400 } }, it.label));
      }));
  }

  // ============================================================
  // 主组件
  // ============================================================
  function FanficApp(props) {
    const t = useTheme();
    const [tabs, setTabs] = useState(loadTabs);
    const [fics, setFics] = useState(loadFics);
    const [cps, setCps] = useState(loadCPs);
    const [me, setMe] = useState(function () { return meProfile(loadMe(), props.profile); });
    const [activeTab, setActiveTab] = useState(tabs[0] && tabs[0].id);
    const [view, setView] = useState("feed"); // feed / shelf / publish / rp / mine
    const [openId, setOpenId] = useState(null);
    const [gearOpen, setGearOpen] = useState(false);
    const [tabSheet, setTabSheet] = useState(null); // null | {} (new) | tabObj (edit)
    const [busy, setBusy] = useState(false);

    const userName = (props.profile && props.profile.name) || "我";
    const characters = props.characters || [];
    const curTab = tabs.find(function (x) { return x.id === activeTab; }) || tabs[0];

    function persistFics(next) { setFics(next); saveFics(next); }
    function updateFic(id, fn) {
      const next = loadFics().map(function (f) { return f.id === id ? fn(Object.assign({}, f)) : f; });
      persistFics(next);
    }
    function toggleShelf(id) {
      updateFic(id, function (f) { f.onShelf = !f.onShelf; return f; });
      props.toast && props.toast("已" + (loadFics().find(function (f) { return f.id === id; }).onShelf ? "收藏" : "取消收藏"));
    }

    // 点赞（切换）
    function likeFic(id) { updateFic(id, function (f) { f.liked = !f.liked; return f; }); }
    function saveMeFn(m) { setMe(m); saveMe(m); props.toast && props.toast("已保存"); }
    // 转发：记录 sharedTo（item 8：新章推给这些角色）并调 app.js 真正 push
    function fwdChat(fic, ch) { updateFic(fic.id, function (f) { const s = f.sharedTo || []; if (s.indexOf(ch.id) < 0) s.push(ch.id); f.sharedTo = s; return f; }); props.onForwardToChat && props.onForwardToChat(fic, ch); }
    function fwdGroup(fic, g) { props.onForwardToGroup && props.onForwardToGroup(fic, g); }
    // 追更后通知曾被分享的角色读新章
    function chapterShared(fic, ch, chapNo) { props.onNotifyChapter && props.onNotifyChapter(fic, ch, chapNo, fic.sharedTo || []); }

    // 生成
    async function doGen(n, cp, styleIds, includeMe) {
      setGearOpen(false); setBusy(true);
      props.toast && props.toast("生成中…（" + n + " 篇）");
      try {
        const chars = cpChars(cp, characters, props.profile);
        const cfg = loadCfg();
        // 本次勾选的文风（GenSheet 传来）→ 用它，并记住当默认；没传就退回上次的
        let styleText;
        if (Array.isArray(styleIds)) {
          saveCfg(Object.assign({}, cfg, { activeStyleIds: styleIds }));
          styleText = (cfg.styles || []).filter(function (s) { return styleIds.indexOf(s.id) >= 0; }).map(function (s) { return s.text; }).filter(Boolean).join("\n\n");
        } else styleText = activeStyleText(cfg);
        // 推荐(mixed)版：把其它世界观当池子供每篇随机取
        const worldPool = curTab.mixed ? tabs.filter(function (x) { return !x.mixed; }) : null;
        const opts = { style: styleText, perFic: cfg.perFic, chatMaterial: chatMaterialFor(chars), worldPool: worldPool,
          includeMe: !!includeMe, meName: (props.profile && props.profile.name) || userName || "我", mePersona: (props.profile && props.profile.persona) || "" };
        const arr = await window.Fanfic.genBatch(props.active, curTab, chars, n, userName, props.worldbook, opts);
        const now = Date.now();
        const made = arr.map(function (x, i) {
          return {
            id: uid("fic"), tabId: curTab.id, cp: cp || [], title: x.title, author: x.author, tags: x.tags,
            chapters: [{ content: x.body, endHook: x.endHook }], source: "npc", onShelf: false, sharedTo: [],
            stats: ficHeat(x.title + now + i), reviews: [], createdAt: now - i, updatedAt: now - i
          };
        });
        persistFics(made.concat(loadFics()));
        props.toast && props.toast("已生成 " + made.length + " 篇");
      } catch (e) { props.toast && props.toast(String(e.message || e)); }
      setBusy(false);
    }

    // 刷新：清掉当前 tab 里非保护的 npc fic（onShelf/user 保留）
    function refreshTab() {
      const next = loadFics().filter(function (f) {
        if (f.tabId !== curTab.id) return true;
        return protectedFic(f);
      });
      persistFics(next);
      props.toast && props.toast("已清理本版未收藏的生成内容");
    }

    // 发布（onShelf=false → 留在 feed + 我发布的；source=user 刷新受保护不会被清）
    function publish(tabId, title, cp, tags, body) {
      const now = Date.now();
      const fic = { id: uid("fic"), tabId: tabId, cp: cp || [], title: title, author: me.name || userName, tags: tags, chapters: [{ content: body, endHook: "" }], source: "user", onShelf: false, sharedTo: [], stats: ficHeat(title + now), reviews: [], createdAt: now, updatedAt: now };
      persistFics([fic].concat(loadFics()));
      setActiveTab(tabId); setView("feed");
      props.toast && props.toast("已发布");
    }

    // tab 增删改
    function saveTab(id, name, desc) {
      let next;
      if (id) next = tabs.map(function (tb) { return tb.id === id ? Object.assign({}, tb, { name: name, desc: desc }) : tb; });
      else { const nt = { id: uid("tab"), name: name, desc: desc }; next = tabs.concat([nt]); }
      setTabs(next); saveTabs(next); setTabSheet(null);
      if (!id) props.toast && props.toast("已添加世界观");
    }
    function delTab(id) {
      const next = tabs.filter(function (tb) { return tb.id !== id; });
      setTabs(next); saveTabs(next); setTabSheet(null);
      if (activeTab === id) setActiveTab(next[0] && next[0].id);
    }

    function addCP(cp) { const next = cps.concat([cp]); setCps(next); saveCPs(next); }
    function delCP(id) { const next = cps.filter(function (c) { return c.id !== id; }); setCps(next); saveCPs(next); }

    // ---- 阅读页 ----
    if (openId) {
      const f = fics.find(function (x) { return x.id === openId; });
      if (!f) { setOpenId(null); return null; }
      const ftab = tabs.find(function (x) { return x.id === f.tabId; }) || curTab;
      return h(Reader, {
        fic: f, tab: ftab, active: props.active, characters: characters, profile: props.profile,
        groups: props.groups || [], userName: userName, worldbook: props.worldbook, toast: props.toast,
        onBack: function () { setOpenId(null); },
        onUpdate: updateFic, onToggleShelf: toggleShelf, onLike: likeFic,
        onForwardToChat: fwdChat, onForwardToGroup: fwdGroup, onChapterShared: chapterShared
      });
    }

    // ---- 各子页 ----
    let inner;
    if (view === "publish") {
      inner = h(Publish, { tabs: tabs, characters: characters, userName: userName, toast: props.toast, onBack: function () { setView("feed"); }, onPublish: publish });
    } else if (view === "mine") {
      inner = h(Mine, { characters: characters, cps: cps, userName: userName, me: me, fics: fics, profile: props.profile, toast: props.toast,
        onBack: function () { setView("feed"); }, onAddCP: addCP, onDelCP: delCP, onEnterRP: function () { setView("rp"); },
        onOpenFic: function (id) { setOpenId(id); }, onSaveMe: saveMeFn });
    } else if (view === "rp") {
      inner = h(RPApp, { fics: fics, tabs: tabs, characters: characters, profile: props.profile, userName: userName, active: props.active, worldbook: props.worldbook, toast: props.toast, onBack: function () { setView("feed"); } });
    } else {
      // feed / shelf。item 5：收藏(onShelf)的从 feed 移除、只在书架出现
      const list = fics.filter(function (f) {
        if (view === "shelf") return f.onShelf === true;
        return f.tabId === (curTab && curTab.id) && !f.onShelf;
      }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      inner = h("div", { className: "flex-1 min-h-0 flex flex-col" },
        h(Head, {
          zh: view === "shelf" ? "书架" : "同人文", en: view === "shelf" ? "追更中心 · Shelf" : "Fanfic",
          onBack: props.onBack,
          right: view === "feed" ? h("div", { className: "flex items-center gap-3" },
            h("button", { onClick: refreshTab, className: "active:opacity-60", style: { fontFamily: F_BODY, fontSize: 12, color: t.fog } }, "刷新"),
            h("button", { onClick: function () { setGearOpen(true); }, disabled: busy, className: "active:opacity-60", title: "生成配置" }, h(GConfig, { size: 19, color: t.ink }))) : null
        }),
        view === "feed" ? h(TabBar, {
          tabs: tabs, activeId: activeTab, onPick: setActiveTab,
          onAdd: function () { setTabSheet({}); }, onEdit: function (tb) { setTabSheet(tb); }
        }) : null,
        view === "feed" && curTab && curTab.desc ? h("div", { className: "px-5 pb-2", style: { fontFamily: F_BODY, fontSize: 11, color: t.fog, lineHeight: 1.5 } }, curTab.desc) : null,
        h("div", { className: "flex-1 min-h-0 overflow-y-auto px-5 pb-6" },
          busy ? h(Spinner, { label: "生成中…" }) : null,
          list.length ? list.map(function (f) {
            return h(FicCard, { key: f.id, fic: f, characters: characters, userName: userName, onOpen: function () { setOpenId(f.id); }, onLike: function () { likeFic(f.id); } });
          }) : (busy ? null : h(Empty, { text: view === "shelf" ? "书架空空" : "本版还没有同人文", sub: view === "shelf" ? "收藏或发布的篇目会留在这里追更" : "点右上角齿轮生成，或用底部加号自己写" }))));
    }

    // 发布/我的/rp 是全屏子页（自带返回箭头回 feed），不叠底 nav；feed/shelf 才显示底 nav
    const showNav = view === "feed" || view === "shelf";
    return h("div", { className: "h-full flex flex-col", style: { background: t.bg } },
      inner,
      showNav ? h(BottomNav, { view: view, onNav: function (k) { setView(k); } }) : null,
      gearOpen ? h(GenSheet, { tab: curTab, cps: cps, characters: characters, userName: userName, onClose: function () { setGearOpen(false); }, onConfirm: doGen }) : null,
      tabSheet ? h(TabSheet, { tab: tabSheet.id ? tabSheet : null, onClose: function () { setTabSheet(null); }, onSave: saveTab, onDelete: delTab }) : null);
  }

  window.FanficApp = FanficApp;
})();
