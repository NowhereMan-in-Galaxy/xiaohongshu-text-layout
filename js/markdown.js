/*
 * Markdown 解析器 —— 把用户输入的文本解析成一个个「块」（标题、段落、列表项、表格……）
 *
 * 这是纯逻辑代码，不依赖浏览器 DOM，所以既能在网页里用，也能在 Node 里跑单元测试。
 * 解析结果里的 html 字段已经做过转义，可以安全地放进 innerHTML。
 *
 * 为了照顾中文写作习惯，这里和标准 Markdown 有两点不同：
 *   1. 每一行就是一个段落（不需要空一行）
 *   2. 连续多个空行会变成额外的留白
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Markdown = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

    const UNESC = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
    const toPlain = (html) => html
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(amp|lt|gt|quot|#39);/g, (e) => UNESC[e]);

    /** 只允许安全的图片地址：http(s)、站内相对路径、data:image、以及本工具的 img:xxx 引用 */
    function safeImageSrc(url) {
        const u = url.trim();
        if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u;
        if (/^img:[\w-]+$/.test(u)) return u;
        if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(u)) return u;
        if (/^(\.{0,2}\/)?[\w\-./]+\.(png|jpe?g|gif|webp|svg)$/i.test(u) && !u.includes('..')) return u;
        return null;
    }

    /* ---------------------------------------------------------------- 行内语法 */

    // 成对的标记，顺序很重要：** 必须排在 * 前面
    const PAIRS = [
        ['**', 'strong'],
        ['__', 'u'],
        ['~~', 'del'],
        ['==', 'mark'],
        ['*', 'em'],
    ];
    const ESCAPABLE = '\\*_~=`[]#!|';

    /** 从 from 开始找闭合标记 d，跳过被反斜杠转义的，以及 * 查找时跳过嵌套的 ** */
    function findClose(s, from, d) {
        let j = from;
        while (j < s.length) {
            j = s.indexOf(d, j);
            if (j < 0) return -1;
            if (s[j - 1] === '\\') { j += 1; continue; }
            if (d === '*' && s[j + 1] === '*') {
                const inner = s.indexOf('**', j + 2);
                j = inner < 0 ? j + 2 : inner + 2;
                continue;
            }
            if (j > from && !/\s/.test(s[j - 1])) return j;
            j += d.length;
        }
        return -1;
    }

    function parseInline(s, depth = 0) {
        if (depth > 8) return escapeHtml(s);
        let out = '';
        let buf = '';
        const flush = () => { out += escapeHtml(buf); buf = ''; };
        let i = 0;
        outer: while (i < s.length) {
            const ch = s[i];

            if (ch === '\\' && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) {
                buf += s[i + 1];
                i += 2;
                continue;
            }

            if (ch === '`') {
                const j = s.indexOf('`', i + 1);
                if (j > i + 1) {
                    flush();
                    out += `<code>${escapeHtml(s.slice(i + 1, j))}</code>`;
                    i = j + 1;
                    continue;
                }
            }

            if (ch === '[') {
                // 兼容旧版语法：[color:#ff4757]文字[/color]
                const color = /^\[color:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\]/i.exec(s.slice(i));
                if (color) {
                    const start = i + color[0].length;
                    const end = s.indexOf('[/color]', start);
                    if (end > start) {
                        flush();
                        out += `<span class="c" style="color:${color[1]}">${parseInline(s.slice(start, end), depth + 1)}</span>`;
                        i = end + '[/color]'.length;
                        continue;
                    }
                }
                // 链接：图片里点不了，所以只保留文字并加上链接样式
                const link = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(s.slice(i));
                if (link) {
                    flush();
                    out += `<span class="lnk">${parseInline(link[1], depth + 1)}</span>`;
                    i += link[0].length;
                    continue;
                }
            }

            // #话题 （小红书风格），前面必须是行首或空白，避免误伤 C# 这类写法
            if (ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
                const tag = /^#([^\s#[\]]{1,24})(?:\[话题\])?#?/.exec(s.slice(i));
                if (tag && /\p{L}/u.test(tag[1])) {
                    flush();
                    out += `<span class="tag">#${escapeHtml(tag[1])}</span>`;
                    i += tag[0].length;
                    continue;
                }
            }

            for (const [d, tag] of PAIRS) {
                if (!s.startsWith(d, i)) continue;
                const after = s[i + d.length];
                if (after === undefined || /\s/.test(after)) continue;
                const close = findClose(s, i + d.length, d);
                if (close < 0) continue;
                flush();
                out += `<${tag}>${parseInline(s.slice(i + d.length, close), depth + 1)}</${tag}>`;
                i = close + d.length;
                continue outer;
            }

            buf += ch;
            i += 1;
        }
        flush();
        return out;
    }

    /* ---------------------------------------------------------------- 块级语法 */

    const RE = {
        blank: /^\s*$/,
        fence: /^\s*(```|~~~)\s*([\w+-]*)\s*$/,
        pagebreak: /^\s*-{3,}\s*$/,
        divider: /^\s*(?:(?:\*\s*){3,}|(?:_\s*){3,})$/,
        heading: /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/,
        quote: /^\s*>\s?(.*)$/,
        list: /^(\s*)([-*+•·]|\d{1,3}[.)、])\s+(.*)$/,
        task: /^\[([ xX])\]\s+(.*)$/,
        image: /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/,
        tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
    };

    function splitRow(line) {
        let s = line.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
        const cells = [];
        let cur = '';
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
            if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
            cur += s[i];
        }
        cells.push(cur.trim());
        return cells;
    }

    function isTableStart(lines, i) {
        return lines[i].includes('|') && i + 1 < lines.length
            && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes('-')
            && (lines[i].trim().startsWith('|') || lines[i + 1].includes('|'));
    }

    /**
     * 解析整篇文档
     * @returns {{ blocks: object[], title: string, titleHtml: string, stats: {chars:number, images:number} }}
     */
    function parse(src) {
        const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
        const blocks = [];
        let blankRun = 0;
        // 有序列表的编号：按缩进层级分别计数，遇到非列表块时清零
        let counters = [];

        const push = (block) => {
            if (blankRun >= 2 && blocks.length && blocks[blocks.length - 1].type !== 'pagebreak') {
                blocks.push({ type: 'spacer', size: Math.min(blankRun - 1, 8), line: block.line });
            }
            blankRun = 0;
            if (block.type !== 'li') counters = [];
            blocks.push(block);
        };

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const at = i;

            if (RE.blank.test(line)) { blankRun++; i++; continue; }

            const fence = RE.fence.exec(line);
            if (fence) {
                const body = [];
                i++;
                while (i < lines.length && !new RegExp('^\\s*' + fence[1] + '\\s*$').test(lines[i])) body.push(lines[i++]);
                i++; // 跳过结尾的 ```
                push({ type: 'code', lang: fence[2] || '', html: escapeHtml(body.join('\n')), text: body.join('\n'), line: at });
                continue;
            }

            if (RE.pagebreak.test(line)) { push({ type: 'pagebreak', line: at }); i++; continue; }
            if (RE.divider.test(line)) { push({ type: 'hr', line: at }); i++; continue; }

            const h = RE.heading.exec(line);
            if (h) {
                const html = parseInline(h[2]);
                push({ type: 'h', level: Math.min(h[1].length, 3), html, text: toPlain(html), line: at });
                i++;
                continue;
            }

            if (RE.quote.test(line)) {
                const parts = [];
                while (i < lines.length && RE.quote.test(lines[i])) parts.push(RE.quote.exec(lines[i++])[1]);
                const html = parts.map((p) => parseInline(p)).join('<br>');
                push({ type: 'quote', html, text: toPlain(html), line: at });
                continue;
            }

            if (isTableStart(lines, i)) {
                const header = splitRow(lines[i]);
                const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
                i += 2;
                const rows = [];
                while (i < lines.length && lines[i].includes('|') && !RE.blank.test(lines[i])) rows.push(splitRow(lines[i++]));
                const cols = header.length;
                const norm = (r) => Array.from({ length: cols }, (_, c) => parseInline(r[c] || ''));
                const table = { type: 'table', header: norm(header), align, rows: rows.map(norm), line: at };
                table.text = [table.header, ...table.rows].map((r) => r.map(toPlain).join(' ')).join('\n');
                push(table);
                continue;
            }

            const li = RE.list.exec(line);
            if (li) {
                const depth = Math.min(Math.floor(li[1].replace(/\t/g, '    ').length / 2), 2);
                const ordered = /\d/.test(li[2]);
                let content = li[3];
                let task = null;
                const t = RE.task.exec(content);
                if (t) { task = t[1] !== ' '; content = t[2]; }
                counters.length = depth + 1;
                let number = null;
                if (ordered) {
                    number = counters[depth] === undefined ? parseInt(li[2], 10) : counters[depth] + 1;
                    counters[depth] = number;
                } else {
                    counters[depth] = undefined;
                }
                const html = parseInline(content);
                push({ type: 'li', ordered, number, task, depth, html, text: toPlain(html), line: at });
                i++;
                continue;
            }

            const img = RE.image.exec(line);
            if (img) {
                const src = safeImageSrc(img[2]);
                if (src) {
                    push({ type: 'img', src, alt: img[1], html: escapeHtml(img[1]), text: '', line: at });
                    i++;
                    continue;
                }
            }

            const html = parseInline(line.trim());
            push({ type: 'p', html, text: toPlain(html), line: at });
            i++;
        }

        const first = blocks.find((b) => b.type === 'h' && b.level === 1);
        const chars = blocks.reduce((n, b) => n + (b.text ? b.text.replace(/\s/g, '').length : 0), 0);
        return {
            blocks,
            title: first ? first.text : '',
            titleHtml: first ? first.html : '',
            stats: { chars, images: blocks.filter((b) => b.type === 'img').length },
        };
    }

    /* ---------------------------------------------------------------- 断行规则 */

    // 不能出现在行首的标点（避头）和不能出现在行尾的标点（避尾）
    const NO_START = '，。、！？；：,.!?;:)）]】」』”’》〉…—～%％·';
    const NO_END = '（([【「『“‘《〈';
    const WORD = /[A-Za-z0-9'’\-_.@]/;

    /**
     * 跨页拆分段落时，调整断点位置 k（text 的第 k 个字符将成为下一页的开头）
     * 保证下一页不以「，。」等标点开头，也不把英文单词拦腰截断
     */
    function adjustBreak(text, k) {
        if (k <= 0 || k >= text.length) return k;
        let j = k;
        for (let n = 0; n < 3 && j > 1; n++) {
            if (NO_START.includes(text[j]) || NO_END.includes(text[j - 1])) j--;
            else break;
        }
        if (WORD.test(text[j - 1] || '') && WORD.test(text[j] || '')) {
            let m = j;
            while (m > 0 && j - m < 30 && WORD.test(text[m - 1])) m--;
            if (m > 0 && j - m < 30) j = m;
        }
        return j > 0 ? j : k;
    }

    return { parse, parseInline, escapeHtml, toPlain, safeImageSrc, adjustBreak };
});
