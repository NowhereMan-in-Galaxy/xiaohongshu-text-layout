/*
 * 导出 —— 把页面变成 PNG 图片
 *
 * 使用 modern-screenshot：它把页面包进 SVG 交给浏览器自己绘制，
 * 所以导出的图片和屏幕上看到的完全一致（旧版 html2canvas 是自己模拟绘制，
 * 纹理、荧光笔、波浪线等效果都会画错）。
 */
const Exporter = (() => {
    let stage = null;

    function getStage() {
        if (!stage) {
            stage = document.createElement('div');
            stage.className = 'export-stage';
            stage.setAttribute('aria-hidden', 'true');
            document.body.appendChild(stage);
        }
        return stage;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /** 等字体加载完，但最多等几秒（网络字体被墙时不能一直卡住） */
    async function fontsReady(ms = 4000) {
        if (!document.fonts) return;
        await Promise.race([document.fonts.ready, sleep(ms)]);
    }

    /* ---------------------------------------------------------------- 字体嵌入
     * 导出时字体必须嵌进图片里。中文网络字体会被切成上百个小文件（按 unicode-range），
     * 如果全部嵌入，导出一张图要 30 秒。所以这里只挑出「这一页真正用到的字」所在的那几个分片，
     * 并且把下载过的分片缓存起来，之后的导出几乎不花时间。
     */
    const fontData = new Map(); // 字体文件 URL → Promise<dataURL>

    function fetchAsDataURL(url) {
        if (!fontData.has(url)) {
            fontData.set(url, fetch(url, { mode: 'cors' })
                .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
                .then((blob) => new Promise((resolve) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                }))
                .catch(() => null));
        }
        return fontData.get(url);
    }

    function parseRanges(value) {
        if (!value || !value.trim()) return null;
        return value.split(',').map((part) => {
            const r = part.trim().replace(/^u\+/i, '');
            if (r.includes('?')) return [parseInt(r.replace(/\?/g, '0'), 16), parseInt(r.replace(/\?/g, 'F'), 16)];
            const [a, b] = r.split('-');
            return [parseInt(a, 16), parseInt(b || a, 16)];
        });
    }

    const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');

    /** 找出页面里用到的字体名和字符 */
    function usage(root) {
        const families = new Set();
        const chars = new Set();
        const addText = (t) => { for (const ch of t) chars.add(ch.codePointAt(0)); };
        addText(root.textContent);
        for (const el of [root, ...root.querySelectorAll('*')]) {
            const cs = getComputedStyle(el);
            cs.fontFamily.split(',').forEach((f) => families.add(unquote(f).toLowerCase()));
            for (const pseudo of ['::before', '::after']) {
                const c = getComputedStyle(el, pseudo).content;
                if (c && c !== 'none' && c !== 'normal') addText(c.replace(/^["']|["']$/g, ''));
            }
        }
        return { families, chars: [...chars] };
    }

    const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
    const weight = (w) => ({ NORMAL: '400', BOLD: '700' })[norm(w)] || norm(w) || '400';
    const faceKey = (family, w, range) => [unquote(family).toLowerCase(), weight(w), norm(range) || 'U+0-10FFFF'].join('|');

    /** 浏览器已经成功加载并校验过的字体分片。没加载完或加载失败的分片不嵌入，让它退回系统字体，免得出现空白字 */
    function loadedFaces() {
        const keys = new Set();
        document.fonts.forEach((f) => { if (f.status === 'loaded') keys.add(faceKey(f.family, f.weight, f.unicodeRange)); });
        return keys;
    }

    async function fontCss(root) {
        const { families, chars } = usage(root);
        const loaded = loadedFaces();
        const tasks = [];
        for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch { continue; }
            for (const rule of rules) {
                if (!(rule instanceof CSSFontFaceRule)) continue;
                const family = unquote(rule.style.getPropertyValue('font-family'));
                if (!families.has(family.toLowerCase())) continue;
                const ranges = parseRanges(rule.style.getPropertyValue('unicode-range'));
                if (ranges && !chars.some((c) => ranges.some(([a, b]) => c >= a && c <= b))) continue;
                const m = /url\(\s*(['"]?)(.+?)\1\s*\)/.exec(rule.style.getPropertyValue('src'));
                if (!m) continue;
                const url = m[2].startsWith('data:') ? m[2] : new URL(m[2], sheet.href || location.href).href;
                const key = faceKey(family, rule.style.getPropertyValue('font-weight'), rule.style.getPropertyValue('unicode-range'));
                if (!url.startsWith('data:') && !loaded.has(key)) continue;
                tasks.push((url.startsWith('data:') ? Promise.resolve(url) : fetchAsDataURL(url)).then((data) => {
                    if (!data) return '';
                    const prop = (p, d) => rule.style.getPropertyValue(p) || d;
                    return `@font-face{font-family:"${family}";src:url(${data});font-weight:${prop('font-weight', 'normal')};`
                        + `font-style:${prop('font-style', 'normal')};${ranges ? `unicode-range:${rule.style.getPropertyValue('unicode-range')};` : ''}}`;
                }));
            }
        }
        return (await Promise.all(tasks)).filter(Boolean).join('\n');
    }

    function checksum(data) {
        const u = new Uint32Array(data.buffer);
        let h = 0;
        for (let i = 0; i < u.length; i++) h = (h * 31 + u[i]) | 0;
        return h;
    }

    /**
     * SVG 图片里嵌入的字体是异步解码的，第一次绘制时可能还没准备好，那些字会画成空白。
     * 所以反复绘制，直到连续两次画出来的像素完全一样，才算字体全部就绪。
     */
    async function rasterize(svg, w, h, scale) {
        const xml = new XMLSerializer().serializeToString(svg)
            .replace(/[\u0000-\u0008\v\f\u000E-\u001F\uD800-\uDFFF￾￿]/gu, '');
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        await img.decode();

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const g = canvas.getContext('2d');
        const draw = () => {
            g.clearRect(0, 0, canvas.width, canvas.height);
            g.drawImage(img, 0, 0, canvas.width, canvas.height);
        };

        let prev = null;
        for (let i = 0; i < 10; i++) {
            draw();
            let sum;
            try {
                sum = checksum(g.getImageData(0, 0, canvas.width, canvas.height).data);
            } catch {
                // 个别浏览器不允许读取像素：退而求其次，多等一会儿再画
                await sleep(400);
                draw();
                break;
            }
            if (sum === prev) break;
            prev = sum;
            await sleep(i === 0 ? 50 : 150);
        }
        return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png'));
    }

    /** 把一个页面元素渲染成 PNG Blob */
    async function toBlob(pageEl, scale = 1) {
        const st = getStage();
        st.replaceChildren(pageEl);
        try {
            await fontsReady();
            await Promise.all([...pageEl.querySelectorAll('img')].map((img) => img.decode().catch(() => { })));
            const cssText = await fontCss(pageEl);
            const svg = await modernScreenshot.domToForeignObjectSvg(pageEl, {
                timeout: 30000,
                font: cssText ? { cssText } : false,
            });
            return await rasterize(svg, pageEl.offsetWidth, pageEl.offsetHeight, scale);
        } finally {
            st.replaceChildren();
        }
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    async function zip(entries) {
        const z = new JSZip();
        entries.forEach((e) => z.file(e.name, e.blob));
        return z.generateAsync({ type: 'blob', compression: 'STORE' });
    }

    function canShareFiles() {
        try {
            const f = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
            return !!(navigator.canShare && navigator.canShare({ files: [f] }));
        } catch {
            return false;
        }
    }

    async function share(entries, title) {
        const files = entries.map((e) => new File([e.blob], e.name, { type: 'image/png' }));
        await navigator.share({ files, title });
    }

    /** 复制到剪贴板。传入 Promise 是为了兼容 Safari：必须在用户点击的同一时刻调用 clipboard.write */
    async function copy(blobPromise) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    }

    function safeName(s) {
        return (s || '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 24) || '长文卡片';
    }

    return { toBlob, download, zip, share, canShareFiles, copy, safeName, fontsReady };
})();
