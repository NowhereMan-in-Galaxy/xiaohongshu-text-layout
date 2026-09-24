/*
 * 应用主程序 —— 把编辑器、设置面板、分页引擎、预览和导出串起来
 *
 * 数据流：
 *   输入文字 / 改设置  →  schedule()  →  update()
 *     → Markdown.parse 解析成块
 *     → Paginator.paginate 在测量台上真实排版分页
 *     → 渲染预览（平铺 / 手机）
 *     → 自动保存草稿
 */
(() => {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => [...document.querySelectorAll(sel)];

    /* ================================================================ 默认值 */

    const DEFAULTS = {
        theme: 'cream',
        accent: null,
        ratio: '3:4',
        fontSize: 42,
        lineHeight: 1.75,
        paraSpacing: 0.6,
        align: 'justify',
        indent: false,
        bodyFont: 'theme',
        headFont: 'theme',
        cover: { enabled: true, title: '', subtitle: '', badge: '', sticker: '✨' },
        header: '',
        watermark: '',
        pageNum: true,
        scale: 1,
    };

    const BADGES = ['干货', '保姆级', '建议收藏', '亲测有效', '新手必看', '合集'];
    const STICKERS = ['', '✨', '🔥', '📌', '💡', '🌙', '🍓', '📚', '☕️', '🌿'];
    const TEXT_COLORS = ['#e8804a', '#ff2442', '#e0607e', '#f5a623', '#2ed573', '#12a150', '#1e90ff', '#2f6feb', '#8b6cff', '#a55eea', '#8a8a8a', '#1d1d1f'];

    const SAMPLE = `# 把长文排成==好看的卡片==，只要三步

写小红书长文，最头疼的就是**排版**：字太密没人看，截图又不好看。这个工具帮你把文字自动排成一页页精致的卡片，左边写，右边实时出图。

## 01 放心写，自动分页

每一行就是一个段落，写多长都行。一页放不下的内容会自动接到下一页，**加粗**、[color:#e8804a]颜色[/color]这些格式也会跟着走，*一个字都不会被裁掉*。

想从某处强制换页？单独写一行 \`---\` 就可以。

## 02 用 Markdown 点缀重点

- **加粗**：用两个星号包起来
- ==荧光笔==：用两个等号包起来
- __下划线__ 和 ~~删除线~~ 也都支持
- 图片直接粘贴或拖进编辑框

> 小技巧：选中文字后按 Ctrl/⌘ + B 加粗，Ctrl/⌘ + E 高亮。点工具栏最右边的「?」可以看全部语法。

## 03 挑主题，导出

| 主题 | 适合写什么 |
|:--|:--|
| 奶油手帐 | 日常分享、好物推荐 |
| 学习笔记 | 干货、考试经验 |
| 杂志 | 观点、书评影评 |
| 夜读 | 情绪、故事 |
| 终端 | 技术分享 |

右边还能调字号、生成封面、加署名和页码。点「手机预览」，看看发出去是什么样子 📱

***

## 今日待办

- [x] 写完这篇笔记
- [ ] 换个主题试试
- [ ] 导出，发布！

#长文排版 #小红书运营 #效率工具`;

    const clone = (o) => JSON.parse(JSON.stringify(o));
    const mergeSettings = (s) => ({ ...clone(DEFAULTS), ...(s || {}), cover: { ...DEFAULTS.cover, ...((s && s.cover) || {}) } });

    /* ================================================================ 状态 */

    const state = {
        draftId: null,
        text: '',
        settings: clone(DEFAULTS),
        model: null, // { doc, pages, total, coverFs, cover }
        view: 'grid',
        phoneMode: 'note',
        selected: 0,
        caretPage: -1,
        zoom: 300,
        busy: false,
    };

    const ed = $('#editor');

    /* ================================================================ 小工具 */

    let toastTimer = 0;
    function toast(msg, ms = 2400) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        if (ms) toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    }

    function debounce(fn, ms) {
        let t = 0;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    /* ================================================================ 图片 */

    const Images = {
        cache: new Map(), // src → {url, w, h}；加载失败为 null

        load(src) {
            if (src.startsWith('img:')) {
                return Store.assets.get(src).then((r) => r || null);
            }
            return new Promise((resolve) => {
                const img = new Image();
                if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
                const timer = setTimeout(() => resolve(null), 10000);
                img.onload = () => { clearTimeout(timer); resolve({ url: src, w: img.naturalWidth, h: img.naturalHeight }); };
                img.onerror = () => { clearTimeout(timer); resolve(null); };
                img.src = src;
            });
        },

        async resolveAll(blocks) {
            const srcs = [...new Set(blocks.filter((b) => b.type === 'img').map((b) => b.src))];
            await Promise.all(srcs.filter((s) => !this.cache.has(s)).map(async (s) => {
                this.cache.set(s, await this.load(s));
            }));
        },

        /** 压缩并保存用户插入的图片，返回 img:xxx 引用 */
        async add(file) {
            const url = await readAsDataURL(file);
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = url;
            });
            let rec = { url, w: img.naturalWidth, h: img.naturalHeight };
            const MAX = 2000;
            const keep = (file.type === 'image/png' || file.type === 'image/gif') && file.size < 1.5e6;
            if (!keep && (file.size > 6e5 || Math.max(rec.w, rec.h) > MAX)) {
                const k = Math.min(1, MAX / Math.max(rec.w, rec.h));
                const c = document.createElement('canvas');
                c.width = Math.round(rec.w * k);
                c.height = Math.round(rec.h * k);
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0, c.width, c.height);
                rec = { url: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
            }
            const id = 'img:' + Store.drafts.newId();
            await Store.assets.put(id, rec);
            this.cache.set(id, rec);
            return id;
        },
    };

    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
        });
    }

    /* ================================================================ 排版流水线 */

    let generation = 0;

    async function update() {
        const gen = ++generation;
        const s = state.settings;
        const doc = Markdown.parse(state.text);
        await Images.resolveAll(doc.blocks);
        if (gen !== generation) return;

        // 开启封面且没有单独填写封面标题时，第一个 # 标题放到封面上，正文里不再重复
        const cover = s.cover.enabled;
        const titleBlock = cover && !s.cover.title.trim()
            ? doc.blocks.find((b) => b.type === 'h' && b.level === 1)
            : null;

        const blocks = doc.blocks
            .filter((b) => b !== titleBlock)
            .map((b) => ({ type: b.type, html: Render.blockHtml(b, Images.cache) }));

        const pages = Paginator.paginate(blocks, () => Render.shell(s));
        const total = pages.length + (cover ? 1 : 0);
        const coverFs = cover ? Paginator.measure(Render.coverShell(s, doc, total), Render.fitCover) : null;

        state.model = { doc, pages, total, cover, coverFs, titleLine: titleBlock ? titleBlock.line : null };
        state.selected = Math.min(state.selected, total - 1);
        renderPreview();
        updateStats();
        syncCaretPage();
        $('#draftTitle').textContent = draftTitle() || '未命名草稿';
        save();
    }

    const schedule = debounce(update, 160);

    /** 按序号生成一页完整的 DOM（预览和导出都用它） */
    function buildPage(i) {
        const { model } = state;
        const s = state.settings;
        if (model.cover && i === 0) {
            const el = Render.coverShell(s, model.doc, model.total);
            el.querySelector('.cv-title').style.setProperty('--cv-fs', model.coverFs + 'px');
            return el;
        }
        const el = Render.shell(s, { index: i, total: model.total });
        el.querySelector('.pg-body').innerHTML = model.pages[i - (model.cover ? 1 : 0)].html;
        return el;
    }

    /* ================================================================ 预览 */

    function renderPreview() {
        const { total } = state.model;
        $('#pageInfo').textContent = `共 ${total} 页`;
        if (state.view === 'phone') renderPhone();
        else renderGrid();
    }

    function renderGrid() {
        const grid = $('#grid');
        const scroll = grid.scrollTop;
        const [w, h] = Render.size(state.settings.ratio);
        const k = state.zoom / w;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < state.model.total; i++) {
            const t = document.createElement('div');
            t.className = 'thumb' + (i === state.selected ? ' sel' : '') + (i === state.caretPage ? ' caret-here' : '');
            t.dataset.i = i;
            const frame = document.createElement('div');
            frame.className = 'thumb-frame';
            frame.style.width = state.zoom + 'px';
            frame.style.height = Math.round(h * k) + 'px';
            const pg = buildPage(i);
            pg.style.transform = `scale(${k})`;
            frame.appendChild(pg);
            const label = state.model.cover && i === 0 ? '封面' : `第 ${i + 1} 页`;
            const bar = document.createElement('div');
            bar.className = 'thumb-bar';
            bar.innerHTML = `<span>${label}</span><button data-dl="${i}" title="下载这一页"><svg class="i" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>下载</button>`;
            t.append(frame, bar);
            frag.appendChild(t);
        }
        grid.replaceChildren(frag);
        grid.scrollTop = scroll;
    }

    function rezoom() {
        const [w, h] = Render.size(state.settings.ratio);
        const k = state.zoom / w;
        $$('#grid .thumb-frame').forEach((f) => {
            f.style.width = state.zoom + 'px';
            f.style.height = Math.round(h * k) + 'px';
            f.firstElementChild.style.transform = `scale(${k})`;
        });
    }

    function markThumbs() {
        $$('#grid .thumb').forEach((t) => {
            const i = Number(t.dataset.i);
            t.classList.toggle('sel', i === state.selected);
            t.classList.toggle('caret-here', i === state.caretPage);
        });
    }

    function renderPhone() {
        const { model } = state;
        const s = state.settings;
        const pages = Array.from({ length: model.total }, (_, i) => buildPage(i));
        const doc = model.doc;
        const plainTitle = s.cover.title.trim()
            ? Markdown.toPlain(Markdown.parseInline(s.cover.title.replace(/\n/g, ' ')))
            : doc.title;
        const paras = doc.blocks.filter((b) => b.type === 'p' && b.text && !b.html.includes('class="tag"'));
        let desc = paras.slice(0, 2).map((b) => b.text).join(' ');
        if (desc.length > 90) desc = desc.slice(0, 90) + '…';
        const tags = [...new Set(doc.blocks.flatMap((b) => [...(b.html || '').matchAll(/class="tag">(#[^<]+)</g)].map((m) => m[1])))].slice(0, 6);
        Phone.render($('#phoneView'), {
            mode: state.phoneMode,
            pages,
            size: Render.size(s.ratio),
            title: plainTitle || '无标题',
            desc,
            tags,
            author: s.watermark.trim().replace(/^@/, '') || '我的账号',
        });
    }

    function setView(v) {
        state.view = v;
        $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
        $('#grid').hidden = v !== 'grid';
        $('#phoneView').hidden = v !== 'phone';
        $('.zoom').style.visibility = v === 'grid' ? '' : 'hidden';
        if (state.model) renderPreview();
    }

    function updateStats() {
        const { chars } = state.model.doc.stats;
        const mins = Math.max(1, Math.round(chars / 400));
        const total = state.model.total;
        const warn = total > 18 ? ` · <span class="warn">图片较多，小红书单篇笔记一般最多 18 张</span>` : '';
        $('#stats').innerHTML = `${chars} 字 · 约 ${mins} 分钟读完 · ${total} 页${warn}`;
    }

    /* ---------------- 编辑器光标 ↔ 预览页 联动 ---------------- */

    function caretLine() {
        return ed.value.slice(0, ed.selectionStart).split('\n').length - 1;
    }

    function pageOfLine(line) {
        const { model } = state;
        if (!model) return -1;
        if (model.cover && line === model.titleLine) return 0;
        const off = model.cover ? 1 : 0;
        let found = -1;
        model.pages.forEach((p, i) => {
            if (p.first !== null && p.first <= line) found = i + off;
        });
        return found === -1 ? off : found;
    }

    function syncCaretPage() {
        if (document.activeElement !== ed) return;
        const p = pageOfLine(caretLine());
        if (p === state.caretPage) return;
        state.caretPage = p;
        markThumbs();
        const el = $(`#grid .thumb[data-i="${p}"]`);
        if (el && state.view === 'grid') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function jumpToPage(i) {
        const { model } = state;
        const p = model.pages[i - (model.cover ? 1 : 0)];
        const line = model.cover && i === 0 ? model.titleLine : p && p.first;
        if (line === null || line === undefined) return;
        const lines = ed.value.split('\n');
        const pos = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
        ed.focus();
        ed.setSelectionRange(pos, pos);
        ed.scrollTop = Math.max(0, (line / lines.length) * ed.scrollHeight - ed.clientHeight / 3);
        if (matchMedia('(max-width: 820px)').matches) setPane('editor');
    }

    /* ================================================================ 编辑器命令 */

    /** 替换一段文字，尽量保留浏览器原生的撤销（Ctrl+Z） */
    function replaceRange(start, end, text, selStart = start + text.length, selEnd = selStart) {
        ed.focus();
        ed.setSelectionRange(start, end);
        let ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
        if (!ok || ed.value.slice(start, start + text.length) !== text) {
            ed.setRangeText(text, start, end, 'end');
            onInput();
        }
        ed.setSelectionRange(selStart, selEnd);
    }

    /** 给选中文字加上/去掉成对的标记，比如 **加粗** */
    function wrap(before, after = before, placeholder = '文字') {
        const { selectionStart: a, selectionEnd: b, value } = ed;
        const sel = value.slice(a, b);
        if (value.slice(a - before.length, a) === before && value.slice(b, b + after.length) === after) {
            replaceRange(a - before.length, b + after.length, sel, a - before.length, b - before.length);
            return;
        }
        if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
            const inner = sel.slice(before.length, sel.length - after.length);
            replaceRange(a, b, inner, a, a + inner.length);
            return;
        }
        const text = sel || placeholder;
        replaceRange(a, b, before + text + after, a + before.length, a + before.length + text.length);
    }

    function currentLines() {
        const { selectionStart: a, selectionEnd: b, value } = ed;
        const start = value.lastIndexOf('\n', a - 1) + 1;
        let end = value.indexOf('\n', b > a && value[b - 1] === '\n' ? b - 1 : b);
        if (end < 0) end = value.length;
        return { start, end, lines: value.slice(start, end).split('\n') };
    }

    const LINE_PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+•]\s+\[[ xX]\]\s+|[-*+•]\s+|\d+[.)、]\s+)?/;

    /** 给当前行（或选中的多行）切换行首标记：标题、列表、引用 */
    function toggleLinePrefix(kind) {
        const { start, end, lines } = currentLines();
        const make = (i) => ({
            h1: '# ', h2: '## ', h3: '### ', quote: '> ', ul: '- ', task: '- [ ] ', ol: `${i + 1}. `,
        })[kind];
        const same = (line) => {
            const m = LINE_PREFIX.exec(line)[2] || '';
            if (kind === 'ol') return /^\d/.test(m);
            if (kind === 'task') return /\[/.test(m);
            if (kind === 'ul') return /^[-*+•]\s+(?!\[)/.test(m);
            return m.trim() === make(0).trim();
        };
        const allSame = lines.filter((l) => l.trim()).every(same);
        const out = lines.map((line, i) => {
            if (!line.trim() && lines.length > 1) return line;
            const m = LINE_PREFIX.exec(line);
            const rest = line.slice(m[0].length);
            return allSame ? m[1] + rest : m[1] + make(i) + rest;
        }).join('\n');
        replaceRange(start, end, out, start + out.length);
    }

    /** 在光标处插入独占一行（或几行）的内容 */
    function insertBlock(text, selectFrom, selectTo) {
        const { selectionStart: a, selectionEnd: b, value } = ed;
        const pre = a > 0 && value[a - 1] !== '\n' ? '\n' : '';
        const post = value[b] !== '\n' ? '\n' : '';
        const ins = pre + text + post;
        const base = a + pre.length;
        replaceRange(a, b, ins,
            selectFrom === undefined ? a + ins.length : base + selectFrom,
            selectTo === undefined ? (selectFrom === undefined ? a + ins.length : base + selectFrom) : base + selectTo);
    }

    const COMMANDS = {
        h1: () => toggleLinePrefix('h1'),
        h2: () => toggleLinePrefix('h2'),
        h3: () => toggleLinePrefix('h3'),
        bold: () => wrap('**'),
        italic: () => wrap('*'),
        underline: () => wrap('__'),
        strike: () => wrap('~~'),
        mark: () => wrap('=='),
        ul: () => toggleLinePrefix('ul'),
        ol: () => toggleLinePrefix('ol'),
        task: () => toggleLinePrefix('task'),
        quote: () => toggleLinePrefix('quote'),
        table: () => insertBlock('| 项目 | 说明 |\n| --- | --- |\n| 内容 | 内容 |\n| 内容 | 内容 |', 2, 4),
        hr: () => insertBlock('***'),
        pagebreak: () => insertBlock('---'),
        image: () => $('#imageInput').click(),
        help: () => $('#helpDialog').showModal(),
        colors: () => toggleMenu($('#colorMenu')),
    };

    async function insertImages(files) {
        const list = [...files].filter((f) => f.type.startsWith('image/'));
        if (!list.length) return;
        toast(list.length > 1 ? `正在插入 ${list.length} 张图片…` : '正在插入图片…', 0);
        try {
            const ids = [];
            for (const f of list) ids.push(await Images.add(f));
            insertBlock(ids.map((id) => `![](${id})`).join('\n'));
            toast('图片已插入，可以在 ![ ] 的方括号里写图片说明');
        } catch (e) {
            console.error(e);
            toast('图片插入失败，换一张试试？');
        }
    }

    /* 回车时自动延续列表，空列表项再按回车就结束列表 */
    function continueList(e) {
        const { selectionStart: a, selectionEnd: b, value } = ed;
        if (a !== b) return false;
        const lineStart = value.lastIndexOf('\n', a - 1) + 1;
        const line = value.slice(lineStart, a);
        const m = /^(\s*)([-*+•]\s+\[[ xX]\]\s+|[-*+•]\s+|(\d+)([.)、])\s+|>\s?)(.*)$/.exec(line);
        if (!m) return false;
        e.preventDefault();
        if (!m[5].trim() && value.slice(a, value.indexOf('\n', a) < 0 ? value.length : value.indexOf('\n', a)).trim() === '') {
            replaceRange(lineStart, a, '');
            return true;
        }
        let marker = m[2];
        if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `;
        else if (/\[[xX]\]/.test(marker)) marker = marker.replace(/\[[xX]\]/, '[ ]');
        replaceRange(a, a, '\n' + m[1] + marker);
        return true;
    }

    function indentLines(out) {
        const { start, end, lines } = currentLines();
        const res = lines.map((l) => (out ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n');
        if (lines.length === 1 && !out && !LINE_PREFIX.exec(lines[0])[2]) {
            replaceRange(ed.selectionStart, ed.selectionEnd, '  ');
            return;
        }
        replaceRange(start, end, res, start, start + res.length);
    }

    function onKeyDown(e) {
        if (e.isComposing || e.keyCode === 229) return; // 输入法正在输入中文，别打扰
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();
        if (mod && !e.shiftKey && !e.altKey) {
            const map = { b: 'bold', i: 'italic', u: 'underline', e: 'mark' };
            if (map[key]) { e.preventDefault(); COMMANDS[map[key]](); return; }
            if (key === 'enter') { e.preventDefault(); COMMANDS.pagebreak(); return; }
            if (key === 's') { e.preventDefault(); save(true); return; }
        }
        if (key === 'tab' && !mod) { e.preventDefault(); indentLines(e.shiftKey); return; }
        if (key === 'enter' && !mod && !e.shiftKey) continueList(e);
    }

    function onInput() {
        state.text = ed.value;
        $('#saveState').textContent = '编辑中…';
        schedule();
    }

    /* ================================================================ 草稿 */

    function draftTitle() {
        if (!state.model) return '';
        return state.model.doc.title || state.text.trim().split('\n')[0].replace(/^[#>\-*\s]+/, '').slice(0, 24);
    }

    const saveNow = () => {
        if (!state.model) return;
        const title = draftTitle();
        const ok = Store.drafts.save(state.draftId, { title, text: state.text, settings: state.settings });
        Store.local.set('current', state.draftId);
        $('#saveState').textContent = ok ? '已自动保存' : '未能保存（浏览器存储不可用或已满）';
    };
    const saveLater = debounce(saveNow, 500);
    function save(now) {
        if (now) { saveNow(); toast('已保存到草稿箱'); } else saveLater();
    }

    function loadDraft(id) {
        const d = Store.drafts.load(id);
        if (!d) return;
        state.draftId = id;
        state.text = d.text || '';
        state.settings = mergeSettings(d.settings);
        ed.value = state.text;
        syncSettingsUI();
        update();
    }

    function newDraft(text) {
        saveNow();
        state.draftId = Store.drafts.newId();
        state.text = text;
        state.settings = mergeSettings({ ...state.settings, cover: { ...state.settings.cover, title: '', subtitle: '', badge: '' } });
        ed.value = text;
        syncSettingsUI();
        update();
        ed.focus();
    }

    function renderDraftMenu() {
        const menu = $('#draftMenu');
        const list = Store.drafts.list();
        const fmt = (t) => {
            const d = new Date(t);
            const now = new Date();
            const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return d.toDateString() === now.toDateString() ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日`;
        };
        menu.innerHTML = `<div class="label">草稿箱（保存在这台设备的浏览器里）</div>`
            + (list.length ? '' : '<div class="label">还没有草稿</div>')
            + list.map((d) => `
                <div class="item${d.id === state.draftId ? ' on' : ''}" data-id="${d.id}" role="button" tabindex="0">
                    <span class="t">${Markdown.escapeHtml(d.title)}</span>
                    <span class="d">${fmt(d.updated)}</span>
                    <button class="x" data-del="${d.id}" title="删除" aria-label="删除草稿">✕</button>
                </div>`).join('')
            + `<hr><button data-act="new">＋ 新建空白草稿</button><button data-act="sample">载入示例文章</button>`;
    }

    /* ================================================================ 设置面板 */

    function setSetting(path, value) {
        const keys = path.split('.');
        let o = state.settings;
        keys.slice(0, -1).forEach((k) => { o = o[k]; });
        o[keys[keys.length - 1]] = value;
        schedule();
    }

    function buildSettingsUI() {
        $('#themeList').innerHTML = Themes.list.map((t) => `
            <button class="theme-card" data-theme="${t.id}" title="${t.desc}">
                <span class="sw" style="background:${t.swatch[0]}"><i style="background:${t.swatch[1]}"></i><i style="background:${t.dark ? '#fff' : '#333'}"></i><i style="background:${t.dark ? '#fff' : '#333'}"></i><i style="background:${t.dark ? '#fff' : '#333'}"></i></span>
                ${t.name}
            </button>`).join('');

        $('#badgeChips').innerHTML = BADGES.map((b) => `<button data-badge="${b}">${b}</button>`).join('');
        $('#stickerChips').classList.add('emoji');
        $('#stickerChips').innerHTML = STICKERS.map((s) => `<button data-sticker="${s}" title="${s ? '贴纸' : '不要贴纸'}">${s || '无'}</button>`).join('');
        $('#colorMenu').innerHTML = TEXT_COLORS.map((c) => `<button data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
    }

    function renderAccents() {
        const s = state.settings;
        const theme = Themes.get(s.theme);
        const current = s.accent || theme.accents[0];
        $('#accentList').innerHTML = theme.accents.map((c) => `<button data-accent="${c}" style="background:${c}" class="${c === current ? 'on' : ''}" title="${c}"></button>`).join('')
            + `<label title="自定义颜色" class="${theme.accents.includes(current) ? '' : 'on'}"><input type="color" id="accentPicker" value="${current}"></label>`;
    }

    function syncSettingsUI() {
        const s = state.settings;
        $$('.theme-card').forEach((b) => b.classList.toggle('on', b.dataset.theme === s.theme));
        renderAccents();
        const seg = (id, v) => $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
        seg('ratioSeg', s.ratio);
        seg('alignSeg', s.align);
        seg('scaleSeg', s.scale);
        $('#fontSize').value = s.fontSize;
        $('#lineHeight').value = s.lineHeight;
        $('#paraSpacing').value = s.paraSpacing;
        $('#indent').checked = s.indent;
        $('#bodyFont').value = s.bodyFont;
        $('#headFont').value = s.headFont;
        $('#coverOn').checked = s.cover.enabled;
        $('#coverFields').classList.toggle('off', !s.cover.enabled);
        $('#coverTitle').value = s.cover.title;
        $('#coverSub').value = s.cover.subtitle;
        $('#coverBadge').value = s.cover.badge;
        $$('#badgeChips button').forEach((b) => b.classList.toggle('on', b.dataset.badge === s.cover.badge));
        $$('#stickerChips button').forEach((b) => b.classList.toggle('on', b.dataset.sticker === s.cover.sticker));
        $('#header').value = s.header;
        $('#watermark').value = s.watermark;
        $('#pageNum').checked = s.pageNum;
        syncOutputs();
    }

    function syncOutputs() {
        const s = state.settings;
        $('#fontSizeOut').textContent = s.fontSize + ' px';
        $('#lineHeightOut').textContent = Number(s.lineHeight).toFixed(2);
        $('#paraSpacingOut').textContent = Number(s.paraSpacing).toFixed(1);
    }

    function bindSettings() {
        $('#themeList').addEventListener('click', (e) => {
            const b = e.target.closest('[data-theme]');
            if (!b) return;
            state.settings.theme = b.dataset.theme;
            state.settings.accent = null;
            syncSettingsUI();
            schedule();
        });

        $('#accentList').addEventListener('click', (e) => {
            const b = e.target.closest('[data-accent]');
            if (!b) return;
            const theme = Themes.get(state.settings.theme);
            state.settings.accent = b.dataset.accent === theme.accents[0] ? null : b.dataset.accent;
            renderAccents();
            schedule();
        });
        $('#accentList').addEventListener('input', (e) => {
            if (e.target.id !== 'accentPicker') return;
            state.settings.accent = e.target.value;
            $$('#accentList button').forEach((b) => b.classList.remove('on'));
            e.target.parentElement.classList.add('on');
            schedule();
        });

        const segBind = (id, key, cast = String) => $(`#${id}`).addEventListener('click', (e) => {
            const b = e.target.closest('button[data-v]');
            if (!b) return;
            state.settings[key] = cast(b.dataset.v);
            syncSettingsUI();
            schedule();
        });
        segBind('ratioSeg', 'ratio');
        segBind('alignSeg', 'align');
        segBind('scaleSeg', 'scale', Number);

        for (const id of ['fontSize', 'lineHeight', 'paraSpacing']) {
            $('#' + id).addEventListener('input', (e) => {
                state.settings[id] = Number(e.target.value);
                syncOutputs();
                schedule();
            });
        }
        $('#indent').addEventListener('change', (e) => setSetting('indent', e.target.checked));
        $('#pageNum').addEventListener('change', (e) => setSetting('pageNum', e.target.checked));
        $('#bodyFont').addEventListener('change', (e) => {
            if (e.target.value === 'custom' && !customFontLoaded) $('#fontInput').click();
            setSetting('bodyFont', e.target.value);
        });
        $('#headFont').addEventListener('change', (e) => {
            if (e.target.value === 'custom' && !customFontLoaded) $('#fontInput').click();
            setSetting('headFont', e.target.value);
        });
        $('#fontUpload').addEventListener('click', () => $('#fontInput').click());

        $('#coverOn').addEventListener('change', (e) => {
            setSetting('cover.enabled', e.target.checked);
            $('#coverFields').classList.toggle('off', !e.target.checked);
        });
        const textBind = (id, path) => $('#' + id).addEventListener('input', (e) => setSetting(path, e.target.value));
        textBind('coverTitle', 'cover.title');
        textBind('coverSub', 'cover.subtitle');
        textBind('coverBadge', 'cover.badge');
        textBind('header', 'header');
        textBind('watermark', 'watermark');
        $('#coverBadge').addEventListener('input', (e) => {
            $$('#badgeChips button').forEach((b) => b.classList.toggle('on', b.dataset.badge === e.target.value));
        });

        $('#badgeChips').addEventListener('click', (e) => {
            const b = e.target.closest('[data-badge]');
            if (!b) return;
            const v = state.settings.cover.badge === b.dataset.badge ? '' : b.dataset.badge;
            setSetting('cover.badge', v);
            syncSettingsUI();
        });
        $('#stickerChips').addEventListener('click', (e) => {
            const b = e.target.closest('[data-sticker]');
            if (!b) return;
            setSetting('cover.sticker', b.dataset.sticker);
            syncSettingsUI();
        });

        $('#resetStyle').addEventListener('click', () => {
            const keep = { cover: state.settings.cover, header: state.settings.header, watermark: state.settings.watermark };
            state.settings = mergeSettings({ ...clone(DEFAULTS), ...keep, cover: { ...keep.cover, sticker: DEFAULTS.cover.sticker } });
            syncSettingsUI();
            schedule();
            toast('样式已恢复默认');
        });
    }

    /* ================================================================ 自定义字体 */

    let customFontLoaded = false;

    function installFont(rec) {
        let style = $('#customFontStyle');
        if (!style) {
            style = document.createElement('style');
            style.id = 'customFontStyle';
            document.head.appendChild(style);
        }
        style.textContent = `@font-face{font-family:"StudioCustomFont";src:url(${rec.url});font-display:block}`;
        customFontLoaded = true;
        $('#fontName').textContent = '已加载：' + rec.name;
        document.fonts.load('40px "StudioCustomFont"', '字').then(() => schedule()).catch(() => { });
    }

    async function onFontFile(file) {
        if (!file) return;
        if (file.size > 30e6) { toast('字体文件太大了（超过 30MB），换一个试试'); return; }
        toast('正在加载字体…', 0);
        const rec = { name: file.name.replace(/\.\w+$/, ''), url: await readAsDataURL(file) };
        installFont(rec);
        await Store.assets.put('font:custom', rec);
        if (state.settings.bodyFont !== 'custom') {
            state.settings.bodyFont = 'custom';
            syncSettingsUI();
        }
        toast(file.size > 8e6 ? '字体已加载。文件较大，导出会慢一些' : '字体已加载');
        schedule();
    }

    /* ================================================================ 导出 */

    function fileBase() {
        const { doc } = state.model;
        const t = state.settings.cover.title.trim() ? Markdown.toPlain(Markdown.parseInline(state.settings.cover.title.split('\n')[0])) : doc.title;
        return Exporter.safeName(t);
    }

    const pad = (n) => String(n).padStart(2, '0');

    async function renderAll() {
        const out = [];
        const base = fileBase();
        const total = state.model.total;
        for (let i = 0; i < total; i++) {
            toast(`正在生成第 ${i + 1} / ${total} 张…`, 0);
            out.push({ name: `${base}_${pad(i + 1)}.png`, blob: await Exporter.toBlob(buildPage(i), state.settings.scale) });
        }
        return out;
    }

    async function runExport(act) {
        if (state.busy || !state.model) return;
        state.busy = true;
        document.body.style.cursor = 'progress';
        try {
            const base = fileBase();
            const sel = state.selected;
            if (act === 'copy') {
                if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) throw new Error('当前浏览器不支持复制图片');
                toast('正在生成…', 0);
                await Exporter.copy(Exporter.toBlob(buildPage(sel), state.settings.scale));
                toast('已复制，可以直接粘贴到聊天或文档里');
            } else if (act === 'current') {
                toast('正在生成…', 0);
                Exporter.download(await Exporter.toBlob(buildPage(sel), state.settings.scale), `${base}_${pad(sel + 1)}.png`);
                toast('已下载这一页');
            } else if (act === 'share') {
                if (!Exporter.canShareFiles()) throw new Error('当前浏览器不支持分享图片，已改为下载压缩包');
                const entries = await renderAll();
                toast('请在弹出的面板里选择「存储图像」', 3000);
                await Exporter.share(entries, base);
            } else if (act === 'each') {
                const entries = await renderAll();
                for (const e of entries) {
                    Exporter.download(e.blob, e.name);
                    await new Promise((r) => setTimeout(r, 350));
                }
                toast(`已下载 ${entries.length} 张图片`);
            } else {
                // 手机上优先用系统分享面板，可以一键存到相册
                if (act === 'auto' && matchMedia('(pointer: coarse)').matches && Exporter.canShareFiles()) {
                    state.busy = false;
                    return await runExport('share');
                }
                const entries = await renderAll();
                toast('正在打包…', 0);
                Exporter.download(await Exporter.zip(entries), `${base}.zip`);
                toast(`已导出 ${entries.length} 张图片（ZIP 压缩包）`);
            }
        } catch (e) {
            if (e && e.name === 'AbortError') {
                toast('已取消');
            } else {
                console.error(e);
                const msg = e && e.message && /[一-龥]/.test(e.message) ? e.message : '导出失败了，请重试一次';
                toast(msg, 4000);
                if (act === 'share') { state.busy = false; return await runExport('zip'); }
            }
        } finally {
            state.busy = false;
            document.body.style.cursor = '';
        }
    }

    /* ================================================================ 外观 & 布局 */

    function applyDark() {
        const pref = Store.local.get('ui-theme');
        const dark = pref ? pref === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    }

    function setPane(p) {
        $('#app').dataset.pane = p;
        $$('#mobileTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === p));
    }

    function toggleMenu(menu, force) {
        const open = force !== undefined ? force : menu.hidden;
        $$('.menu').forEach((m) => { if (m !== menu) m.hidden = true; });
        menu.hidden = !open;
        const btn = menu.parentElement.querySelector('[aria-haspopup]');
        if (btn) btn.setAttribute('aria-expanded', String(open));
    }

    function setSettingsDrawer(open) {
        $('#app').classList.toggle('settings-open', open);
        $('#scrim').hidden = !open;
    }

    /* ================================================================ 事件绑定 */

    function bindEvents() {
        ed.addEventListener('input', onInput);
        ed.addEventListener('keydown', onKeyDown);
        for (const ev of ['keyup', 'click', 'focus']) ed.addEventListener(ev, syncCaretPage);

        ed.addEventListener('paste', (e) => {
            const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (files.length) { e.preventDefault(); insertImages(files); }
        });
        ed.addEventListener('dragover', (e) => {
            if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) {
                e.preventDefault();
                ed.classList.add('dragover');
            }
        });
        ed.addEventListener('dragleave', () => ed.classList.remove('dragover'));
        ed.addEventListener('drop', (e) => {
            ed.classList.remove('dragover');
            if (e.dataTransfer?.files?.length) { e.preventDefault(); insertImages(e.dataTransfer.files); }
        });

        $('#toolbar').addEventListener('mousedown', (e) => {
            // 点工具栏时不让编辑框失去选区
            if (e.target.closest('button')) e.preventDefault();
        });
        $('#toolbar').addEventListener('click', (e) => {
            const color = e.target.closest('[data-color]');
            if (color) {
                toggleMenu($('#colorMenu'), false);
                wrap(`[color:${color.dataset.color}]`, '[/color]');
                return;
            }
            const b = e.target.closest('[data-cmd]');
            if (b && COMMANDS[b.dataset.cmd]) COMMANDS[b.dataset.cmd]();
        });

        $('#imageInput').addEventListener('change', (e) => { insertImages(e.target.files); e.target.value = ''; });
        $('#fontInput').addEventListener('change', (e) => { onFontFile(e.target.files[0]); e.target.value = ''; });

        // 预览区
        $('#grid').addEventListener('click', (e) => {
            const dl = e.target.closest('[data-dl]');
            const t = e.target.closest('.thumb');
            if (!t) return;
            state.selected = Number(t.dataset.i);
            markThumbs();
            if (dl) runExport('current');
        });
        $('#grid').addEventListener('dblclick', (e) => {
            const t = e.target.closest('.thumb');
            if (t) jumpToPage(Number(t.dataset.i));
        });
        $('#zoom').addEventListener('input', (e) => {
            state.zoom = Number(e.target.value);
            Store.local.set('zoom', state.zoom);
            rezoom();
        });
        $('#viewSeg').addEventListener('click', (e) => {
            const b = e.target.closest('[data-view]');
            if (b) setView(b.dataset.view);
        });
        $('#phoneView').addEventListener('click', (e) => {
            const b = e.target.closest('[data-mode]');
            if (b) { state.phoneMode = b.dataset.mode; renderPhone(); }
        });

        // 顶栏
        $('#draftBtn').addEventListener('click', () => { renderDraftMenu(); toggleMenu($('#draftMenu')); });
        $('#draftMenu').addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) {
                e.stopPropagation();
                const id = del.dataset.del;
                if (!confirm('确定删除这篇草稿吗？删除后无法恢复。')) return;
                Store.drafts.remove(id);
                if (id === state.draftId) {
                    const next = Store.drafts.list()[0];
                    if (next) loadDraft(next.id); else newDraft('');
                }
                renderDraftMenu();
                return;
            }
            const item = e.target.closest('[data-id]');
            const act = e.target.closest('[data-act]');
            toggleMenu($('#draftMenu'), false);
            if (item && item.dataset.id !== state.draftId) { saveNow(); loadDraft(item.dataset.id); }
            if (act && act.dataset.act === 'new') newDraft('');
            if (act && act.dataset.act === 'sample') newDraft(SAMPLE);
        });
        $('#exportAll').addEventListener('click', () => runExport('auto'));
        $('#exportMore').addEventListener('click', () => toggleMenu($('#exportMenu')));
        $('#exportMenu').addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            toggleMenu($('#exportMenu'), false);
            runExport(b.dataset.act);
        });
        $('#darkToggle').addEventListener('click', () => {
            const dark = document.documentElement.dataset.theme !== 'dark';
            Store.local.set('ui-theme', dark ? 'dark' : 'light');
            applyDark();
        });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyDark);

        $('#settingsToggle').addEventListener('click', () => setSettingsDrawer(true));
        $('#settingsClose').addEventListener('click', () => setSettingsDrawer(false));
        $('#scrim').addEventListener('click', () => setSettingsDrawer(false));
        $('#mobileTabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-pane]');
            if (b) setPane(b.dataset.pane);
        });

        // 点空白处关闭菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) $$('.menu').forEach((m) => { m.hidden = true; });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                $$('.menu').forEach((m) => { m.hidden = true; });
                setSettingsDrawer(false);
            }
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

        // 网络字体加载完成后，字宽会变化，需要重新分页
        if (document.fonts) document.fonts.addEventListener('loadingdone', () => schedule());
    }

    /* ================================================================ 启动 */

    async function init() {
        applyDark();
        Themes.installNoise();
        buildSettingsUI();
        bindSettings();
        bindEvents();

        state.zoom = Store.local.get('zoom', 300);
        $('#zoom').value = state.zoom;

        const lastId = Store.local.get('current');
        const draft = lastId && Store.drafts.load(lastId);
        if (draft) {
            state.draftId = lastId;
            state.text = draft.text || '';
            state.settings = mergeSettings(draft.settings);
        } else {
            state.draftId = Store.drafts.newId();
            state.text = SAMPLE;
        }
        ed.value = state.text;
        syncSettingsUI();

        const font = await Store.assets.get('font:custom');
        if (font) installFont(font);

        await update();
    }

    // 给自动化测试和调试用的入口
    window.Studio = {
        state,
        update,
        buildPage,
        setSettings(patch) {
            state.settings = mergeSettings({ ...state.settings, ...patch });
            syncSettingsUI();
            return update();
        },
        setText(text) {
            ed.value = text;
            state.text = text;
            return update();
        },
        exportPage: (i, scale = 1) => Exporter.toBlob(buildPage(i), scale),
        SAMPLE,
    };
    window.Studio.ready = init();
})();
