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
// 检测这个 API 支不支持 embedding（向量记忆的前提）：真调一次 /embeddings，返回 { ok, dim, model, msg }
// 只走 openai 兼容格式（中转站基本都是这个）；anthropic 原生没 embedding、gemini 端点不同——都提示换法
async function testEmbedding(p) {
  const base = (p.baseUrl || "").replace(/\/$/, "");
  const fmt = detectFormat(base);
  if (fmt === "anthropic") return { ok: false, msg: "Anthropic 原生不提供 embedding。若你用的是中转站，把地址换成它的 OpenAI 兼容端点(通常 .../v1)再测。" };
  if (fmt === "gemini") return { ok: false, msg: "Gemini 的 embedding 端点是 :embedContent，和这里不同。多数中转站有 OpenAI 兼容的 /v1/embeddings，把地址换成那个再测。" };
  const root = base.endsWith("/v1") ? base : base + "/v1";
  // 手填的排最前（优先试你指定的）；后面是各家常见 embedding 模型名，尽量多撞几个
  const candidates = [p.embedModel, "text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002", "bge-m3", "text-embedding-v3", "text-embedding-v2", "embedding-2", "doubao-embedding"].filter(Boolean);
  const tried = [];   // 逐个记下失败原因，别只留最后一个（否则会误以为只是那一个模型的问题）
  for (const model of candidates) {
    let why = "";
    try {
      const r = await fetchT(root + "/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.apiKey },
        body: JSON.stringify({ model: model, input: "测试向量" })
      }, 20000);
      const raw = await r.text();
      let d; try { d = JSON.parse(raw); } catch (e) { why = "返回非 JSON：" + raw.slice(0, 60); tried.push(model + " → " + why); continue; }
      if (d && d.error) { why = (d.error.message || JSON.stringify(d.error)).slice(0, 100); tried.push(model + " → " + why); continue; }
      const vec = d && d.data && d.data[0] && d.data[0].embedding;
      if (Array.isArray(vec) && vec.length) return { ok: true, dim: vec.length, model: model };
      why = "返回里没找到向量：" + raw.slice(0, 60); tried.push(model + " → " + why);
    } catch (e) { why = e.message || String(e); tried.push(model + " → " + why); }
  }
  return { ok: false, msg: "试了这些 embedding 模型都没通（多半是这家中转站压根没开 embedding 渠道）：\n" + tried.join("\n") + "\n\n办法：①去中转站后台看它到底有没有 embedding 模型、把确切的模型名手填进下面的框再测；②换一家有 OpenAI 兼容 /v1/embeddings 的 key（如支持 text-embedding-3-small 的）。测不通也没关系——向量记忆只是锦上添花，现在的关键词记忆照常工作。" };
}
// 独立 embedding API 配置（和聊天模型分开：聊天用 gemini 中转、embedding 可另填一家支持 /v1/embeddings 的 key）
// 存 x_embedApi{baseUrl,apiKey,model,enabled}。没开/没填时向量功能就不启用，零影响。
function loadEmbApi() {
  try { const c = JSON.parse(localStorage.getItem("x_embedApi") || "null"); if (c && typeof c === "object") return Object.assign({ baseUrl: "", apiKey: "", model: "text-embedding-3-small", enabled: false }, c); } catch (e) {}
  return { baseUrl: "", apiKey: "", model: "text-embedding-3-small", enabled: false };
}
function saveEmbApi(c) { try { localStorage.setItem("x_embedApi", JSON.stringify(c || {})); } catch (e) {} return c; }
function embApiReady() { const c = loadEmbApi(); return !!(c.enabled && c.baseUrl && c.apiKey); }
// ============================================================
// 向量记忆（v48.11）：给记忆库条目配 embedding，检索时语义相似度+关键词混合打分——
// 「上次吃的那顿」也能召回「火锅之约」。设计要点：
// · 向量（1024 维浮点）只进 IndexedDB(x_memvec)，绝不进 localStorage/云存档（几百条就是 MB 级）；
//   换设备导入存档后检测到缺向量会自动静默重嵌（embedding 便宜/免费，重建零成本）。
// · 检索函数 retrieveMemories 保持【同步】签名不动（ctxFor 等几十处调用零改动）：
//   发消息前先 primeQueryVec() 把查询向量预热进内存缓存，检索时同步取用；
//   没预热/没开开关/API 挂了 → 缓存未命中 → 自动回落纯关键词打分，行为与旧版完全一致，零影响。
// · 每条向量记录 {文本hash, 模型名}：改了文本或换了 embedding 模型自动检测重嵌，不拿两个语义空间硬比。
// ============================================================
function memVecHash(s) { let h = 5381; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36) + "_" + s.length; }
function idbVecOpen() { return new Promise((res, rej) => { const r = indexedDB.open("x_memvec", 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("vec")) r.result.createObjectStore("vec"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbVecPut(k, val) { const db = await idbVecOpen(); return new Promise((res, rej) => { const tx = db.transaction("vec", "readwrite"); tx.objectStore("vec").put(val, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbVecDel(k) { const db = await idbVecOpen(); return new Promise(res => { const tx = db.transaction("vec", "readwrite"); tx.objectStore("vec").delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function idbVecClear() { const db = await idbVecOpen(); return new Promise(res => { const tx = db.transaction("vec", "readwrite"); tx.objectStore("vec").clear(); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function idbVecEntries() { const db = await idbVecOpen(); return new Promise(res => { const tx = db.transaction("vec", "readonly"); const st = tx.objectStore("vec"); let ks = null, vs = null; const done = () => { if (ks && vs) res(ks.map((k, i) => [k, vs[i]])); }; const kq = st.getAllKeys(); const vq = st.getAll(); kq.onsuccess = () => { ks = kq.result || []; done(); }; vq.onsuccess = () => { vs = vq.result || []; done(); }; tx.onerror = () => res([]); }); }
// 内存缓存：记忆条目 id -> {h:文本hash, m:模型名, v:Float32Array}（挂 window 跨脚本共享）
function _memVecCache() { if (typeof window === "undefined") return new Map(); return window.__memVecCache || (window.__memVecCache = new Map()); }
async function hydrateMemVecs() {
  if (typeof window !== "undefined" && window.__memVecHydrated) return _memVecCache().size;
  try { const entries = await idbVecEntries(); const c = _memVecCache(); entries.forEach(([k, val]) => { if (k && val && val.v && !c.has(k)) c.set(k, val); }); } catch (e) {}
  if (typeof window !== "undefined") window.__memVecHydrated = true;
  return _memVecCache().size;
}
// bge 系官方用法：短查询→长文档检索时【只在查询侧】加指令前缀，文档侧不加（嵌错一边质量明显掉）
const BGE_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";
// 批量嵌入。texts -> Float32Array[]（顺序与输入一致）。没配 API 返回 null；网络/格式错误抛异常（调用方自行兜底）
async function embedTexts(texts, opts) {
  opts = opts || {};
  const c = loadEmbApi();
  if (!(c.enabled && c.baseUrl && c.apiKey && c.model)) return null;
  const base = c.baseUrl.replace(/\/$/, "");
  const root = base.endsWith("/v1") ? base : base + "/v1";
  const isBge = /bge/i.test(c.model);
  // bge 单条输入上限 512 token：中文按字截 420 字兜底（加上前缀仍在限内）
  const input = texts.map(t => { let s = String(t || "").slice(0, 420); if (opts.isQuery && isBge) s = BGE_QUERY_PREFIX + s; return s || " "; });
  const r = await fetchT(root + "/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.apiKey },
    body: JSON.stringify({ model: c.model, input: input })
  }, opts.timeout || 25000);
  const d = await r.json();
  if (!d || !Array.isArray(d.data)) throw new Error((d && d.error && (d.error.message || JSON.stringify(d.error))) || "embedding 返回格式不对");
  const arr = d.data.slice().sort((a, b) => (a.index || 0) - (b.index || 0)).map(x => Float32Array.from((x && x.embedding) || []));
  if (arr.length !== texts.length || arr.some(v => !v.length)) throw new Error("embedding 返回条数/维度不对");
  return arr;
}
// 条目 -> 待嵌文本（带标签一起嵌，标签也是语义的一部分）
function memEntryEmbedText(e) { return (String(e.text || "") + ((e.tags && e.tags.length) ? ("（" + e.tags.join("、") + "）") : "")).slice(0, 420); }
// 给记忆库补嵌向量：只处理「没向量/文本变了/换了模型」的条目（force=全量重嵌），分批走 API、批间歇口气（免费模型有限速）。
// 顺手清掉已删除条目的孤儿向量。onProgress(done,total)。返回本次嵌了几条。任何时候没配 API 都静默返回 0。
async function ensureMemVecs(lib, opts) {
  opts = opts || {};
  if (!embApiReady()) return 0;
  await hydrateMemVecs();
  const model = loadEmbApi().model;
  const cache = _memVecCache();
  const list = (lib || []).filter(e => e && e.id && e.text);
  const todo = list.filter(e => { if (opts.force) return true; const cur = cache.get(e.id); return !(cur && cur.m === model && cur.h === memVecHash(memEntryEmbedText(e))); });
  // 孤儿清理：缓存/IDB 里有、记忆库里已经没有的条目
  const liveIds = new Set(list.map(e => e.id));
  for (const k of Array.from(cache.keys())) { if (!liveIds.has(k)) { cache.delete(k); idbVecDel(k); } }
  if (!todo.length) { if (opts.onProgress) opts.onProgress(0, 0); return 0; }
  const BATCH = 16;
  let done = 0;
  if (opts.onProgress) opts.onProgress(0, todo.length);
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vecs = await embedTexts(batch.map(memEntryEmbedText));
    if (!vecs) return done;
    for (let j = 0; j < batch.length; j++) {
      const rec = { h: memVecHash(memEntryEmbedText(batch[j])), m: model, v: vecs[j] };
      cache.set(batch[j].id, rec);
      await idbVecPut(batch[j].id, rec);
    }
    done += batch.length;
    if (opts.onProgress) opts.onProgress(done, todo.length);
    if (i + BATCH < todo.length) await new Promise(res => setTimeout(res, 300));
  }
  return done;
}
// 查询向量缓存（LRU 20 条）：key = 模型|查询文本hash。查询取【末尾】420 字——最近的消息在最后，语义检索要贴着最新话题
function _qVecCache() { if (typeof window === "undefined") return new Map(); return window.__qVecCache || (window.__qVecCache = new Map()); }
function _qVecKey(text) { return loadEmbApi().model + "|" + memVecHash(String(text || "").slice(-420)); }
// 发消息前调这个把查询向量预热进缓存（一次小嵌入调用 ~200-400ms，和大模型几秒比可忽略）。永不抛异常。
async function primeQueryVec(text) {
  try {
    text = String(text || "");
    if (!embApiReady() || !text.trim()) return null;
    const key = _qVecKey(text);
    const qc = _qVecCache();
    if (qc.has(key)) { const hit = qc.get(key); qc.delete(key); qc.set(key, hit); return hit; }
    const arr = await embedTexts([text.slice(-420)], { isQuery: true, timeout: 6000 });
    if (!arr || !arr[0]) return null;
    qc.set(key, arr[0]);
    while (qc.size > 20) qc.delete(qc.keys().next().value);
    return arr[0];
  } catch (e) { return null; }
}
// 检索时同步取查询向量：预热过才有，没有就 null（= 纯关键词打分）
function getQueryVec(text) {
  try { if (!embApiReady()) return null; const v = _qVecCache().get(_qVecKey(text)); return v ? { v: v, m: loadEmbApi().model } : null; } catch (e) { return null; }
}
function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
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
  // 有一场没散的线下（按需注入：没有就零 token）——不然主动问候会把正在进行的线下当没开始
  if (ctx.offlineNow && ctx.offlineNow.trim()) parts.push(ctx.offlineNow.trim());
  if (ctx.giftLog && ctx.giftLog.trim()) parts.push("【你们之间的礼物往来】（这些礼物真实发生过，你记得。聊到相关话题、或 " + uName + " 提起时可自然想起、回应、道谢或调侃，别生硬罗列）\n" + ctx.giftLog.trim());
  if (ctx.momentLog && ctx.momentLog.trim()) parts.push("【朋友圈动态（" + uName + " 发的 & 你自己发的）】（你清楚自己在 " + uName + " 每条下点没点赞、评没评论，也记得自己发过什么、谁在你帖子下说了什么——聊到时自然接得上、别一脸茫然。若你此刻决定去 " + uName + " 最新那条下补评论/点赞，把评论内容填进输出的 momentComment 字段）\n" + ctx.momentLog.trim());
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
function scoreMemEntry(entry, qTokens, now, qVec) {
  const eTokens = memTokens((entry.text || "") + " " + (entry.tags || []).join(" "));
  let overlap = 0;
  qTokens.forEach(tk => { if (eTokens.has(tk)) overlap += tk.length >= 2 ? 1.4 : 1; });
  // 标签直接命中 query 额外加权
  let tagHit = 0;
  (entry.tags || []).forEach(tag => { if (qTokens.has(tag.toLowerCase())) tagHit += 2; });
  let keyword = overlap + tagHit;
  // ⭐向量语义（v48.11）：查询向量预热过且该条目已嵌 → 语义相似度和关键词混合。
  // 关键词继续兜底精确名词命中（人名地名向量容易糊），向量管「换了说法也认得」。
  // bge 系余弦分布很窄（完全不相关也有 0.3+），减基线归一化再放大到与关键词分同量级，不然等于没筛。
  if (qVec && qVec.v) {
    const cv = _memVecCache().get(entry.id);
    if (cv && cv.v && cv.m === qVec.m && cv.v.length === qVec.v.length) {
      const sem = Math.max(0, Math.min(1, (cosSim(qVec.v, cv.v) - 0.38) / 0.32));
      keyword = keyword * 0.6 + sem * 7;
    }
  }
  // ⭐艾宾浩斯（2026-07-09）：记忆有「保持率」——多久没被想起就渐渐淡；被检索到=复习，会刷新并变牢
  // stability：复习(hits)越多越稳（遗忘半衰期变长）；情绪强度大的事本身更难忘
  const aRaw = Math.max(0, Math.min(5, entry.a == null ? 1 : entry.a));
  const stability = 1 + Math.min(1.6, (entry.hits || 0) * 0.3) + aRaw * 0.12;
  // 从「上次被想起」（没有就创建时）开始遗忘，半衰期 = 21天 × stability
  const freshTs = Math.max(entry.ts || 0, entry.lastHit || 0) || now;
  const idleDays = Math.max(0, (now - freshTs) / 86400000);
  const retention = Math.max(0.25, Math.pow(0.5, idleDays / (21 * stability))); // 陈年老事仍想得起，只是不再抢戏
  // 时间新近度（也按 freshTs 算：昨天刚聊起的旧事＝很新鲜）
  const recency = Math.pow(0.5, idleDays / 30);
  // 权重池（Ombre Brain 借鉴）：情绪强度 arousal 越高越难忘、未了结 open 的开环会一直惦记 → 更容易被想起
  const arousalW = (aRaw / 5) * 1.1;
  const openW = entry.open ? (0.7 + arousalW * 0.4) : 0;
  return keyword * (0.45 + 0.55 * retention) + recency * 0.8 + arousalW + openW + (entry.pinned ? 100 : 0);
}
function retrieveMemories(lib, charId, queryText, opts = {}) {
  const limit = opts.limit || 6;
  const list = (lib || []).filter(e => e && e.text && (!e.charIds || e.charIds.length === 0 || e.charIds.includes(charId)));
  if (list.length === 0) return [];
  const qTokens = memTokens(queryText);
  // 向量：只有发送前 primeQueryVec 预热过、缓存命中才拿得到；没有就 null=纯关键词，行为同旧版
  const qVec = opts.vec === false ? null : getQueryVec(queryText);
  const scored = list.map(e => ({ e, s: scoreMemEntry(e, qTokens, Date.now(), qVec) }));
  scored.sort((a, b) => b.s - a.s);
  // 置顶条目一定进；其余按分数，忽略几乎无关联（分数过低且非置顶）的
  const picked = scored.filter(x => x.e.pinned || x.s > 0.9).slice(0, limit).map(x => x.e);
  // ⭐检索即复习：被想起的条目刷新 lastHit、hits+1（就地改 entry 对象——lib 就是 memLibRef.current 那份）。
  // 节流持久化：只有当有条目超过 6 小时没被摸过时才写盘，防每轮聊天都重写整个记忆库
  if (opts.touch !== false && picked.length) {
    const nowTs = Date.now();
    let dirty = false;
    picked.forEach(e => {
      if (!e.lastHit || nowTs - e.lastHit > 6 * 3600000) dirty = true;
      e.lastHit = nowTs;
      e.hits = (e.hits || 0) + 1;
    });
    if (dirty && Array.isArray(lib)) { try { saveJSON("x_memLib", lib); } catch (e2) {} }
  }
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
    (Array.isArray(opts.openList) && opts.openList.length
      ? "\n\n【当前还没了结的约定/心事（下面每条前有编号）】若下面对话显示某条【已经完成/兑现/做过了/解决/明确不了了之】，就在输出数组里加一个 {\"resolveOpen\":编号} 元素（**填那条的数字编号**，不是原文；能确定哪几条完成就各加一个，没完成的别加）：\n" + opts.openList.slice(0, 12).map((s, i) => (i + 1) + ". " + s).join("\n")
      : "") +
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
  // 身材硬约束放最前（v47.74 提权）：edits 模式参考照主导身材，文字要顶在最前才有一点话语权；
  // 参考照本身如果就是极瘦风，靠 prompt 很难扳——根治要换参考照或裁成只含脸部
  parts.push("【身材硬性要求，凌驾于参考图的身体】healthy body weight, realistic anatomy, not underweight, not emaciated, natural muscle definition——健康体重、真实自然的人体：头身比正常、肩颈躯干四肢比例正确，有自然的肌肉与皮下脂肪，绝不许瘦脱相（不许肋骨锁骨根根凸出、不许胳膊细如柴、不许病态苍白消瘦），也不许肢体拉长扭曲。若参考图中的身体过瘦，按健康匀称的体型重画身体、只保留脸部长相。");
  parts.push("照片里的人：" + (char.name || "一个人") + "。");
  if (char.appearance && char.appearance.trim()) parts.push("外貌特征（务必贴合）：" + char.appearance.trim() + "。");
  if (st && st.wearing) parts.push("此刻穿着：" + st.wearing + "。");
  if (sceneDesc && String(sceneDesc).trim()) parts.push("此刻的场景/在做什么：" + String(sceneDesc).trim() + "。");
  if (st && st.mood) parts.push("神情情绪：" + st.mood + "。");
  parts.push("【必须是能看到人脸的自拍】TA 的脸要清楚出现在画面里（正脸或半侧脸，五官清晰可辨、对着镜头），这是一张自拍人像，不是纯风景/纯物品照——就算在描述某个场景，也要把 TA 本人带脸拍进去。");
  parts.push("前置摄像头随手拍的生活质感、自然光、真实不摆拍，画面里只有 TA 一个人，不要任何文字/水印/logo/相框。");
  return parts.join("");
}
// 生成一张自拍，返回 { blob, dataUrl } 或 { blob:null, url }。有参考照先走 images/edits(保长相)，
// 失败(很多便宜中转不支持 /images/edits)自动退回 images/generations(丢参考照但能出图)。
async function generateSelfieImage(prompt, refPhotoDataUrl, opts) {
  const a = loadImgApi();
  if (!imgApiReady(a)) throw new Error("没配置图像 API");
  // 归一 base：用户可能把整段 endpoint(…/v1/images/generations) 都粘进来 → 削回域名根，统一补 /v1
  let base = (a.baseUrl || "").trim().replace(/\/+$/, "");
  base = base.replace(/\/(v1\/)?images\/(generations|edits)\/?$/i, "").replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
  const root = base.endsWith("/v1") ? base : base + "/v1";
  const size = (opts && opts.size) || a.size || "1024x1536";
  const parseOut = async (r, rawTxt) => {
    let d;
    try { d = JSON.parse(rawTxt); } catch (e) { throw new Error("接口没返回 JSON：" + rawTxt.slice(0, 160)); }
    if (d && d.error) throw new Error((d.error.message || d.error.msg || JSON.stringify(d.error)) + "");
    const cand = (d && d.data && d.data[0]) || (d && d.images && d.images[0]) || (d && d.output && (Array.isArray(d.output) ? d.output[0] : d.output)) || d || {};
    let b64 = cand.b64_json || cand.b64 || (typeof cand === "string" && /^data:image/i.test(cand) ? cand.replace(/^data:image\/\w+;base64,/i, "") : null);
    let url = cand.url || (cand.image && cand.image.url) || (typeof cand === "string" && /^https?:\/\//i.test(cand) ? cand : null);
    if (!b64 && url && /^data:image/i.test(url)) { b64 = url.replace(/^data:image\/\w+;base64,/i, ""); url = null; }
    if (!b64 && !url) { const mk = String(rawTxt).match(/data:image\/\w+;base64,[A-Za-z0-9+/=]+/i); if (mk) b64 = mk[0].replace(/^data:image\/\w+;base64,/i, ""); }
    if (!b64 && !url) { const mk = String(rawTxt).match(/https?:\/\/[^\s"')\]]+\.(?:png|jpe?g|webp)/i); if (mk) url = mk[0]; }
    if (b64) {
      // 验真：base64 得解得开、且开头是真图片的魔数（PNG/JPEG/WebP/GIF）——
      // 不然坏数据会被当成图存进图库，聊天里就是一个加载不出来的空白框、还不报错
      const pure = String(b64).includes(",") ? String(b64).split(",")[1] : String(b64);
      let bin;
      try { bin = atob(pure.replace(/\s+/g, "")); } catch (e) { throw new Error("返回的 base64 解不开（不是有效图片数据）。原始返回：" + rawTxt.replace(/\s+/g, " ").slice(0, 200)); }
      const c0 = bin.charCodeAt(0), c1 = bin.charCodeAt(1);
      const mime = (c0 === 0x89 && bin.slice(1, 4) === "PNG") ? "image/png"
        : (c0 === 0xff && c1 === 0xd8) ? "image/jpeg"
        : (bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP") ? "image/webp"
        : bin.slice(0, 4) === "GIF8" ? "image/gif" : null;
      if (!mime) throw new Error("返回的数据不是图片。原始返回：" + rawTxt.replace(/\s+/g, " ").slice(0, 200));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return { blob: new Blob([arr], { type: mime }), dataUrl: "data:" + mime + ";base64," + pure.replace(/\s+/g, "") };
    }
    if (url) {
      try { const resp = await fetch(url); if (resp.ok) { const blob = await resp.blob(); if (blob && blob.size > 0) return { blob, dataUrl: null }; } } catch (e) {}
      return { blob: null, url: url };
    }
    throw new Error("返回里没找到图。原始返回：" + rawTxt.replace(/\s+/g, " ").slice(0, 200));
  };
  const attempt = async (useRef, slim) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 180000);
    let r;
    try {
      if (useRef && refPhotoDataUrl) {
        const fd = new FormData();
        fd.append("model", a.model || "gpt-image-1"); fd.append("prompt", prompt); fd.append("size", size); fd.append("n", "1"); fd.append("response_format", "b64_json");
        if (a.quality) fd.append("quality", a.quality);
        fd.append("image", b64ToBlob(refPhotoDataUrl, "image/png"), "ref.png");
        r = await fetch(root + "/images/edits", { method: "POST", headers: { Authorization: "Bearer " + a.apiKey }, body: fd, signal: ctrl.signal });
      } else {
        // slim = 裸参数重试：有些中转不认 quality/response_format 这类可选参数，只发必填的
        const body = { model: a.model || "gpt-image-1", prompt, size, n: 1 };
        if (!slim) { body.response_format = "b64_json"; if (a.quality) body.quality = a.quality; }
        r = await fetch(root + "/images/generations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.apiKey }, body: JSON.stringify(body), signal: ctrl.signal });
      }
    } finally { clearTimeout(to); }
    const rawTxt = await r.text();
    // 4xx 且报错像是在挑剔某个可选参数 → 裸参数自动再试一次（gpt-image-1 的 quality 值域
    // 是 low/medium/high，别家可能只认 standard/hd；response_format 也有接口不认）
    if (!useRef && !slim && r.status >= 400 && r.status < 500 && ![401, 402, 403, 429].includes(r.status) && /param|quality|response_format|invalid\s+value|不支持|参数/i.test(rawTxt)) {
      try { return await attempt(false, true); } catch (e) {}
    }
    return await parseOut(r, rawTxt);
  };
  // 有参考照：先 edits(保长相)，挂了退回 generations；没参考照直接 generations
  if (refPhotoDataUrl) { try { return await attempt(true); } catch (e) { return await attempt(false); } }
  return await attempt(false);
}
// ============================================================
// MiniMax 语音 TTS —— 角色语音消息真发声
// ⭐懒生成：点开那条才合成（按字符计费，没人点就不花钱）；成品存 IndexedDB(x_tts) 缓存，重播免费
// 配置存 x_ttsApi（可云同步）；每角色音色在角色档案 voiceId 字段
// ============================================================
function loadTtsApi() {
  const def = { baseUrl: "https://api.minimax.io", groupId: "", apiKey: "", model: "speech-02-hd", enabled: false };
  let a = def;
  try { const c = JSON.parse(localStorage.getItem("x_ttsApi") || "null"); if (c && typeof c === "object") a = Object.assign({}, def, c); } catch (e) {}
  // 粘贴时容易带进首尾空格/换行，key 里混一个空白字符接口就报 invalid api key——读的时候统一清干净
  a.baseUrl = String(a.baseUrl || "").trim();
  a.groupId = String(a.groupId || "").trim();
  a.apiKey = String(a.apiKey || "").replace(/\s+/g, "");
  return a;
}
function saveTtsApi(c) { const clean = Object.assign(loadTtsApi(), c || {}); try { localStorage.setItem("x_ttsApi", JSON.stringify(clean)); } catch (e) {} return clean; }
// 克隆音色库：克过的 voice_id 登记在本机（只是清单方便管理/指派，删掉不影响 MiniMax 账号里的音色）
function loadVoiceLib() { try { const v = JSON.parse(localStorage.getItem("x_voiceLib") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function saveVoiceLib(list) { try { localStorage.setItem("x_voiceLib", JSON.stringify(list || [])); } catch (e) {} }
function ttsReady(a) { a = a || loadTtsApi(); return !!(a.enabled && a.groupId && a.apiKey); }
// MiniMax 系统预置音色（先用预置，克隆音色以后再接——克隆出的 voice_id 也能直接填）
const TTS_VOICES = [
  { id: "male-qn-qingse", name: "青涩青年·男" }, { id: "male-qn-jingying", name: "精英青年·男" },
  { id: "male-qn-badao", name: "霸道青年·男" }, { id: "male-qn-daxuesheng", name: "大学生·男" },
  { id: "audiobook_male_1", name: "磁性低音·男" }, { id: "audiobook_male_2", name: "沉稳叙述·男" },
  { id: "presenter_male", name: "男主播" }, { id: "clever_boy", name: "机灵少年" }, { id: "cute_boy", name: "可爱男孩" },
  { id: "female-shaonv", name: "少女·女" }, { id: "female-yujie", name: "御姐·女" },
  { id: "female-chengshu", name: "成熟·女" }, { id: "female-tianmei", name: "甜美·女" },
  { id: "audiobook_female_1", name: "温柔叙述·女" }, { id: "presenter_female", name: "女主播" }, { id: "lovely_girl", name: "俏皮女孩" }
];
// ---- 音频缓存 IndexedDB（大二进制不进 localStorage/云同步）----
function idbAudOpen() { return new Promise((res, rej) => { const r = indexedDB.open("x_tts", 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("aud")) r.result.createObjectStore("aud"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbAudPut(k, blob) { const db = await idbAudOpen(); return new Promise((res, rej) => { const tx = db.transaction("aud", "readwrite"); tx.objectStore("aud").put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbAudGet(k) { const db = await idbAudOpen(); return new Promise((res, rej) => { const tx = db.transaction("aud", "readonly"); const rq = tx.objectStore("aud").get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
function ttsCacheKey(voiceId, text) { let hsh = 5381; const s = voiceId + "|" + text; for (let i = 0; i < s.length; i++) hsh = (hsh * 33 + s.charCodeAt(i)) >>> 0; return "tts_" + voiceId + "_" + hsh.toString(36) + "_" + s.length; }

// ============================================================
// 图片仓库（IndexedDB）· 阶段1基建 —— 把大 base64 图从 5MB 的 localStorage 挪进空间大得多的 IndexedDB
// localStorage 只留 iv_<hash> 引用键；渲染前用 resolveImg() 换成 objectURL（开机 hydrateImgVault 一次性把
// 图库全读进内存缓存，Avatar 等同步组件可直接同步取用，不用每处改成异步）。此阶段纯新增、无处调用、零行为改动。
// ============================================================
function idbVaultOpen() { return new Promise((res, rej) => { const r = indexedDB.open("x_imgvault", 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("img")) r.result.createObjectStore("img"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbVaultPut(k, blob) { const db = await idbVaultOpen(); return new Promise((res, rej) => { const tx = db.transaction("img", "readwrite"); tx.objectStore("img").put(blob, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbVaultGet(k) { const db = await idbVaultOpen(); return new Promise((res, rej) => { const tx = db.transaction("img", "readonly"); const rq = tx.objectStore("img").get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
async function idbVaultDel(k) { const db = await idbVaultOpen(); return new Promise(res => { const tx = db.transaction("img", "readwrite"); tx.objectStore("img").delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function idbVaultEntries() { const db = await idbVaultOpen(); return new Promise(res => { const tx = db.transaction("img", "readonly"); const st = tx.objectStore("img"); let ks = null, vs = null; const done = () => { if (ks && vs) res(ks.map((k, i) => [k, vs[i]])); }; const kq = st.getAllKeys(); const vq = st.getAll(); kq.onsuccess = () => { ks = kq.result || []; done(); }; vq.onsuccess = () => { vs = vq.result || []; done(); }; tx.onerror = () => res([]); }); }
// data:URL → Blob（base64 或 URI 编码都支持）
function dataUrlToBlob(dataUrl) { const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || "")); if (!m) return null; const mime = m[1] || "image/png"; if (m[2]) { const bin = atob(m[3]); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime }); } return new Blob([decodeURIComponent(m[3])], { type: mime }); }
function imgVaultHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36) + "_" + s.length; }
// Blob → data:URL（导出整包备份时把图库的图 base64 化打进 JSON）
function blobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
// 是不是一张「真图片」引用（base64 或图库 iv_ 键）——用来替换旧的 startsWith("data:") 判断，
// 让迁进图库(iv_)的图仍被当图渲染、而不是当成文字描述。文字描述/http/空 都返回 false。
function isImgRef(v) { v = String(v || ""); return v.slice(0, 5) === "data:" || v.slice(0, 3) === "iv_"; }
// 内存缓存：iv_ 键 -> objectURL（挂 window 便于跨脚本共享；开机 hydrate 一次）
function _imgCache() { if (typeof window === "undefined") return new Map(); return window.__imgUrlCache || (window.__imgUrlCache = new Map()); }
async function hydrateImgVault() { try { const entries = await idbVaultEntries(); const c = _imgCache(); entries.forEach(([k, blob]) => { if (k && blob && !c.has(k)) { try { c.set(k, URL.createObjectURL(blob)); } catch (e) {} } }); return entries.length; } catch (e) { return 0; } }
// 把一张 base64/dataURL 存进图库，返回 iv_ 键（同图幂等：同 hash 复用）。非 data: 的（http/已是 iv_）原样返回。
async function imgToVault(dataUrl) { if (!dataUrl || typeof dataUrl !== "string") return dataUrl; if (dataUrl.indexOf("iv_") === 0) return dataUrl; if (dataUrl.slice(0, 5) !== "data:") return dataUrl; const key = "iv_" + imgVaultHash(dataUrl); const c = _imgCache(); if (!c.has(key)) { const blob = dataUrlToBlob(dataUrl); if (!blob) return dataUrl; try { await idbVaultPut(key, blob); c.set(key, URL.createObjectURL(blob)); } catch (e) { return dataUrl; } } return key; }
// 渲染用：iv_ 键 -> objectURL（缓存里没有就返回空串，图不显示但不崩）；其它（base64/http/空）原样返回。向后兼容旧存档。
function resolveImg(v) { if (!v || typeof v !== "string") return v; if (v.indexOf("iv_") === 0) return _imgCache().get(v) || ""; return v; }
// 从叙事散文里只抠出【引号内的台词】，旁白/动作/心理全丢——线下、同人文这类「一大段旁白+偶尔一句台词」的语音只念角色真正说出口的话。
// 支持中文「」『』、全角“”、直角双引号 "。多句台词按换行拼接（让 TTS 自然停顿）。整段没引号台词就返回空串（调用方据此不显示 ▶）。
function extractSpeech(text) {
  const s = String(text || "");
  const out = [];
  // 只认成对的中文/全角引号（开≠合，落单的引号自然配不上）。不收直角双引号 " ——它开合同字，
  // 遇到落单的（如 5" 英寸标记）会跨段错配、把旁白当台词念（v47.99 审查）；中文角色扮演基本用「」/“”。
  const re = /「([^」]*)」|『([^』]*)』|“([^”]*)”/g;
  let m;
  while ((m = re.exec(s))) {
    // 剥掉嵌套残留的引号字符（如「他喊『快跑』」外层会连内层『』一起吃进来），别念出括号
    const seg = (m[1] || m[2] || m[3] || "").replace(/[「」『』“”]/g, "").trim();
    if (seg) out.push(seg);
  }
  return out.join("\n");
}
// 按台词内容粗判语气 → MiniMax emotion 参数（本地零成本）。治「开朗音色念正经话还是很夸张」：
// 正经/平静的话显式传 neutral 压住克隆样本自带的亢奋，情绪句才放开。
function ttsEmotionOf(text) {
  const s = String(text || "");
  if (/(哭|呜呜|难过|想你了|对不起|抱歉|委屈|舍不得|唉)/.test(s)) return "sad";
  if (/(气死|烦死|滚|闭嘴|凭什么|够了|混蛋)/.test(s)) return "angry";
  if (/(吓死|好怕|别吓|救命)/.test(s)) return "fearful";
  if (/(哈哈|嘿嘿|太好了|开心|耶|好棒|！！)/.test(s)) return "happy";
  if (/(居然|竟然|不会吧|真的假的|？！|!？)/.test(s)) return "surprised";
  return "neutral";
}
// 按台词自动选发音矫正 language_boost（v47.92）：治「日语角色被中文矫正带偏口音」。
// 假名(ひらがな/カタカナ)是日语铁证、中文里不会出现→有假名走 Japanese，谚文走 Korean，纯 ASCII 走 English，其余默认 Chinese
function ttsLangBoost(text) {
  const s = String(text || "");
  if (/[぀-ヿ]/.test(s)) return "Japanese";
  if (/[가-힣]/.test(s)) return "Korean";
  if (s.trim() && !/[一-鿿぀-ヿ가-힣]/.test(s) && /[a-zA-Z]/.test(s)) return "English";
  return "Chinese";
}
// 取一个能调的 AI profile（优先后台便宜池，没有用主模型）——给「日语汉字转假名」这类合成期小活用
function ttsHelperProfile() {
  try {
    const list = JSON.parse(localStorage.getItem("x_api") || "[]");
    if (!Array.isArray(list) || !list.length) return null;
    const bgId = JSON.parse(localStorage.getItem("x_bgApi") || "null");
    const actId = JSON.parse(localStorage.getItem("x_activeApi") || "null");
    return list.find(p => p.id === bgId) || list.find(p => p.id === actId) || list[0] || null;
  } catch (e) { return null; }
}
// 日语汉字 → 假名读音（v47.93）：MiniMax 对「寝」这类中日共用汉字压不住会读成中文，
// 合成前先让 AI 把汉字换成这句里的正确假名读音，喂假名给 TTS 就不会串中文。失败降级回原文（至少能出声）
async function jpKanaReading(text) {
  const p = ttsHelperProfile();
  if (!p || !p.apiKey || !p.model) return text;
  const sys = "你是日语朗读注音助手。把下面这句日语【全部汉字】替换成它在这句话里的正确假名读音（ひらがな），送假名/助词/原有假名保持不变，语序不变。不要罗马音、不要空格、不要标注、不要解释，只输出替换后的整句假名文本。";
  const raw = await callAI(p, sys, [{ role: "user", content: text }], { maxTokens: 600, timeout: 30000 });
  let kana = String(raw || "").trim().replace(/^["「『]|["」』]$/g, "");
  // 校验：结果里不该再有汉字残留（宽松），且非空——否则用原文兜底
  if (!kana || /[一-鿿]/.test(kana)) return text;
  return kana;
}
// 合成一段语音：先查缓存，没有才真调 MiniMax（t2a_v2，hex 音频 → mp3 blob）
async function ttsSpeak(text, voiceId) {
  const a = loadTtsApi();
  if (!ttsReady(a)) throw new Error("没配置语音 API（设置 · 语音 TTS）");
  const vid = voiceId || "female-shaonv";
  const txt = String(text || "").trim().slice(0, 800);
  if (!txt) throw new Error("这条语音没有文字内容");
  // per-voice 沉稳调校（v47.86）：克隆音色若素材本身亢奋（如杨昕燃配的挏马酒），在音色库开「沉稳」——
  // 降语速+降音调+锁 neutral 情绪，把那股端着的兴奋劲压下去；只影响这一个音色
  // trim 匹配（v47.88）：角色档案手填 voiceId 常多打首尾空格→精确匹配对不上
  const vidN = String(vid).trim();
  const ve = (loadVoiceLib() || []).find(x => x && String(x.id).trim() === vidN) || {};
  // 语速可调（v47.89）：压亢奋只靠语速——绝不动 pitch（一压音调就变声=八戒）。
  // 老 calm=true 兼容成 0.85；新版直接存 speed（0.6~1.0，越低越稳）
  let spd = (ve.speed != null && isFinite(ve.speed)) ? Number(ve.speed) : (ve.calm ? 0.85 : 1.0);
  spd = Math.max(0.5, Math.min(1.0, spd));
  const slowed = spd < 0.99;
  const emo = slowed ? "neutral" : ttsEmotionOf(txt);   // 主动压稳时锁平静情绪
  const pit = 0;
  const boost = ttsLangBoost(txt);   // 按句子语言选发音矫正（日语句走 Japanese，别被中文带偏口音）
  // 日语汉字注音（v47.93）：音色开了 jpKana + 是日语句 + 含汉字 → 先转假名再合成，治「寝→中文qin」
  const wantKana = !!ve.jpKana && boost === "Japanese" && /[一-鿿]/.test(txt);
  // 缓存键带语速档 + 语言矫正 + 注音标记：不同参数别互相命中
  const key = ttsCacheKey(vid + ":" + emo + ":lb:" + boost + (slowed ? ":s" + Math.round(spd * 100) : "") + (wantKana ? ":kana" : ""), txt);
  const hit = await idbAudGet(key).catch(() => null);
  if (hit && hit.size > 0) return hit;
  // 缓存没命中才真去转假名（转换也缓存进最终音频，重听免费）
  let synthTxt = txt;
  if (wantKana) { try { synthTxt = await jpKanaReading(txt); } catch (e) {} }
  const base = (a.baseUrl || "https://api.minimax.io").trim().replace(/\/+$/, "");
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  let r;
  try {
    r = await fetch(base + "/v1/t2a_v2?GroupId=" + encodeURIComponent(a.groupId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.apiKey },
      // language_boost 按句子语言自动选（v47.92）；synthTxt 可能是汉字转假名后的文本（v47.93 jpKana）
      body: JSON.stringify({ model: a.model || "speech-02-hd", text: synthTxt, stream: false, language_boost: boost, voice_setting: { voice_id: vid, speed: spd, vol: 1.0, pitch: pit, emotion: emo }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 } }),
      signal: ctrl.signal
    });
  } finally { clearTimeout(to); }
  const raw = await r.text();
  let d; try { d = JSON.parse(raw); } catch (e) { throw new Error("语音接口没返回 JSON：" + raw.slice(0, 120)); }
  if (d.base_resp && d.base_resp.status_code !== 0) {
    let msg = d.base_resp.status_msg || ("错误码 " + d.base_resp.status_code);
    // key 无效最常见的根因是国内站/海外版不匹配：key 是哪个平台发的，接口地址就得填哪边
    if (/api key|apikey|token|auth/i.test(msg)) msg += "（key 和站点要配对：在 platform.minimax.io 国际版申请的 → 接口地址填 https://api.minimax.io；minimaxi.com → https://api.minimaxi.com；国内 minimax.chat 用默认地址。设置里有一键选站点。另外 key 生成时只完整显示一次，确认复制的是那串完整的）";
    throw new Error(msg);
  }
  const hex = d.data && (d.data.audio || d.audio);
  if (!hex || typeof hex !== "string") throw new Error("返回里没有音频数据。原始返回：" + raw.replace(/\s+/g, " ").slice(0, 120));
  // hex → bytes（MiniMax 音频是十六进制串）
  const clean2 = hex.replace(/[^0-9a-f]/gi, "");
  const arr = new Uint8Array(clean2.length >> 1);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean2.substr(i * 2, 2), 16);
  if (arr.length < 200) throw new Error("音频数据异常（太短）");
  const blob = new Blob([arr], { type: "audio/mpeg" });
  idbAudPut(key, blob).catch(() => {});
  return blob;
}
// 克隆音色：①上传一段干净人声（10s~5min，mp3/wav/m4a）→ file_id ②/v1/voice_clone 绑到自定 voice_id
// 克隆成功后把 voice_id 填进角色档案「音色」即可用（按 MiniMax 规则克隆按次收费，具体看你账户计费页）
async function ttsCloneVoice(fileBlob, customVoiceId) {
  const a = loadTtsApi();
  if (!ttsReady(a)) throw new Error("先在设置里配置语音 API");
  const vid = String(customVoiceId || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{7,}$/.test(vid)) throw new Error("voice_id 需以字母开头、8 位以上字母/数字（如 GuChao2026）");
  const base = (a.baseUrl || "https://api.minimax.io").trim().replace(/\/+$/, "");
  const fd = new FormData();
  fd.append("purpose", "voice_clone");
  fd.append("file", fileBlob, fileBlob.name || "voice.mp3");
  const r1 = await fetch(base + "/v1/files/upload?GroupId=" + encodeURIComponent(a.groupId), { method: "POST", headers: { Authorization: "Bearer " + a.apiKey }, body: fd });
  let d1; try { d1 = JSON.parse(await r1.text()); } catch (e) { throw new Error("上传接口没返回 JSON"); }
  if (d1.base_resp && d1.base_resp.status_code !== 0) throw new Error("上传失败：" + (d1.base_resp.status_msg || d1.base_resp.status_code));
  const fileId = d1.file && (d1.file.file_id || d1.file.id);
  if (!fileId) throw new Error("上传没拿到 file_id。原始返回：" + JSON.stringify(d1).slice(0, 120));
  const r2 = await fetch(base + "/v1/voice_clone?GroupId=" + encodeURIComponent(a.groupId), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.apiKey }, body: JSON.stringify({ file_id: fileId, voice_id: vid }) });
  let d2; try { d2 = JSON.parse(await r2.text()); } catch (e) { throw new Error("克隆接口没返回 JSON"); }
  if (d2.base_resp && d2.base_resp.status_code !== 0) throw new Error("克隆失败：" + (d2.base_resp.status_msg || d2.base_resp.status_code));
  return vid;
}
// ============================================================
// 实时天气（Open-Meteo，免费无 key、支持 CORS）——⭐进日程不进聊天：
// 天气写进日程推演，角色照着天气过日子；聊天经 schedNow 顺带看到，零新增常驻
// 缓存 wx_cache（故意不带 x_ 前缀：设备本地的时效数据，不值得进云同步）
// ============================================================
const WMO_ZH = { 0: "晴", 1: "大致晴", 2: "多云", 3: "阴", 45: "雾", 48: "雾凇", 51: "毛毛雨", 53: "小雨", 55: "细雨", 56: "冻毛毛雨", 57: "冻雨", 61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "强冻雨", 71: "小雪", 73: "中雪", 75: "大雪", 77: "米雪", 80: "阵雨", 81: "阵雨", 82: "强阵雨", 85: "阵雪", 86: "大阵雪", 95: "雷雨", 96: "雷雨带雹", 99: "强雷暴" };
function wmoZh(c) { return WMO_ZH[c] != null ? WMO_ZH[c] : "多云"; }
function wmoEmoji(c) { if (c === 0 || c === 1) return "☀️"; if (c === 2) return "⛅️"; if (c === 3) return "☁️"; if (c === 45 || c === 48) return "🌫"; if (c >= 95) return "⛈"; if (c >= 71 && c <= 86 && c !== 80 && c !== 81 && c !== 82) return "❄️"; if (c >= 51) return "🌧"; return "🌤"; }
function weatherCacheKey(lat, lng) { return Number(lat).toFixed(1) + "," + Number(lng).toFixed(1); }
// 只读缓存（同步，给 schedNow/组件即时用；由 weatherFor 填充）
function weatherCached(lat, lng) {
  try { const c = JSON.parse(localStorage.getItem("wx_cache") || "{}"); const hit = c[weatherCacheKey(lat, lng)]; return hit && hit.day === new Date().toDateString() ? hit : null; } catch (e) { return null; }
}
async function weatherFor(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const hit = weatherCached(lat, lng);
  if (hit && Date.now() - hit.ts < 2 * 3600000) return hit; // 2 小时内不重取
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 10000);
  let d;
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng + "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1", { signal: ctrl.signal });
    d = await r.json();
  } catch (e) { return hit || null; } finally { clearTimeout(to); }
  if (!d || !d.current) return hit || null;
  const out = { day: new Date().toDateString(), ts: Date.now(), t: Math.round(d.current.temperature_2m), code: d.current.weather_code, hi: Math.round(d.daily.temperature_2m_max[0]), lo: Math.round(d.daily.temperature_2m_min[0]), dayCode: d.daily.weather_code[0] };
  try { const c = JSON.parse(localStorage.getItem("wx_cache") || "{}"); c[weatherCacheKey(lat, lng)] = out; const ks = Object.keys(c); if (ks.length > 24) ks.slice(0, ks.length - 24).forEach(k => delete c[k]); localStorage.setItem("wx_cache", JSON.stringify(c)); } catch (e) {}
  return out;
}
function weatherLine(w) { return w && isFinite(w.t) ? wmoEmoji(w.dayCode != null ? w.dayCode : w.code) + wmoZh(w.dayCode != null ? w.dayCode : w.code) + "，现在 " + w.t + "°C（今天 " + w.lo + "~" + w.hi + "°）" : ""; }
// 特殊天气判定（给「角色对天气有反应」用）：雨/雪/雷雨/大雾/高温/严寒才算，晴阴多云返回 null
function wxSpecial(w) {
  if (!w || !isFinite(w.t)) return null;
  const c = w.dayCode != null ? w.dayCode : w.code;
  if (c >= 95) return "雷雨";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "下雪";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "下雨";
  if (c === 45 || c === 48) return "大雾";
  if (isFinite(w.hi) && w.hi >= 33) return "高温";
  if (isFinite(w.lo) && w.lo <= -10) return "严寒";
  return null;
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
  // 篇幅：设了下限（≥150）就别再暗示写短，否则「一小段2-6句」+尾部「宁可短」会把下限压没（她报的 bug）
  const wantLong = session.minWords && session.minWords >= 150;
  const lenGuide = wantLong ? "充分展开写足这一段——把动作、神态、心理、环境、对话都写够，别省笔墨" : "写成一小段（约2到6句）";
  const system = buildBundle(ctx) +
    "\n\n" + NARRATIVE_ANTI_CLICHE +
    "\n\n" + INTIMATE_ANTI_CLICHE +
    cotSystemBlock(cotT) +
    "\n\n【当前场景：线下面对面】你和" + userName + "此刻身处同一个地方，面对面相处（不是隔着手机聊天）。用第一人称『我』完全代入「" + char.name + "」，称对方为『你』。把这一刻演绎成有画面感的叙事：融合【动作描写】【神态与心理描写】【环境旁白】与【对话】，" + lenGuide + "。对话用引号包住。自然推进、不出戏、不提前跳到未发生的剧情。" +
    (ctx.timeAware !== false ? "\n【时间感】你清楚现在的真实时间（见上文），让当下的时段自然渗进场景——天色光线、周围的动静、店家开没开、你此刻该困该饿还是精神，都照这个钟走；别报时刻表，也别把深夜写成白天。" : "") +
    (styleText ? "\n【文风要求】" + styleText : "") +
    narrativeDirective(session.narr) +
    (session.minWords ? "\n【篇幅要求·硬性，优先级高于「简短」的一般习惯】scene 正文至少写 " + session.minWords + " 字，务必写足——宁可多不可少，把这一刻的动作、心理、环境、对话都展开写透。" : "") +
    (notes.length ? "\n【临时导演提示（务必遵循）】" + notes.join("；") : "") +
    (ctx.curWear ? "\n【着装连贯】你现在穿着：" + ctx.curWear + "。除非场景变了、过了很久、或你明确换/脱了衣服，否则 wearing 保持这套；一旦场景真的换了（如从外面进了家、下了雨淋湿、换了衣服）就据实更新。" : "") +
    "\n【输出】只输出一个 JSON，不要代码块：\n{" + cotJsonField(cotT) + "\"scene\":\"这一刻的叙事正文（含动作/心理/旁白/对话）\",\"thought\":\"角色此刻没说出口的真实心声（一句；情绪复杂时可稍长）\",\"mood\":{\"label\":\"此刻心情词\"},\"wearing\":\"你此刻的穿着一句（随场景/剧情如实变化，别每段乱换）\",\"action\":\"你此刻正在做的动作一句（贴合这一段场景、【每段都据实更新】、别照抄上一段）\",\"affinityDelta\":整数(-5到5，这次面对面相处让你对对方的好感如何变化：亲近/被打动/被冒犯/失望，通常小幅，没什么波动就0)}";
  const hist = offlineHistory(session.msgs, userName, char.name);
  // ⭐尾部重申（治「越写越八股」）：长对话里开头的规矩会被稀释，模型还会模仿自己前文的油腻输出——
  // 把关键约束追加到上下文最尾（模型对结尾最敏感），每轮都在
  const tailNudge = "\n\n〔幕后提醒，绝不出现在正文里：①反陈词滥调清单全程生效——尤其禁通用小动作（挑眉/勾唇/垂眸/轻笑/喉结滚动）和空转大词；②这一段的【句式、开头方式、意象、节奏】不许和你上一段雷同——上一段用过的比喻和小动作这段一律换新的，长短句结构也换着来；③" + (wantLong ? "写够上面要求的篇幅，把这段写足写透，别注水凑字、也别偷懒写短" : "宁可短而准，别长而油") + "；" + (cotT ? "④cot 字段必填，先想后写。" : "") + "〕";
  if (hist.length && hist[hist.length - 1].role === "user") hist[hist.length - 1] = { role: "user", content: hist[hist.length - 1].content + tailNudge };
  else hist.push({ role: "user", content: "（继续）" + tailNudge });
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
  const text = (session.msgs || []).filter(m => !isOocMsg(m)).map(m => {
    if (m.role === "char") return ctx.char.name + "：" + (m.content || "");
    if (m.role === "narration") return "【场景】" + (m.content || "");
    return userName + "：" + (m.content || "");
  }).join("\n");
  const system = "把下面这段『" + userName + "』与『" + ctx.char.name + "』的线下相处做记忆归档。只输出 JSON：\n" +
    "{\"summary\":\"1~3句第三人称总结：在哪、做了什么、关键互动或情绪转折\"," +
    "\"details\":[\"谈话中值得长期记住的【具体细节】：彼此透露的事/新知道的信息/说过的重要的话/吃了什么去了哪——每条一句、开头带主语真名（" + userName + "／" + ctx.char.name + "），2~6条，宁具体勿空泛；真没有就 []\"]," +
    "\"open\":[\"这次线下里【新约好、还没兑现】的事（下次去哪/答应对方什么），每条一句；没有就 []\"]}";
  const raw = await callAI(p, system, [{ role: "user", content: "【线下经过】\n" + text }], { maxTokens: 4000 });
  const d = extractJSON(raw);
  if (d && d.summary) return { summary: String(d.summary).trim(), details: (Array.isArray(d.details) ? d.details : []).map(x => String(x).trim()).filter(Boolean).slice(0, 6), open: (Array.isArray(d.open) ? d.open : []).map(x => String(x).trim()).filter(Boolean).slice(0, 3) };
  return { summary: String(raw || "").trim(), details: [], open: [] };
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
  // 群 OOC 立的长期规矩：线上 replyGroup 有，线下也必须带着（否则一进线下角色就把规矩全忘了）
  const gDirs = (ctx.directives || []).map(d => (typeof d === "string" ? d : d && d.text) || "").filter(s => s.trim());
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
    (gDirs.length ? "\n\n【用户立下的长期规矩（高优先·在场所有角色务必遵守）】\n这些是用户明确要求的准则，优先级高于一般演绎习惯；在不违背各自核心人设的前提下务必遵守：\n" + gDirs.map((s, i) => (i + 1) + ". " + s.trim()).join("\n") : "") +
    (ctx.worldbook && ctx.worldbook.trim() ? "\n\n【世界书】\n" + ctx.worldbook.trim() : "") +
    (memLibText && memLibText.trim() ? "\n\n【记忆库·相关条目（请自然记住并保持一致）】\n" + memLibText.trim() : "") +
    "\n\n【当前场景：线下面对面 · 多人同处】用户和上述角色此刻身处同一个地方，面对面相处（不是隔着手机的群聊）。以沉浸的第三人称叙事推进这一刻：融合【动作描写】【神态与心理】【环境旁白】与【对话】。多个角色会自然地行动、开口、互相接话、跑题调侃或起冲突，像真实的多人相处那样，不是轮流回答用户。称用户为『你』。对话用引号包住。自然推进、不出戏、不提前跳到未发生的剧情。" +
    (styleText ? "\n【文风要求】" + styleText : "") +
    narrativeDirective(session.narr) +
    (session.minWords ? "\n【篇幅要求·硬性，优先级高于「简短」的一般习惯】每个 beat 的 scene 都充分展开，整段总字数至少 " + session.minWords + " 字，务必写足——宁可多不可少。" : "") +
    (notes.length ? "\n【临时导演提示（务必遵循）】" + notes.join("；") : "") +
    cotSystemBlock(cotT) +
    "\n【输出】只输出一个 JSON，不要代码块：\n{" + cotJsonField(cotT) + "\"beats\":[{\"name\":\"这一段里行动或说话的角色名；纯环境旁白填『旁白』\",\"scene\":\"这一段叙事正文（第三人称，含动作/神态/对话）\",\"thought\":\"（仅角色 beat，可选）该角色此刻没说出口的真实心声\",\"mood\":{\"label\":\"此刻心情词\"},\"affinityDelta\":\"（仅角色 beat）整数-5到5，这段相处让该角色对用户的好感如何变化，通常小幅、没波动就0\"}]}\n一次产出 2~5 个 beat，让在场角色轮流有戏、互相有来有往；name 必须是在场角色之一或『旁白』。";
  const hist = offlineGroupHistory(session.msgs, userName);
  // 尾部重申（同单人线下）：治长对话后段八股回潮 + cot 丢失
  const gWantLong = session.minWords && session.minWords >= 150;
  const gTail = "\n\n〔幕后提醒，绝不出现在正文里：①反陈词滥调清单全程生效——禁通用小动作（挑眉/勾唇/垂眸/轻笑/喉结滚动）和空转大词；②各角色声纹别互相同化，这一轮的句式/意象/开头不许和上一轮雷同；③" + (gWantLong ? "写够上面要求的篇幅，把这几个 beat 写足写透，别注水也别偷懒写短" : "宁可短而准，别长而油") + "；" + (cotT ? "④cot 字段必填，先想后写。" : "") + "〕";
  if (hist.length && hist[hist.length - 1].role === "user") hist[hist.length - 1] = { role: "user", content: hist[hist.length - 1].content + gTail };
  else hist.push({ role: "user", content: "（继续）" + gTail });
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
  // 和单人 summarizeOffline 同构：总结之外，具体细节/未兑现的约定也逐条出（v47.55 平权）
  const system = "把下面『" + userName + "』与" + names + "的这段线下相处做记忆归档。只输出 JSON：\n" +
    "{\"summary\":\"1~3句第三人称总结：他们在哪、一起做了什么、谁和谁有关键互动或情绪转折、达成的约定。具体、可复用\"," +
    "\"details\":[\"值得长期记住的【具体细节】：谁透露的事/新知道的信息/谁说过的重要的话/吃了什么去了哪——每条一句、开头带主语真名（" + userName + "／" + names + "），2~6条，宁具体勿空泛；真没有就 []\"]," +
    "\"open\":[\"这次线下里【新约好、还没兑现】的事（下次去哪/谁答应谁什么），每条一句；没有就 []\"]}";
  const raw = await callAI(p, system, [{ role: "user", content: "【线下经过】\n" + text }], { maxTokens: 4000 });
  const d = extractJSON(raw);
  if (d && d.summary) return { summary: String(d.summary).trim(), details: (Array.isArray(d.details) ? d.details : []).map(x => String(x).trim()).filter(Boolean).slice(0, 6), open: (Array.isArray(d.open) ? d.open : []).map(x => String(x).trim()).filter(Boolean).slice(0, 3) };
  return { summary: String(raw || "").trim(), details: [], open: [] };
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
// （原本这里有个 fmtStamp，被 1200 行附近的同名函数覆盖成了死代码——已删，真身在下面：同天只显时刻、跨天带月/日）
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
// 常见公历固定节日（月-日 → 名字）
const FIXED_FESTIVALS = {
  "1-1": "元旦", "2-14": "情人节", "3-8": "妇女节", "4-1": "愚人节",
  "5-1": "劳动节", "6-1": "儿童节", "10-31": "万圣夜", "11-11": "光棍节",
  "12-24": "平安夜", "12-25": "圣诞节", "12-31": "跨年夜"
};
// ============================================================
// 农历（1900–2100 查表法，标准 lunarInfo 压缩表）+ 农历节日
// ============================================================
const LUNAR_INFO = [0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520];
function lunarLeapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
function lunarLeapDays(y) { return lunarLeapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function lunarMonthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
function lunarYearDays(y) { let sum = 348; for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0; return sum + lunarLeapDays(y); }
// 公历 Date → { y, m, d, isLeap }（农历年/月/日）；超出 1900–2100 返回 null
function solarToLunar(dateObj) {
  const yy = dateObj.getFullYear();
  if (yy < 1901 || yy > 2099) return null;
  let offset = Math.round((Date.UTC(yy, dateObj.getMonth(), dateObj.getDate()) - Date.UTC(1900, 0, 31)) / 86400000);
  let i, temp = 0;
  for (i = 1900; i < 2101 && offset > 0; i++) { temp = lunarYearDays(i); offset -= temp; }
  if (offset < 0) { offset += temp; i--; }
  const year = i;
  const leap = lunarLeapMonth(year);
  let isLeap = false, month;
  for (month = 1; month < 13 && offset > 0; month++) {
    if (leap > 0 && month === leap + 1 && isLeap === false) { --month; isLeap = true; temp = lunarLeapDays(year); }
    else temp = lunarMonthDays(year, month);
    if (isLeap === true && month === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && month === leap + 1) { if (isLeap) isLeap = false; else { isLeap = true; --month; } }
  if (offset < 0) { offset += temp; --month; }
  return { y: year, m: month, d: offset + 1, isLeap: isLeap };
}
const LUNAR_FESTIVALS = { "1-1": "春节", "1-15": "元宵节", "2-2": "龙抬头", "5-5": "端午节", "7-7": "七夕", "7-15": "中元节", "8-15": "中秋节", "9-9": "重阳节", "12-8": "腊八" };
// 某天是不是农历节日（含除夕=腊月最后一天）；不是返回 null
function lunarFestivalOn(dateObj) {
  const l = solarToLunar(dateObj);
  if (!l || l.isLeap) return null;
  const f = LUNAR_FESTIVALS[l.m + "-" + l.d];
  if (f) return f;
  if (l.m === 12 && l.d === lunarMonthDays(l.y, 12)) return "除夕";
  return null;
}
// 这条消息是不是 OOC 幕后对话（v48.13 她点名：OOC 是说给模型听的，角色本人不该记住）。
// 两种形态都要认：①用户的 OOC 提问和群/线下的 OOC 回复都存 kind:"ooc"；
// ②单聊的 OOC 回复历史上存的是 kind:"system" + turnId:"ooc_…"——按 turnId 前缀兜住（含她已有的旧记录）。
// 所有「角色视角」的取材（记忆抽取/长期记忆/日记/周刊/同人文/塔罗/梦境/辩论/番茄钟/prompt 原文窗）都用它过滤。
function isOocMsg(m) { return !!(m && (m.kind === "ooc" || (m.turnId && String(m.turnId).indexOf("ooc_") === 0))); }
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
  // 人设截断长度和正戏(replyGroup 的 200)对齐：曾出现「正戏通、OOC 拦」的诡异 case——
  // 触发词恰好埋在人设第 200~220 字，只有 OOC 递出去（v48.19 她的 prohibited content 排查）
  const memberDesc = members.map(c => "【" + c.name + "】" + (c.persona || "（暂无设定）").slice(0, 200)).join("\n\n");
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
  if (opts.walletText && opts.walletText.trim()) {
    parts.push("【今天花的钱（真实流水，可当素材）】\n" + opts.walletText.trim() + "\n——不必逐笔罗列进日记，但如果哪笔买得开心/肉疼/是给谁买的，可以自然写进去。");
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
// opts.prevSaid：该角色最近评论用户别的日记时说过的话 → 逼 Ta 换新说法，治「每篇都同一个梗/开头」
async function generateDiaryComment(p, ctx, entryText, opts) {
  const parts = [buildBundle(ctx)];
  if (ctx.moodLabel) parts.push("【你此刻的心情】" + ctx.moodLabel);
  const prev = opts && Array.isArray(opts.prevSaid) ? opts.prevSaid.filter(Boolean) : [];
  if (prev.length) parts.push("【你最近评论 Ta 别的日记时说过】" + prev.map(s => "「" + String(s).slice(0, 50) + "」").join("、") + "——这次必须换新的说法和角度：开头、句式、梗都不许和之前重样，别活成复读机。");
  parts.push("【" + (ctx.profile && ctx.profile.name || "用户") + " 刚写下的这篇日记】\n" + entryText);
  const system = "你现在完全代入「" + ctx.char.name + "」。上面是 " + (ctx.profile && ctx.profile.name || "用户") + " 写的私人日记，Ta 给你看了。请以你的口吻写**一条评论**——就像在对方日记/朋友圈底下留言。\n要求：依据你此刻的心情、你和 Ta 的关系与好感度来决定语气（可以心疼/调侃/吃醋/欲言又止/敷衍，符合人设；好感高的更上心，好感低的可以淡）；口语、自然、简短（1~2 句，最多一小段）；不要复述日记内容，不要加旁白或动作括号，不要@别人。只输出评论正文。\n\n" + parts.join("\n\n");
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
  // 七要素清单（v47.77 借 LNPhone conclusion 规范）：让浓缩段不只记事件、还留住氛围和悬着的事
  const system = "把下面这【一段新对话】浓缩成一小段第三人称记忆。这段要覆盖到（有则写、无则跳，别硬凑）：①发生的关键事件 ②聊的主题 ③两人此刻的关系氛围（如刚吵完在冷战/正在暧昧/和好如初）④用户显露的情绪与需求 ⑤角色的情绪与态度 ⑥未完成的事（答应了没做的、约好的、话说一半的）⑦红包转账礼物照片等功能事件。具体可回看、信息密度高。这是要【追加】到长期记忆末尾的一段，别逐字复述对话、别复述早前已知的旧事、别升华总结。只输出这一段正文，别加标题。";
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
// 喂给模型的时间戳（prompt 专用，UI 别用）：同天必须明说「今天」——裸时刻模型会瞎猜，
// 下午说的话晚上在群里被引用成「昨天才说」就是这个坑（v47.81）
function fmtStampAI(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天" + fmtClock(d);
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yd.toDateString()) return "昨天" + fmtClock(d);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + fmtClock(d);
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

