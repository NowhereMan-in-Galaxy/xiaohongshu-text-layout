/*
 * 贴纸 —— 浮在页面最上层、可以自由拖动的小图片或表情
 *
 * 贴纸不参与分页：它们记在「第几页」上，位置用页面像素表示（页面宽 1080）。
 * 列表里越靠后的贴纸越靠上层，「上移一层 / 下移一层」就是在列表里交换位置。
 *
 * 这里还有一个不依赖网络、不上传图片的「自动抠图」：
 * 从图片四条边出发，把和边缘颜色相近、并且连成一片的像素当成背景去掉。
 * 适合纯色或接近纯色背景的图（商品图、截图、白底照片、手绘扫描），复杂的街景照片抠不干净。
 */
const Stickers = (() => {
    const { escapeHtml: esc } = Markdown;

    const EMOJIS = ['✨', '🔥', '💡', '📌', '❤️', '⭐️', '🌸', '🍀', '🎀', '🌙', '☀️', '🍓', '☕️', '📚', '✏️', '📍',
        '✅', '❌', '‼️', '❓', '💯', '👍', '👀', '🎉', '😆', '🥹', '😭', '🤔', '🙌', '💪', '🐱', '🐶'];

    const SHAPES = [
        ['none', '原图'],
        ['circle', '圆形'],
        ['rounded', '圆角'],
        ['arch', '拱门'],
        ['heart', '爱心'],
        ['star', '星星'],
        ['flower', '花朵'],
    ];

    /** 某一页上的贴纸（页数变少时，超出的贴纸显示在最后一页，不会丢） */
    function onPage(list, i, total) {
        return list.filter((s) => Math.min(s.page, total - 1) === i);
    }

    function html(st, images, [pw, ph]) {
        const x = Math.max(0, Math.min(pw, st.x));
        const y = Math.max(0, Math.min(ph, st.y));
        const cls = ['stk', st.shape && st.shape !== 'none' ? 'sh-' + st.shape : '', st.outline ? 'outline' : '', st.shadow ? 'shadow' : ''].filter(Boolean).join(' ');
        const pos = `width:${st.w}px;transform:translate(${x - st.w / 2}px, ${y}px) translateY(-50%) rotate(${st.rot || 0}deg)`;
        let inner;
        if (st.kind === 'emoji') {
            inner = `<span class="stk-in emoji" style="font-size:${(st.w * 0.86).toFixed(1)}px;line-height:${st.w}px">${esc(st.text)}</span>`;
        } else {
            const im = images.get(st.src);
            inner = im
                ? `<img class="stk-in" src="${esc(im.url)}" alt="" draggable="false" style="aspect-ratio:${im.w}/${im.h}">`
                : '<span class="stk-in img-missing" style="aspect-ratio:1">图片丢失</span>';
        }
        return `<div class="${cls}" data-sid="${esc(st.id)}" style="${pos}">${inner}</div>`;
    }

    function layer(list, i, total, images, size) {
        const here = onPage(list, i, total);
        if (!here.length) return null;
        const el = document.createElement('div');
        el.className = 'pg-stk';
        el.innerHTML = here.map((st) => html(st, images, size)).join('');
        return el;
    }

    /* ---------------------------------------------------------------- 自动抠图 */

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片读取失败'));
            img.src = url;
        });
    }

    /**
     * 去掉图片背景
     * @param {string} url 原图
     * @param {number} strength 1–100，越大去掉的颜色范围越宽
     * @returns {Promise<{url:string,w:number,h:number,removed:number}>} removed 是被去掉的像素比例
     */
    async function cutout(url, strength = 50) {
        const img = await loadImage(url);
        const MAX = 1000;
        const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const W = Math.max(1, Math.round(img.naturalWidth * k));
        const H = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, W, H);
        const im = g.getImageData(0, 0, W, H);
        const d = im.data;
        const N = W * H;

        // 1. 统计边缘颜色，找出背景色（可能不止一种，比如渐变或阴影）
        const buckets = new Map();
        const addEdge = (p) => {
            const o = p * 4;
            if (d[o + 3] < 16) return;
            const key = ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4);
            const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            b.n++; b.r += d[o]; b.g += d[o + 1]; b.b += d[o + 2];
            buckets.set(key, b);
        };
        for (let x = 0; x < W; x++) { addEdge(x); addEdge((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { addEdge(y * W); addEdge(y * W + W - 1); }
        const edgeTotal = [...buckets.values()].reduce((n, b) => n + b.n, 0) || 1;
        const palette = [...buckets.values()]
            .filter((b) => b.n / edgeTotal > 0.03)
            .sort((a, b) => b.n - a.n)
            .slice(0, 6)
            .map((b) => [b.r / b.n, b.g / b.n, b.b / b.n]);

        const tol = 14 + strength * 0.9;
        const dist = new Float32Array(N);
        for (let p = 0; p < N; p++) {
            const o = p * 4;
            if (d[o + 3] < 16) { dist[p] = 0; continue; }
            let best = 1e9;
            for (const [r, gg, b] of palette) {
                const dr = d[o] - r;
                const dg = d[o + 1] - gg;
                const db = d[o + 2] - b;
                // 人眼对绿色更敏感，给一点加权
                const v = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) * 1.6;
                if (v < best) best = v;
            }
            dist[p] = palette.length ? best : 1e9;
        }

        // 2. 从四条边出发做「洪水填充」：只有和边缘连成一片的背景色才会被去掉，主体内部的同色区域会保留
        const bg = new Uint8Array(N);
        const queue = new Int32Array(N);
        let head = 0;
        let tail = 0;
        const seed = (p) => { if (!bg[p] && dist[p] < tol) { bg[p] = 1; queue[tail++] = p; } };
        for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
        while (head < tail) {
            const p = queue[head++];
            const x = p % W;
            if (x > 0) seed(p - 1);
            if (x < W - 1) seed(p + 1);
            if (p >= W) seed(p - W);
            if (p < N - W) seed(p + W);
        }

        // 3. 生成透明度：背景全透明；紧挨背景的边缘像素按颜色接近程度半透明，边缘更柔和
        const alpha = new Uint8ClampedArray(N);
        let removed = 0;
        for (let p = 0; p < N; p++) {
            if (bg[p]) { removed++; continue; }
            const x = p % W;
            const edge = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (p >= W && bg[p - W]) || (p < N - W && bg[p + W]);
            const a = d[p * 4 + 3];
            alpha[p] = edge ? Math.min(a, Math.max(0, (dist[p] - tol * 0.7) / (tol * 0.8)) * 255) : a;
        }
        // 轻微模糊边缘一圈，去掉锯齿
        const out = new Uint8ClampedArray(alpha);
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                const p = y * W + x;
                if (!alpha[p] || (bg[p - 1] | bg[p + 1] | bg[p - W] | bg[p + W]) === 0) continue;
                let s = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += alpha[p + dy * W + dx];
                out[p] = Math.min(alpha[p], s / 9 * 1.3);
            }
        }

        // 4. 裁掉四周的透明部分
        let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
        for (let p = 0; p < N; p++) {
            d[p * 4 + 3] = out[p];
            if (out[p] > 8) {
                const x = p % W;
                const y = (p - x) / W;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        g.putImageData(im, 0, 0);
        if (x1 < 0) return { url, w: img.naturalWidth, h: img.naturalHeight, removed: 1 };
        const pad = 2;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
        const cw = x1 - x0 + 1;
        const ch = y1 - y0 + 1;
        const crop = document.createElement('canvas');
        crop.width = cw;
        crop.height = ch;
        crop.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
        return { url: crop.toDataURL('image/png'), w: cw, h: ch, removed: removed / N };
    }

    return { EMOJIS, SHAPES, onPage, layer, cutout };
})();
