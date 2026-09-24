/*
 * 渲染 —— 把解析好的块变成 HTML，搭出每一页的骨架（背景、页眉、正文区、页脚）以及封面
 */
const Render = (() => {
    const { escapeHtml: esc, parseInline } = Markdown;

    const RATIOS = {
        '3:4': [1080, 1440],
        '2:3': [1080, 1620],
        '9:16': [1080, 1920],
        '1:1': [1080, 1080],
        '4:3': [1080, 810],
    };

    const BODY_FONTS = {
        sans: 'var(--sans)',
        serif: 'var(--serif)',
        kai: 'var(--kai)',
        round: 'var(--round)',
        custom: '"StudioCustomFont", var(--sans)',
    };
    const HEAD_FONTS = { ...BODY_FONTS, brush: 'var(--brush)', same: 'var(--font-body)' };

    function size(ratio) {
        return RATIOS[ratio] || RATIOS['3:4'];
    }

    /** 根据颜色亮度决定上面该用深色字还是白字 */
    function inkOn(hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        if (!m) return '#fff';
        const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? '#1b1b1b' : '#ffffff';
    }

    function pageStyle(s) {
        const theme = Themes.get(s.theme);
        const [w, h] = size(s.ratio);
        const accent = s.accent || theme.accents[0];
        const vars = {
            '--pw': w + 'px',
            '--ph': h + 'px',
            '--fs': s.fontSize + 'px',
            '--lh': s.lineHeight,
            '--ps': s.paraSpacing,
            '--indent': s.indent ? '2em' : '0',
            '--align': s.align,
            '--accent': accent,
            '--accent-ink': inkOn(accent),
        };
        if (s.bodyFont !== 'theme' && BODY_FONTS[s.bodyFont]) vars['--font-body'] = BODY_FONTS[s.bodyFont];
        if (s.headFont !== 'theme' && HEAD_FONTS[s.headFont]) vars['--font-head'] = HEAD_FONTS[s.headFont];
        return vars;
    }

    /* ---------------------------------------------------------------- 正文块 */

    function blockHtml(b, images) {
        const dl = ` data-line="${b.line}"`;
        switch (b.type) {
            case 'h':
                return `<h${b.level} class="blk h h${b.level}"${dl}><span class="hx">${b.html}</span></h${b.level}>`;
            case 'p':
                return `<p class="blk p"${dl}>${b.html}</p>`;
            case 'li': {
                const kind = b.task !== null ? 'task' : b.ordered ? 'ol' : 'ul';
                const mk = kind === 'ol' ? `${b.number}.` : '<i></i>';
                return `<div class="blk li ${kind} d${b.depth}${b.task ? ' done' : ''}"${dl}><span class="mk">${mk}</span><div class="lic">${b.html}</div></div>`;
            }
            case 'quote':
                return `<blockquote class="blk quote"${dl}>${b.html}</blockquote>`;
            case 'table': {
                const al = (i) => (b.align[i] ? ` class="al-${b.align[i]}"` : '');
                const head = b.header.map((c, i) => `<th${al(i)}>${c}</th>`).join('');
                const rows = b.rows.map((r) => `<tr>${r.map((c, i) => `<td${al(i)}>${c}</td>`).join('')}</tr>`).join('');
                return `<table class="blk tbl"${dl}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
            }
            case 'code':
                return `<pre class="blk code"${dl}><code>${b.html}</code></pre>`;
            case 'img': {
                const im = images.get(b.src);
                const cap = b.alt ? `<figcaption>${esc(b.alt)}</figcaption>` : '';
                const al = b.align && b.align !== 'center' ? ` al-${b.align}` : '';
                if (!im) {
                    return `<figure class="blk fig missing${al}"${dl}><div class="img-missing">图片加载失败</div>${cap}</figure>`;
                }
                // 宽度取「设定的百分比」「原图宽度」「按页面高度能放下的宽度」三者中最小的，保证等比例且不超出页面
                const ratio = (im.w / im.h).toFixed(5);
                const capH = b.alt ? ' - 2.4em' : '';
                const style = `aspect-ratio:${im.w}/${im.h};width:min(${b.width || 100}%, ${im.w}px, calc((var(--body-h)${capH}) * ${ratio}))`;
                return `<figure class="blk fig${b.alt ? ' has-cap' : ''}${al}"${dl}><img data-i="0" src="${esc(im.url)}" alt="${esc(b.alt)}" style="${style}">${cap}</figure>`;
            }
            case 'imgrow': {
                // 多张图并排：每格的宽度按图片宽高比分配，这样所有图高度一样；整行高度不超过页面
                const GAP = 20;
                const hasCap = b.items.some((it) => it.alt);
                const recs = b.items.map((it) => images.get(it.src));
                const ratios = recs.map((im) => (im ? im.w / im.h : 1));
                const sum = ratios.reduce((a, r) => a + r, 0);
                const gaps = GAP * (b.items.length - 1);
                const width = `min(100%, calc((var(--body-h)${hasCap ? ' - 2.4em' : ''}) * ${sum.toFixed(5)} + ${gaps}px))`;
                const cells = b.items.map((it, i) => {
                    const im = recs[i];
                    const pic = im
                        ? `<img data-i="${i}" src="${esc(im.url)}" alt="${esc(it.alt)}" style="aspect-ratio:${im.w}/${im.h}">`
                        : '<div class="img-missing" style="aspect-ratio:1">图片加载失败</div>';
                    const cap = hasCap ? `<figcaption>${esc(it.alt) || '&nbsp;'}</figcaption>` : '';
                    return `<div class="cell" style="flex:${ratios[i].toFixed(5)} 1 0">${pic}${cap}</div>`;
                }).join('');
                return `<figure class="blk fig row"${dl}><div class="row-in" style="width:${width};gap:${GAP}px">${cells}</div></figure>`;
            }
            case 'hr':
                return `<div class="blk hr"${dl}><i></i><i></i><i></i></div>`;
            case 'spacer':
                return `<div class="blk sp" style="--n:${b.size}"${dl}></div>`;
            default:
                return '';
        }
    }

    /* ---------------------------------------------------------------- 页面骨架 */

    function numText(i, total) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(i + 1)} / ${pad(total)}`;
    }

    /**
     * 创建一页的外壳
     * @param {object} s 设置
     * @param {{cover?:boolean, index?:number, total?:number}} opt
     */
    function shell(s, opt = {}) {
        const theme = Themes.get(s.theme);
        const [w, h] = size(s.ratio);
        const el = document.createElement('div');
        const header = !opt.cover && s.header.trim();
        el.className = [
            'pg',
            'theme-' + theme.id,
            w > h ? 'r-wide' : '',
            header ? 'has-header' : '',
            opt.cover ? 'is-cover' : '',
        ].filter(Boolean).join(' ');
        for (const [k, v] of Object.entries(pageStyle(s))) el.style.setProperty(k, v);

        const deco = opt.cover ? (theme.coverDeco ?? theme.deco ?? '') : (theme.deco || '');
        let html = `<div class="pg-bg"></div><div class="pg-deco">${deco}</div>`;
        if (!opt.cover) {
            if (header) html += `<div class="pg-header"><span>${esc(header)}</span></div>`;
            html += '<div class="pg-body"></div>';
            const wm = s.watermark.trim() ? `<span class="pg-wm">${esc(s.watermark.trim())}</span>` : '';
            const num = s.pageNum ? `<span class="pg-num">${numText(opt.index || 0, opt.total || 1)}</span>` : '';
            if (wm || num) html += `<div class="pg-footer">${wm}${num}</div>`;
        }
        el.innerHTML = html;
        return el;
    }

    /* ---------------------------------------------------------------- 封面 */

    function coverTitleHtml(s, doc) {
        const custom = s.cover.title.trim();
        if (custom) return custom.split('\n').map((l) => parseInline(l.trim())).join('<br>');
        if (doc.titleHtml) return doc.titleHtml;
        const first = doc.blocks.find((b) => b.text);
        return first ? esc(first.text.slice(0, 28)) : '写点什么吧';
    }

    function coverShell(s, doc, total) {
        const el = shell(s, { cover: true });
        const c = s.cover;
        const wm = s.watermark.trim();
        el.insertAdjacentHTML('beforeend', `
            <div class="cv">
                ${c.badge.trim() ? `<div class="cv-badge">${esc(c.badge.trim())}</div>` : ''}
                <div class="cv-title">${coverTitleHtml(s, doc)}</div>
                ${c.subtitle.trim() ? `<div class="cv-sub">${parseInline(c.subtitle.trim())}</div>` : ''}
                ${c.sticker.trim() ? `<div class="cv-sticker">${esc(c.sticker.trim())}</div>` : ''}
                <div class="cv-meta"><span>${esc(wm)}</span><span>${total > 1 ? `共 ${total} 页 · 左滑阅读 →` : ''}</span></div>
            </div>`);
        return el;
    }

    /** 在测量台上二分查找封面标题的最大字号，让标题尽量大但不溢出 */
    function fitCover(el) {
        const cv = el.querySelector('.cv');
        const title = el.querySelector('.cv-title');
        const justify = cv.style.justifyContent;
        cv.style.justifyContent = 'flex-start';
        const maxH = cv.clientHeight * 0.62;
        // 只看正常排版流里的元素（角标、标题、副标题），页脚和贴纸是绝对定位的装饰
        const flow = [...cv.children].filter((c) => getComputedStyle(c).position !== 'absolute');
        const last = flow[flow.length - 1];
        let lo = 56;
        let hi = 200;
        let best = lo;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            title.style.setProperty('--cv-fs', mid + 'px');
            const ok = title.scrollWidth <= title.clientWidth + 1
                && title.offsetHeight <= maxH
                && last.getBoundingClientRect().bottom <= cv.getBoundingClientRect().bottom + 1;
            if (ok) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        title.style.setProperty('--cv-fs', best + 'px');
        cv.style.justifyContent = justify;
        return best;
    }

    return { RATIOS, size, blockHtml, shell, coverShell, fitCover, numText, inkOn };
})();
