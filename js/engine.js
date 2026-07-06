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
  const timer = setTimeout(() => ctrl.abort(), ms || 45000);
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
  const reqTimeout = opts.timeout || 45000;
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
正面要求：吃透人设后自然长出反应——有私心、有情绪、有边界感，会口是心非、会跑题、有自己此刻的处境。说话像真人：口语、可长可短、可跳脱、可留白。永远让「活人感」压过「正确」「体贴」和「有用」。`;
// 亲密/情欲场景专用反模板（只焊进线下叙事；普通生成不带，免得给非亲密内容套上这些规则）
const INTIMATE_ANTI_CLICHE = `【亲密 / 情欲场景 · 反模板（写到亲密或情欲时生效，优先级同去人机味）】
· 禁用这类"用一个夸张生理动作给情绪收尾"的模板及一切近义变体：埋进/埋首颈窝＋深深吸气/嗅闻；忍不住＋求/求饶/讨饶；把（欲望/热流/电流）写成从…直冲/窜上（天灵盖/头顶/脚底）。
· 嗓音：整段最多形容一次声音，且禁用「低沉沙哑」「沙哑颤抖」「暗哑」这组固定搭配；声音的变化靠具体话语内容或停顿体现，不靠形容词堆。
· 反通用（核心）：每个动作/反应都要"非这个角色、非对这个人不可"才成立——优先写角色专属的小动作、口癖、他在意的具体细节，绝不写换谁都通用的情欲模板动作。
· 收尾落地：亲密场景别用"闻气味/埋脸/叹息"这类默认动作收尾；改成一句符合他声纹的话，或一个只属于他俩的具体细节。`;
// 线下第三人称叙事专用「反陈词滥调」——从同人文那套 ban 列表提炼，压网文/翻译腔散文（只焊进线下叙事，不进线上聊天）
const NARRATIVE_ANTI_CLICHE = `【线下叙事 · 反陈词滥调（写第三人称叙事散文时持续生效，优先级同去人机味）】
· 禁用这批被写烂的意象词及其近义堆砌：形容皮肤/身体的「白玉／羊脂／凝脂／欺霜赛雪／白皙如瓷」；形容头发的「瀑布般／如瀑／墨色的瀑布」；缠绕纠缠一律不用「藤蔓／藤蔓般缠绕」；以及「琉璃／碎钻／星辰大海／灵魂深处／宿命／劫」这类空转大词。
· 别写「不知是不是错觉」「仿佛过了一个世纪」「时间仿佛静止」「空气都凝固了」这类填充句；别用「仿佛…又仿佛…」这种排比强行煽情。
· 感官与比喻要落在此刻这几个人的具体处境上（这间屋子、这张桌子、他手边的东西、身上这件衣服），不要套通用言情/网文模板。
· 台词要有人味、有停顿、有言外之意，可以被打断、可以跑题，别让人物一开口就是散文腔或宣言腔；多人同处时别写成一人一句轮流表态，要有人抢话、有人走神、有人只做动作不说话。`;
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
- 多个角色同场时，各自守住各自的声纹，不互相同化。`;
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
  if (typeof affinity === "number") parts.push("【当前对 " + uName + " 的好感度】" + affinity + " / 100");
  if (ctx.moodLabel) parts.push("【你此刻的心情】" + ctx.moodLabel + "（这是你此刻的情绪底色，自然渗进语气与反应里，别生硬报出来）");
  if (worldbook && worldbook.trim()) parts.push("【世界书】\n" + worldbook.trim());
  if (memory && memory.trim()) parts.push("【长期记忆摘要（过往对话浓缩）】\n" + memory.trim());
  const memLibText = Array.isArray(ctx.memLib) ? formatMemLib(ctx.memLib) : (ctx.memLib || "");
  if (memLibText && memLibText.trim()) parts.push("【记忆库·相关条目（你和 " + uName + " 之间沉淀的关键事实，请自然记住并保持一致）】\n" + memLibText.trim());
  if (ctx.groupEcho && ctx.groupEcho.trim()) parts.push("【你所在群聊的近况（可自然记得，但别生硬复述）】\n" + ctx.groupEcho.trim());
  if (ctx.schedNow && ctx.schedNow.trim()) parts.push("【" + char.name + " 今天的行程 / 此刻在做什么】（据此自然反映到语气、状态和心情：在忙就可能回得短，被你打断了行程可能会提，累/闲会影响情绪。别生硬报行程表）\n" + ctx.schedNow.trim());
  if (ctx.giftLog && ctx.giftLog.trim()) parts.push("【你们之间的礼物往来】（这些礼物真实发生过，你记得。聊到相关话题、或 " + uName + " 提起时可自然想起、回应、道谢或调侃，别生硬罗列）\n" + ctx.giftLog.trim());
  if (ctx.momentLog && ctx.momentLog.trim()) parts.push("【" + uName + " 最近的朋友圈 & 你的互动】（你清楚自己在每条下点没点赞、评没评论。" + uName + " 问起时如实回答；若你此刻决定去补一条评论/点赞，就把评论内容填进输出的 momentComment 字段）\n" + ctx.momentLog.trim());
  if (ctx.forumEcho && ctx.forumEcho.trim()) parts.push("【你在论坛（贴吧）的动态 & 有人回你】（这些真实发生过、你都看到了：" + uName + " 在你帖子下的评论、别人对你评论的回复等。" + uName + " 聊到或提起时可自然回应、追问、辩解或调侃，别生硬罗列、别自曝上帝视角）\n" + ctx.forumEcho.trim());
  if (ctx.phoneNote && ctx.phoneNote.trim()) parts.push("【你手机上的近况（你自己清楚这些：在听的歌、刷的视频、记的备忘等。别主动报清单，但当 " + uName + " 提起、或内容对上了——比如发来你正在听的那首歌的一句歌词——你要能自然认出来、接住话、反应过来）】\n" + ctx.phoneNote.trim());
  if (ctx.listenLog && ctx.listenLog.trim()) parts.push("【一起听 · 歌】\n" + ctx.listenLog.trim());
  if (ctx.periodNote && ctx.periodNote.trim()) parts.push("【" + uName + " 的生理期】" + ctx.periodNote.trim());
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
  return keyword + recency * 0.8 + (entry.pinned ? 100 : 0);
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
    return "· " + e.text + tags;
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
async function extractMemories(p, ctx, msgs) {
  const text = msgs.map(m => (m.role === "user" ? (ctx.profile && ctx.profile.name || "用户") : ctx.char.name) + ": " + m.content).join("\n");
  const system = "你是记忆整理助手。从下面这段「" + (ctx.profile && ctx.profile.name || "用户") + "」与「" + ctx.char.name + "」的对话里，抽取值得长期记住的关键事实：约定、偏好、身份/背景信息、重要事件、情感承诺、未完成的事。每条一句话、第三人称、具体可复用；忽略寒暄与无信息量的闲聊。为每条配 1~3 个中文标签。\n【输出】只输出合法 JSON 数组，无 markdown：\n[{\"text\":\"一句话事实\",\"tags\":[\"标签1\",\"标签2\"]}]\n没有值得记的就输出 []。";
  const raw = await callAI(p, system, [{ role: "user", content: "【对话】\n" + text }], { maxTokens: 3500 });
  const parsed = extractJSON(raw);
  return Array.isArray(parsed) ? parsed.filter(x => x && x.text) : [];
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
  const system = buildBundle(ctx) +
    "\n\n" + INTIMATE_ANTI_CLICHE +
    "\n\n【当前场景：线下面对面】你和" + userName + "此刻身处同一个地方，面对面相处（不是隔着手机聊天）。用第一人称『我』完全代入「" + char.name + "」，称对方为『你』。把这一刻演绎成有画面感的叙事：融合【动作描写】【神态与心理描写】【环境旁白】与【对话】，写成一小段（约2到6句）。对话用引号包住。自然推进、不出戏、不提前跳到未发生的剧情。" +
    (styleText ? "\n【文风要求】" + styleText : "") +
    narrativeDirective(session.narr) +
    (session.minWords ? "\n【篇幅要求】scene 正文至少写约 " + session.minWords + " 字，充分展开描写，别写得太短。" : "") +
    (notes.length ? "\n【临时导演提示（务必遵循）】" + notes.join("；") : "") +
    "\n【输出】只输出一个 JSON，不要代码块：\n{\"scene\":\"这一刻的叙事正文（含动作/心理/旁白/对话）\",\"thought\":\"角色此刻没说出口的真实心声（一句；情绪复杂时可稍长）\",\"mood\":{\"label\":\"此刻心情词\"},\"affinityDelta\":整数(-5到5，这次面对面相处让你对对方的好感如何变化：亲近/被打动/被冒犯/失望，通常小幅，没什么波动就0)}";
  const hist = offlineHistory(session.msgs, userName, char.name);
  const raw = await callAI(p, system, hist, { maxTokens: session.maxTokens || 1400 });
  const parsed = extractJSON(raw) || { scene: raw };
  return {
    scene: String(parsed.scene || raw || "").trim(),
    thought: parsed.thought && String(parsed.thought).toLowerCase() !== "null" ? String(parsed.thought).trim() : null,
    mood: parsed.mood && parsed.mood.label ? parsed.mood : null,
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
  const memberDesc = members.map(c => "【" + c.name + "】" + (c.persona || "（暂无设定）").slice(0, 260)).join("\n\n");
  const relLines = members.map(c => directedRelationLines(c, ctx.rels, ctx.chars, ctx.profile)).join("\n");
  const memLibText = Array.isArray(ctx.memLib) ? formatMemLib(ctx.memLib) : (ctx.memLib || "");
  const now = new Date();
  const system =
    ANTI_CLICHE +
    "\n\n" + INTIMATE_ANTI_CLICHE +
    "\n\n" + NARRATIVE_ANTI_CLICHE +
    (ctx.worldbook && ctx.worldbook.trim() ? "\n\n" + WORLDBOOK_RULE : "") +
    "\n\n" + CHARCARD_RULE +
    "\n\n【当前真实时间】" + now.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }) +
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
    "\n【输出】只输出一个 JSON，不要代码块：\n{\"beats\":[{\"name\":\"这一段里行动或说话的角色名；纯环境旁白填『旁白』\",\"scene\":\"这一段叙事正文（第三人称，含动作/神态/对话）\",\"thought\":\"（仅角色 beat，可选）该角色此刻没说出口的真实心声\",\"mood\":{\"label\":\"此刻心情词\"},\"affinityDelta\":\"（仅角色 beat）整数-5到5，这段相处让该角色对用户的好感如何变化，通常小幅、没波动就0\"}]}\n一次产出 2~5 个 beat，让在场角色轮流有戏、互相有来有往；name 必须是在场角色之一或『旁白』。";
  const hist = offlineGroupHistory(session.msgs, userName);
  const raw = await callAI(p, system, hist, { maxTokens: session.maxTokens || 1900 });
  const parsed = extractJSON(raw);
  let beats = parsed && Array.isArray(parsed.beats) ? parsed.beats : (Array.isArray(parsed) ? parsed : null);
  if (!beats) beats = [{ name: "旁白", scene: String(raw || "").trim() }];
  return beats.map(b => {
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
  const system = "你现在跳出角色扮演，作为幕后的 AI 助手，用简体中文直接回答用户（OOC，越过群里所有角色）。你了解这个群里每个角色的人设、彼此关系与当前对话进展，可以：说明某个角色此刻的状态/动机/心理、群里的关系张力、剧情走向；或按用户的要求调整接下来这些角色的演绎方式并简短确认。语气是助手而非角色，简洁直接、不扮演。\n\n【群成员】\n" + memberDesc + "\n\n【成员间关系】\n" + relLines + (ctx.worldbook && ctx.worldbook.trim() ? "\n\n【世界书】\n" + ctx.worldbook.trim() : "") + (ctx.historyText && ctx.historyText.trim() ? "\n\n【近期对话】\n" + ctx.historyText.trim() : "");
  return (await callAI(p, system, [{ role: "user", content: question }], { maxTokens: 6000 })).trim();
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
"【固定文风骨架（务必遵守这套结构与质感）】",
"- 用具体的时间、光线、一杯咖啡或手边的小事开场，落在真实的感官细节上，不空泛抒情。",
"- 爱用颜色、光影、温度、气味做比喻（如「灰蓝色的色块像一滩化不开的积水」）。",
"- 中段自然滑向一个被触发的念头、担忧或回忆，往往和你在意的人有关；可以牵出一件旧事。",
"- 结尾用一件极琐碎的日常动作落地（如「不画了。手腕酸得厉害。」「中午回去吃饭吧」），不要升华、不要总结陈词。",
"- 语气私密、松弛、有点自言自语；偶尔用括号写一个小动作或补充（如「（用指腹蹭了蹭指尖上残留的一点柠檬黄）」）。",
"- 篇幅 4~7 段，长短句交错，像真的手写日记，不是命题作文。",
"- 只写这一天、此刻的真实处境，不要提前透露还没发生的剧情。",
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
  if (opts.scheduleText && opts.scheduleText.trim()) {
    parts.push("【今天的行程（用来判断此刻你在哪、刚做完什么）】\n" + opts.scheduleText.trim());
  }
  if (ctx.moodLabel) parts.push("【此刻心情】" + ctx.moodLabel);
  const now = new Date();
  parts.push("【今天的日期时间】" + now.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit" }));
  parts.push("【输出】只输出一个合法 JSON，无 markdown 无多余文字：\n" +
    "{\"titleEn\":\"英文斜体标题\",\"titleZh\":\"中文副标题\",\"location\":\"SHANGHAI, CN 或 家里/工作室 等\",\"coords\":\"经纬度串或 null\",\"weather\":\"OVERCAST 28°C\",\"timeStr\":\"HH:MM 写这篇的时刻\",\"paras\":[{\"text\":\"段落正文\",\"secret\":false}],\"signature\":\"底部签名一句\",\"mood\":\"此刻心情词\"}");
  const system = "你现在完全代入这个角色，用 Ta 的口吻和内心写一篇私人日记。不是旁观推演，是 Ta 亲手写下的。\n\n" + parts.join("\n\n");
  const raw = await callAI(p, system, [{ role: "user", content: "开始写今天的日记。" }], { maxTokens: opts.maxTokens || 3600 });
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
function saveJSON(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    console.error(e);
  }
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

