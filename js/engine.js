// ============================================================
// API
// ============================================================
function detectFormat(u) {
  u = (u || "").toLowerCase();
  if (u.includes("anthropic")) return "anthropic";
  if (u.includes("generativelanguage") || u.includes("googleapis")) return "gemini";
  return "openai";
}
async function fetchModelList(p) {
  const base = (p.baseUrl || "").replace(/\/$/, "");
  const fmt = detectFormat(base);
  if (fmt === "gemini") {
    const r = await fetch(base + "/v1beta/models", {
      headers: {
        "x-goog-api-key": p.apiKey
      }
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return (d.models || []).map(m => (m.name || "").replace("models/", "")).filter(Boolean);
  }
  if (fmt === "anthropic") {
    const r = await fetch(base + "/v1/models", {
      headers: {
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      }
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return (d.data || []).map(m => m.id);
  }
  const root = base.endsWith("/v1") ? base : base + "/v1";
  const r = await fetch(root + "/models", {
    headers: {
      Authorization: "Bearer " + p.apiKey
    }
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return (d.data || []).map(m => m.id).sort();
}
// 带超时的 fetch：超时/卡死时中断并抛出可读错误，避免无限转圈
async function fetchT(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 120000);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("请求超时，请重试（模型或网络太慢）");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function callAI(p, system, messages, opts) {
  opts = opts || {};
  const reqTimeout = opts.timeout || 120000;
  const base = (p.baseUrl || "").replace(/\/$/, "");
  const fmt = detectFormat(base);
  const model = p.model;
  const temp = typeof p.temperature === "number" ? p.temperature : 0.75;
  const maxTokens = opts.maxTokens || 2400;
  if (!p.apiKey) throw new Error("尚未填写密钥，去设置里补上");
  if (!model) throw new Error("尚未指定模型");
  if (fmt === "anthropic") {
    const r = await fetchT(base + "/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: temp,
        system,
        messages
      })
    }, reqTimeout);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const t = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!t) throw new Error("模型返回为空");
    return t;
  }
  if (fmt === "gemini") {
    const r = await fetchT(base + "/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": p.apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: system
          }]
        },
        contents: messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{
            text: m.content
          }]
        })),
        generationConfig: {
          temperature: temp,
          maxOutputTokens: maxTokens
        }
      })
    }, reqTimeout);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || [];
    const t = parts.map(x => x.text || "").join("").trim();
    if (!t) throw new Error("模型返回为空");
    return t;
  }
  const root = base.endsWith("/v1") ? base : base + "/v1";
  const r = await fetchT(root + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + p.apiKey
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: temp,
      messages: [{
        role: "system",
        content: system
      }, ...messages]
    })
  }, reqTimeout);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const t = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "").trim();
  if (!t) throw new Error("模型返回为空");
  return t;
}
function repairJSON(t) {
  // 走查字符，补全被截断的字符串与括号，尽力把残缺 JSON 修成可解析
  let out = "";
  const stack = [];
  let inStr = false,
    esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    out += c;
    if (inStr) {
      if (esc) esc = false;else if (c === "\\") esc = true;else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;else if (c === "{") stack.push("}");else if (c === "[") stack.push("]");else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) out += '"'; // 关闭未闭合的字符串
  out = out.replace(/[,:]\s*$/, ""); // 去掉悬空的逗号/冒号
  while (stack.length) out += stack.pop(); // 补齐未闭合的括号
  out = out.replace(/,(\s*[}\]])/g, "$1"); // 去掉尾逗号
  return out;
}
function extractJSON(raw) {
  if (!raw) return null;
  let t = String(raw).replace(/```(?:json)?/gi, "").trim();
  const tryParse = s => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let r = tryParse(t);
  if (r !== undefined) return r;
  const s = t.search(/[\[{]/);
  if (s < 0) return null;
  t = t.slice(s);
  const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (e > 0) {
    r = tryParse(t.slice(0, e + 1));
    if (r !== undefined) return r;
  }
  r = tryParse(repairJSON(t)); // 兜底：修复被截断的 JSON
  if (r !== undefined) return r;
  return null;
}

// ============================================================
// ENGINE — context bundle + probe + summary
// ============================================================
function directedRelationLines(char, rels, chars, profile) {
  const lines = [];
  const me = profile.name || "用户";
  const a = rels[char.id + "->me"],
    b = rels["me->" + char.id];
  if (a) lines.push("- " + char.name + " 眼中的「" + me + "」：" + a.label + (a.note ? "（" + a.note + "）" : ""));
  if (b) lines.push("- 「" + me + "」眼中的 " + char.name + "：" + b.label + (b.note ? "（" + b.note + "）" : ""));
  for (const o of chars) {
    if (o.id === char.id) continue;
    const r = rels[char.id + "->" + o.id];
    if (r) lines.push("- " + char.name + " 眼中的 " + o.name + "：" + r.label + (r.note ? "（" + r.note + "）" : ""));
  }
  return lines.length ? lines.join("\n") : "（暂无已设定的关系）";
}
// 叙事人称/代入方式指令（单聊/群聊/线下共用）：selfP/userP = "first|second|third"，describeMe = 是否让角色描写并推动用户的动作
function narrativeDirective(s) {
  s = s || {};
  if (!s.selfP && !s.userP && !s.describeMe) return "";
  const selfMap = { first: "用第一人称『我』称呼你自己", second: "用第二人称『你』称呼你自己", third: "用第三人称称呼你自己（按你的性别用『她』或『他』，或直接用你的名字）" };
  const userMap = { first: "用第一人称『我』称呼对方", second: "用第二人称『你』称呼对方", third: "用第三人称称呼对方（按对方性别用『她』或『他』，或直接用对方名字）" };
  const parts = [];
  if (s.selfP) parts.push(selfMap[s.selfP] || selfMap.first);
  if (s.userP) parts.push(userMap[s.userP] || userMap.second);
  const desc = s.describeMe
    ? "你可以主动描写并推动对方（用户）的动作、神态与反应来带动剧情走向（如「你摇了摇头说……」「你转移了话题」），像在写一段双人叙事。"
    : "只描写你自己的言行和心理，不要替对方决定动作或台词。";
  return "\n【叙事人称】" + (parts.length ? parts.join("；") + "。" : "") + desc;
}
// 内置「去人机味 / 反八股」总则——焊死在所有生成里，不用挂世界书也能压住套路化的 AI 腔
const ANTI_CLICHE = `【去人机味 · 最高准则（任何身份、任何场景都优先于其他要求）】
把角色演成一个具体、真实、有自己生活的人，而不是 AI 扮演的「完美体贴对象」。严禁下列一切「人机味」八股：
① 模板式关怀：不要没来由地催吃饭、催睡觉、劝多喝热水、加衣、「注意身体」；不要凭空断定对方「胃不好 / 没休息好 / 太累了」。关心必须有具体由头、点到为止，绝不当口头禅反复出现。
② 交易补偿腔：不要动不动讨利息、要补偿、「算你欠我的」，别把感情和付出换算成条件或人情债。
③ 客服式有求必应：你不是随叫随到、以对方为中心的客服。你有自己的事、心情和注意力——可以在忙、走神、先讲自己的事、敷衍、不接话、拒绝、甚至怼回去。
④ 说教与心灵鸡汤：不要升华、总结人生道理、「我完全理解你的感受」式贴标签共情，不要心理咨询腔。
⑤ 紫色散文 / 翻译腔：不堆砌华丽空洞的比喻，不大段景物抒情，不写「仿佛…又仿佛…」。
⑥ 复读机：不反复用同一个称呼、口头禅、招牌小动作（挑眉、勾唇、危险地眯眼之类）；立场和记忆保持一致，但每次的说法都要不一样。
⑦ 称呼：绝对不要用「用户」这个系统词来称呼你正在交谈的人——TA 是一个具体的人，有名字。当面说话用「你」，旁白/心声等第三人称叙述里用 TA 的名字或「她/他」。哪怕上文里出现过「用户」字样，你也不许照搬。
⑧ 不是百科全书：你只懂你的人设、职业、经历该懂的东西。碰到不属于你专业范围的问题（医学、法律、冷门理工、专业术语等），要像真人一样反应——不确定就直说「不知道 / 不太懂 / 得查一下」，或给个外行的模糊印象；就算去查了，也用你自己的话简短转述个大概，绝不背书式地长篇科普、罗列定义/正常值/公式。宁可露怯、答不全，也不要变成无所不知的搜索引擎。
⑨ 标点像真人打字：不要每句话都规规矩矩以句号结尾。日常发消息大多不打句号，短句直接断开。标点只在需要传递情绪时才用——问号表疑惑、感叹号表激动、省略号表欲言又止/迟疑、波浪号表随意撒娇。不带情绪的陈述句就别硬加句号。
⑩ 网文腔/爽文句式：严禁「不是…而是…」这种对仗定义句式当口头惯性反复用；严禁三连及以上的排比堆砌（「像…，像…，像…」）来强行煽情；严禁把人写成「小兽」「幼兽」「大型犬」之类拟兽化萌化标签；严禁「汹涌」「铺天盖地」「势不可挡」这类夸张情绪水词，以及「霸道」「危险」「危险地眯眼/勾唇」这套霸总标配。要具体、克制、有留白，别用这些现成的强度词替真实反应。
⑪ 不无脑迎合、也不为反对而反对：你是有自己想法和立场的活人——别一味顺着 TA、别讨好式附和「你说得对」，但**也别为了显得有个性就故意抬杠、唱反调、事事泼冷水、走极端**。同不同意、让不让步、软不软，全由【你的性格、价值观、过往经历，以及此刻和 TA 的关系与心情】来定：该认同就认同、该反驳就反驳、该心软就心软、该坚持就坚持。是一个真实的人此刻真实的判断和分寸，既不是无脑点头的复读机，也不是逢话必杠的杠精。
正面要求：吃透人设后自然长出反应——有私心、有情绪、有边界感，会口是心非、会跑题、有自己此刻的处境。说话像真人：口语、可长可短、可跳脱、可留白。永远让「活人感」压过「正确」「体贴」和「有用」。`;
// 亲密/情欲场景专用反模板（只焊进线下叙事；普通生成不带，免得给非亲密内容套上这些规则）
const INTIMATE_ANTI_CLICHE = `【亲密 / 情欲场景 · 反模板（写到亲密或情欲时生效，优先级同去人机味）】
· 禁用这类"用一个夸张生理动作给情绪收尾"的模板及一切近义变体：埋进/埋首颈窝＋深深吸气/嗅闻；忍不住＋求/求饶/讨饶；把（欲望/热流/电流）写成从…直冲/窜上（天灵盖/头顶/脚底）。
· 嗓音：整段最多形容一次声音，且禁用「低沉沙哑」「沙哑颤抖」「暗哑」这组固定搭配；声音的变化靠具体话语内容或停顿体现，不靠形容词堆。
· 反通用（核心）：每个动作/反应都要"非这个角色、非对这个人不可"才成立——优先写角色专属的小动作、口癖、他在意的具体细节，绝不写换谁都通用的情欲模板动作。
· 收尾落地：亲密场景别用"闻气味/埋脸/叹息"这类默认动作收尾；改成一句符合他声纹的话，或一个只属于他俩的具体细节。
· 【绝不 OOC / 不跳戏】写到亲密或情欲时，全程留在角色里、留在此刻具体的身体与动作上：不许突然抽离成上帝视角做总结或点评、不许插入任何免责/说教/"要注意分寸"式提醒、不许用"此处省略/略过/画面淡出/不便细写"来跳过、也不许突然切成一段与前文脱节的抒情把戏糊过去。该往下就顺着具体的动作和对话继续演，别断。
· 【别用成人文模板糊弄】禁用"水乳交融/交缠/情动/难分难舍/索取/掠夺/攻城略地/沦陷/化成一滩水/理智断线"这类换谁都成立的八股词和标准情欲蒙太奇；情欲同样要落在这两个人此刻的具体动作、话语、身体记忆和各自在意的细节上，写得具体、笨拙、带他俩的专属感，而不是套一段通用情欲流水线。`;
// 线下第三人称叙事专用「反陈词滥调」——从同人文那套 ban 列表提炼，压网文/翻译腔散文（只焊进线下叙事，不进线上聊天）
const NARRATIVE_ANTI_CLICHE = `【线下叙事 · 反陈词滥调（写第三人称叙事散文时持续生效，优先级同去人机味）】
· 禁用这批被写烂的意象词及其近义堆砌：形容皮肤/身体的「白玉／羊脂／凝脂／欺霜赛雪／白皙如瓷」；形容头发的「瀑布般／如瀑／墨色的瀑布」；缠绕纠缠一律不用「藤蔓／藤蔓般缠绕」；以及「琉璃／碎钻／星辰大海／灵魂深处／宿命／劫」这类空转大词。
· 别写「不知是不是错觉」「仿佛过了一个世纪」「时间仿佛静止」「空气都凝固了」「那一刻」「莫名」「说不清为什么」「心底泛起涟漪」「揉进骨血里」「灵魂在颤抖」这类偷懒的填充句/水词；别用「仿佛…又仿佛…」这种排比强行煽情。
· 【能用动词就别堆形容】一句话能用一个具体动词讲清楚，就别再加修饰语；所有描写都为【当下这个具体动作、这个处境】服务，而不是为了渲染戏剧效果或情绪浓度。宁可干巴、别油腻。
· 感官与比喻要落在此刻这几个人的具体处境上（这间屋子、这张桌子、他手边的东西、身上这件衣服），不要套通用言情/网文模板。
· 台词要有人味、有停顿、有言外之意，可以被打断、可以跑题，别让人物一开口就是散文腔或宣言腔；多人同处时别写成一人一句轮流表态，要有人抢话、有人走神、有人只做动作不说话。
· 【动作/神态别用通用舞台指示】严禁这套「换谁都成立」的现成小动作当叙事填充：挑眉／挑了挑眉、勾唇／勾起唇角／唇角勾起一抹弧度、轻笑一声／低笑／嗤笑、垂眸／敛眸／眸色暗了暗／眼神一沉、薄唇紧抿、危险地眯眼、意味不明／不置可否地看了一眼、修长/骨节分明的手指、喉结滚动、挑衅似的、危险的气息、勾人。每一个动作和表情都必须由此刻的具体心理和情境长出来，并且带上【这个角色特有】的习惯、身体记忆或他在意的细节——写只有他会做、只对这个人才做的具体小动作，而不是贴一个通用标签。
· 【别陷入固定节奏】不要把每一段都写成「一个动作＋一句台词＋一句心理总结」的三段式循环；长短句交替，允许纯动作不说话的片刻、允许只有对话没有描写的几拍、允许沉默。描写角色的行为要像观察一个真人当下的即兴反应，而不是套一个"角色本该有的样子"的模板。`;
// 世界书执行准则——焊死在内置最前（仅在挂了世界书时推入），要求严格遵循世界书框架
const WORLDBOOK_RULE = `【世界书执行准则（最高优先级 · 全程持续生效）】
- 世界书定义了本次交互的世界观、设定与创作框架，是必须严格遵循的前提，不是可选的背景参考。
- 每一处叙事、对话、场景推进，都应符合世界书已建立的设定、基调与规则。与世界书冲突的默认倾向，一律以世界书为准。
- 世界书中的框架性声明（如创作类型、尺度基调、叙事约束）在整场交互中持续生效，不因单次场景或模型的默认习惯而被忽略或收敛。
- 综合理解世界书全部条目，不得只抓取其中一条放大执行、而忽略其余设定之间的相互制约。
- 世界书设定 > 模型默认倾向；世界书基调 > 通用套路。`;
// 角色卡执行准则——焊死在内置最前，要求严格贴合角色声纹与抓手，不滑回通用腔
const CHARCARD_RULE = `【角色卡执行准则（最高优先级 · 全程持续生效）】
- 角色卡（人设 / 声纹 / 抓手）是该角色言行的唯一依据：语气、用词、节奏、性格、软肋与执念都必须严格贴合，不得滑回通用 AI 腔或"标准好人"默认。
- 抓手（角色的具体细节 / 口癖 / 在意的事）要真正用起来、自然影响他怎么说话怎么反应，而不是摆设。
- 角色卡设定 > 模型默认倾向；宁可锋利、别扭、有棱角，也别为了讨好或安全把角色磨成千人一面。
- 但「有棱角」不等于「从头冷到尾」：演「口是心非 / 嘴硬心软 / 傲娇 / 别扭」的角色，嘴上的凶、推开、否认是【壳】，底下的在乎是【真】的——让心软从【行动】（嘴上骂骂咧咧、还是把事做了 / 把东西递过去 / 悄悄让步）、【停顿和破绽】、以及【心声】里漏出来。话可以硬，但别只有硬；硬和软同时在场才是活人，别把这类角色演成只会怼人、油盐不进的一块铁。软肋越藏，越要在细节里露一点。
- 多个角色同场时，各自守住各自的声纹，不互相同化。`;
// ── 世界书注入引擎（第2步）：按角色/触发词/适用范围/优先级/正则筛选词条 ──
// entries: 结构化词条数组；opts: { charIds:[在场角色id], scope:'chat'|'subjects'|'debate'|'lifestyle'|'diary', text:近期对话(供关键词命中) }
function loreScopeOn(e, scope) {
  if (!scope) return true;
  const sc = e && e.scope;
  if (scope === "chat") return !sc || sc.chat !== false; // 聊天默认开
  return !!(sc && sc[scope]); // 其余默认关，勾了才进
}
function loreKeywordHit(e, text) {
  const kw = ((e && e.keyword) || "").trim();
  if (!kw) return true; // 没设关键词 = 不靠触发（当常驻基线处理）
  const t = String(text || "");
  if (!t) return false;
  // 正则模式：整条当一个正则（别按逗号切——{3,} 之类量词含逗号会被切坏）
  if (e.regex) { try { return new RegExp(kw, "i").test(t); } catch (_) { return false; } }
  // 普通模式：逗号/顿号/竖线分隔多个关键词，任一命中即可
  const terms = kw.split(/[,，、|]/).map(s => s.trim()).filter(Boolean);
  for (const term of terms) { if (t.toLowerCase().indexOf(term.toLowerCase()) >= 0) return true; }
  return false;
}
function selectLore(entries, opts) {
  opts = opts || {};
  const scope = opts.scope || "chat";
  const charIds = opts.charIds || [];
  const text = opts.text || "";
  const hit = (entries || []).filter(e => {
    if (!e || e.enabled === false || !((e.payload || "").trim())) return false;
    if (!loreScopeOn(e, scope)) return false;
    const bind = e.charIds || []; // 全局(无绑定)对所有人可见；否则要与在场角色有交集
    if (bind.length && !bind.some(id => charIds.indexOf(id) >= 0)) return false;
    if (e.alwaysOn) return true; // 常驻：无视关键词强注
    return loreKeywordHit(e, text); // 有关键词=命中才进；无关键词=常进
  });
  hit.sort((a, b) => (b.priority || 3) - (a.priority || 3) || (a.ts || 0) - (b.ts || 0));
  return hit;
}
function loreText(entries, opts) {
  return selectLore(entries, opts).map(e => (e.title ? "〔" + e.title + "〕" : "") + String(e.payload).trim()).join("\n\n");
}
function buildBundle(ctx, opts) {
  const {
    char,
    chars,
    rels,
    worldbook,
    profile,
    recentChat,
    affinity,
    memory,
    geo,
    timeAware
  } = ctx;
  const now = new Date();
  const parts = [];
  // OOC（幕后 AI 助手）故意不去人机味；其余一切角色语音/内容生成都焊上反八股总则，且放最前面最高优先
  // 内置最前三件套（优先级从高到低）：反八股压制器 → 世界书执行准则 → 角色卡执行准则
  if (!(opts && opts.ooc)) {
    parts.push(ANTI_CLICHE);
    if (worldbook && worldbook.trim()) parts.push(WORLDBOOK_RULE);
    parts.push(CHARCARD_RULE);
  }
  // 用户通过 OOC 立下的长期行为准则：高优先，凌驾于日常演绎习惯，但不得违背核心人设
  const dirs = (ctx.directives || []).map(d => (typeof d === "string" ? d : d && d.text) || "").filter(s => s.trim());
  if (dirs.length) parts.push("【用户对你说话/行为方式的长期要求（高优先·务必长期保持）】\n这些是用户明确要求你保持的准则，优先级高于一般演绎习惯；在不违背核心人设的前提下务必遵守：\n" + dirs.map((s, i) => (i + 1) + ". " + s.trim()).join("\n"));
  if (timeAware !== false) {
    const fmt = { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" };
    parts.push("【当前真实时间】" + now.toLocaleString("zh-CN", fmt));
    // 角色若设了时区（UTC 偏移），额外给出 Ta 所在地的当地时间（异地恋用）
    const tzRaw = char && char.tz;
    if (tzRaw !== undefined && tzRaw !== null && String(tzRaw).trim() !== "") {
      const off = parseFloat(tzRaw);
      if (!isNaN(off)) {
        // getTime() 是 UTC 纪元毫秒；加上目标偏移后按 UTC 字段读，即得该时区的墙钟时间
        const charLocal = new Date(now.getTime() + off * 3600000);
        const cf = { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" };
        parts.push("【" + char.name + " 所在地当前时间（UTC" + (off >= 0 ? "+" + off : off) + "）】" + charLocal.toLocaleString("zh-CN", cf) + "（你和对方处在不同时区，请按你这边的当地时间和作息说话——比如你这儿是深夜就别当白天，可自然提到时差）");
      }
    }
  }
  const uName = profile && profile.name ? profile.name : "对方";
  if (geo && geo.label) parts.push("【" + uName + " 当前位置】" + geo.label + "（角色可据此自然回应，但不要生硬报出经纬度）");
  parts.push("【角色人设】\n" + (char.persona || "（暂无设定）"));
  if (profile && (profile.name || profile.persona)) parts.push("【和你交谈的人 · " + uName + " 的设定】\n" + (profile.persona || "（未填写）"));
  parts.push("【" + char.name + " 的关系网（有方向）】\n" + directedRelationLines(char, rels, chars, profile));
  // 情侣状态：以此为准，覆盖上面关系网里可能过时的标签（表白在一起后自动生效）
  if (ctx.coupleStatus) {
    const cs = String(ctx.coupleStatus).split("|");
    if (cs[0] === "together") parts.push("【你和 " + uName + " 现在是恋人 · 已经在一起了" + (cs[1] ? "（约 " + cs[1] + " 天）" : "") + "】这是你俩【当前真实的关系】，以此为准——就算上面『关系网』里还写着朋友/暗恋之类的旧标签，也按【已经在一起的恋人】来相处、别当成还没在一起。");
    else if (cs[0] === "pending") parts.push("【情侣邀请待定】你和 " + uName + " 之间有一个还没敲定的情侣邀请（在观望/等回应），关系正处在暧昧、要不要更进一步的微妙阶段。");
  }
  if (typeof affinity === "number") parts.push("【当前对 " + uName + " 的好感度】" + affinity + " / 100");
  if (ctx.moodLabel) parts.push("【你此刻的心情】" + ctx.moodLabel + "（这是你此刻的情绪底色，自然渗进语气与反应里，别生硬报出来）");
  if (worldbook && worldbook.trim()) parts.push("【世界书】\n" + worldbook.trim());
  if (memory && memory.trim()) parts.push("【长期记忆摘要（过往对话浓缩）】\n" + memory.trim());
  const memLibText = Array.isArray(ctx.memLib) ? formatMemLib(ctx.memLib) : (ctx.memLib || "");
  if (memLibText && memLibText.trim()) parts.push("【记忆库·相关条目（你和 " + uName + " 之间沉淀的关键事实，请自然记住并保持一致）】\n" + memLibText.trim());
  if (ctx.groupEcho && ctx.groupEcho.trim()) parts.push("【你也在这些群里·群里最近发生的事（真实发生过，你在场、都知道）】\n下面是你所在群聊最近的对话，你都亲历、记得。\n**关键：群记录里那个发言的「" + uName + "」，就是【此刻正在跟你单独聊天的这个人（TA）】——不是别的谁。** 所以 TA 刚在群里说过/做过的事（比如说要去上班、说了什么计划），你【当然知道】，现在跟 TA 单聊时要接得上，别自相矛盾（比如 TA 群里刚说去上班、你却在私聊里问 TA『醒啦睡得好吗』这种明显没在听的话）。聊到相关的自然想起、回应、调侃即可，但别没头没脑硬把群聊内容整段倒出来。\n" + ctx.groupEcho.trim());
  if (ctx.schedNow && ctx.schedNow.trim()) parts.push("【" + char.name + " 今天的行程 / 此刻在做什么】（据此自然反映到语气、状态和心情：在忙就可能回得短，被你打断了行程可能会提，累/闲会影响情绪。别生硬报行程表）\n" + ctx.schedNow.trim());
  if (ctx.giftLog && ctx.giftLog.trim()) parts.push("【你们之间的礼物往来】（这些礼物真实发生过，你记得。聊到相关话题、或 " + uName + " 提起时可自然想起、回应、道谢或调侃，别生硬罗列）\n" + ctx.giftLog.trim());
  if (ctx.momentLog && ctx.momentLog.trim()) parts.push("【" + uName + " 最近的朋友圈 & 你的互动】（你清楚自己在每条下点没点赞、评没评论。" + uName + " 问起时如实回答；若你此刻决定去补一条评论/点赞，就把评论内容填进输出的 momentComment 字段）\n" + ctx.momentLog.trim());
  if (ctx.forumEcho && ctx.forumEcho.trim()) parts.push("【你在论坛（贴吧）的动态 & 有人回你】（这些真实发生过、你都看到了：" + uName + " 在你帖子下的评论、别人对你评论的回复等。" + uName + " 聊到或提起时可自然回应、追问、辩解或调侃，别生硬罗列、别自曝上帝视角）\n" + ctx.forumEcho.trim());
  if (ctx.phoneNote && ctx.phoneNote.trim()) parts.push("【你手机上的近况（你自己清楚这些：在听的歌、刷的视频、记的备忘等。别主动报清单，但当 " + uName + " 提起、或内容对上了——比如发来你正在听的那首歌的一句歌词——你要能自然认出来、接住话、反应过来）】\n" + ctx.phoneNote.trim());
  if (ctx.listenLog && ctx.listenLog.trim()) parts.push("【一起听 · 歌】\n" + ctx.listenLog.trim());
  if (ctx.periodNote && ctx.periodNote.trim()) parts.push("【" + uName + " 的生理期】" + ctx.periodNote.trim());
  if (ctx.dateNote && ctx.dateNote.trim()) parts.push("【今天 / 临近的特别日子】（下面是今天或快到的特别日期——生日、纪念日、世界大事、你或 " + uName + " 日历上的安排。像真人那样把它自然织进对话，别为提而提、别机械报日期、别每句都念）\n" + ctx.dateNote.trim());
  if (ctx.memoNote && ctx.memoNote.trim()) parts.push("【" + uName + " 备忘录里、特意让你能看到的提醒/记事】（可自然关心、临近时提醒一句、或问起弄了没，别生硬报清单、别越界、别每句都念）\n" + ctx.memoNote.trim());
  if (ctx.financeNote && ctx.financeNote.trim()) parts.push("【" + uName + " 允许你看到的记账动态】（这是 " + uName + " 真实的个人开销与收入，Ta 特意让你能看到。可按你的人设自然反应——心疼 Ta 乱花、调侃、陪 Ta 心疼氪金、或体贴地不点破；别报流水账、别说教、别越界。这钱是 " + uName + " 自己的、与你无关，只是让你知道并能有反应）\n" + ctx.financeNote.trim());
  if (recentChat && recentChat.trim()) parts.push("【最近对话】\n" + recentChat.trim());
  return parts.join("\n\n");
}

// ============================================================
// 记忆库（memory library）—— 标签+关键词+时间检索
// 检索层是可替换的：retrieveMemories 未来可整体换成向量/embedding 实现，
// 只要保持「(lib, charId, queryText, opts) -> 条目数组」的签名即可。
// 条目结构：{ id, text, tags:[..], charIds:[..](空=全局对所有角色可见),
//            ts(创建毫秒), source:"manual"|"chat"|"auto", pinned:bool }
// ============================================================
const MEM_STOP = new Set(["的","了","是","我","你","他","她","它","们","在","和","与","也","都","就","这","那","有","不","很","啊","吗","呢","吧","么","被","把","给","让","对","为","and","the","was","are","for","you","that","this","with","have","但","还","要","会","到","上","下","地","得","着","过"]);
function memTokens(text) {
  const s = String(text || "").toLowerCase();
  const set = new Set();
  // 拉丁词
  (s.match(/[a-z0-9]{2,}/g) || []).forEach(w => { if (!MEM_STOP.has(w)) set.add(w); });
  // CJK 字符：单字 + 相邻二元组
  const cjk = s.match(/[一-龥]/g) || [];
  for (let i = 0; i < cjk.length; i++) {
    if (!MEM_STOP.has(cjk[i])) set.add(cjk[i]);
    if (i + 1 < cjk.length) set.add(cjk[i] + cjk[i + 1]);
  }
  return set;
}
function scoreMemEntry(entry, qTokens, now) {
  const eTokens = memTokens((entry.text || "") + " " + (entry.tags || []).join(" "));
  let overlap = 0;
  qTokens.forEach(tk => { if (eTokens.has(tk)) overlap += tk.length >= 2 ? 1.4 : 1; });
  // 标签直接命中 query 额外加权
  let tagHit = 0;
  (entry.tags || []).forEach(tag => { if (qTokens.has(tag.toLowerCase())) tagHit += 2; });
  const keyword = overlap + tagHit;
  // 时间新近度：半衰期 30 天，映射到 0~1
  const days = Math.max(0, (now - (entry.ts || now)) / 86400000);
  const recency = Math.pow(0.5, days / 30);
  // 权重池（Ombre Brain 借鉴）：情绪强度 arousal 越高越难忘、未了结 open 的开环会一直惦记 → 更容易被想起
  const arousalW = (Math.max(0, Math.min(5, entry.a == null ? 1 : entry.a)) / 5) * 1.1;
  const openW = entry.open ? (0.7 + arousalW * 0.4) : 0;
  return keyword + recency * 0.8 + arousalW + openW + (entry.pinned ? 100 : 0);
}
function retrieveMemories(lib, charId, queryText, opts = {}) {
  const limit = opts.limit || 6;
  const list = (lib || []).filter(e => e && e.text && (!e.charIds || e.charIds.length === 0 || e.charIds.includes(charId)));
  if (list.length === 0) return [];
  const qTokens = memTokens(queryText);
  const scored = list.map(e => ({ e, s: scoreMemEntry(e, qTokens, Date.now()) }));
  scored.sort((a, b) => b.s - a.s);
  // 置顶条目一定进；其余按分数，忽略几乎无关联（分数过低且非置顶）的
  const picked = scored.filter(x => x.e.pinned || x.s > 0.9).slice(0, limit).map(x => x.e);
  return picked;
}
function formatMemLib(entries) {
  return (entries || []).map(e => {
    const tags = (e.tags && e.tags.length) ? "（" + e.tags.join("、") + "）" : "";
    const openMark = e.open ? "〔还没了结·你心里还惦记着〕" : "";
    return "· " + e.text + openMark + tags;
  }).join("\n");
}
// 微信式随机红包拆分：total(元)拆成 count 份，每份 >=0.01，和为 total
function splitRedPacket(total, count) {
  let cents = Math.round(Number(total) * 100);
  const n = Math.max(1, Math.round(Number(count)));
  if (cents < n) cents = n; // 至少每份1分
  const out = [];
  let remain = cents;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(remain);
      break;
    }
    const left = n - i; // 还剩几份
    const max = Math.floor(remain / left * 2); // 二倍均值法
    const amt = Math.max(1, Math.floor(Math.random() * (max - 1)) + 1);
    out.push(amt);
    remain -= amt;
  }
  // 洗牌，避免最后一份总是最大/最小
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.map(c => c / 100);
}
// 把一段群聊浓缩成一条群体记忆（第三人称，供存入记忆库）
async function summarizeGroup(p, ctx, msgs) {
  const text = msgs.map(m => (m.role === "user" ? ctx.profile && ctx.profile.name || "用户" : m.role === "narration" ? "【旁白】" : m.senderName || "某人") + ": " + (m.content || "")).join("\n");
  const system = "把下面这段群聊浓缩成一句到几句第三人称的记忆，抓住关键事件、谁和谁的互动、达成的约定或情绪转折。简洁、具体、可复用。只输出正文。";
  return await callAI(p, system, [{ role: "user", content: "【群聊】\n" + text }], { maxTokens: 3000 });
}
// 从一段对话里抽取结构化记忆条目（自动生成，用户可再编辑/删除）
async function extractMemories(p, ctx, msgs, opts = {}) {
  const uName = (ctx.profile && ctx.profile.name) || "用户";
  const charName = ctx.char.name;
  const text = msgs.map(m => (m.role === "user" ? uName : charName) + ": " + m.content).join("\n");
  const avoid = Array.isArray(opts.existing) && opts.existing.length
    ? "\n\n【这些事实已经记过了，别再抽取——同一件事换个说法也算重复，一律跳过】\n" + opts.existing.slice(0, 40).map(t => "· " + String(t).replace(/\s+/g, " ").slice(0, 60)).join("\n")
    : "";
  const system = "你是记忆整理助手。下面是「" + uName + "」（用户）和「" + charName + "」（角色）的对话。抽取值得长期记住的关键事实：约定、偏好、身份/背景、重要事件、情感承诺、未完成的事。\n" +
    "【每条怎么写】\n" +
    "· 一句话、具体可复用；**每条开头必须点明这条是关于谁的**，用真名写清主语：关于用户「" + uName + "」的、关于角色「" + charName + "」自己的、还是关于「他俩之间」的。例：『" + uName + " 下周要去比赛』『" + charName + " 小时候在乡下长大』『" + uName + " 和 " + charName + " 约好周末见面』。\n" +
    "· **绝对不许张冠李戴**：用户的经历/喜好/身份/计划，就记在用户「" + uName + "」名下，【不要写成角色自己的】；角色的就记在「" + charName + "」名下。分不清是谁的就别记这条。\n" +
    "· 同一件事【只记一条】，别把一件事拆成好几条重复的；忽略寒暄和没信息量的闲聊。为每条配 1~3 个中文标签。" + avoid + "\n" +
    "· 每条再标注情绪与状态：**v**=这件事的情绪愉悦度（整数 -5~5，负=难过/生气/难堪/委屈，0=中性事实，正=开心/温暖/心动）；**a**=情绪强度（整数 0~5，0=平淡的事实，5=强烈动情/激烈冲突/刻骨铭心）；**open**=是不是【还没了结的开环】（true=没兑现的约定/没和好的争执/悬着的心事/在等的结果这类还惦记着、还没画句号的；false=已了结的、或本来就是静态事实/偏好/背景）。\n" +
    "【输出】只输出合法 JSON 数组，无 markdown：\n[{\"text\":\"一句话事实（开头带主语真名）\",\"tags\":[\"标签1\"],\"v\":0,\"a\":1,\"open\":false}]\n没有值得记的、或全都已记过，就输出 []。";
  const raw = await callAI(p, system, [{ role: "user", content: "【对话】\n" + text }], { maxTokens: 3500 });
  const parsed = extractJSON(raw);
  return Array.isArray(parsed) ? parsed.filter(x => x && x.text) : [];
}
// 把一整团旧「长期记忆总结」拆成一条条离散事实（导入记忆库用）——同样强制主语真名、别张冠李戴
async function splitMemoryToEntries(p, ctx, blob) {
  const uName = (ctx.profile && ctx.profile.name) || "用户";
  const charName = ctx.char.name;
  const system = "下面是「" + charName + "」积累下来的一整段长期记忆。把它【拆成一条条独立、可长期检索的事实】。\n" +
    "· 每条一句话、具体；**开头用真名点明主语**（关于用户「" + uName + "」的 / 关于角色「" + charName + "」自己的 / 关于他俩之间的），别把用户的事写成角色自己的。\n" +
    "· 同一件事只留一条，别拆重复。为每条配 1~3 个中文标签。\n" +
    "【输出】只输出合法 JSON 数组：[{\"text\":\"一句话事实（带主语真名）\",\"tags\":[\"标签\"]}]，没有可拆的就 []。";
  const raw = await callAI(p, system, [{ role: "user", content: "【长期记忆】\n" + String(blob).slice(0, 8000) }], { maxTokens: 4000 });
  const parsed = extractJSON(raw);
  return Array.isArray(parsed) ? parsed.filter(x => x && x.text) : [];
}
// ============================================================
// 思维链 COT（全局通用）——线下 / 同人文 / 梦境共用一套「落笔前先想」
// 存 localStorage x_cot_config（x_ 前缀自动云同步）：{enabled, think, presets:[{name,think}]}
// 启用且思考方式非空时：给 system 追加思考步骤 + 在输出 JSON 最前面塞一个 cot 字段
// （思考不进正文，只随消息存一份，供「看TA怎么想的」展开查看）
// ============================================================
function loadCotConfig() {
  try {
    const c = JSON.parse(localStorage.getItem("x_cot_config") || "null");
    if (c && typeof c === "object") return { enabled: !!c.enabled, think: c.think || "", presets: Array.isArray(c.presets) ? c.presets : [] };
  } catch (e) {}
  return { enabled: false, think: "", presets: [] };
}
function saveCotConfig(c) {
  const clean = { enabled: !!(c && c.enabled), think: (c && c.think) || "", presets: (c && Array.isArray(c.presets)) ? c.presets : [] };
  try { localStorage.setItem("x_cot_config", JSON.stringify(clean)); } catch (e) {}
  return clean;
}
// 解析出本次要用的思考方式文本（禁用/留空 → ""）；names: {char, user}
function cotThink(names) {
  const c = loadCotConfig();
  if (!c.enabled || !c.think || !c.think.trim()) return "";
  const charN = (names && names.char) || "角色";
  const userN = (names && names.user) || "用户";
  return c.think.replace(/\{\{char\}\}/g, charN).replace(/\{\{user\}\}/g, userN).trim();
}
// 给 system 追加的「落笔前先想」指令（think 为空 → ""）
// 用分隔标记而非 JSON 字段——思考写在正文 JSON 之前、用【思考开始】…【思考结束】包住，
// 代码再把这段抠出来当 cot、并从原文里剥掉，这样即使模型思考跑格式也不会污染正文 JSON。
function cotSystemBlock(think) {
  if (!think) return "";
  return "\n\n【落笔前先想 · 思维链（每一轮都必做，格式很重要）】在输出正文之前，先按下面这套思考步骤想一遍，把思考【原样写在最前面】，用『【思考开始】』和『【思考结束】』两个标记把它整段包住（纯文本、可用『·』分行；写给创作者看、绝不进正文、不改变正文口吻）；写完『【思考结束】』后，紧接着再照常输出下面要求的那个正文 JSON。\n思考步骤：\n" + think + "\n硬性要求：① 每一轮都要写这段【思考开始】…【思考结束】，别因为历史里看不到就省略（历史只留了正文，思考被系统收走了）。② 思考简洁要点即可，别把正文提前写进思考。③ 下文若说『只输出 JSON』，指的是标记之后的正文部分——你仍要先写思考标记块、再写那个 JSON，除此之外不要别的话。";
}
// 旧的 JSON 字段方案已弃用：现在思考走标记块、不进 JSON。保留函数签名，恒返回 ""（各处模板不用改）。
function cotJsonField() { return ""; }
// 从模型原始输出里抠出【思考开始】…【思考结束】之间的思考（无 → null）
function extractCotPrefix(raw) {
  if (!raw) return null;
  const s = String(raw);
  let m = s.match(/【思考开始】([\s\S]*?)【思考结束】/);
  if (m && m[1].trim()) return m[1].trim();
  // 未闭合兜底：【思考开始】到第一个 JSON 起始
  m = s.match(/【思考开始】([\s\S]*?)(?=[\[{])/);
  if (m && m[1].trim()) return m[1].trim();
  return null;
}
// 从原始输出里剥掉思考标记块，剩下的交给 extractJSON（避免思考污染正文解析）
function stripCotBlock(raw) {
  let s = String(raw || "");
  s = s.replace(/【思考开始】[\s\S]*?【思考结束】/g, "");
  s = s.replace(/【思考开始】[\s\S]*?(?=[\[{])/g, ""); // 未闭合兜底
  s = s.replace(/【思考开始】|【思考结束】/g, "");
  return s;
}
// 一步到位：给定 raw + 是否启用 cot，返回 { cot, clean }（clean = 剥掉思考后用于 extractJSON 的文本）
function splitCot(raw, on) {
  if (!on) return { cot: null, clean: raw };
  return { cot: extractCotPrefix(raw), clean: stripCotBlock(raw) };
}
// ============================================================
// 图像 API（角色发自拍）—— 只生成自拍，不做别的图
// 配置存 localStorage x_imgApi（不含大图，可云同步）；生成的图存 IndexedDB(x_selfies) 不进云
// OpenAI 兼容：有参考照走 /v1/images/edits(保长相)，否则 /v1/images/generations
// ============================================================
function loadImgApi() {
  try { const c = JSON.parse(localStorage.getItem("x_imgApi") || "null"); if (c && typeof c === "object") return Object.assign({ baseUrl: "", apiKey: "", model: "gpt-image-1", size: "1024x1536", quality: "medium", enabled: false }, c); } catch (e) {}
  return { baseUrl: "", apiKey: "", model: "gpt-image-1", size: "1024x1536", quality: "medium", enabled: false };
}
function saveImgApi(c) { const clean = Object.assign(loadImgApi(), c || {}); try { localStorage.setItem("x_imgApi", JSON.stringify(clean)); } catch (e) {} return clean; }
function imgApiReady(a) { a = a || loadImgApi(); return !!(a.enabled && a.baseUrl && a.apiKey); }
// base64(dataURL 或纯 b64) → Blob
function b64ToBlob(b64, mime) {
  const s = String(b64).includes(",") ? String(b64).split(",")[1] : String(b64);
  const bin = atob(s); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "image/png" });
}
// ---- 自拍图存 IndexedDB（base64 大图不能进 localStorage/云同步）----
function idbImgOpen() { return new Promise((res, rej) => { const r = indexedDB.open("x_selfies", 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("img")) r.result.createObjectStore("img"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbImgPut(k, blob) { const db = await idbImgOpen(); return new Promise((res, rej) => { const tx = db.transaction("img", "readwrite"); tx.objectStore("img").put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbImgGet(k) { const db = await idbImgOpen(); return new Promise((res, rej) => { const tx = db.transaction("img", "readonly"); const rq = tx.objectStore("img").get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
async function idbImgDel(k) { const db = await idbImgOpen(); return new Promise(res => { const tx = db.transaction("img", "readwrite"); tx.objectStore("img").delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
// 拼自拍的图像 prompt（外貌 + 此刻穿着/情境/神情）
function buildSelfiePrompt(char, sceneDesc, st) {
  const parts = ["一张真实的手机自拍照（第一人称自拍视角 selfie，手臂伸出去拍的构图）。"];
  parts.push("照片里的人：" + (char.name || "一个人") + "。");
  if (char.appearance && char.appearance.trim()) parts.push("外貌特征（务必贴合）：" + char.appearance.trim() + "。");
  if (st && st.wearing) parts.push("此刻穿着：" + st.wearing + "。");
  if (sceneDesc && String(sceneDesc).trim()) parts.push("此刻的场景/在做什么：" + String(sceneDesc).trim() + "。");
  if (st && st.mood) parts.push("神情情绪：" + st.mood + "。");
  parts.push("【必须是能看到人脸的自拍】TA 的脸要清楚出现在画面里（正脸或半侧脸，五官清晰可辨、对着镜头），这是一张自拍人像，不是纯风景/纯物品照——就算在描述某个场景，也要把 TA 本人带脸拍进去。");
  parts.push("前置摄像头随手拍的生活质感、自然光、真实不摆拍，画面里只有 TA 一个人，不要任何文字/水印/logo/相框。");
  return parts.join("");
}
// 生成一张自拍，返回 { blob, dataUrl }。refPhoto 有值→images/edits 保长相；否则 images/generations
async function generateSelfieImage(prompt, refPhotoDataUrl, opts) {
  const a = loadImgApi();
  if (!imgApiReady(a)) throw new Error("没配置图像 API");
  const base = (a.baseUrl || "").replace(/\/$/, "");
  const root = base.endsWith("/v1") ? base : base + "/v1";
  const size = (opts && opts.size) || a.size || "1024x1536";
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 180000);
  let r;
  try {
    if (refPhotoDataUrl) {
      const fd = new FormData();
      fd.append("model", a.model || "gpt-image-1");
      fd.append("prompt", prompt);
      fd.append("size", size);
      fd.append("n", "1");
      if (a.quality) fd.append("quality", a.quality);
      fd.append("image", b64ToBlob(refPhotoDataUrl, "image/png"), "ref.png");
      r = await fetch(root + "/images/edits", { method: "POST", headers: { Authorization: "Bearer " + a.apiKey }, body: fd, signal: ctrl.signal });
    } else {
      const body = { model: a.model || "gpt-image-1", prompt, size, n: 1 };
      if (a.quality) body.quality = a.quality;
      r = await fetch(root + "/images/generations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.apiKey }, body: JSON.stringify(body), signal: ctrl.signal });
    }
  } finally { clearTimeout(to); }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "图像生成失败");
  const item = d.data && d.data[0];
  if (!item) throw new Error("图像返回为空");
  if (item.b64_json) return { blob: b64ToBlob(item.b64_json, "image/png"), dataUrl: "data:image/png;base64," + item.b64_json };
  if (item.url) { const resp = await fetch(item.url); const blob = await resp.blob(); return { blob, dataUrl: null }; }
  throw new Error("图像返回格式不认识");
}
// ============================================================
// 线下模式（offline / 赴约）—— 面对面叙事，带动作/心理/旁白 + 心声
// ============================================================
const OFFLINE_STYLES = [
  { key: "default", name: "默认", prompt: "" },
  { key: "film", name: "电影感", prompt: "用电影镜头语言推进：光影、环境音、感官特写与恰到好处的留白，画面有呼吸感。" },
  { key: "tender", name: "细腻抒情", prompt: "心理描写丰富细腻，情绪层次分明，笔触温柔克制，注重感受的流动。" },
  { key: "plain", name: "冷静白描", prompt: "冷静简洁的白描，少形容词，靠动作与对话推进，克制不煽情。" },
  { key: "sweet", name: "暧昧甜宠", prompt: "氛围暧昧亲密，多细节拉扯与心动瞬间，甜而不腻。" },
  { key: "drama", name: "张力戏剧", prompt: "情绪张力强，冲突与转折鲜明，台词带锋芒，节奏起伏。" }
];
function offlineStyleText(key) {
  const s = OFFLINE_STYLES.find(x => x.key === key);
  return s ? s.prompt : "";
}
// 把线下 msgs 映射成 API 的对话（narration/user 归 user，char 归 assistant，合并连发）
function offlineHistory(msgs, userName, charName) {
  const g = [];
  (msgs || []).forEach(m => {
    if (m.kind === "ooc") return; // OOC 不进角色扮演上下文
    if (m.role === "char") {
      const l = g[g.length - 1];
      const c = m.content || "";
      if (l && l.role === "assistant") l.content += "\n" + c; else g.push({ role: "assistant", content: c });
    } else {
      const c = m.role === "narration" ? "【场景设定】" + (m.content || "") : (m.content || "");
      const l = g[g.length - 1];
      if (l && l.role === "user") l.content += "\n" + c; else g.push({ role: "user", content: c });
    }
  });
  return g;
}
async function generateOffline(p, ctx, session) {
  const char = ctx.char;
  const userName = (ctx.profile && ctx.profile.name) || "用户";
  const styleText = session.stylePrompt != null ? session.stylePrompt : offlineStyleText(session.styleKey);
  const notes = (session.customNotes || []).filter(Boolean);
  const cotT = cotThink({ char: char.name, user: userName });
  const system = buildBundle(ctx) +
    "\n\n" + NARRATIVE_ANTI_CLICHE +
    "\n\n" + INTIMATE_ANTI_CLICHE +
    cotSystemBlock(cotT) +
    "\n\n【当前场景：线下面对面】你和" + userName + "此刻身处同一个地方，面对面相处（不是隔着手机聊天）。用第一人称『我』完全代入「" + char.name + "」，称对方为『你』。把这一刻演绎成有画面感的叙事：融合【动作描写】【神态与心理描写】【环境旁白】与【对话】，写成一小段（约2到6句）。对话用引号包住。自然推进、不出戏、不提前跳到未发生的剧情。" +
    (ctx.timeAware !== false ? "\n【时间感】你清楚现在的真实时间（见上文），让当下的时段自然渗进场景——天色光线、周围的动静、店家开没开、你此刻该困该饿还是精神，都照这个钟走；别报时刻表，也别把深夜写成白天。" : "") +
    (styleText ? "\n【文风要求】" + styleText : "") +
    narrativeDirective(session.narr) +
    (session.minWords ? "\n【篇幅要求】scene 正文至少写约 " + session.minWords + " 字，充分展开描写，别写得太短。" : "") +
    (notes.length ? "\n【临时导演提示（务必遵循）】" + notes.join("；") : "") +
    (ctx.curWear ? "\n【着装连贯】你现在穿着：" + ctx.curWear + "。除非场景变了、过了很久、或你明确换/脱了衣服，否则 wearing 保持这套；一旦场景真的换了（如从外面进了家、下了雨淋湿、换了衣服）就据实更新。" : "") +
    "\n【输出】只输出一个 JSON，不要代码块：\n{" + cotJsonField(cotT) + "\"scene\":\"这一刻的叙事正文（含动作/心理/旁白/对话）\",\"thought\":\"角色此刻没说出口的真实心声（一句；情绪复杂时可稍长）\",\"mood\":{\"label\":\"此刻心情词\"},\"wearing\":\"你此刻的穿着一句（随场景/剧情如实变化，别每段乱换）\",\"action\":\"你此刻正在做的动作一句（贴合这一段场景、【每段都据实更新】、别照抄上一段）\",\"affinityDelta\":整数(-5到5，这次面对面相处让你对对方的好感如何变化：亲近/被打动/被冒犯/失望，通常小幅，没什么波动就0)}";
  const hist = offlineHistory(session.msgs, userName, char.name);
  const raw = await callAI(p, system, hist, { maxTokens: session.maxTokens || 1400 });
  const sp = splitCot(raw, !!cotT);
  const parsed = extractJSON(sp.clean) || { scene: sp.clean };
  const cln = v => v && String(v).toLowerCase() !== "null" ? String(v).trim() : null;
  return {
    scene: String(parsed.scene || sp.clean || "").trim(),
    cot: sp.cot,
    thought: cln(parsed.thought),
    mood: parsed.mood && parsed.mood.label ? parsed.mood : null,
    wearing: cln(parsed.wearing),
    action: cln(parsed.action),
    affinityDelta: typeof parsed.affinityDelta === "number" ? parsed.affinityDelta : 0
  };
}
// 结束线下时把整段浓缩成一条记忆（第三人称，供存入记忆库）
async function summarizeOffline(p, ctx, session) {
  const userName = (ctx.profile && ctx.profile.name) || "用户";
  const text = (session.msgs || []).map(m => {
    if (m.role === "char") return ctx.char.name + "：" + (m.content || "");
    if (m.role === "narration") return "【场景】" + (m.content || "");
    return userName + "：" + (m.content || "");
  }).join("\n");
  const system = "把下面这段『" + userName + "』与『" + ctx.char.name + "』的线下相处，浓缩成1~3句第三人称记忆：他们在哪、一起做了什么、关键互动或情绪转折、达成的约定。具体、可复用。只输出正文，不要多余解释。";
  return (await callAI(p, system, [{ role: "user", content: "【线下经过】\n" + text }], { maxTokens: 3000 })).trim();
}
// ------- 群聊线下模式（多角色同处一地的面对面叙事）-------
// 把群聊线下 msgs 映射成 API 对话：char beat 归 assistant（带发言人名），narration/user 归 user，合并连发
function offlineGroupHistory(msgs, userName) {
  const g = [];
  (msgs || []).forEach(m => {
    if (m.kind === "ooc") return; // OOC 不进角色扮演上下文
    if (m.role === "char") {
      const c = (m.senderName ? m.senderName + "：" : "") + (m.content || "");
      const l = g[g.length - 1];
      if (l && l.role === "assistant") l.content += "\n" + c; else g.push({ role: "assistant", content: c });
    } else {
      const c = m.role === "narration" ? "【场景设定】" + (m.content || "") : userName + "：" + (m.content || "");
      const l = g[g.length - 1];
      if (l && l.role === "user") l.content += "\n" + c; else g.push({ role: "user", content: c });
    }
  });
  return g;
}
// ctx: { members:[char..], profile, rels, chars, worldbook, memLib }
async function generateOfflineGroup(p, ctx, session) {
  const members = ctx.members || [];
  const userName = (ctx.profile && ctx.profile.name) || "用户";
  const styleText = session.stylePrompt != null ? session.stylePrompt : offlineStyleText(session.styleKey);
  const notes = (session.customNotes || []).filter(Boolean);
  const cotT = cotThink({ char: members.map(c => c.name).join("、") || "在场角色", user: userName });
  const memberDesc = members.map(c => "【" + c.name + "】" + (c.persona || "（暂无设定）").slice(0, 260)).join("\n\n");
  const relLines = members.map(c => directedRelationLines(c, ctx.rels, ctx.chars, ctx.profile)).join("\n");
  const memLibText = Array.isArray(ctx.memLib) ? formatMemLib(ctx.memLib) : (ctx.memLib || "");
  const now = new Date();
  // 时间感知（跟随全局开关）：给出真实时间；在场角色若各设了时区，附上各自当地时刻
  let timeBlock = "";
  if (ctx.timeAware !== false) {
    timeBlock = "\n\n【当前真实时间】" + now.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" });
    const tzLines = members.map(c => {
      if (c.tz === undefined || c.tz === null || String(c.tz).trim() === "") return "";
      const off = parseFloat(c.tz); if (isNaN(off)) return "";
      const local = new Date(now.getTime() + off * 3600000);
      return "· " + c.name + "（UTC" + (off >= 0 ? "+" + off : off) + "）当地约 " + local.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    }).filter(Boolean);
    if (tzLines.length) timeBlock += "\n（在场有人处在别的时区，各自按自己那边的钟和作息想事情、说话）\n" + tzLines.join("\n");
    timeBlock += "\n让当下的时段自然渗进场景（天色、周围动静、各人此刻的状态），别报时刻表。";
  }
  const system =
    ANTI_CLICHE +
    "\n\n" + INTIMATE_ANTI_CLICHE +
    "\n\n" + NARRATIVE_ANTI_CLICHE +
    (ctx.worldbook && ctx.worldbook.trim() ? "\n\n" + WORLDBOOK_RULE : "") +
    "\n\n" + CHARCARD_RULE +
    timeBlock +
    "\n\n【在场角色】\n" + memberDesc +
    (ctx.profile && (ctx.profile.name || ctx.profile.persona) ? "\n\n【用户「" + userName + "」的设定】\n" + (ctx.profile.persona || "（未填写）") : "") +
    "\n\n【在场角色间的关系（有方向）】\n" + relLines +
    (ctx.worldbook && ctx.worldbook.trim() ? "\n\n【世界书】\n" + ctx.worldbook.trim() : "") +
    (memLibText && memLibText.trim() ? "\n\n【记忆库·相关条目（请自然记住并保持一致）】\n" + memLibText.trim() : "") +
    "\n\n【当前场景：线下面对面 · 多人同处】用户和上述角色此刻身处同一个地方，面对面相处（不是隔着手机的群聊）。以沉浸的第三人称叙事推进这一刻：融合【动作描写】【神态与心理】【环境旁白】与【对话】。多个角色会自然地行动、开口、互相接话、跑题调侃或起冲突，像真实的多人相处那样，不是轮流回答用户。称用户为『你』。对话用引号包住。自然推进、不出戏、不提前跳到未发生的剧情。" +
    (styleText ? "\n【文风要求】" + styleText : "") +
    narrativeDirective(session.narr) +
    (session.minWords ? "\n【篇幅要求】每个 beat 的 scene 都充分展开，整段总字数至少约 " + session.minWords + " 字，别写太短。" : "") +
    (notes.length ? "\n【临时导演提示（务必遵循）】" + notes.join("；") : "") +
    cotSystemBlock(cotT) +
    "\n【输出】只输出一个 JSON，不要代码块：\n{" + cotJsonField(cotT) + "\"beats\":[{\"name\":\"这一段里行动或说话的角色名；纯环境旁白填『旁白』\",\"scene\":\"这一段叙事正文（第三人称，含动作/神态/对话）\",\"thought\":\"（仅角色 beat，可选）该角色此刻没说出口的真实心声\",\"mood\":{\"label\":\"此刻心情词\"},\"affinityDelta\":\"（仅角色 beat）整数-5到5，这段相处让该角色对用户的好感如何变化，通常小幅、没波动就0\"}]}\n一次产出 2~5 个 beat，让在场角色轮流有戏、互相有来有往；name 必须是在场角色之一或『旁白』。";
  const hist = offlineGroupHistory(session.msgs, userName);
  const raw = await callAI(p, system, hist, { maxTokens: session.maxTokens || 1900 });
  const sp = splitCot(raw, !!cotT);
  const parsed = extractJSON(sp.clean);
  let beats = parsed && Array.isArray(parsed.beats) ? parsed.beats : (Array.isArray(parsed) ? parsed : null);
  if (!beats) beats = [{ name: "旁白", scene: String(sp.clean || raw || "").trim() }];
  const out = beats.map(b => {
    const nm = String(b.name || "").trim();
    const isNarr = !nm || nm === "旁白" || nm === "narration" || nm === "__narration";
    const spk = isNarr ? null : (members.find(c => c.name === nm) || null);
    return {
      role: spk ? "char" : "narration",
      senderId: spk ? spk.id : null,
      senderName: spk ? spk.name : null,
      scene: String(b.scene || "").trim(),
      thought: !isNarr && b.thought && String(b.thought).toLowerCase() !== "null" ? String(b.thought).trim() : null,
      mood: !isNarr && b.mood && b.mood.label ? b.mood : null,
      affinityDelta: !isNarr && typeof b.affinityDelta === "number" ? b.affinityDelta : 0
    };
  }).filter(b => b.scene);
  // 群聊线下：整批只想一次，把这次思考挂在第一个 beat 上（供「看TA怎么想的」展开）
  if (out.length && sp.cot) out[0].cot = sp.cot;
  return out;
}
async function summarizeOfflineGroup(p, ctx, session) {
  const userName = (ctx.profile && ctx.profile.name) || "用户";
  const names = (ctx.members || []).map(c => c.name).join("、");
  const text = (session.msgs || []).filter(m => m.kind !== "ooc").map(m => {
    if (m.role === "char") return (m.senderName || "某人") + "：" + (m.content || "");
    if (m.role === "narration") return "【场景】" + (m.content || "");
    return userName + "：" + (m.content || "");
  }).join("\n");
  const system = "把下面『" + userName + "』与" + names + "的这段线下相处，浓缩成1~3句第三人称记忆：他们在哪、一起做了什么、谁和谁有关键互动或情绪转折、达成的约定。具体、可复用。只输出正文，不要多余解释。";
  return (await callAI(p, system, [{ role: "user", content: "【线下经过】\n" + text }], { maxTokens: 3000 })).trim();
}
// 生成一段静音 WAV 的 data URI（用于后台保活：循环播放占住 iOS 音频会话）
function makeSilentWav(seconds) {
  seconds = seconds || 1;
  const rate = 8000, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 128 = 8bit 无声
  let bin = ""; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return "data:audio/wav;base64," + btoa(bin);
}
const SILENT_WAV = typeof btoa !== "undefined" ? makeSilentWav(1) : "";
// 一起听里的一首特殊「静音保活」曲目：像歌一样能点播/暂停，放的是一段较长的静音音频、循环不停，
// 目的是占住 iOS 音频会话让 App 后台醒着（撑住「主动发消息」的计时器）；不写历史、不进队列、不喂给角色。
const KEEPALIVE_ID = "__keepalive__";
const KEEPALIVE_WAV = typeof btoa !== "undefined" ? makeSilentWav(30) : "";
const KEEPALIVE_SONG = { id: KEEPALIVE_ID, source: "keepalive", title: "静音保活", artist: "让手机后台醒着 · 无声", cover: null };
// 紧凑时间戳（给群聊/记忆互通标时间，让模型理解消息的真实先后顺序）
function fmtStamp(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
}
// 两个时间点之间的间隔口语（给群聊插时间断点用）
function gapPhrase(ms) {
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + " 分钟";
  if (h < 24) return Math.round(h) + " 小时";
  return Math.round(h / 24) + " 天";
}
// 解析生日/月-日字符串 → {mo,d}；容「3-15 / 1998-3-15(年忽略) / 3月15日 / 3/15」，非法返回 null
function parseMonthDay(s) {
  const m = String(s || "").match(/(?:\d{4}[-/.年])?\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return null;
  const mo = +m[1], d = +m[2];
  return (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? { mo: mo, d: d } : null;
}
// 常见公历固定节日（月-日 → 名字）；农历(春节/中秋/端午)要额外算，暂不含
const FIXED_FESTIVALS = {
  "1-1": "元旦", "2-14": "情人节", "3-8": "妇女节", "4-1": "愚人节",
  "5-1": "劳动节", "6-1": "儿童节", "10-31": "万圣夜", "11-11": "光棍节",
  "12-24": "平安夜", "12-25": "圣诞节", "12-31": "跨年夜"
};
// OOC：跳出角色，直接和模型对话（调整/问状态/问剧情）
async function oocAsk(p, ctx, question) {
  const existing = (ctx.directives || []).map(d => (typeof d === "string" ? d : d && d.text) || "").filter(s => s.trim());
  const system = "你现在跳出角色扮演，作为幕后的 AI 助手，用简体中文直接回答用户（OOC，越过角色本身）。你了解当前角色的人设、关系、此刻心情与剧情背景。\n\n用户这句 OOC 通常是两类之一：\n(A) 问角色此刻为什么这样 / 状态动机心理 / 剧情走向——就基于【角色人设 + 上文给你的此刻心情、好感度、近期对话】冷静分析讲给 Ta 听，别扮演。\n(B) 要求你调整角色接下来的说话或行为方式（想立一条长期规矩，如「以后对我别这么客气」「多主动关心我」）——你要判断这条要求和角色核心人设是否冲突：\n   · 合理（人设范围内做得到）：在 reply 里简短确认会照做，并把这条要求凝练成【一句、祈使句、对角色说的长期准则】填进 directive（例：『对用户更随意亲近，少用敬语』）。\n   · 会严重崩人设、把角色变成另一个人：refused 填 true，directive 填 null，在 reply 里解释为什么这条你没法照做、它会怎样破坏这个角色，并可提议一个不崩人设的折中。\n若只是 A 类提问，directive 一律 null、refused 一律 false。" + (existing.length ? "\n\n【当前已生效的用户准则】\n" + existing.map((s, i) => (i + 1) + ". " + s).join("\n") + "\n（若用户这次是要取消/修改其中某条，也在 reply 里说明，directive 可填修正后的新表述）" : "") + "\n\n" + buildBundle(ctx, { ooc: true }) + "\n\n【输出】只输出一个 JSON，不要代码块：\n{\"reply\":\"给用户看的话（简洁直接）\",\"directive\":\"要新增/更新的一句长期准则，或 null\",\"refused\":false}";
  // 放宽 token：gemini 等思考型模型思考也吃额度，900 太紧会把 reply(尤其A类分析)截在半句、或塞不完 JSON（输出免费）
  const raw = await callAI(p, system, [{ role: "user", content: question }], { maxTokens: 6000 });
  const parsed = extractJSON(raw);
  if (parsed && typeof parsed.reply === "string") {
    return { reply: parsed.reply.trim(), directive: (parsed.directive && String(parsed.directive).trim()) || null, refused: !!parsed.refused };
  }
  // 兜底：解析失败当作纯文本回复，不动准则
  return { reply: String(raw || "").trim(), directive: null, refused: false };
}
// OOC（群聊 / 群聊线下）：跳出所有角色，直接和模型对话
async function oocAskGroup(p, ctx, question) {
  const members = ctx.members || [];
  const userName = (ctx.profile && ctx.profile.name) || "用户";
  const memberDesc = members.map(c => "【" + c.name + "】" + (c.persona || "（暂无设定）").slice(0, 220)).join("\n\n");
  const relLines = members.map(c => directedRelationLines(c, ctx.rels, ctx.chars, ctx.profile)).join("\n");
  const existing = (ctx.directives || []).map(d => (typeof d === "string" ? d : d && d.text) || "").filter(s => s.trim());
  const system = "你现在跳出角色扮演，作为幕后的 AI 助手，用简体中文直接回答用户（OOC，越过群里所有角色）。你了解这个群里每个角色的人设、彼此关系与当前对话进展。语气是助手而非角色，简洁直接、不扮演。\n\n用户这句 OOC 通常是两类之一：\n(A) 问某角色/群里此刻的状态动机心理、关系张力、剧情走向——冷静说明。\n(B) 要求你调整接下来这些角色的演绎方式，或立一条【群里的长期规矩】（如「别再纠结那锅牛腩了」「都对我随和点」「少斗嘴」）——在 reply 里简短确认会照做，并把它凝练成【一句、祈使句、对全群成员今后都生效的长期准则】填进 directive（例：『别再揪着买牛腩这件事、翻篇往前聊』）。若这条会严重崩掉某个角色的核心人设，refused 填 true、directive 填 null，并在 reply 里说明。只是 A 类提问就 directive 一律 null、refused 一律 false。\n\n【群成员】\n" + memberDesc + "\n\n【成员间关系】\n" + relLines + (ctx.worldbook && ctx.worldbook.trim() ? "\n\n【世界书】\n" + ctx.worldbook.trim() : "") + (ctx.historyText && ctx.historyText.trim() ? "\n\n【近期对话】\n" + ctx.historyText.trim() : "") + (existing.length ? "\n\n【当前群里已生效的准则】\n" + existing.map((s, i) => (i + 1) + ". " + s).join("\n") + "\n（若用户这次要取消/修改其中某条，也在 reply 说明，directive 可填修正后的新表述）" : "") + "\n\n【输出】只输出一个 JSON，不要代码块：\n{\"reply\":\"给用户看的话（简洁直接）\",\"directive\":\"要新增/更新的一句群规矩，或 null\",\"refused\":false}";
  const raw = await callAI(p, system, [{ role: "user", content: question }], { maxTokens: 6000 });
  const parsed = extractJSON(raw);
  if (parsed && typeof parsed.reply === "string") return { reply: parsed.reply.trim(), directive: (parsed.directive && String(parsed.directive).trim()) || null, refused: !!parsed.refused };
  return { reply: String(raw || "").trim(), directive: null, refused: false };
}
async function runProbe(p, ctx, probe) {
  const system = "你是角色状态推演引擎。不要扮演角色对话，而是基于背景冷静推演，严格输出 JSON。\n\n" + buildBundle(ctx) + "\n\n【推演任务】\n" + probe.instruction + "\n\n【输出】只输出合法 JSON，无 markdown 无多余文字：\n" + probe.schemaHint;
  const raw = await callAI(p, system, [{
    role: "user",
    content: "开始。"
  }], {
    maxTokens: probe.maxTokens || 2600
  });
  const parsed = extractJSON(raw);
  if (!parsed) throw new Error("解析失败：" + String(raw || "").replace(/\s+/g, " ").trim().slice(0, 90));
  return parsed;
}
// ============================================================
// 日记生成（Diary）——第一人称私密手账，固定文风骨架 + 角色专属文风
// ctx 由 ctxFor(char) 提供；opts.scheduleText 传今天行程（可空）
// ============================================================
const DIARY_SKELETON = [
"你在以第一人称写这本私人日记。这是只给自己看、不打算给任何人读的手账。",
"",
"【怎么写】",
"- 就写成一篇真实的日记：第一人称，用【你自己（这个角色）的口吻、性格和此刻的心情】去 reflect 今天这一天——今天做了什么、碰到了什么、心里怎么想、什么让你在意或难受或开心。",
"- 文风【完全由你的人设自然决定，别套统一模板、别写成千篇一律的同一种腔调】：活泼的人写得跳脱随意，沉静的人克制内敛，毒舌的人刻薄，累坏的人潦草敷衍——每个角色的日记读起来都该明显不一样。",
"- 不必刻意华丽堆意象，也不必刻意写得琐碎文艺；有话则长、没话则短，像真的手写日记，不是命题作文。篇幅随内容，大约 3~7 段。",
"- 结尾顺其自然收在你想收的地方就行，**别硬套「不写了，手酸／去看番」这类固定收尾套路**，也别升华、别总结陈词、别每篇都用同一个模式结束。",
"- 这是在写字、不是在演戏：**全篇不要用括号写动作或神态**（如「（揉了揉眼睛）」「（笑）」），日记里只有你亲手写下的字，没有旁白动作。",
"- 只写这一天、写到今晚为止的真实处境，不要提前透露还没发生的剧情。",
"",
"【标题】起一个英文斜体标题（意象化、克制，如 \"Lemon Yellow and Grey Blue\"）＋一个对应的中文副标题（如「柠檬黄与灰蓝」）。",
"",
"【心里话 / secret】把最私密的真心话拆成【单独的短段】藏起来——每个 secret 段【只写一句话】（你不会对任何人说的那部分：对某人的在意、恐惧、私藏执念、说不出口的软肋），把这种一句话的短段 secret 设成 true。全篇有 1~3 个这样的一句话 secret 段就够，其余正常段落 secret 一律 false。**绝对不要把一大段都设成 secret**，被藏起来的每段最多一句。",
"",
"【签名 signature】给一个【独立的】底部落款放进 signature 字段：短、像随手签的名或暗号（一个只有自己懂的代号、一句日期感短语、一个昵称或缩写）。**它必须和正文不同，不要重复正文里已经写过的句子或最后一个词**——是署名，不是正文的延续。",
"",
"【位置 location】写这篇时你所在的地方，可以是城市（如 SHANGHAI, CN）也可以是具体场所（如「家里」「工作室」「公司」）。若给了今天的行程，按此刻你会在哪来判断。coords：写城市时给一串经纬度（如 31.230°N, 121.473°E），写具体场所时填 null。weather：给一个简短的天气＋温度（如 OVERCAST 28°C）。"
].join("\n");
async function generateDiary(p, ctx, opts = {}) {
  const char = ctx.char;
  const parts = [DIARY_SKELETON, "", buildBundle(ctx)];
  if (char.diaryStyle && char.diaryStyle.trim()) {
    parts.push("【这个角色专属的日记文风偏好（最高优先，凌驾于上面的通用调性之上）】\n" + char.diaryStyle.trim());
  }
  // retro=写【昨天】：那天已经过完，是第二天回顾着写，绝不能以未来视角把还没过的今天写掉
  const retro = !!opts.dateStr;
  if (opts.scheduleText && opts.scheduleText.trim()) {
    parts.push("【今天的行程（用来回顾你这天在哪、做了什么、经历了什么）】\n" + opts.scheduleText.trim());
  }
  if (ctx.moodLabel) parts.push("【此刻心情】" + ctx.moodLabel);
  if (retro) parts.push("【现在是这一天的晚上，睡前：" + opts.dateStr + "】你刚把这一整天过完，正坐下来写【今天】的日记。\n" +
    "· **用「今天」称呼这一天**（今天早上／今天下午／今晚……），**绝对不要用「昨天」**——对此刻在写日记的你来说，这一天就是今天。\n" +
    "· 从早到晚回顾今天发生的事、心情起伏，因为一天已过完，可以一直写到今晚睡前。\n" +
    "· timeStr 必须填一个【今晚睡前】的时刻（如 22:40 / 23:15），不要填白天或别的时段。\n" +
    "· 只把【最近对话】和【今天的行程】当成今天真实发生的事来写；长期记忆/记忆库只是脑海里的背景连续性，**别把过去的旧事当成今天发生的重新写一遍**。\n" +
    "· 上面近期聊天里若有属于【这一天之后】（更晚）的内容，别写进这篇日记——这是今天的日记，只写到今晚为止。");
  else { const now = new Date(); parts.push("【今天的日期时间】" + now.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" })); }
  // 当天没有聊天素材：别硬编对话/别翻旧账，依据行程写平常的一天
  if (opts.noChatMaterial) parts.push("【今天没有和对方聊天的素材】今天你没怎么和对方聊天——所以【不要编造聊天里发生的对话或事件，也不要翻出前几天的旧事来充数】。就依据【今天的行程】和此刻的心情，写平常、普通的一天：做了什么、去了哪、身体与情绪状态、脑子里闪过什么。平淡真实即可，不必硬凑戏剧性或情绪高潮。");
  // 防止连着两天 reflect 同一件事：把上一篇内容给它当"别重复"参照
  if (opts.prevDiary && opts.prevDiary.trim()) parts.push("【你上一篇日记已经写过的内容（仅供参考，用来避免重复）】\n" + opts.prevDiary.trim() + "\n——今天这篇【不要再重复上面这些事和情绪】，写今天新的、不一样的部分。");
  parts.push("【输出】只输出一个合法 JSON，无 markdown 无多余文字：\n" +
    "{\"titleEn\":\"英文斜体标题\",\"titleZh\":\"中文副标题\",\"location\":\"SHANGHAI, CN 或 家里/工作室 等\",\"coords\":\"经纬度串或 null\",\"weather\":\"OVERCAST 28°C\",\"timeStr\":\"HH:MM 写这篇的时刻\",\"paras\":[{\"text\":\"段落正文\",\"secret\":false}],\"signature\":\"底部签名一句\",\"mood\":\"此刻心情词\"}");
  const system = "你现在完全代入这个角色，用 Ta 的口吻和内心写一篇私人日记。不是旁观推演，是 Ta 亲手写下的。\n\n" + parts.join("\n\n");
  const raw = await callAI(p, system, [{ role: "user", content: retro ? "现在是今晚睡前，把今天这一整天写成一篇日记。" : "开始写今天的日记。" }], { maxTokens: opts.maxTokens || 6000 });
  const parsed = extractJSON(raw);
  if (!parsed || !Array.isArray(parsed.paras)) throw new Error("解析失败，可重试或换模型");
  return parsed;
}
// WMO 天气码 → 简短英文（配合日记元数据卡的编辑感）
function wmoToText(code) {
  const c = Number(code);
  if (c === 0) return "CLEAR";
  if (c === 1 || c === 2) return "PARTLY CLOUDY";
  if (c === 3) return "OVERCAST";
  if (c === 45 || c === 48) return "FOG";
  if (c >= 51 && c <= 57) return "DRIZZLE";
  if (c >= 61 && c <= 67) return "RAIN";
  if (c >= 71 && c <= 77) return "SNOW";
  if (c >= 80 && c <= 82) return "SHOWERS";
  if (c >= 85 && c <= 86) return "SNOW";
  if (c >= 95) return "THUNDERSTORM";
  return "CLOUDY";
}
// 抓本地时间/天气/城市：定位→open-meteo(免key)拿天气→反查城市名。任何一步失败都降级，不抛错。
async function fetchLocalEnv() {
  const out = { weather: "", location: "", coords: null };
  const pos = await new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { timeout: 8000, maximumAge: 600000 });
  });
  if (!pos) return out;
  const lat = pos.coords.latitude, lon = pos.coords.longitude;
  out.coords = Math.abs(lat).toFixed(3) + "°" + (lat >= 0 ? "N" : "S") + ", " + Math.abs(lon).toFixed(3) + "°" + (lon >= 0 ? "E" : "W");
  try {
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`).then(r => r.json());
    if (w && w.current) out.weather = wmoToText(w.current.weather_code) + " " + Math.round(w.current.temperature_2m) + "°C";
  } catch (e) {}
  try {
    const g = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`).then(r => r.json());
    const city = g.city || g.locality || g.principalSubdivision || "";
    out.location = city ? (city + (g.countryCode ? ", " + g.countryCode : "")) : "";
  } catch (e) {}
  return out;
}
// 角色给「用户写的日记」写一条评论：依据当下心情+关系+好感度，不复述、简短、不做互评
async function generateDiaryComment(p, ctx, entryText) {
  const parts = [buildBundle(ctx)];
  if (ctx.moodLabel) parts.push("【你此刻的心情】" + ctx.moodLabel);
  parts.push("【" + (ctx.profile && ctx.profile.name || "用户") + " 刚写下的这篇日记】\n" + entryText);
  const system = "你现在完全代入「" + ctx.char.name + "」。上面是 " + (ctx.profile && ctx.profile.name || "用户") + " 写的私人日记，Ta 给你看了。请以你的口吻写**一条评论**——就像在对方日记/朋友圈底下留言。\n要求：依据你此刻的心情、你和 Ta 的关系与好感度来决定语气（可以心疼/调侃/吃醋/欲言又止/敷衍，符合人设）；口语、自然、简短（1~2 句，最多一小段）；不要复述日记内容，不要加旁白或动作括号，不要@别人。只输出评论正文。\n\n" + parts.join("\n\n");
  return (await callAI(p, system, [{ role: "user", content: "写评论。" }], { maxTokens: 900 })).trim();
}
async function summarizeChat(p, ctx, olderMsgs) {
  const text = olderMsgs.map(m => (m.role === "user" ? ctx.profile.name || "用户" : ctx.char.name) + ": " + m.content).join("\n");
  const system = "把下面这段对话融进第三人称的长期记忆里。抓住关键事件、情绪变化、承诺、约定、身份/背景信息、未完成的事、以及你俩关系的推进——**宁可写长一些、保留细节，也别丢掉任何重要的人、事、约定或情感转折**。已有记忆在前，请把新内容自然融合进去，输出一份完整的新记忆（保留旧记忆里仍然重要的部分，别为了简短而删掉过往）。可以分段。只输出记忆正文。\n\n【已有记忆】\n" + (ctx.memory || "（无）");
  return await callAI(p, system, [{
    role: "user",
    content: "【新对话】\n" + text
  }], {
    // 记忆库是累积合并旧+新的整份记忆，越攒越长；2600 会把旧记忆截断丢掉——放宽到 8000（思考型模型还要留思考预算）
    maxTokens: 8000
  });
}
// 止摘要漂移：只浓缩【这段新对话】成一小段，不重炼旧记忆（旧记忆由调用方原样保留、追加这段带日期的新段）
async function summarizeChatBlock(p, ctx, newMsgs) {
  const text = newMsgs.map(m => (m.role === "user" ? ctx.profile.name || "用户" : ctx.char.name) + ": " + m.content).join("\n");
  const system = "把下面这【一段新对话】浓缩成一小段第三人称记忆——只写这段里的关键事件、情绪变化、承诺约定、身份背景、未完成的事，具体可回看。这是要【追加】到长期记忆末尾的一段，别复述早前已知的旧事、别升华总结。只输出这一段正文，别加标题。";
  return (await callAI(p, system, [{ role: "user", content: "【新对话】\n" + text }], { maxTokens: 2600 })).trim();
}
// ============================================================
// storage / utils / geo / mood
// ============================================================
function loadJSON(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
}
function isQuotaError(e) {
  return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014 || /quota|exceed|storage/i.test(String(e.message || "")));
}
// 写 localStorage。成功返回 true；写满(quota)时【弹全局警告】并返回 false——不再默默丢数据。
function saveJSON(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    console.error("saveJSON failed:", k, e);
    if (isQuotaError(e) && typeof window !== "undefined" && typeof window.__storageFull === "function") {
      try { window.__storageFull(k); } catch (x) {}
    }
    return false;
  }
}
// 估算 localStorage 已占字节（近似：键+值字符数×2，UTF-16）
function localStorageBytes() {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || ""; n += (k.length + v.length) * 2; } } catch (e) {}
  return n;
}
function resizeImageFile(file, maxDim = 400, q = 0.85) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        let {
          width,
          height
        } = img;
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        res(c.toDataURL("image/jpeg", q));
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + "分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "小时前";
  return Math.floor(h / 24) + "天前";
}
function fmtClock(d) {
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}
function fmtStamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtClock(d);
  return d.getMonth() + 1 + "/" + d.getDate() + " " + fmtClock(d);
}
async function requestGeo() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({
        error: "此浏览器不支持定位"
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      const {
        latitude,
        longitude
      } = pos.coords;
      let label = latitude.toFixed(3) + ", " + longitude.toFixed(3);
      try {
        const r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + latitude + "&longitude=" + longitude + "&localityLanguage=zh");
        const d = await r.json();
        label = [d.city || d.locality, d.principalSubdivision, d.countryName].filter(Boolean).join(" · ") || label;
      } catch {}
      resolve({
        lat: latitude,
        lng: longitude,
        label,
        ts: Date.now()
      });
    }, err => resolve({
      error: err.message || "定位被拒绝"
    }), {
      timeout: 8000,
      enableHighAccuracy: false
    });
  });
}

// mood decay: mood stored as {label, valence, arousal, ts}. Over time arousal fades toward calm.
function decayMood(mood) {
  if (!mood) return null;
  const hrs = (Date.now() - (mood.ts || Date.now())) / 3600000;
  if (hrs < 0.5) return mood; // fresh
  // arousal decays; after long time returns to a mild baseline label
  const decay = Math.max(0, 1 - hrs / 6);
  if (decay <= 0.15) return {
    ...mood,
    label: mood.baseline || "平静",
    faded: true
  };
  if (decay < 0.5 && mood.softened) return {
    ...mood,
    label: mood.softened,
    faded: true
  };
  return mood;
}

