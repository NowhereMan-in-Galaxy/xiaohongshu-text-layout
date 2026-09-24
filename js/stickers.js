/*
 * 贴纸 —— 浮在页面最上层、可以自由拖动的小图片或表情
 *
 * 贴纸不参与分页：它们记在「第几页」上，位置用页面像素表示（页面宽 1080）。
 * 列表里越靠后的贴纸越靠上层，「上移一层 / 下移一层」就是在列表里交换位置。
 *
 * 两种抠图，都在浏览器里完成，图片不会上传：
 *  - 智能识别（aiCutout）：用一个小的 AI 模型找出图片里的主体，人像、宠物、物品、风景里的东西都行
 *  - 纯色背景（cutout）：从四条边出发，去掉和边缘颜色相近、连成一片的像素。
 *    不用下载任何东西，适合白底、纯色底的图；智能识别加载失败（比如没网）时也用它
 */
const Stickers = (() => {
    const { escapeHtml: esc } = Markdown;

    // 表情库，分类和手机输入法的表情键盘差不多
    const E = (str) => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(str)].map((x) => x.segment).filter((x) => x.trim());
    const EMOJI_CATS = [
        ['笑脸', '😀', E('😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😛😜🤪😝🤗🤭🤫🤔😐😑😶😏😒🙄😬😌😔😪😴😷🤒🥵🥶🥴😵🤯🥳😎🤓🧐😕😟🙁😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀💩🤡👻👽🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊')],
        ['手势', '👍', E('👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅💪🧠👀👁️👅👄💋')],
        ['爱心', '❤️', E('❤️🩷🧡💛💚💙🩵💜🤎🖤🩶🤍💔❣️💕💞💓💗💖💘💝💟💌')],
        ['动物', '🐱', E('🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🐢🐍🦎🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦒🐘🦛🐪🦘🐄🐎🐖🐑🦙🐐🦌🐕🐩🐈🐈‍⬛🐓🦃🦚🦜🦢🦩🕊️🐇🦝🦦🦥🐁🐿️🦔🐉')],
        ['植物', '🌸', E('💐🌸💮🏵️🌹🥀🌺🌻🌼🌷🌱🪴🌲🌳🌴🌵🌾🌿☘️🍀🍁🍂🍃🍄🌰🪷🪻')],
        ['食物', '🍓', E('🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🫐🥝🍅🥥🥑🍆🥔🥕🌽🌶️🥒🥬🥦🧄🧅🍞🥐🥖🥨🥯🥞🧇🧀🍖🍗🥩🥓🍔🍟🍕🌭🥪🌮🌯🥗🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🥛☕️🍵🧋🥤🧃🍶🍺🍻🥂🍷🍸🍹')],
        ['天气', '☀️', E('☀️🌤️⛅️🌥️☁️🌦️🌧️⛈️🌩️❄️☃️⛄️🌬️💨🌪️🌈☔️💧🌊🌙🌛🌜🌝🌞⭐️🌟✨💫☄️🔥🌍🪐')],
        ['物品', '🎀', E('🎀🎁🎈🎉🎊🧧🏮🎐🕯️🧸🪄🎨🖌️🖍️✏️✒️🖊️📝📒📓📔📕📗📘📙📚📖🔖📎🖇️📌📍✂️📐📏🗂️📅📆🗓️📷📸📹🎥📱💻⌨️🎧🎤🎬🎮🕹️🎲🧩⏰⌛️💡🔦🕶️👓👗👚👕👖👠👟👜👛🎒💄💍💎🌂☂️🧳🏠🏡🏖️🏝️⛰️🗻🏕️🚗🚲✈️🚀🛸⛵️🀄️')],
        ['符号', '✅', E('✅❌⭕️❗️❓‼️⁉️💯🔴🟠🟡🟢🔵🟣⚫️⚪️🟥🟧🟨🟩🟦🟪🔺🔻🔸🔹🔶🔷💠➡️⬅️⬆️⬇️↗️↘️↙️↖️🔄🔁🆕🆒🆗🆙🆓🔝🔜💤💢💥💦💬💭🗯️♨️🎵🎶➕➖✖️➗♾️🚫⚠️🚩')],
    ];

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
        const { c, g } = await toCanvas(url);
        const W = c.width;
        const H = c.height;
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

        return { ...applyAlpha(c, g, im, out, url), removed: removed / N };
    }

    /** 把透明度写回画布，再裁掉四周完全透明的部分 */
    function applyAlpha(c, g, im, alpha, url) {
        const { width: W, height: H } = c;
        const d = im.data;
        let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
        for (let p = 0; p < W * H; p++) {
            d[p * 4 + 3] = alpha[p];
            if (alpha[p] > 8) {
                const x = p % W;
                const y = (p - x) / W;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        g.putImageData(im, 0, 0);
        if (x1 < 0) return { url, w: W, h: H, box: { x: 0, y: 0, W, H } };
        const pad = 2;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
        const cw = x1 - x0 + 1;
        const ch = y1 - y0 + 1;
        const crop = document.createElement('canvas');
        crop.width = cw;
        crop.height = ch;
        crop.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
        // box：裁剪后的图在原图（缩放到画布大小后）里的位置
        return { url: crop.toDataURL('image/png'), w: cw, h: ch, box: { x: x0, y: y0, W, H } };
    }

    /** 画到一张最长边不超过 1000 的画布上 */
    async function toCanvas(url) {
        const img = await loadImage(url);
        const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, c.width, c.height);
        return { img, c, g };
    }

    /** 图片边缘有透明像素（比如 iPhone「拷贝主体」得到的图），说明已经抠好了 */
    async function hasTransparency(url) {
        const { c, g } = await toCanvas(url);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 200) n++;
        return n / (c.width * c.height) > 0.02;
    }

    /* ---------------------------------------------------------------- 智能抠图（AI）
     * 用 U²-Netp 模型（Apache-2.0 许可，4.5MB）识别图片里的主体，在浏览器里用 ONNX Runtime 运行。
     * 模型文件放在仓库里（lib/u2netp.js），运行库从 jsDelivr 加载，第一次用的时候才下载。
     * 图片始终留在你的浏览器里，不会上传到任何服务器。
     */
    const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
    const SIZE = 320;
    let sessionPromise = null;
    const masks = new Map(); // 原图 → 模型输出的蒙版，调强度时不用重新识别

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = () => { el.remove(); reject(new Error('加载失败：' + src)); };
            document.head.appendChild(el);
        });
    }

    function session() {
        if (!sessionPromise) {
            sessionPromise = (async () => {
                if (!self.ort) await loadScript(ORT_URL + 'ort.wasm.min.js');
                ort.env.wasm.wasmPaths = ORT_URL;
                ort.env.wasm.numThreads = 1;
                ort.env.logLevel = 'error';
                if (!self.U2NETP_MODEL) await loadScript('lib/u2netp.js');
                const bin = await (await fetch('data:application/octet-stream;base64,' + self.U2NETP_MODEL)).arrayBuffer();
                return ort.InferenceSession.create(new Uint8Array(bin), { executionProviders: ['wasm'] });
            })();
            sessionPromise.catch(() => { sessionPromise = null; });
        }
        return sessionPromise;
    }

    async function predict(img) {
        const sess = await session();
        const c = document.createElement('canvas');
        c.width = SIZE;
        c.height = SIZE;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, SIZE, SIZE);
        const d = g.getImageData(0, 0, SIZE, SIZE).data;
        const N = SIZE * SIZE;
        const x = new Float32Array(3 * N);
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];
        for (let p = 0; p < N; p++) {
            for (let ch = 0; ch < 3; ch++) x[ch * N + p] = (d[p * 4 + ch] / 255 - mean[ch]) / std[ch];
        }
        const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, SIZE, SIZE]) });
        const m = out[sess.outputNames[0]].data;
        let lo = Infinity;
        let hi = -Infinity;
        for (let p = 0; p < N; p++) { if (m[p] < lo) lo = m[p]; if (m[p] > hi) hi = m[p]; }
        // 放进一张灰度图里，之后缩放到原图大小时浏览器会帮忙做平滑插值
        const mc = document.createElement('canvas');
        mc.width = SIZE;
        mc.height = SIZE;
        const mg = mc.getContext('2d');
        const mi = mg.createImageData(SIZE, SIZE);
        for (let p = 0; p < N; p++) {
            const v = ((m[p] - lo) / (hi - lo || 1)) * 255;
            mi.data[p * 4] = mi.data[p * 4 + 1] = mi.data[p * 4 + 2] = v;
            mi.data[p * 4 + 3] = 255;
        }
        mg.putImageData(mi, 0, 0);
        return mc;
    }

    /**
     * 智能抠图
     * @param {number} strength 1–100，越大抠得越狠（边缘半透明的部分去掉得越多）
     */
    async function aiCutout(url, strength = 50) {
        const { img, c, g } = await toCanvas(url);
        if (!masks.has(url)) masks.set(url, predict(img));
        let mc;
        try { mc = await masks.get(url); } catch (e) { masks.delete(url); throw e; }
        const W = c.width;
        const H = c.height;
        const big = document.createElement('canvas');
        big.width = W;
        big.height = H;
        const bg = big.getContext('2d', { willReadFrequently: true });
        bg.imageSmoothingQuality = 'high';
        bg.drawImage(mc, 0, 0, W, H);
        const md = bg.getImageData(0, 0, W, H).data;
        const im = g.getImageData(0, 0, W, H);
        const lo = (strength / 100) * 0.6 - 0.05;
        const alpha = new Uint8ClampedArray(W * H);
        let removed = 0;
        for (let p = 0; p < W * H; p++) {
            const a = Math.min(1, Math.max(0, (md[p * 4] / 255 - lo) / 0.35));
            alpha[p] = a * im.data[p * 4 + 3];
            if (alpha[p] < 8) removed++;
        }
        return { ...applyAlpha(c, g, im, alpha, url), removed: removed / (W * H) };
    }

    return { EMOJI_CATS, SHAPES, onPage, layer, cutout, aiCutout, hasTransparency };
})();
