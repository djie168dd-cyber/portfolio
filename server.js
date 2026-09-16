const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

// 静态资源缓存配置
const cacheConfig = {
  // HTML/CSS/JS 不缓存，确保样式与交互更新即时生效
  ".html": "no-cache",
  ".css": "no-cache",
  ".js": "no-cache",
  // 图片/PDF 缓存 30 天
  ".png": "public, max-age=2592000",
  ".jpg": "public, max-age=2592000",
  ".jpeg": "public, max-age=2592000",
  ".webp": "public, max-age=2592000",
  ".svg": "public, max-age=2592000",
  ".ico": "public, max-age=2592000",
  ".pdf": "public, max-age=2592000"
};

/* ============================================
   RAG 问答：本地检索 + OpenAI 兼容大模型
   配置全部来自环境变量，密钥只在服务端使用，不会下发浏览器：
     LLM_API_KEY   大模型 API Key（必填，否则问答接口返回未配置提示）
     LLM_BASE_URL  服务地址，默认 https://api.deepseek.com（OpenAI 兼容即可，如通义/OpenAI）
     LLM_MODEL     模型名，默认 deepseek-chat
   ============================================ */
// 可选：从 rag/llm-local.json 读取配置（该文件已加入 .gitignore，避免泄露密钥）
// 优先级：环境变量 > 本地配置文件
function loadLocalConfig() {
  try {
    const cfgPath = path.join(root, "rag", "llm-local.json");
    return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {
    return {};
  }
}
const localConfig = loadLocalConfig();
const LLM_API_KEY = process.env.LLM_API_KEY || localConfig.apiKey || "";
const LLM_BASE_URL = (process.env.LLM_BASE_URL || localConfig.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
const LLM_MODEL = process.env.LLM_MODEL || localConfig.model || "deepseek-chat";
const TOP_K = 4;

// 加载知识库并预处理检索词
function loadKnowledgeBase() {
  const kbPath = path.join(root, "rag", "knowledge-base.json");
  const kb = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
  return (kb.chunks || []).map(chunk => {
    const tagText = (chunk.tags || []).join(" ");
    const haystack = [chunk.category, chunk.title, tagText, chunk.content].join(" \n").toLowerCase();
    return { ...chunk, tagText: tagText.toLowerCase(), haystack };
  });
}
let knowledgeChunks = [];
try {
  knowledgeChunks = loadKnowledgeBase();
  console.log(`问答知识库已加载：${knowledgeChunks.length} 个内容片段。`);
} catch (error) {
  console.warn("知识库加载失败，问答检索将不可用：", error.message);
}

// 加载 FAQ（高频问题标准答复），优先于知识库与大模型
function loadFaqs() {
  const faqPath = path.join(root, "rag", "faq.json");
  const data = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
  return (data.faqs || []).map(faq => ({
    ...faq,
    haystack: [faq.category, faq.q, (faq.keywords || []).join(" ")].join(" \n").toLowerCase(),
    keys: (faq.keywords || []).map(k => String(k).toLowerCase().trim()).filter(Boolean)
  }));
}
let faqs = [];
try {
  faqs = loadFaqs();
  const answered = faqs.filter(f => f.a && f.a.trim()).length;
  console.log(`FAQ 已加载：${faqs.length} 个问题，其中 ${answered} 个已填答案（未填答案的会自动走知识库回答）。`);
} catch (error) {
  console.warn("FAQ 加载失败（将仅使用知识库）：", error.message);
}

// FAQ 匹配：关键词整串包含优先，其次 ngram 重合；仅返回“已填答案”的 FAQ
function matchFaq(queryRaw) {
  const query = String(queryRaw || "").toLowerCase().trim();
  if (!query || !faqs.length) return null;
  const queryTokens = new Set(tokenize(query));
  let best = null;
  for (const faq of faqs) {
    if (!faq.a || !faq.a.trim()) continue; // 未填答案则跳过，交给知识库+大模型
    let score = 0;
    // 关键词整串命中，权重最高
    for (const key of faq.keys) {
      if (key.length >= 2 && query.includes(key)) score += 6;
    }
    // ngram / 整词重合
    for (const token of queryTokens) {
      if (token.length < 2) continue;
      score += countOccurrences(faq.haystack, token);
    }
    if (!best || score > best.score) best = { faq, score };
  }
  // 阈值：要么关键词命中(>=6)，要么重合度足够(>=4)
  if (best && (best.score >= 6 || best.score >= 4)) return best.faq;
  return null;
}

// 查询词扩展：常见别称
const ALIASES = {
  "电话": "手机", "电话号码": "手机", "vx": "微信", "wechat": "微信", "威信": "微信",
  "邮件": "邮箱", "email": "邮箱", "mail": "邮箱",
  "履历": "简历", "cv": "简历", "resume": "简历",
  "闹钟枕": "智能枕头", "枕头": "智能枕头", "闹钟": "智能枕头",
  "物料": "活动物料管理系统", "prd": "需求文档",
  "毕业学校": "院校", "学校": "院校", "经验": "工作年限", "几年": "工作年限"
};

// 中英混合分词：英文/数字整词，中文取整段 + 二元 + 三元 gram
function tokenize(text) {
  const tokens = [];
  const groups = String(text).toLowerCase().match(/[a-z0-9]+|[一-龥]+/g) || [];
  for (const group of groups) {
    if (/[一-龥]/.test(group)) {
      tokens.push(group);
      for (let i = 0; i < group.length - 1; i++) tokens.push(group.slice(i, i + 2));
      for (let i = 0; i < group.length - 2; i++) tokens.push(group.slice(i, i + 3));
    } else {
      tokens.push(group);
    }
  }
  return tokens;
}

function countOccurrences(haystack, token) {
  if (!token) return 0;
  let count = 0, index = 0;
  while ((index = haystack.indexOf(token, index)) !== -1) { count++; index += token.length; }
  return count;
}

// 本地相似度检索
function retrieve(query) {
  let expanded = String(query || "").toLowerCase();
  for (const [from, to] of Object.entries(ALIASES)) {
    if (expanded.includes(from)) expanded += " " + to;
  }
  const queryTokens = [...new Set(tokenize(expanded))];
  if (!queryTokens.length) return [];

  const scored = knowledgeChunks.map(chunk => {
    let score = 0;
    for (const token of queryTokens) {
      const inContent = countOccurrences(chunk.haystack, token);
      score += inContent;
      if (chunk.tagText.includes(token)) score += 3;
      if (chunk.title.toLowerCase().includes(token)) score += 2;
    }
    if (chunk.haystack.includes(expanded.trim())) score += 5; // 整句命中加权
    return { chunk, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(item => item.chunk);

  // 检索为空时，至少给模型一段整体画像，避免对基本问题完全无上下文
  if (!scored.length) {
    const fallback = knowledgeChunks.find(c => c.id === "profile-summary");
    if (fallback) return [fallback];
  }
  return scored;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(body);
}

async function callLlm(question, contexts, history) {
  const contextText = contexts.map((c, i) =>
    `【资料${i + 1}｜${c.category}｜${c.title}】\n${c.content}`
  ).join("\n\n");

  const systemPrompt = [
    "你是产品经理邓洁作品集网站上的「问答助手」，代表邓洁与招聘方、HR、面试官对话。",
    "严格要求：",
    "1. 只能依据下面“参考资料”回答，使用简体中文，以邓洁第一人称“我”口吻，专业、简洁、可信，一般 2 到 5 句话。",
    "2. 不得编造资料之外的公司、数据、时间、职位或经历；资料没有依据时，明确说明“这部分资料暂未覆盖”，并可建议对方发邮件到 3484307487@qq.com 进一步沟通。",
    "3. 被问到联系方式时给出：手机/微信 13672919213，邮箱 3484307487@qq.com。",
    "4. 不要输出“根据资料/根据检索”之类的元描述，自然作答即可。",
    "",
    "参考资料：",
    contextText
  ].join("\n");

  const messages = [{ role: "system", content: systemPrompt }];
  // 仅带入最近 6 轮对话，控制长度
  for (const turn of (history || []).slice(-6)) {
    if (turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string") {
      messages.push({ role: turn.role, content: turn.content.slice(0, 1000) });
    }
  }
  messages.push({ role: "user", content: question });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 600
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`上游模型返回 ${response.status}：${detail.slice(0, 300)}`);
    }
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("上游模型未返回有效内容");
    return answer;
  } finally {
    clearTimeout(timer);
  }
}

// ---- 防滥用：简单内存限频（部署到公网/免费托管时保护大模型额度）----
// 可用环境变量 RATE_MAX（每窗口请求数）、RATE_WINDOW_MS（窗口毫秒）调整
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60000);
const RATE_MAX = Number(process.env.RATE_MAX || 12);
const rateBuckets = new Map();

// 周期性清理过期计数桶，避免内存无限增长（.unref 不阻止进程退出）
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS).unref();

function clientIpOf(req) {
  // Render 等经反向代理，真实 IP 在 x-forwarded-for 首段
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

async function handleAsk(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", "Allow": "POST" });
    return res.end("Method Not Allowed");
  }

  // 限频：同一 IP 每窗口最多 RATE_MAX 次
  const ip = clientIpOf(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) {
    return sendJson(res, 429, { error: "请求过于频繁，请稍后再试。" });
  }

  let raw = "";
  req.setEncoding("utf-8");
  for await (const piece of req) {
    raw += piece;
    if (raw.length > 8000) {
      return sendJson(res, 413, { error: "问题内容过长，请精简后重试。" });
    }
  }

  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return sendJson(res, 400, { error: "请求格式不正确。" });
  }

  const question = String(payload.message || "").trim();
  const history = Array.isArray(payload.history) ? payload.history : [];
  if (!question) return sendJson(res, 400, { error: "请输入你的问题。" });
  if (question.length > 1000) return sendJson(res, 400, { error: "问题请控制在 1000 字以内。" });

  if (!LLM_API_KEY) {
    return sendJson(res, 503, {
      error: "问答助手尚未配置大模型 API Key。请在启动 server.js 前设置环境变量 LLM_API_KEY（可选 LLM_BASE_URL、LLM_MODEL），详见《问答助手配置说明.md》。"
    });
  }
  if (!knowledgeChunks.length) {
    return sendJson(res, 503, { error: "知识库未加载，请确认 rag/knowledge-base.json 存在且格式正确。" });
  }

  // 1) 优先查 FAQ：命中已配置的标准答复则直接返回，不再调用大模型
  const faqHit = matchFaq(question);
  if (faqHit) {
    return sendJson(res, 200, {
      answer: faqHit.a.trim(),
      sources: [{ category: "FAQ", title: faqHit.q }],
      fromFaq: true
    });
  }

  try {
    // 2) FAQ 未命中：本地知识库检索 + 大模型生成
    const contexts = retrieve(question);
    const answer = await callLlm(question, contexts, history);
    const sources = contexts.map(c => ({ category: c.category, title: c.title }));
    return sendJson(res, 200, { answer, sources });
  } catch (error) {
    const aborted = error.name === "AbortError";
    console.error("问答接口错误：", error.message);
    return sendJson(res, 502, {
      error: aborted ? "模型响应超时，请稍后重试。" : "问答服务暂时不可用，请稍后重试，或直接发邮件联系。"
    });
  }
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);

  // RAG 问答接口
  if (requestPath === "/api/ask") {
    handleAsk(req, res).catch(error => {
      console.error(error);
      sendJson(res, 500, { error: "服务器内部错误。" });
    });
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  // 密钥文件禁止通过 HTTP 访问（返回 404，不暴露其存在）
  if (path.basename(filePath) === "llm-local.json") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      const status = error.code === "ENOENT" ? 404 : 500;
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(status === 404 ? "Not found" : "Server error");
    }

    const ext = path.extname(filePath).toLowerCase();

    // 仅本地运行且已配置大模型密钥时，向 HTML 注入问答助手启用标记。
    // GitHub Pages 等纯静态托管没有此标记，前端据此隐藏 AI 对话入口，避免招聘方点到报错。
    if (ext === ".html" && LLM_API_KEY) {
      let html = data.toString("utf8");
      if (html.includes("</head>") && !html.includes("rag-local")) {
        html = html.replace("</head>", '  <script>document.documentElement.classList.add("rag-local");</script>\n</head>');
      }
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": cacheConfig[ext] || "no-cache"
      });
      return res.end(html);
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": cacheConfig[ext] || "no-cache"
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(port, () => {
    console.log(`邓洁产品经理作品集已启动：http://localhost:${port}`);
    console.log(LLM_API_KEY
      ? `问答助手已启用（模型：${LLM_MODEL}）。`
      : "问答助手未启用：未检测到 LLM_API_KEY（静态网站不受影响），配置方法见《问答助手配置说明.md》。");
    console.log("按 Ctrl + C 可停止服务。");
  });
}

// 导出供检索自测使用
module.exports = { retrieve, loadKnowledgeBase, knowledgeChunks };
