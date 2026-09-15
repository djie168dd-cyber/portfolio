/* ============================================
   简历问答助手（RAG）前端组件
   接口：POST /api/ask  { message, history } -> { answer, sources }
   纯原生 JS，无第三方依赖
   ============================================ */
(function () {
    "use strict";

    const SUGGESTED = [
        "先简单介绍一下你自己",
        "智能枕头 App 是为了解决什么问题？",
        "你最有代表性的 AI 项目是什么？",
        "怎么做活动物料的申请与审批？",
        "怎么联系你？"
    ];

    const history = []; // { role, content }，随请求发送支持多轮追问

    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[ch]));
    }

    function buildDom(withLauncher) {
        // 悬浮入口按钮（案例页等无内联按钮时使用）
        let launcher = null;
        if (withLauncher) {
            launcher = el("button", "rag-launcher");
            launcher.type = "button";
            launcher.setAttribute("aria-label", "打开简历问答助手");
            launcher.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>问我</span><span class="rag-launcher-dot" aria-hidden="true"></span>`;
        }

        // 对话面板
        const panel = el("div", "rag-panel");
        panel.id = "ragPanel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "false");
        panel.setAttribute("aria-label", "简历问答助手");
        panel.innerHTML = `
            <div class="rag-header">
                <span class="rag-header-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V18a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 22h6"/></svg>
                </span>
                <span class="rag-header-text">
                    <strong>问答助手</strong>
                    <small>基于简历与作品集内容回答</small>
                </span>
                <button type="button" class="rag-close" aria-label="关闭问答助手">&times;</button>
            </div>
            <div class="rag-messages" id="ragMessages"></div>
            <div class="rag-chips" id="ragChips"></div>
            <div class="rag-input-row">
                <textarea class="rag-input" id="ragInput" rows="1" placeholder="输入你的问题，如：介绍下你的 AI 项目" aria-label="输入问题"></textarea>
                <button type="button" class="rag-send" id="ragSend" aria-label="发送问题">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
                </button>
            </div>
            <div class="rag-footer-note">回答由大模型基于简历资料生成，仅供参考</div>`;

        if (launcher) document.body.appendChild(launcher);
        document.body.appendChild(panel);
        return {
            launcher,
            panel,
            messages: panel.querySelector("#ragMessages"),
            chips: panel.querySelector("#ragChips"),
            input: panel.querySelector("#ragInput"),
            send: panel.querySelector("#ragSend"),
            close: panel.querySelector(".rag-close")
        };
    }

    document.addEventListener("DOMContentLoaded", function () {
        // 页面内的触发按钮（如 Hero 区“和我的经历直接对话”）；存在时不显示悬浮入口
        const inlineTriggers = Array.from(document.querySelectorAll("[data-rag-open]"));
        const refs = buildDom(!inlineTriggers.length);
        let opened = false;
        let busy = false;
        let lastFocus = null;

        if (inlineTriggers.length) {
            // 首页：由 Hero 按钮触发、无悬浮入口，对话面板贴近左下角
            document.body.classList.add("rag-has-inline-trigger");
            inlineTriggers.forEach(trigger => {
                trigger.setAttribute("aria-haspopup", "dialog");
                trigger.setAttribute("aria-expanded", "false");
                trigger.addEventListener("click", () => {
                    lastFocus = trigger;
                    openPanel();
                });
            });
        }

        function welcome() {
            addBot("你好，我是邓洁作品集的问答助手。可以问我她的项目经历、擅长的方向，或某个项目的背景与成果。", null, false);
            renderChips();
        }

        function renderChips() {
            refs.chips.innerHTML = "";
            SUGGESTED.forEach(text => {
                const chip = el("button", "rag-chip");
                chip.type = "button";
                chip.textContent = text;
                chip.addEventListener("click", () => ask(text));
                refs.chips.appendChild(chip);
            });
        }

        function scrollDown() {
            refs.messages.scrollTop = refs.messages.scrollHeight;
        }

        function addUser(text) {
            const wrap = el("div", "rag-msg rag-msg-user");
            const bubble = el("div", "rag-bubble", escapeHtml(text));
            wrap.appendChild(bubble);
            refs.messages.appendChild(wrap);
            scrollDown();
        }

        function addBot(text, sources, withSources) {
            const wrap = el("div", "rag-msg rag-msg-bot");
            const bubble = el("div", "rag-bubble");
            bubble.textContent = text;
            if (withSources && sources && sources.length) {
                const seen = new Set();
                const labels = sources
                    .map(s => s.category)
                    .filter(c => c && !seen.has(c) && seen.add(c));
                if (labels.length) {
                    const src = el("div", "rag-sources");
                    labels.slice(0, 3).forEach(name => {
                        src.appendChild(el("span", null, escapeHtml(name)));
                    });
                    bubble.appendChild(src);
                }
            }
            wrap.appendChild(bubble);
            refs.messages.appendChild(wrap);
            scrollDown();
            return bubble;
        }

        function showTyping() {
            const wrap = el("div", "rag-msg rag-msg-bot");
            const bubble = el("div", "rag-bubble");
            bubble.innerHTML = `<span class="rag-typing" role="status" aria-label="正在思考"><i></i><i></i><i></i></span>`;
            wrap.appendChild(bubble);
            refs.messages.appendChild(wrap);
            scrollDown();
            return wrap;
        }

        function setBusy(state) {
            busy = state;
            refs.send.disabled = state;
            refs.input.disabled = state;
        }

        async function ask(questionRaw) {
            const question = (questionRaw || refs.input.value).trim();
            if (!question || busy) return;

            refs.input.value = "";
            refs.input.style.height = "auto";
            addUser(question);
            setBusy(true);
            const typing = showTyping();

            try {
                const response = await fetch("/api/ask", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: question, history })
                });
                const data = await response.json().catch(() => ({}));
                typing.remove();

                if (response.ok && data.answer) {
                    addBot(data.answer, data.sources, true);
                    history.push({ role: "user", content: question });
                    history.push({ role: "assistant", content: data.answer });
                } else {
                    const fallback = data.error || "暂时无法回答，请稍后再试，或直接发邮件到 3484307487@qq.com。";
                    const wrap = el("div", "rag-msg rag-msg-error");
                    wrap.appendChild(el("div", "rag-bubble", escapeHtml(fallback)));
                    refs.messages.appendChild(wrap);
                    scrollDown();
                }
            } catch (error) {
                typing.remove();
                const wrap = el("div", "rag-msg rag-msg-error");
                wrap.appendChild(el("div", "rag-bubble",
                    "连接问答服务失败。若你是直接双击打开的 HTML，请改用文件夹内“启动网站.cmd”或运行 node server.js 后通过 http://localhost:8080 访问。"));
                refs.messages.appendChild(wrap);
                scrollDown();
            } finally {
                setBusy(false);
                refs.input.focus();
            }
        }

        function setLauncherExpanded(value) {
            if (refs.launcher) refs.launcher.setAttribute("aria-expanded", String(value));
            inlineTriggers.forEach(t => t.setAttribute("aria-expanded", String(value)));
        }

        function openPanel() {
            if (!lastFocus) lastFocus = document.activeElement;
            refs.panel.classList.add("open");
            setLauncherExpanded(true);
            if (!opened) { opened = true; welcome(); }
            setTimeout(() => refs.input.focus(), 60);
        }

        function closePanel() {
            refs.panel.classList.remove("open");
            setLauncherExpanded(false);
            // 还原焦点给触发按钮，但禁止浏览器自动滚动到该元素（首页按钮在顶部，否则关闭时会跳回顶部）
            if (lastFocus && lastFocus.focus) {
                try { lastFocus.focus({ preventScroll: true }); }
                catch (err) { lastFocus.focus(); }
            }
        }

        if (refs.launcher) {
            refs.launcher.addEventListener("click", () =>
                refs.panel.classList.contains("open") ? closePanel() : openPanel());
        }
        refs.close.addEventListener("click", closePanel);
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && refs.panel.classList.contains("open")) closePanel();
        });

        refs.send.addEventListener("click", () => ask());
        refs.input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
            }
        });
        refs.input.addEventListener("input", () => {
            refs.input.style.height = "auto";
            refs.input.style.height = Math.min(refs.input.scrollHeight, 96) + "px";
        });
    });
})();
