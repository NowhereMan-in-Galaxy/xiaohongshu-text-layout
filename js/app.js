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
        theme: 'grid',
        accent: null,
        canvas: 'sage', // 自由排版模式的画布
        canvasAccent: null,
        ratio: '3:4',
        fontSize: 36,
        lineHeight: 1.75,
        paraSpacing: 0.6,
        align: 'justify',
        indent: false,
        bodyFont: 'theme',
        headFont: 'theme',
        cover: { enabled: true, title: '', subtitle: '', badge: '' },
        header: '',
        watermark: '',
        pageNum: true,
        scale: 1,
    };

    const BADGES = ['干货', '保姆级', '建议收藏', '亲测有效', '新手必看', '合集'];
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
        mode: 'long', // 'long' 长文排版 ｜ 'free' 自由排版
        longStk: [], // 长文模式的贴纸，见 js/stickers.js
        freeStk: [], // 自由排版模式里的所有内容（文字、图片、贴纸、线条）
        freePages: 1,
        freeTitle: '',
        sel: null, // 预览里选中的对象：{ kind: 'stk', id } 或 { kind: 'img', line, i }
    };

    // 两种模式各有一套贴纸，互不影响；代码里统一用 state.stickers 访问当前模式的那一套
    Object.defineProperty(state, 'stickers', {
        get: () => (state.mode === 'free' ? state.freeStk : state.longStk),
        set: (v) => { if (state.mode === 'free') state.freeStk = v; else state.longStk = v; },
    });
    const isFree = () => state.mode === 'free';

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

        async resolveAll(list) {
            const srcs = [...new Set(list)];
            await Promise.all(srcs.filter((s) => !this.cache.has(s)).map(async (s) => {
                this.cache.set(s, await this.load(s));
            }));
        },

        /** 保存一张已经处理好的图片 {url, w, h}，返回 img:xxx 引用 */
        async put(rec) {
            const id = 'img:' + Store.drafts.newId();
            await Store.assets.put(id, rec);
            this.cache.set(id, rec);
            return id;
        },

        /** 压缩并保存用户插入的图片，返回 img:xxx 引用。png: true 时保留透明背景（贴纸用） */
        async add(file, { png = false } = {}) {
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
            if (png && Math.max(rec.w, rec.h) > 1200) {
                const k = 1200 / Math.max(rec.w, rec.h);
                const c = document.createElement('canvas');
                c.width = Math.round(rec.w * k);
                c.height = Math.round(rec.h * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                rec = { url: c.toDataURL('image/png'), w: c.width, h: c.height };
            } else if (!png && !keep && (file.size > 6e5 || Math.max(rec.w, rec.h) > MAX)) {
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
            return this.put(rec);
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
        if (isFree()) {
            await Images.resolveAll(state.stickers.filter((st) => st.src).map((st) => st.src));
            if (gen !== generation) return;
            const title = state.freeTitle.trim();
            const doc = { title, titleHtml: '', blocks: [], stats: { chars: 0 } };
            state.model = { doc, pages: [], total: state.freePages, cover: false, coverFs: null, titleLine: null, free: true };
            state.selected = Math.min(state.selected, state.freePages - 1);
            renderPreview();
            updateStats();
            renderPageList();
            $('#draftTitle').textContent = draftTitle() || '未命名草稿';
            save();
            return;
        }
        const doc = Markdown.parse(state.text);
        await Images.resolveAll([
            ...doc.blocks.flatMap((b) => (b.type === 'img' ? [b.src] : b.type === 'imgrow' ? b.items.map((it) => it.src) : [])),
            ...state.stickers.filter((st) => st.src).map((st) => st.src),
        ]);
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
        let el;
        if (model.free) {
            el = Render.canvasShell(s, { index: i, total: model.total });
        } else if (model.cover && i === 0) {
            el = Render.coverShell(s, model.doc, model.total);
            el.querySelector('.cv-title').style.setProperty('--cv-fs', model.coverFs + 'px');
        } else {
            el = Render.shell(s, { index: i, total: model.total });
            el.querySelector('.pg-body').innerHTML = model.pages[i - (model.cover ? 1 : 0)].html;
        }
        const stk = Stickers.layer(state.stickers, i, model.total, Images.cache, Render.size(s.ratio));
        if (stk) el.appendChild(stk);
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
        grid.style.setProperty('--inv', (1 / k).toFixed(4));
        decorate();
    }

    function rezoom() {
        const [w, h] = Render.size(state.settings.ratio);
        const k = state.zoom / w;
        $$('#grid .thumb-frame').forEach((f) => {
            f.style.width = state.zoom + 'px';
            f.style.height = Math.round(h * k) + 'px';
            f.firstElementChild.style.transform = `scale(${k})`;
        });
        $('#grid').style.setProperty('--inv', (1 / k).toFixed(4));
        placeBar();
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
        $('#stickerDrop').hidden = v !== 'grid';
        if (v !== 'grid') select(null);
        if (state.model) renderPreview();
    }

    function updateStats() {
        if (isFree()) {
            $('#stats').textContent = `自由排版 · ${state.model.total} 页 · ${state.stickers.length} 个元素`;
            return;
        }
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
            // 一次插入好几张竖图时，两张一组并排放，像 Word 里那样省地方
            const tall = (id) => { const r = Images.cache.get(id); return r && r.h > r.w * 1.15; };
            const lines = [];
            for (let i = 0; i < ids.length; i++) {
                if (tall(ids[i]) && tall(ids[i + 1])) { lines.push(`![](${ids[i]}) ![](${ids[i + 1]})`); i++; } else lines.push(`![](${ids[i]})`);
            }
            insertBlock(lines.join('\n'));
            toast(lines.some((l) => l.includes(') !['))
                ? '竖图已经两张一组并排放好了。点预览里的图片可以调大小、对齐或拆开'
                : '图片已插入。点预览里的图片可以拖动调大小');
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
        if (isFree()) return state.freeTitle.trim() || '自由排版';
        return state.model.doc.title || state.text.trim().split('\n')[0].replace(/^[#>\-*\s]+/, '').slice(0, 24);
    }

    const saveNow = () => {
        if (!state.model) return;
        const title = draftTitle();
        const ok = Store.drafts.save(state.draftId, {
            title,
            text: state.text,
            settings: state.settings,
            stickers: state.longStk,
            mode: state.mode,
            free: { pages: state.freePages, title: state.freeTitle, stickers: state.freeStk },
        });
        Store.local.set('current', state.draftId);
        $('#saveState').textContent = ok ? '已自动保存' : '未能保存（浏览器存储不可用或已满）';
    };
    const saveLater = debounce(saveNow, 500);
    function save(now) {
        if (now) { saveNow(); toast('已保存到草稿箱'); } else saveLater();
    }

    /** 读取草稿里的贴纸。旧版草稿的「封面贴纸」设置会变成封面上一张可以拖动的贴纸 */
    function stickersOf(d) {
        const list = d.stickers || [];
        const old = d.settings && d.settings.cover && d.settings.cover.sticker;
        if (old && old.trim() && d.settings.cover.enabled !== false) {
            list.push({ id: Store.drafts.newId(), page: 0, kind: 'emoji', text: old.trim(), x: 990, y: 70, w: 200, rot: 12, shape: 'none', outline: false, shadow: false });
        }
        if (d.settings && d.settings.cover) delete d.settings.cover.sticker;
        return list;
    }

    /** 把一篇草稿的内容放进 state（不含刷新界面） */
    function applyDraft(d) {
        state.text = d.text || '';
        state.longStk = stickersOf(d);
        state.settings = mergeSettings(d.settings);
        const free = d.free || {};
        state.freeStk = free.stickers || [];
        state.freePages = Math.max(1, free.pages || 1);
        state.freeTitle = free.title || '';
        state.mode = d.mode === 'free' ? 'free' : 'long';
        state.sel = null;
        state.selected = 0;
        ed.value = state.text;
        $('#freeTitle').value = state.freeTitle;
        syncMode();
    }

    function loadDraft(id) {
        const d = Store.drafts.load(id);
        if (!d) return;
        state.draftId = id;
        applyDraft(d);
        syncSettingsUI();
        update();
    }

    function newDraft(text) {
        saveNow();
        state.draftId = Store.drafts.newId();
        state.text = text;
        state.settings = mergeSettings({ ...state.settings, cover: { ...state.settings.cover, title: '', subtitle: '', badge: '' } });
        state.longStk = [];
        state.freeStk = [];
        state.freePages = 1;
        state.freeTitle = '';
        state.sel = null;
        state.selected = 0;
        ed.value = text;
        $('#freeTitle').value = '';
        syncSettingsUI();
        update();
        if (!isFree()) ed.focus();
    }

    /* ================================================================ 自由排版模式 */

    /** 根据当前模式切换界面：左边是编辑器还是素材栏，右边是主题还是画布 */
    function syncMode() {
        document.body.classList.toggle('mode-free', isFree());
        $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
        $('#mobileTabs [data-pane="editor"]').textContent = isFree() ? '素材' : '写作';
    }

    /** 第一次进入自由排版时放一页示例，方便看出能怎么玩（删掉或清空这一页就好） */
    function starterPage() {
        const INK = '#3a3326';
        const id = () => Store.drafts.newId();
        const base = { page: 0, shape: 'none', outline: false, shadow: false };
        return [
            { kind: 'deco', deco: 'note-paper', x: 560, y: 830, w: 780, rot: 2 },
            { kind: 'deco', deco: 'tape-pink', x: 560, y: 560, w: 300, rot: -4 },
            { kind: 'deco', deco: 'tape-sage', x: 250, y: 170, w: 420, rot: -9 },
            { kind: 'text', text: '周末碎碎念', fs: 120, style: 'plain', color: null, font: 'round', bold: true, x: 540, y: 330, w: 900, rot: 0 },
            { kind: 'text', text: '今天去了新开的咖啡店 ☕\n拿铁很好喝，下次还来！', fs: 50, style: 'plain', color: INK, font: 'kai', bold: false, x: 560, y: 820, w: 660, rot: 2 },
            { kind: 'deco', deco: 'star', x: 900, y: 520, w: 150, rot: 12 },
            { kind: 'deco', deco: 'sparkles', x: 170, y: 560, w: 170, rot: 0 },
            { kind: 'deco', deco: 'heart', x: 230, y: 1190, w: 140, rot: -10 },
            { kind: 'deco', deco: 'label', x: 800, y: 1200, w: 320, rot: -6 },
        ].map((st) => ({ id: id(), ...base, ...st }));
    }

    function setMode(m) {
        if (m === state.mode) return;
        select(null);
        state.mode = m;
        state.selected = 0;
        if (m === 'free' && !state.freeStk.length && state.freePages === 1 && !state.freeTitle) state.freeStk = starterPage();
        syncMode();
        syncSettingsUI();
        update();
        toast(m === 'free' ? '自由排版：不用写长文，文字、图片、贴纸随便摆' : '回到长文排版', 1800);
    }

    function renderPageList() {
        const counts = Array.from({ length: state.freePages }, () => 0);
        state.freeStk.forEach((st) => { counts[Math.min(st.page, state.freePages - 1)]++; });
        const n = state.freePages;
        $('#pageList').innerHTML = counts.map((c, i) => `
            <div class="fp-page${i === state.selected ? ' on' : ''}" data-i="${i}">
                <b>${i + 1}</b><span>${c ? `${c} 个元素` : '空白页'}</span>
                <button data-pact="up" title="往前挪"${i === 0 ? ' disabled' : ''}>↑</button>
                <button data-pact="down" title="往后挪"${i === n - 1 ? ' disabled' : ''}>↓</button>
                <button data-pact="dup" title="复制这一页">复制</button>
                <button data-pact="del" title="删除这一页">删除</button>
            </div>`).join('');
    }

    function focusPage(i) {
        state.selected = i;
        markThumbs();
        renderPageList();
        const el = $(`#grid .thumb[data-i="${i}"]`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async function pageAction(act, i) {
        select(null);
        const n = state.freePages;
        const list = state.freeStk;
        if (act === 'add') {
            state.freePages++;
            state.selected = n;
        } else if (act === 'dup') {
            list.forEach((st) => { if (st.page > i) st.page++; });
            const copies = list.filter((st) => st.page === i).map((st) => ({ ...clone(st), id: Store.drafts.newId(), page: i + 1 }));
            state.freeStk = [...list, ...copies];
            state.freePages++;
            state.selected = i + 1;
        } else if (act === 'del') {
            const here = list.filter((st) => Math.min(st.page, n - 1) === i);
            if (here.length && !confirm(`这一页上有 ${here.length} 个元素，确定删除这一页吗？`)) return;
            if (n === 1) {
                state.freeStk = list.filter((st) => !here.includes(st));
            } else {
                state.freeStk = list.filter((st) => !here.includes(st));
                state.freeStk.forEach((st) => { if (st.page > i) st.page--; });
                state.freePages--;
            }
            dropUnused(here.flatMap((st) => [st.src, st.orig, st.full]));
            state.selected = Math.min(i, state.freePages - 1);
        } else if (act === 'up' || act === 'down') {
            const j = i + (act === 'up' ? -1 : 1);
            if (j < 0 || j >= n) return;
            list.forEach((st) => {
                const p = Math.min(st.page, n - 1);
                if (p === i) st.page = j; else if (p === j) st.page = i;
            });
            state.selected = j;
        }
        await update();
        focusPage(state.selected);
    }

    /** 自由排版里加图片：直接放到当前页，不强制裁剪、抠图（工具条上随时可以再做） */
    async function addPhotos(files) {
        const list = [...files].filter((f) => f.type.startsWith('image/'));
        if (!list.length) return;
        if (state.view !== 'grid') setView('grid');
        if (matchMedia('(max-width: 820px)').matches) setPane('preview');
        for (const f of list) {
            try {
                const id = await Images.add(f, { png: !/jpe?g/.test(f.type) });
                const rec = Images.cache.get(id);
                const w = rec.w >= rec.h ? 620 : 460;
                addSticker({ kind: 'img', src: id, orig: id, cut: 0, w });
            } catch (e) {
                console.error(e);
                toast('这张图片读取失败了，换一张试试？');
            }
        }
        toast('图片已放上去：拖动摆位置，选中后可以加描边、裁剪、抠图', 2600);
    }

    function addDeco(id) {
        const tape = id.startsWith('tape');
        addSticker({ kind: 'deco', deco: id, w: tape ? 400 : id === 'note-paper' ? 520 : 220, rot: tape ? -8 : 0 });
    }

    function renderDecoList() {
        $('#decoList').innerHTML = Stickers.DECOS.map(([id, name]) => `
            <button data-deco="${id}" title="${name}"><span class="stk deco-prev">${Stickers.decoHtml({ deco: id })}</span></button>`).join('');
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

        $('#canvasList').innerHTML = Canvases.list.map((c) => `
            <button class="theme-card canvas-card" data-canvas="${c.id}">
                <span class="sw"><span class="pg canvas canvas-${c.id}"><span class="pg-bg"></span><span class="pg-deco">${c.deco || ''}</span></span></span>
                ${c.name}
            </button>`).join('');

        $('#badgeChips').innerHTML = BADGES.map((b) => `<button data-badge="${b}">${b}</button>`).join('');
        $('#colorMenu').innerHTML = TEXT_COLORS.map((c) => `<button data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
    }

    /** 强调色：长文模式跟着主题，自由排版跟着画布 */
    function accentSource() {
        const s = state.settings;
        return isFree()
            ? { key: 'canvasAccent', accents: Canvases.get(s.canvas).accents }
            : { key: 'accent', accents: Themes.get(s.theme).accents };
    }

    function renderAccents() {
        const s = state.settings;
        const theme = accentSource();
        const current = s[theme.key] || theme.accents[0];
        $('#accentList').innerHTML = theme.accents.map((c) => `<button data-accent="${c}" style="background:${c}" class="${c === current ? 'on' : ''}" title="${c}"></button>`).join('')
            + `<label title="自定义颜色" class="${theme.accents.includes(current) ? '' : 'on'}"><input type="color" id="accentPicker" value="${current}"></label>`;
    }

    function syncSettingsUI() {
        const s = state.settings;
        $$('.theme-card[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === s.theme));
        $$('.theme-card[data-canvas]').forEach((b) => b.classList.toggle('on', b.dataset.canvas === s.canvas));
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

        $('#canvasList').addEventListener('click', (e) => {
            const b = e.target.closest('[data-canvas]');
            if (!b) return;
            state.settings.canvas = b.dataset.canvas;
            state.settings.canvasAccent = null;
            syncSettingsUI();
            schedule();
        });

        $('#accentList').addEventListener('click', (e) => {
            const b = e.target.closest('[data-accent]');
            if (!b) return;
            const src = accentSource();
            state.settings[src.key] = b.dataset.accent === src.accents[0] ? null : b.dataset.accent;
            renderAccents();
            schedule();
        });
        $('#accentList').addEventListener('input', (e) => {
            if (e.target.id !== 'accentPicker') return;
            state.settings[accentSource().key] = e.target.value;
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

        $('#resetStyle').addEventListener('click', () => {
            const keep = { cover: state.settings.cover, header: state.settings.header, watermark: state.settings.watermark };
            state.settings = mergeSettings({ ...clone(DEFAULTS), ...keep, cover: keep.cover });
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

    /* ================================================================ 贴纸 & 图片：在预览里直接摆弄 */

    const pageSize = () => Render.size(state.settings.ratio);
    const findSticker = (id) => state.stickers.find((st) => st.id === id);
    const zoomK = () => state.zoom / pageSize()[0];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function select(sel) {
        state.sel = sel;
        decorate();
    }

    /** 给选中的对象加上选中框和拖动手柄，并摆好浮动工具条 */
    function decorate() {
        $$('#grid .obj-h').forEach((h) => h.remove());
        $$('#grid .sel-obj').forEach((el) => el.classList.remove('sel-obj'));
        const el = selectedEl();
        if (!el) {
            if (state.sel && state.view === 'grid') state.sel = null;
            $('#objBar').hidden = true;
            return;
        }
        el.classList.add('sel-obj');
        if (state.sel.kind === 'stk') {
            const line = findSticker(state.sel.id)?.kind === 'line';
            el.insertAdjacentHTML('beforeend', line
                ? '<i class="obj-h h-end e0" data-h="e0" title="拖动端点"></i><i class="obj-h h-end e1" data-h="e1" title="拖动端点"></i>'
                : '<i class="obj-h h-rot" data-h="rot" title="旋转"></i><i class="obj-h h-size" data-h="size" title="缩放"></i>');
        } else if (!el.closest('.row')) {
            const fig = el.closest('.fig');
            fig.insertAdjacentHTML('beforeend', `<i class="obj-h h-img${fig.classList.contains('al-right') ? ' left' : ''}" data-h="img" title="拖动调整大小"></i>`);
            placeImgHandle(el);
        }
        renderBar();
        placeBar();
    }

    function selectedEl() {
        const sel = state.sel;
        if (!sel || state.view !== 'grid') return null;
        if (sel.kind === 'stk') return $(`#grid .stk[data-sid="${CSS.escape(sel.id)}"]`);
        return $(`#grid .fig[data-line="${sel.line}"] img[data-i="${sel.i}"]`);
    }

    function placeImgHandle(img) {
        const h = img.parentElement.querySelector('.h-img');
        if (!h) return;
        const left = h.classList.contains('left');
        h.style.left = (img.offsetLeft + (left ? 0 : img.offsetWidth)) + 'px';
        h.style.top = (img.offsetTop + img.offsetHeight) + 'px';
    }

    const ICON = {
        up: '<svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
        down: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
        copy: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
        del: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
        left: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h16M4 10h10M4 15h16M4 20h10"/></svg>',
        center: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h16M7 10h10M4 15h16M7 20h10"/></svg>',
        right: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h16M10 10h10M4 15h16M10 20h10"/></svg>',
    };

    function renderBar() {
        const bar = $('#objBar');
        const sel = state.sel;
        let html = '';
        if (sel.kind === 'stk') {
            const st = findSticker(sel.id);
            const i = state.stickers.indexOf(st);
            const isImg = st.kind === 'img';
            const opts = (list, cur) => list.map(([v, n]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${n}</option>`).join('');
            const colors = () => '<span class="colors">' + Stickers.COLORS.map((c) => `<button data-act="color" data-v="${c || ''}" class="dot${(st.color || null) === c ? ' on' : ''}" title="${c ? c : '跟随主题色'}" style="--c:${c || 'var(--ui-brand)'}">${c ? '' : '主题'}</button>`).join('') + '</span><span class="sep"></span>';
            if (st.kind === 'text') {
                html += '<button data-act="edit" title="修改文字（也可以双击文字）">改字</button>';
                html += `<select data-act="tstyle" title="样式">${opts(Stickers.TEXT_STYLES, st.style || 'plain')}</select>`;
                html += `<select data-act="font" title="字体">${opts(Stickers.FONTS.map(([v, n]) => [v, n]), st.font || 'head')}</select>`;
                html += `<button data-act="bold" class="${st.bold === false ? '' : 'on'}" title="粗体"><b>B</b></button><span class="sep"></span>`;
                html += colors();
            } else if (st.kind === 'line') {
                html += `<select data-act="dash" title="线型">${opts(Stickers.DASHES, st.dash || 'solid')}</select>`;
                html += `<select data-act="arrow" title="箭头">${opts(Stickers.ARROWS, st.arrow || 'none')}</select>`;
                html += `<button data-act="curve" class="${st.curve ? 'on' : ''}" title="弯曲">弯曲</button>`;
                html += `<label class="cut-range" title="粗细"><input type="range" data-act="thick" min="3" max="28" value="${st.thick || 8}"></label><span class="sep"></span>`;
                html += colors();
            }
            html += `<button data-act="up" title="上移一层"${i === state.stickers.length - 1 ? ' disabled' : ''}>${ICON.up}上移</button>`;
            html += `<button data-act="down" title="下移一层"${i === 0 ? ' disabled' : ''}>${ICON.down}下移</button><span class="sep"></span>`;
            if (isImg) {
                html += `<button data-act="crop" title="重新框选想要的部分">裁剪</button>`;
                html += `<select data-act="shape" title="形状">${Stickers.SHAPES.map(([v, n]) => `<option value="${v}"${(st.shape || 'none') === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
                html += `<button data-act="cut" class="${st.cut ? 'on' : ''}" title="自动去掉背景">抠图</button>`;
                if (st.cut) {
                    const mode = st.cutMode || 'ai';
                    html += `<select data-act="cutmode" title="抠图方式"><option value="ai"${mode === 'ai' ? ' selected' : ''}>智能识别</option><option value="color"${mode === 'color' ? ' selected' : ''}>纯色背景</option></select>`;
                    html += `<label class="cut-range" title="抠得不干净就往右拖，抠过头了就往左拖"><input type="range" data-act="strength" min="1" max="100" value="${st.cut}"></label>`;
                }
            }
            if (st.kind !== 'line') html += `<select data-act="border" title="描边：拼贴风格">${opts(Stickers.BORDERS, Stickers.borderOf(st))}</select>`;
            html += `<button data-act="shadow" class="${st.shadow ? 'on' : ''}" title="投影">阴影</button><span class="sep"></span>`;
            html += `<button data-act="dup" title="复制一个">${ICON.copy}</button><button data-act="del" title="删除 (Delete)">${ICON.del}</button>`;
        } else {
            const line = ed.value.split('\n')[sel.line] || '';
            const items = Markdown.imageLine(line) || [];
            const it = items[sel.i] || {};
            if (items.length > 1) {
                html += `<button data-act="swapL"${sel.i === 0 ? ' disabled' : ''} title="和左边那张换位置">← 左移</button>`;
                html += `<button data-act="swapR"${sel.i === items.length - 1 ? ' disabled' : ''} title="和右边那张换位置">右移 →</button><span class="sep"></span>`;
                html += '<button data-act="split" title="每张图单独占一行">拆开</button>';
            } else {
                const al = it.align || 'center';
                html += ['left', 'center', 'right'].map((a) => `<button data-act="align" data-v="${a}" class="${al === a ? 'on' : ''}" title="${{ left: '靠左', center: '居中', right: '靠右' }[a]}">${ICON[a]}</button>`).join('');
                html += `<span class="sep"></span><span class="pct" id="imgPct">${it.width || 100}%</span>`;
                html += `<button data-act="full" title="恢复满宽">满宽</button>`;
                if (prevImageLine(sel.line) >= 0) html += '<span class="sep"></span><button data-act="merge" title="和上一张图并排放在同一行">和上一张并排</button>';
            }
        }
        bar.innerHTML = html;
        bar.hidden = false;
    }

    function placeBar() {
        const bar = $('#objBar');
        const el = selectedEl();
        if (!el || bar.hidden) return;
        const r = el.getBoundingClientRect();
        const g = $('#grid').getBoundingClientRect();
        const bw = bar.offsetWidth;
        const bh = bar.offsetHeight;
        let top = r.top - bh - 14;
        if (top < g.top + 4) top = Math.min(r.bottom + 14, window.innerHeight - bh - 8);
        bar.style.left = clamp(r.left + r.width / 2 - bw / 2, 8, window.innerWidth - bw - 8) + 'px';
        bar.style.top = top + 'px';
        const outside = r.bottom < g.top || r.top > g.bottom;
        bar.style.visibility = outside ? 'hidden' : '';
    }

    function commitStickers() {
        save();
        renderGrid();
    }

    /* ---------------- 贴纸：添加 / 删除 / 抠图 ---------------- */

    function addSticker(props) {
        const [pw, ph] = pageSize();
        const page = state.selected;
        // 同一页上连续加的贴纸错开一点，免得叠在一起
        const n = state.stickers.filter((st) => st.page === page).length;
        const st = {
            id: Store.drafts.newId(),
            page,
            x: pw / 2 + (n % 4) * 60 - 90,
            y: ph * 0.42 + (n % 4) * 60 - 90,
            w: { emoji: 180, text: 640, line: 420, deco: 220 }[props.kind] || 360,
            rot: 0,
            shape: 'none',
            outline: false,
            shadow: false,
            ...props,
        };
        state.stickers.push(st);
        state.sel = { kind: 'stk', id: st.id };
        commitStickers();
        return st;
    }

    function removeSticker(id) {
        const st = findSticker(id);
        if (!st) return;
        state.stickers = state.stickers.filter((x) => x !== st);
        dropUnused([st.src, st.orig, st.full]);
        state.sel = null;
        commitStickers();
    }

    /** 没有任何贴纸再用到的图片，从存储里删掉 */
    function dropUnused(ids) {
        const used = new Set([...state.longStk, ...state.freeStk].flatMap((x) => [x.src, x.orig, x.full]));
        [...new Set(ids)].filter((k) => k && !used.has(k)).forEach((k) => Store.assets.remove(k));
    }

    /* ---------------- 裁剪框：上传图片时先框出想要的部分 ---------------- */

    const FULL = { x: 0, y: 0, w: 1, h: 1 };
    const isFull = (r) => r.x < 0.005 && r.y < 0.005 && r.w > 0.99 && r.h > 0.99;

    /**
     * 打开裁剪框。返回 { rect, cut }（rect 是相对原图的比例），取消返回 null
     * 框得越贴近主体，智能抠图越准：框外的杂乱背景根本不会参与识别
     */
    function openCrop(url, init, cut) {
        const dlg = $('#cropDialog');
        const stage = $('#cropStage');
        const box = $('#cropBox');
        let r = { ...(init || FULL) };
        const draw = () => {
            box.style.left = r.x * 100 + '%';
            box.style.top = r.y * 100 + '%';
            box.style.width = r.w * 100 + '%';
            box.style.height = r.h * 100 + '%';
        };
        $('#cropImg').src = url;
        $('#cropCut').checked = cut;
        draw();

        const onDown = (e) => {
            if (e.button > 0) return;
            e.preventDefault();
            const rect = stage.getBoundingClientRect();
            const px = (ev) => Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
            const py = (ev) => Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
            const corner = e.target.dataset.c;
            const start = { ...r, px: px(e), py: py(e) };
            // 框是整张图的时候，在图上拖就是画新框；否则在框里拖是移动框
            const inside = e.target === box && !isFull(r);
            const MIN = 0.04;
            const move = (ev) => {
                const x = px(ev);
                const y = py(ev);
                if (corner) {
                    // 拖角：对角固定
                    const fx = corner.includes('w') ? start.x + start.w : start.x;
                    const fy = corner.includes('n') ? start.y + start.h : start.y;
                    const nx = corner.includes('w') ? Math.min(x, fx - MIN) : Math.max(x, fx + MIN);
                    const ny = corner.includes('n') ? Math.min(y, fy - MIN) : Math.max(y, fy + MIN);
                    r = { x: Math.max(0, Math.min(fx, nx)), y: Math.max(0, Math.min(fy, ny)), w: Math.abs(nx - fx), h: Math.abs(ny - fy) };
                    r.w = Math.min(r.w, 1 - r.x);
                    r.h = Math.min(r.h, 1 - r.y);
                } else if (inside) {
                    // 拖框：整体平移
                    r.x = Math.min(1 - r.w, Math.max(0, start.x + x - start.px));
                    r.y = Math.min(1 - r.h, Math.max(0, start.y + y - start.py));
                } else {
                    // 在框外拖：画一个新框
                    r = { x: Math.min(x, start.px), y: Math.min(y, start.py), w: Math.max(MIN, Math.abs(x - start.px)), h: Math.max(MIN, Math.abs(y - start.py)) };
                    r.w = Math.min(r.w, 1 - r.x);
                    r.h = Math.min(r.h, 1 - r.y);
                }
                draw();
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        };
        const onReset = (e) => { e.preventDefault(); r = { ...FULL }; draw(); };

        stage.addEventListener('pointerdown', onDown);
        $('#cropAll').addEventListener('click', onReset);
        dlg.returnValue = '';
        dlg.showModal();
        return new Promise((resolve) => {
            dlg.addEventListener('close', () => {
                stage.removeEventListener('pointerdown', onDown);
                $('#cropAll').removeEventListener('click', onReset);
                $('#cropImg').removeAttribute('src');
                const cutNow = $('#cropCut').checked;
                Store.local.set('auto-cut', cutNow);
                resolve(dlg.returnValue === 'ok' ? { rect: r, cut: cutNow } : null);
            }, { once: true });
        });
    }

    /** 按比例裁出图片的一部分（保留透明背景） */
    async function cropRec(rec, r) {
        const img = new Image();
        img.src = rec.url;
        await img.decode();
        const sx = Math.round(r.x * img.naturalWidth);
        const sy = Math.round(r.y * img.naturalHeight);
        const w = Math.max(1, Math.round(r.w * img.naturalWidth));
        const h = Math.max(1, Math.round(r.h * img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, sx, sy, w, h, 0, 0, w, h);
        return { url: c.toDataURL('image/png'), w, h };
    }

    /** 给图片贴纸（重新）裁剪；cut 为 true 时裁完接着抠图 */
    async function recropSticker(st) {
        const fullId = st.full || st.orig;
        const rec = Images.cache.get(fullId) || await Images.load(fullId);
        if (!rec) { toast('找不到原图了'); return; }
        const res = await openCrop(rec.url, st.crop, st.cut > 0 || Store.local.get('auto-cut', true));
        if (!res) return;
        const old = [st.src, st.orig];
        st.full = fullId;
        st.crop = isFull(res.rect) ? null : res.rect;
        st.orig = st.crop ? await Images.put(await cropRec(rec, st.crop)) : fullId;
        st.src = st.orig;
        const strength = st.cut || 50;
        st.cut = 0;
        if (res.cut) await cutSticker(st, strength);
        else commitStickers();
        dropUnused(old);
    }

    async function addStickerImages(files) {
        const list = [...files].filter((f) => f.type.startsWith('image/'));
        if (!list.length) return;
        if (state.view !== 'grid') setView('grid');
        if (matchMedia('(max-width: 820px)').matches) setPane('preview');
        for (const f of list) {
            try {
                const id = await Images.add(f, { png: true });
                const rec = Images.cache.get(id);
                if (await Stickers.hasTransparency(rec.url)) {
                    addSticker({ kind: 'img', src: id, orig: id, cut: 0 });
                    toast('这张图已经是透明背景了，直接用上（不用再抠）');
                    continue;
                }
                // 先让用户框出想要的部分，再抠图
                const res = await openCrop(rec.url, null, Store.local.get('auto-cut', true));
                if (!res) { Store.assets.remove(id); continue; }
                const crop = isFull(res.rect) ? null : res.rect;
                const orig = crop ? await Images.put(await cropRec(rec, crop)) : id;
                const st = addSticker({ kind: 'img', src: orig, orig, full: id, crop, cut: 0 });
                if (res.cut) await cutSticker(st, 50, true);
                else toast('贴纸已添加，拖动它摆到喜欢的位置');
            } catch (e) {
                console.error(e);
                toast('这张图片读取失败了，换一张试试？');
            }
        }
    }

    let modelLoaded = false;

    /** 抠图。strength 为 0 表示恢复原图 */
    async function cutSticker(st, strength, auto) {
        const old = st.src;
        if (!strength) {
            st.src = st.orig;
            st.cut = 0;
        } else {
            const orig = Images.cache.get(st.orig) || await Images.load(st.orig);
            if (!orig) { toast('找不到原图了'); return; }
            let res;
            if ((st.cutMode || 'ai') === 'ai') {
                toast(modelLoaded ? '正在识别主体…' : '第一次用智能抠图，正在加载识别模型，稍等几秒…', 0);
                try {
                    res = await Stickers.aiCutout(orig.url, strength);
                    modelLoaded = true;
                } catch (e) {
                    console.warn('智能抠图不可用，改用纯色背景抠图', e);
                    st.cutMode = 'color';
                    toast('智能抠图加载失败（可能是网络问题），先用「纯色背景」方式抠', 3500);
                }
            }
            if (!res) {
                if (st.cutMode !== 'color') toast('正在抠图…', 0);
                res = await Stickers.cutout(orig.url, strength);
            }
            if (res.removed < 0.01 || res.removed > 0.98) {
                const msg = res.removed > 0.98
                    ? '抠过头了，整张图都被去掉了。把强度往左调一调，或者换一种抠图方式'
                    : (st.cutMode === 'color' ? '没找到明显的纯色背景。试试工具条上的「智能识别」' : '没识别出需要去掉的背景');
                toast(auto ? '贴纸已添加。' + msg : msg, 3500);
                if (auto || res.removed > 0.98) { commitStickers(); return; }
            }
            st.src = await Images.put({ url: res.url, w: res.w, h: res.h });
            st.cut = strength;
            if (res.removed >= 0.01) toast('抠好了！不满意可以拖工具条上的滑块调强度');
        }
        commitStickers();
        dropUnused([old]);
    }

    /* ---------------- 表情面板：像输入法的表情键盘一样左右滑 ---------------- */

    function renderEmojiPicker() {
        const recent = Store.local.get('recent-emoji', []);
        const cats = [...(recent.length ? [['最近', '🕘', recent]] : []), ...Stickers.EMOJI_CATS];
        $('#emojiTabs').innerHTML = cats.map(([name, icon], i) => `<button data-cat="${i}" title="${name}"${i === 0 ? ' class="on"' : ''}>${icon}</button>`).join('');
        $('#emojiGrid').innerHTML = cats.map(([name, , list], i) => `
            <section class="emoji-cat" data-cat="${i}">
                <div class="cat-name">${name}</div>
                <div class="cat-grid">${list.map((em) => `<button data-emoji="${em}">${em}</button>`).join('')}</div>
            </section>`).join('');
        $('#emojiGrid').scrollLeft = 0;
    }

    function useEmoji(em) {
        const recent = [em, ...Store.local.get('recent-emoji', []).filter((x) => x !== em)].slice(0, 24);
        Store.local.set('recent-emoji', recent);
        addSticker({ kind: 'emoji', text: em });
        toast('拖动贴纸摆到喜欢的位置', 1600);
    }

    function syncEmojiTabs() {
        const grid = $('#emojiGrid');
        let cur = 0;
        $$('#emojiGrid .emoji-cat').forEach((sec, i) => { if (sec.offsetLeft - grid.offsetLeft <= grid.scrollLeft + 40) cur = i; });
        $$('#emojiTabs button').forEach((b, i) => b.classList.toggle('on', i === cur));
    }

    async function pasteSticker() {
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const it of items) {
                const type = it.types.find((t) => t.startsWith('image/'));
                if (type) files.push(new File([await it.getType(type)], 'paste.png', { type }));
            }
            if (files.length) { toggleMenu($('#stickerMenu'), false); addStickerImages(files); } else toast('剪贴板里没有图片');
        } catch {
            toast('浏览器不让直接读取剪贴板。可以在预览区按 Ctrl/⌘ + V 粘贴', 3500);
        }
    }

    /* ---------------- 图片：改写 Markdown ---------------- */

    /** 把第 from 行到第 to 行（不含）替换成 text */
    function setLines(from, to, text) {
        const lines = ed.value.split('\n');
        const start = lines.slice(0, from).reduce((n, l) => n + l.length + 1, 0);
        const end = start + lines.slice(from, to).join('\n').length;
        ed.setRangeText(text, start, end, 'preserve');
        onInput();
    }

    function prevImageLine(line) {
        const lines = ed.value.split('\n');
        let p = line - 1;
        while (p >= 0 && !lines[p].trim()) p--;
        return p >= 0 && Markdown.imageLine(lines[p]) ? p : -1;
    }

    function editImage(act, v) {
        const sel = state.sel;
        const lines = ed.value.split('\n');
        const items = Markdown.imageLine(lines[sel.line] || '');
        if (!items) return;
        const it = items[sel.i];
        if (act === 'align') it.align = v === 'center' ? null : v;
        if (act === 'width') it.width = v >= 100 ? null : v;
        if (act === 'full') { it.width = null; }
        if (act === 'swapL' || act === 'swapR') {
            const j = sel.i + (act === 'swapL' ? -1 : 1);
            [items[sel.i], items[j]] = [items[j], items[sel.i]];
            state.sel = { ...sel, i: j };
        }
        if (act === 'split') {
            setLines(sel.line, sel.line + 1, items.map((x) => Markdown.formatImages([{ ...x, width: null, align: null }])).join('\n'));
            state.sel = { kind: 'img', line: sel.line + sel.i, i: 0 };
            return;
        }
        if (act === 'merge') {
            const p = prevImageLine(sel.line);
            const prev = Markdown.imageLine(lines[p]);
            const merged = [...prev, ...items].map((x) => ({ ...x, width: null, align: null }));
            setLines(p, sel.line + 1, Markdown.formatImages(merged));
            state.sel = { kind: 'img', line: p, i: prev.length };
            return;
        }
        setLines(sel.line, sel.line + 1, Markdown.formatImages(items));
    }

    /* ---------------- 拖动 ---------------- */

    function drag(e, onMove, onEnd) {
        e.preventDefault();
        const x0 = e.clientX;
        const y0 = e.clientY;
        let moved = false;
        const move = (ev) => {
            if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
            moved = true;
            onMove(ev, ev.clientX - x0, ev.clientY - y0);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            document.body.classList.remove('dragging');
            onEnd(moved);
        };
        document.body.classList.add('dragging');
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    function place(el, st) {
        const [pw, ph] = pageSize();
        const x = clamp(st.x, 0, pw);
        const y = clamp(st.y, 0, ph);
        el.style.width = st.w + 'px';
        el.style.transform = `translate(${x - st.w / 2}px, ${y}px) translateY(-50%) rotate(${st.rot || 0}deg)`;
        const em = el.querySelector('.emoji');
        if (em) { em.style.fontSize = (st.w * 0.86).toFixed(1) + 'px'; em.style.lineHeight = st.w + 'px'; }
        const txt = el.querySelector('.txt');
        if (txt) txt.style.fontSize = st.fs + 'px';
        const line = el.querySelector('svg.line');
        if (line) line.outerHTML = Stickers.lineHtml(st);
    }

    /** 拖动贴纸；拖到别的页面上时，贴纸就跟着换到那一页 */
    function moveSticker(e, el) {
        const st = findSticker(el.dataset.sid);
        const [pw, ph] = pageSize();
        const k = zoomK();
        let frame = el.closest('.thumb-frame');
        const r0 = frame.getBoundingClientRect();
        const offX = (e.clientX - r0.left) / k - st.x;
        const offY = (e.clientY - r0.top) / k - st.y;
        drag(e, (ev) => {
            const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.matches('#grid .thumb-frame'));
            if (under && under !== frame) {
                frame = under;
                const pg = frame.querySelector('.pg');
                let lay = pg.querySelector('.pg-stk');
                if (!lay) { lay = document.createElement('div'); lay.className = 'pg-stk'; pg.appendChild(lay); }
                lay.appendChild(el);
                st.page = Number(frame.closest('.thumb').dataset.i);
            }
            const r = frame.getBoundingClientRect();
            st.x = clamp((ev.clientX - r.left) / k - offX, 0, pw);
            st.y = clamp((ev.clientY - r.top) / k - offY, 0, ph);
            place(el, st);
            placeBar();
        }, (moved) => {
            if (!moved) return;
            state.selected = Math.min(st.page, state.model.total - 1);
            commitStickers();
        });
    }

    function resizeSticker(e, el, mode) {
        const st = findSticker(el.dataset.sid);
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const w0 = st.w;
        const fs0 = st.fs;
        const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
        drag(e, (ev) => {
            if (mode === 'size') {
                st.w = Math.round(clamp(w0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0, 40, pageSize()[0] * 1.5));
                if (st.kind === 'text') st.fs = Math.max(12, Math.round(fs0 * st.w / w0));
            } else {
                let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
                a = ((a + 540) % 360) - 180;
                const snap = Math.round(a / 45) * 45;
                st.rot = Math.abs(a - snap) < 4 ? snap : Math.round(a);
            }
            place(el, st);
            placeBar();
        }, (moved) => { if (moved) commitStickers(); });
    }

    /** 拖线条的一个端点，另一个端点不动（角度接近 45° 的倍数时会吸附） */
    function dragLineEnd(e, el, which) {
        const st = findSticker(el.dataset.sid);
        const frame = el.closest('.thumb-frame');
        const k = zoomK();
        const a0 = (st.rot || 0) * Math.PI / 180;
        const s0 = which === 'e0' ? 1 : -1;
        const fixed = { x: st.x + s0 * Math.cos(a0) * st.w / 2, y: st.y + s0 * Math.sin(a0) * st.w / 2 };
        drag(e, (ev) => {
            const r = frame.getBoundingClientRect();
            const px = (ev.clientX - r.left) / k;
            const py = (ev.clientY - r.top) / k;
            // 线条方向始终是从 e0 指向 e1
            const dx = (px - fixed.x) * -s0;
            const dy = (py - fixed.y) * -s0;
            let ang = Math.atan2(dy, dx) * 180 / Math.PI;
            const snap = Math.round(ang / 45) * 45;
            if (Math.abs(ang - snap) < 4) ang = snap;
            const len = Math.max(40, Math.hypot(dx, dy));
            const rad = ang * Math.PI / 180;
            st.w = Math.round(len);
            st.rot = Math.round(ang * 10) / 10;
            st.x = Math.round(fixed.x - s0 * Math.cos(rad) * len / 2);
            st.y = Math.round(fixed.y - s0 * Math.sin(rad) * len / 2);
            place(el, st);
            placeBar();
        }, (moved) => { if (moved) commitStickers(); });
    }

    /** 在页面上直接改文字：变成可编辑状态，点别处或按 Esc 结束 */
    function editText(el) {
        const st = el && findSticker(el.dataset.sid);
        const box = el?.querySelector('.txt span');
        if (!st || !box || el.classList.contains('editing')) return;
        el.classList.add('editing');
        box.contentEditable = 'plaintext-only';
        if (box.contentEditable !== 'plaintext-only') box.contentEditable = 'true';
        box.focus();
        const range = document.createRange();
        range.selectNodeContents(box);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        box.addEventListener('input', placeBar);
        box.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); box.blur(); }
        });
        box.addEventListener('blur', () => {
            const text = box.innerText.replace(/\n+$/, '');
            if (!text.trim()) { removeSticker(st.id); return; }
            st.text = text;
            commitStickers();
        }, { once: true });
    }

    function addText() {
        const st = addSticker({ kind: 'text', text: '双击修改文字', fs: 72, style: 'plain', color: null, font: 'head', bold: true });
        requestAnimationFrame(() => editText($(`#grid .stk[data-sid="${CSS.escape(st.id)}"]`)));
    }

    const LINES = {
        dashed: { dash: 'dashed', arrow: 'none' },
        arrow: { dash: 'solid', arrow: 'end' },
        dashArrow: { dash: 'dashed', arrow: 'end' },
        curve: { dash: 'solid', arrow: 'end', curve: true },
        both: { dash: 'solid', arrow: 'both' },
    };

    function addLine(preset) {
        addSticker({ kind: 'line', thick: 8, color: null, curve: false, ...LINES[preset] });
    }

    /** 拖图片右下角的圆点调整宽度（等比例），松手后写回 Markdown 里的 {xx%} */
    function resizeImage(e, h) {
        const fig = h.closest('.fig');
        const img = fig.querySelector('img.sel-obj');
        const k = zoomK();
        const bw = fig.clientWidth;
        const w0 = img.offsetWidth;
        const sign = h.classList.contains('left') ? -1 : 1;
        const factor = fig.classList.contains('al-left') || fig.classList.contains('al-right') ? 1 : 2;
        const base = img.style.width;
        let pct = null;
        drag(e, (ev, dx) => {
            pct = Math.round(clamp((w0 + sign * factor * dx / k) / bw * 100, 10, 100));
            img.style.width = base.replace(/^min\(\d+%/, `min(${pct}%`);
            placeImgHandle(img);
            const out = $('#imgPct');
            if (out) out.textContent = pct + '%';
            placeBar();
        }, (moved) => { if (moved && pct) editImage('width', pct); });
    }

    function onGridPointerDown(e) {
        if (e.button > 0 || state.view !== 'grid') return;
        const h = e.target.closest('[data-h]');
        const stk = e.target.closest('.stk');
        const img = e.target.closest('.fig img');
        if (e.target.closest('.stk.editing')) return;
        if (h && h.dataset.h === 'img') { resizeImage(e, h); return; }
        if (h && (h.dataset.h === 'e0' || h.dataset.h === 'e1')) { dragLineEnd(e, h.closest('.stk'), h.dataset.h); return; }
        if (h) { resizeSticker(e, h.closest('.stk'), h.dataset.h); return; }
        if (stk) {
            if (state.sel?.id !== stk.dataset.sid) select({ kind: 'stk', id: stk.dataset.sid });
            moveSticker(e, stk);
            return;
        }
        if (img) {
            const fig = img.closest('.fig');
            select({ kind: 'img', line: Number(fig.dataset.line), i: Number(img.dataset.i) });
            return;
        }
        if (state.sel) select(null);
    }

    function onBarAction(e) {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const act = b.dataset.act;
        if (e.type === 'click' && (b.tagName === 'SELECT' || b.tagName === 'INPUT')) return;
        const sel = state.sel;
        if (!sel) return;
        if (sel.kind === 'img') { editImage(act, b.dataset.v); return; }
        // 正在改字时点了工具条：先把文字存好再执行
        const editing = $('#grid .stk.editing [contenteditable]');
        if (editing) editing.blur();
        const st = findSticker(sel.id);
        const i = state.stickers.indexOf(st);
        switch (act) {
            case 'up':
            case 'down': {
                const j = i + (act === 'up' ? 1 : -1);
                if (j < 0 || j >= state.stickers.length) return;
                [state.stickers[i], state.stickers[j]] = [state.stickers[j], state.stickers[i]];
                commitStickers();
                toast(act === 'up' ? '上移了一层' : '下移了一层', 1200);
                break;
            }
            case 'shape': st.shape = b.value; commitStickers(); break;
            case 'edit': editText(selectedEl()); break;
            case 'color': st.color = b.dataset.v || null; commitStickers(); break;
            case 'tstyle': st.style = b.value; commitStickers(); break;
            case 'font': st.font = b.value; commitStickers(); break;
            case 'bold': st.bold = st.bold === false; commitStickers(); break;
            case 'dash': st.dash = b.value; commitStickers(); break;
            case 'arrow': st.arrow = b.value; commitStickers(); break;
            case 'curve': st.curve = !st.curve; commitStickers(); break;
            case 'thick': st.thick = Number(b.value); commitStickers(); break;
            case 'outline': st.outline = !st.outline; commitStickers(); break;
            case 'border': st.border = b.value; st.outline = false; commitStickers(); break;
            case 'shadow': st.shadow = !st.shadow; commitStickers(); break;
            case 'cut': cutSticker(st, st.cut ? 0 : 50); break;
            case 'strength': cutSticker(st, Number(b.value)); break;
            case 'cutmode': st.cutMode = b.value; cutSticker(st, 50); break;
            case 'crop': recropSticker(st); break;
            case 'dup': {
                const { id, ...rest } = st;
                addSticker({ ...rest, x: st.x + 50, y: st.y + 50 });
                break;
            }
            case 'del': removeSticker(st.id); break;
            default: break;
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
        // 菜单打开时收起贴纸的浮动工具条，免得挡住菜单
        if (open && state.sel) select(null);
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
            if (isFree()) renderPageList();
            if (dl) runExport('current');
        });
        $('#grid').addEventListener('pointerdown', onGridPointerDown);
        $('#grid').addEventListener('scroll', placeBar, { passive: true });
        window.addEventListener('resize', placeBar);
        $('#objBar').addEventListener('click', onBarAction);
        // 点工具条按钮时不要抢走焦点，这样改字的时候也能直接换颜色
        $('#objBar').addEventListener('mousedown', (e) => { if (!e.target.closest('select, input')) e.preventDefault(); });
        $('#objBar').addEventListener('change', onBarAction);
        $('#stickerBtn').addEventListener('click', () => toggleMenu($('#stickerMenu')));
        $('#textBtn').addEventListener('click', addText);
        $('#lineBtn').addEventListener('click', () => toggleMenu($('#lineMenu')));
        $('#lineMenu').addEventListener('click', (e) => {
            const b = e.target.closest('[data-line]');
            if (!b) return;
            toggleMenu($('#lineMenu'), false);
            addLine(b.dataset.line);
        });
        $('#grid').addEventListener('dblclick', (e) => {
            const el = e.target.closest('.stk.k-text');
            if (el && state.view === 'grid') editText(el);
        });
        $('#stickerBtn').addEventListener('click', () => { if (!$('#stickerMenu').hidden) renderEmojiPicker(); });
        renderEmojiPicker();
        $('#stickerMenu').addEventListener('click', (e) => {
            const em = e.target.closest('[data-emoji]');
            if (em) useEmoji(em.dataset.emoji);
            const tab = e.target.closest('[data-cat]');
            if (tab && tab.parentElement.id === 'emojiTabs') {
                const sec = $(`#emojiGrid .emoji-cat[data-cat="${tab.dataset.cat}"]`);
                $('#emojiGrid').scrollTo({ left: sec.offsetLeft - $('#emojiGrid').offsetLeft, behavior: 'smooth' });
            }
            if (e.target.closest('[data-act="upload"]')) { toggleMenu($('#stickerMenu'), false); $('#stickerInput').click(); }
            if (e.target.closest('[data-act="paste"]')) pasteSticker();
        });
        $('#emojiGrid').addEventListener('scroll', syncEmojiTabs, { passive: true });
        // 鼠标滚轮上下滚，面板左右滑
        $('#emojiGrid').addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $('#emojiGrid').scrollLeft += e.deltaY; }
        }, { passive: false });
        // 不在输入框里时粘贴图片 → 变成贴纸（比如 iPhone 相册里长按照片「拷贝主体」后粘贴）
        document.addEventListener('paste', (e) => {
            if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
            const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (files.length) { e.preventDefault(); if (isFree()) addPhotos(files); else addStickerImages(files); }
        });
        // 自由排版：图片直接拖进预览区
        $('#grid').addEventListener('dragover', (e) => {
            if (isFree() && [...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault();
        });
        $('#grid').addEventListener('drop', (e) => {
            if (!isFree() || !e.dataTransfer?.files?.length) return;
            e.preventDefault();
            const t = e.target.closest('.thumb');
            if (t) state.selected = Number(t.dataset.i);
            addPhotos(e.dataTransfer.files);
        });
        $('#stickerInput').addEventListener('change', (e) => { addStickerImages(e.target.files); e.target.value = ''; });
        $('#grid').addEventListener('dblclick', (e) => {
            if (e.target.closest('.stk, .fig img, .obj-h')) return;
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

        // 模式切换 & 自由排版的素材栏
        $('#modeSeg').addEventListener('click', (e) => {
            const b = e.target.closest('[data-mode]');
            if (b) setMode(b.dataset.mode);
        });
        renderDecoList();
        $('#freePanel').addEventListener('click', (e) => {
            const add = e.target.closest('[data-add]');
            const deco = e.target.closest('[data-deco]');
            const line = e.target.closest('[data-fline]');
            const pact = e.target.closest('[data-pact]');
            const row = e.target.closest('.fp-page');
            const toPreview = () => { if (matchMedia('(max-width: 820px)').matches) setPane('preview'); if (state.view !== 'grid') setView('grid'); };
            if (add) {
                e.stopPropagation();
                const a = add.dataset.add;
                if (a === 'photo') { $('#photoInput').click(); return; }
                toPreview();
                if (a === 'text') addText();
                if (a === 'emoji') { toggleMenu($('#stickerMenu'), true); renderEmojiPicker(); }
            } else if (deco) {
                toPreview();
                addDeco(deco.dataset.deco);
            } else if (line) {
                toPreview();
                addLine(line.dataset.fline);
            } else if (pact) {
                pageAction(pact.dataset.pact, Number(pact.closest('.fp-page').dataset.i));
            } else if (row) {
                focusPage(Number(row.dataset.i));
            }
        });
        $('#addPage').addEventListener('click', () => pageAction('add'));
        $('#photoInput').addEventListener('change', (e) => { addPhotos(e.target.files); e.target.value = ''; });
        $('#freeTitle').addEventListener('input', (e) => { state.freeTitle = e.target.value; schedule(); });

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
            const typing = e.target.closest('input, textarea, select, [contenteditable]');
            if (state.sel && !typing) {
                if (state.sel.kind === 'stk' && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeSticker(state.sel.id); return; }
                const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                if (state.sel.kind === 'stk' && arrows[e.key]) {
                    e.preventDefault();
                    const st = findSticker(state.sel.id);
                    const step = e.shiftKey ? 40 : 6;
                    st.x += arrows[e.key][0] * step;
                    st.y += arrows[e.key][1] * step;
                    const el = selectedEl();
                    if (el) place(el, st);
                    placeBar();
                    save();
                    return;
                }
                if (e.key === 'Escape') { select(null); return; }
            }
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
            applyDraft(draft);
        } else {
            state.draftId = Store.drafts.newId();
            state.text = SAMPLE;
            ed.value = state.text;
            syncMode();
        }
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
        addSticker,
        select,
        setMode,
        pageAction,
        cutout: Stickers.cutout,
        aiCutout: Stickers.aiCutout,
        imageSize: (id) => { const r = Images.cache.get(id); return r && { w: r.w, h: r.h }; },
        SAMPLE,
    };
    window.Studio.ready = init();
})();
