/*
 * 素材贴纸 —— 自由排版左边「素材」里的两套贴纸，和两张画布是配套的：
 *
 *  - 像素 Y2K：鼠标箭头、小手光标、翻盖手机、光盘、软盘、弹窗……
 *    用字符画出像素图（一个字母一种颜色），再转成 SVG，放多大都是清晰的方格
 *  - 中世纪手抄本：指示手（manicule）、烛台、蜗牛、拿剑的兔子、怪猫、太阳脸……
 *    仿照手抄本页边插画：深褐墨线，朱红、青金石蓝、金色、铜绿这几种矿物颜料色
 *
 * 全部是内联 SVG，不引用外部图片，导出时和屏幕上一模一样。
 * 注意：不用 <linearGradient> 这类带 id 的定义 —— 同一页上会有很多份，id 会重复
 */
const Decos = (() => {
    /* ================================================================== 小工具 */

    const svg = (vb, body, cls = '', extra = '') => `<svg class="stk-in deco ${cls}" viewBox="0 0 ${vb[0]} ${vb[1]}" style="aspect-ratio:${vb[0]}/${vb[1]}"${extra}>${body}</svg>`;

    /** 像素图：rows 每一行是一串字符，pal 把字符映射成颜色，'.' 是透明 */
    function px(rows, pal) {
        const { w, h, body } = pxBody(rows, pal);
        return svg([w, h], body, 'px', ' shape-rendering="crispEdges"');
    }

    function pxBody(rows, pal) {
        const h = rows.length;
        const w = Math.max(...rows.map((r) => r.length));
        const paths = {};
        rows.forEach((row, y) => {
            let x = 0;
            while (x < row.length) {
                const c = row[x];
                let n = 1;
                while (row[x + n] === c) n++;
                if (pal[c]) (paths[c] = paths[c] || []).push(`M${x} ${y}h${n}v1h-${n}z`);
                x += n;
            }
        });
        const body = Object.entries(paths).map(([c, d]) => `<path fill="${pal[c]}" d="${d.join('')}"/>`).join('');
        return { w, h, body };
    }

    /** 把一张小像素图嵌进别的 SVG 里（x、y、每格大小都是外面那张图的单位） */
    function pxAt(rows, pal, x, y, cell) {
        const { w, h, body } = pxBody(rows, pal);
        return `<svg x="${x}" y="${y}" width="${w * cell}" height="${h * cell}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
    }

    /** 用函数画像素图（圆形的光盘、彩虹这类用字符画不方便的） */
    function pxFn(w, h, fn) {
        const rows = [];
        for (let y = 0; y < h; y++) {
            let r = '';
            for (let x = 0; x < w; x++) r += fn(x + 0.5, y + 0.5) || '.';
            rows.push(r);
        }
        return rows;
    }

    /** 固定种子的随机数：每次打开页面，火漆印的边、藤蔓的走向都一样 */
    function rng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    const f = (n) => +n.toFixed(1);

    /* ================================================================== 像素 Y2K */

    const K = '#3b1f4a'; // 像素描边：深紫
    const P = { K, W: '#ffffff', '.': null };

    const cursor = px([
        'K...........',
        'KK..........',
        'KWK.........',
        'KWWK........',
        'KWWWK.......',
        'KWWWWK......',
        'KWWWWWK.....',
        'KWWWWWWK....',
        'KWWWWWWWK...',
        'KWWWWWWWWK..',
        'KWWWWWWWWWK.',
        'KWWWWWWKKKKK',
        'KWWWKWWK....',
        'KWWK.KWWK...',
        'KWK..KWWK...',
        'KK....KWWK..',
        'K.....KWWK..',
        '.......KWWK.',
        '.......KKK..',
    ], P);

    const hand = px([
        '.....KK.........',
        '....KWWK........',
        '....KWWK........',
        '....KWWK........',
        '....KWWK........',
        '....KWWKKK......',
        '....KWWKWWKKK...',
        '....KWWKWWKWWKK.',
        '.KK.KWWKWWKWWKWK',
        'KWWKKWWWWWWWWKWK',
        'KWWWKWWWWWWWWWWK',
        '.KWWKWWWWWWWWWWK',
        '..KWWWWWWWWWWWWK',
        '..KWWWWWWWWWWWWK',
        '...KWWWWWWWWWWWK',
        '...KWWWWWWWWWWK.',
        '....KWWWWWWWWWK.',
        '....KWWWWWWWWWK.',
        '.....KWWWWWWWK..',
        '.....KWWWWWWWK..',
        '.....KKKKKKKKK..',
    ], P);

    const heart = px([
        '..KKK...KKK..',
        '.KRRRK.KRRRK.',
        'KRWWRRKRRRRRK',
        'KRWRRRRRRRRRK',
        'KRRRRRRRRRRDK',
        'KRRRRRRRRRRDK',
        '.KRRRRRRRRDK.',
        '..KRRRRRRDK..',
        '...KRRRRDK...',
        '....KRRDK....',
        '.....KDK.....',
        '......K......',
    ], { ...P, R: '#ff6fb1', D: '#d9368a' });

    const sparkle = px([
        '......K......',
        '......K......',
        '.....KYK.....',
        '.....KYK.....',
        '....KYYYK....',
        '..KKYYWYYKK..',
        'KKYYYWWWYYYKK',
        '..KKYYWYYKK..',
        '....KYYYK....',
        '.....KYK.....',
        '.....KYK.....',
        '......K......',
        '......K......',
    ], { ...P, Y: '#ffe45c' });

    const star = px([
        '.......K.......',
        '......KYK......',
        '......KYK......',
        '.....KYWYK.....',
        'KKKKKKYWYKKKKKK',
        'KYYYYYYYYYYYYYK',
        '.KYYYYYYYYYYYK.',
        '..KYYYYYYYYYK..',
        '...KYYYYYYYK...',
        '...KYYYOYYYK...',
        '..KYYYOKOYYYK..',
        '..KYYOK.KOYYK..',
        '.KYOKK...KKOYK.',
        '.KKK.......KKK.',
    ], { ...P, Y: '#ffd84a', O: '#f2a93b' });

    const butterfly = px([
        '.KKK..K...K..KKK.',
        'KBBBK..K.K..KBBBK',
        'KBWBBK..K..KBBWBK',
        'KBBBBBKKKKKBBBBBK',
        '.KBBBBBKKKBBBBBK.',
        '..KBBBBKKKBBBBK..',
        '...KKKKKKKKKKK...',
        '..KPPPPKKKPPPPK..',
        '.KPPWPPKKKPPWPPK.',
        '.KPPPPK.K.KPPPPK.',
        '..KKKK.....KKKK..',
    ], { ...P, B: '#8fd3ff', P: '#ffa6d6' });

    const phone = px([
        '..K........',
        '..K........',
        '.KKKKKKKKK.',
        'KPPPPPPPPPK',
        'KPKKKKKKKPK',
        'KPKSSSSSKPK',
        'KPKSRSRSKPK',
        'KPKSRRRSKPK',
        'KPKSSRSSKPK',
        'KPKSSSSSKPK',
        'KPKKKKKKKPK',
        'KPPPPPPPPPK',
        '.KKKKKKKKK.',
        '.KDDDDDDDK.',
        'KPPPPPPPPPK',
        'KPPWPWPWPPK',
        'KPPPPPPPPPK',
        'KPPWPWPWPPK',
        'KPPPPPPPPPK',
        'KPPWPWPWPPK',
        'KPPPPPPPPPK',
        '.KKKKKKKKK.',
    ], { ...P, P: '#ff9ccf', D: '#d06aa3', S: '#c8f4ff', R: '#ff4f9a' });

    // 光盘：按角度换颜色，像 CD 背面的彩虹反光
    const CD_COLORS = { a: '#e8e4ff', b: '#c9f0ff', c: '#ffe0f4', d: '#fff6c9', e: '#d7ffe9' };
    const cd = px(pxFn(17, 17, (x, y) => {
        const dx = x - 8.5;
        const dy = y - 8.5;
        const r = Math.hypot(dx, dy);
        if (r > 8.5) return null;
        if (r > 7.6) return 'K';
        if (r < 1.6) return null;
        if (r < 2.6) return 'K';
        if (r < 3.6) return 'W';
        const a = (Math.atan2(dy, dx) / Math.PI + 1) * 2.5; // 0~5
        return 'abcde'[Math.floor(a) % 5];
    }), { ...P, ...CD_COLORS });

    const floppy = px([
        'KKKKKKKKKKKKK.',
        'KBBKGGGGGGKBBK',
        'KBBKGGGKKGKBBK',
        'KBBKGGGKKGKBBK',
        'KBBKGGGGGGKBBK',
        'KBBBKKKKKKBBBK',
        'KBBBBBBBBBBBBK',
        'KBWWWWWWWWWWBK',
        'KBWLLLLLLLLWBK',
        'KBWWWWWWWWWWBK',
        'KBWLLLLLLWWWBK',
        'KBWWWWWWWWWWBK',
        'KBWWWWWWWWWWBK',
        'KKKKKKKKKKKKKK',
    ], { ...P, B: '#b69cff', G: '#e4e4f0', L: '#ff8cc6' });

    const smiley = px([
        '....KKKKKK....',
        '..KKYYYYYYKK..',
        '.KYYYYYYYYYYK.',
        '.KYYYYYYYYYYK.',
        'KYYYKYYYYKYYYK',
        'KYYYKYYYYKYYYK',
        'KYYYYYYYYYYYYK',
        'KYYYYYYYYYYYYK',
        'KYYKYYYYYYKYYK',
        'KYYYKYYYYKYYYK',
        '.KYYYKKKKYYYK.',
        '.KYYYYYYYYYYK.',
        '..KKYYYYYYKK..',
        '....KKKKKK....',
    ], { ...P, Y: '#fff15c' });

    const RB = ['#ff6fb1', '#ffa35c', '#ffe45c', '#7ee08a', '#6fc8ff', '#a98bff'];
    const rainbow = px(pxFn(26, 14, (x, y) => {
        const r = Math.hypot(x - 13, y - 14);
        if (r > 13 || r < 5) return null;
        if (r > 12 || r < 6) return 'K';
        return 'abcdef'[Math.min(5, Math.floor(12 - r))];
    }), { ...P, a: RB[0], b: RB[1], c: RB[2], d: RB[3], e: RB[4], f: RB[5] });

    const strawberry = px([
        '.....KKK.....',
        '...KKGGGKK...',
        '..KGGKGKGGK..',
        '.KKRRKKKRRKK.',
        'KRRRWRRRRRRRK',
        'KRWRRRRYRRRRK',
        'KRRRRYRRRRYRK',
        'KRYRRRRRYRRRK',
        '.KRRRYRRRRRK.',
        '.KRRRRRRYRRK.',
        '..KRYRRRRRK..',
        '...KRRRYRK...',
        '....KRRRK....',
        '.....KKK.....',
    ], { ...P, R: '#ff5c8a', G: '#6ad17c', Y: '#fff1a8' });

    // 系统弹窗：Y2K 电脑桌面最有记忆点的东西
    const PIXEL_FONT = "'Pixelify Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    const bevel = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${K}" stroke-width="3"/>`
        + `<path d="M${x + 3} ${y + h - 3}V${y + 3}H${x + w - 3}" stroke="#fff" stroke-width="3" fill="none"/>`
        + `<path d="M${x + 4} ${y + h - 4}H${x + w - 4}V${y + 4}" stroke="#b9a3dc" stroke-width="3" fill="none"/>`;
    const WARN = [
        '.......K.......',
        '......KYK......',
        '......KYK......',
        '.....KYYYK.....',
        '.....KYKYK.....',
        '....KYYKYYK....',
        '....KYYKYYK....',
        '...KYYYKYYYK...',
        '...KYYYKYYYK...',
        '..KYYYYYYYYYK..',
        '..KYYYYKYYYYK..',
        '.KYYYYYYYYYYYK.',
        'KKKKKKKKKKKKKKK',
    ];
    const dialog = svg([320, 180], `
        <rect x="10" y="10" width="306" height="166" fill="${K}" opacity="0.25"/>
        ${bevel(3, 3, 306, 166, '#f1e9ff')}
        <rect x="9" y="9" width="294" height="30" fill="#ff78c4"/>
        <rect x="160" y="9" width="143" height="30" fill="#b08cff"/>
        <rect x="120" y="9" width="40" height="30" fill="#d982e2"/>
        <text x="20" y="31" font-family="${PIXEL_FONT}" font-size="19" fill="#fff" font-weight="700">♥ 提示.exe</text>
        ${bevel(275, 13, 22, 22, '#f1e9ff')}<path d="M281 19l10 10M291 19l-10 10" stroke="${K}" stroke-width="3"/>
        ${pxAt(WARN, { K, Y: '#ffd84a' }, 20, 60, 3.2)}
        <text x="74" y="86" font-family="${PIXEL_FONT}" font-size="22" fill="${K}" font-weight="700">今天也要开心哦！</text>
        ${bevel(66, 122, 88, 36, '#f1e9ff')}<text x="110" y="147" text-anchor="middle" font-family="${PIXEL_FONT}" font-size="18" fill="${K}">好的</text>
        ${bevel(166, 122, 108, 36, '#f1e9ff')}<text x="220" y="147" text-anchor="middle" font-family="${PIXEL_FONT}" font-size="18" fill="${K}">当然好的</text>`);

    const loading = svg([300, 92], `
        <text x="4" y="26" font-family="${PIXEL_FONT}" font-size="22" fill="${K}" font-weight="700" letter-spacing="2">LOADING...</text>
        <text x="296" y="26" text-anchor="end" font-family="${PIXEL_FONT}" font-size="22" fill="#ff4f9a" font-weight="700">75%</text>
        ${bevel(3, 40, 294, 46, '#fff')}
        <g shape-rendering="crispEdges">${Array.from({ length: 9 }, (_, i) => `<rect x="${14 + i * 30}" y="50" width="24" height="26" fill="${['#ff8cc6', '#ffb07a', '#ffe45c', '#8fe3a0', '#8fd3ff', '#b69cff'][i % 6]}"/>`).join('')}</g>`);

    // 爆炸贴 NEW!
    const burst = (() => {
        const pts = [];
        for (let i = 0; i < 28; i++) {
            const r = i % 2 ? 58 : 80;
            const a = (i / 28) * Math.PI * 2 - Math.PI / 2;
            pts.push(`${f(90 + Math.cos(a) * r)},${f(90 + Math.sin(a) * r * 0.82)}`);
        }
        return svg([180, 150], `
            <polygon points="${pts.join(' ')}" transform="translate(6 6)" fill="${K}"/>
            <polygon points="${pts.join(' ')}" fill="#ffe45c" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>
            <text x="90" y="92" text-anchor="middle" font-family="${PIXEL_FONT}" font-size="34" font-weight="700" fill="#ff3d8b" stroke="${K}" stroke-width="2" paint-order="stroke" transform="rotate(-8 90 80)">NEW!</text>`);
    })();

    // 像素对话框 OMG
    const bubble = svg([220, 140], `
        <g shape-rendering="crispEdges">
            <path d="M20 8h180v8h8v8h8v72h-8v8h-8v8H90l-24 20v-8h-8v8h-8v-20H20v-8h-8v-8H4V24h8v-8h8z" fill="${K}"/>
            <path d="M24 16h172v8h8v8h4v56h-4v8h-8v8H86l-16 12v-12H24v-8h-8v-8h-4V32h4v-8h8z" fill="#fff"/>
            <path d="M24 24h20v8H24zM16 32h8v12h-8z" fill="#ffd1ea"/>
        </g>
        <text x="110" y="76" text-anchor="middle" font-family="${PIXEL_FONT}" font-size="44" font-weight="700" fill="#ff4f9a" letter-spacing="2">OMG</text>`);

    // 液态金属星星（Y2K 的另一个标志：铬银质感）
    const chrome = svg([160, 160], `
        <path d="M80 4C86 50 110 74 156 80 110 86 86 110 80 156 74 110 50 86 4 80 50 74 74 50 80 4Z" fill="#8e97b8" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M80 18C84 54 104 72 138 78 104 80 84 90 80 104 76 84 60 80 26 78 58 72 76 54 80 18Z" fill="#dfe6f7"/>
        <path d="M80 26C82 52 94 66 116 74 96 74 84 70 80 60 76 70 64 74 44 74 66 66 78 52 80 26Z" fill="#fff"/>
        <path d="M80 104C82 118 90 130 102 138 90 132 84 128 80 124 76 128 70 132 58 138 70 130 78 118 80 104Z" fill="#c5b3ff"/>
        <path d="M122 32l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#fff" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>`);

    /* ================================================================== 中世纪手抄本 */

    const INK = '#2b1d14';
    const C = {
        red: '#b8432f', // 朱红
        blue: '#2f5597', // 青金石蓝
        gold: '#d6a53a',
        goldD: '#a57a22',
        green: '#557f4e', // 铜绿
        skin: '#f2dcc0',
        vellum: '#f6ecd4',
        white: '#fbf7ec',
        pink: '#e3a39a',
    };
    const ms = (vb, body) => svg(vb, `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none">${body}</g>`, 'ms');

    /** 常春藤叶子：手抄本边框上最常见的小金叶，尖朝 +x */
    const leaf = (x, y, deg, s, fill) => `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(${s})" d="M0 0C3-5 8-7 10-4 13-8 19-5 16 0 19 5 13 8 10 4 8 7 3 5 0 0Z" fill="${fill}" stroke-width="${f(1.6 / s)}"/>`;

    /** 法国百合（鸢尾花纹） */
    const fleur = (fill, extra = '') => `<g ${extra}><path d="M0-30C9-18 10-6 4 6H-4C-10-6-9-18 0-30Z" fill="${fill}"/><path d="M-4 4C-8-10-26-16-29-3-31 8-18 11-14 4M4 4C8-10 26-16 29-3 31 8 18 11 14 4" fill="${fill}"/><path d="M-15 4H15V11H-15Z" fill="${fill}"/><path d="M-4 11-10 25 0 19 10 25 4 11" fill="${fill}"/></g>`;

    // 指示手（manicule）：中世纪读者在书页边上画一只手，指着重要的句子
    const manicule = ms([260, 120], `
        <path d="M8 28Q40 16 70 28L74 90Q42 102 10 96Q22 62 8 28Z" fill="${C.red}"/>
        <path d="M26 26Q32 60 26 97M46 22Q52 60 46 99" stroke-width="2" opacity=".6"/>
        <path d="M63 27 77 31 80 89 67 91Z" fill="${C.gold}"/>
        <circle cx="71" cy="44" r="2.2" fill="${INK}" stroke="none"/><circle cx="72" cy="60" r="2.2" fill="${INK}" stroke="none"/><circle cx="73" cy="76" r="2.2" fill="${INK}" stroke="none"/>
        <path d="M79 30q9 4 1 10q9 4 1 10q9 4 1 10q9 4 1 10q9 4 1 10q9 4 1 10" fill="${C.white}" stroke-width="2.4"/>
        <path d="M86 36C104 28 132 28 152 34L154 60C152 78 140 92 120 94L88 92C92 74 92 54 86 36Z" fill="${C.skin}"/>
        <path d="M128 86 154 86C163 87 163 97 154 97L126 96Z" fill="${C.skin}"/>
        <path d="M134 72 164 72C175 73 176 85 165 86L132 86Z" fill="${C.skin}"/>
        <path d="M140 57 170 58C181 59 183 71 172 72L138 72Z" fill="${C.skin}"/>
        <path d="M140 36 232 38C245 38 250 42 250 46 250 51 244 55 232 55L140 57Z" fill="${C.skin}"/>
        <ellipse cx="237" cy="42.5" rx="7" ry="3.2" fill="${C.white}" stroke-width="1.8"/>
        <path d="M192 39Q196 46 192 55M168 60Q171 65 168 71" stroke-width="1.8"/>
        <path d="M108 62C128 58 160 58 180 63 189 65 188 74 178 74 160 74 130 74 110 76" fill="${C.skin}"/>
        <path d="M100 50Q112 46 124 48M98 72Q104 80 112 84" stroke-width="1.8" opacity=".7"/>`);

    const candle = ms([120, 232], `
        <circle cx="60" cy="38" r="34" fill="#f7d774" stroke="none" opacity=".16"/>
        <circle cx="60" cy="40" r="22" fill="#f7d774" stroke="none" opacity=".28"/>
        <path d="M60 12C69 27 73 38 69 48 66 55 54 55 51 48 47 38 51 27 60 12Z" fill="#f0a23a"/>
        <path d="M60 29C64 37 65 44 62 48 60 51 57 50 56 47 55 42 56 37 60 29Z" fill="#fff1b0" stroke="none"/>
        <path d="M60 50V59" stroke-width="2.6"/>
        <path d="M43 60Q60 55 77 60V132H43Z" fill="${C.white}"/>
        <path d="M49 60V76Q52 82 55 76V61M66 59V86Q69 92 72 86V60" fill="${C.white}" stroke-width="2.2"/>
        <path d="M71 94V128" stroke-width="1.6" opacity=".45"/>
        <path d="M22 134Q60 160 98 134Z" fill="${C.goldD}"/>
        <ellipse cx="60" cy="134" rx="38" ry="8" fill="${C.gold}"/>
        <path d="M28 214Q60 178 92 214Z" fill="${C.gold}"/>
        <ellipse cx="60" cy="215" rx="34" ry="7" fill="${C.goldD}"/>
        <path d="M44 204Q52 196 58 194" stroke="#fff" stroke-width="2.4" opacity=".7"/>
        <path d="M52 148H68L66 160Q78 166 66 172L65 200H55L54 172Q42 166 54 160Z" fill="${C.gold}"/>
        <path d="M57 160Q55 166 57 171" stroke="#fff" stroke-width="2" opacity=".7"/>
`);

    const snail = ms([236, 150], `
        <path d="M12 128C28 106 40 76 34 54 32 42 46 38 52 48 60 64 60 100 78 116L204 118C218 118 226 128 216 134L24 136C12 136 8 132 12 128Z" fill="#dcc9a0"/>
        <path d="M40 44 26 12M48 44 56 10" stroke-width="2.6"/>
        <circle cx="25" cy="10" r="5" fill="${INK}" stroke="none"/><circle cx="57" cy="8" r="5" fill="${INK}" stroke="none"/>
        <circle cx="42" cy="58" r="2.6" fill="${INK}" stroke="none"/>
        <path d="M36 70Q42 76 48 70" stroke-width="2.2"/>
        <circle cx="140" cy="74" r="50" fill="${C.green}"/>
        <circle cx="136" cy="77" r="38" fill="${C.gold}"/>
        <circle cx="140" cy="74" r="27" fill="${C.green}"/>
        <circle cx="137" cy="77" r="16" fill="${C.gold}"/>
        <circle cx="140" cy="75" r="6" fill="${INK}" stroke="none"/>
        <path d="M140 75C150 75 152 88 140 92 124 96 118 76 128 64 142 48 166 58 168 78 170 102 146 118 124 112 96 104 94 64 114 44 136 22 180 30 188 66" stroke-width="2.4"/>
        <path d="M104 50Q112 40 122 36" stroke="#fff" stroke-width="3" opacity=".55"/>
        <path d="M70 128H200" stroke-width="1.6" opacity=".4"/>`);

    // 拿剑的兔子：手抄本页边最出名的「凶兔」
    const rabbit = ms([180, 232], `
        <ellipse cx="68" cy="34" rx="9" ry="32" transform="rotate(-14 68 34)" fill="#eee4d0"/>
        <ellipse cx="68" cy="36" rx="4" ry="22" transform="rotate(-14 68 36)" fill="${C.pink}" stroke="none"/>
        <ellipse cx="90" cy="30" rx="9" ry="31" transform="rotate(12 90 30)" fill="#eee4d0"/>
        <ellipse cx="90" cy="32" rx="4" ry="21" transform="rotate(12 90 32)" fill="${C.pink}" stroke="none"/>
        <path d="M58 98C36 124 36 184 58 200H106C124 184 122 124 100 98Z" fill="#eee4d0"/>
        <path d="M66 130C60 150 62 176 74 190" stroke-width="1.8" opacity=".5"/>
        <ellipse cx="82" cy="78" rx="28" ry="23" fill="#eee4d0"/>
        <path d="M84 66 102 72" stroke-width="3.4"/>
        <circle cx="96" cy="76" r="3.8" fill="${INK}" stroke="none"/>
        <path d="M108 82Q112 84 109 88" fill="${C.pink}" stroke-width="2"/>
        <path d="M98 94Q103 91 108 94M110 86 128 82M110 89 128 92" stroke-width="1.6"/>
        <ellipse cx="60" cy="204" rx="17" ry="7" fill="#eee4d0"/>
        <ellipse cx="104" cy="204" rx="17" ry="7" fill="#eee4d0"/>
        <path d="M130 106 164 12 172 16 140 110Z" fill="#e3e7ee"/>
        <path d="M150 64 166 20" stroke="#fff" stroke-width="2"/>
        <path d="M120 98 152 114" stroke-width="7"/><path d="M121 98 151 113" stroke="${C.gold}" stroke-width="3"/>
        <path d="M134 112 126 134" stroke-width="7"/><path d="M134 112 126 133" stroke="${C.red}" stroke-width="3"/>
        <circle cx="124" cy="138" r="5" fill="${C.gold}"/>
        <path d="M100 124C112 120 122 112 130 106" stroke-width="10"/><path d="M100 124C112 120 122 112 130 106" stroke="#eee4d0" stroke-width="4.5"/>
        <circle cx="132" cy="106" r="8" fill="#eee4d0"/>
        <circle cx="48" cy="146" r="22" fill="${C.red}"/>
        <path d="M48 128V164M31 146H65" stroke="${C.gold}" stroke-width="5"/>
        <circle cx="48" cy="146" r="22"/>`);

    // 怪猫：中世纪画家大多没认真看过猫，画出来的猫都长着一张人脸
    const cat = ms([180, 214], `
        <path d="M136 186C170 180 172 130 150 118" stroke-width="15"/>
        <path d="M136 186C170 180 172 130 150 118" stroke="#c9a46a" stroke-width="9"/>
        <path d="M156 150 166 146M158 166 168 166" stroke-width="2"/>
        <path d="M46 204C28 180 34 122 70 106 104 94 130 114 134 152 138 184 128 204 112 206Z" fill="#c9a46a"/>
        <path d="M100 118 112 124M110 138 126 140M112 158 130 158M104 178 124 182" stroke-width="2.4"/>
        <path d="M60 206V160M84 206V162" stroke-width="2.4"/>
        <path d="M52 206H66M76 206H90" stroke-width="3"/>
        <path d="M40 60 36 22 64 44Z" fill="#c9a46a"/><path d="M44 52 42 32 56 44Z" fill="${C.pink}" stroke="none"/>
        <path d="M104 44 128 20 126 58Z" fill="#c9a46a"/><path d="M110 46 122 32 122 52Z" fill="${C.pink}" stroke="none"/>
        <ellipse cx="82" cy="76" rx="42" ry="36" fill="#c9a46a"/>
        <path d="M70 44 74 54M84 42V52M96 44 92 54" stroke-width="2.2"/>
        <path d="M56 76Q66 67 76 76Q66 83 56 76Z" fill="${C.white}" stroke-width="2.2"/>
        <path d="M88 76Q98 67 108 76Q98 83 88 76Z" fill="${C.white}" stroke-width="2.2"/>
        <circle cx="72" cy="75.5" r="3.4" fill="${INK}" stroke="none"/><circle cx="104" cy="75.5" r="3.4" fill="${INK}" stroke="none"/>
        <path d="M54 64Q64 58 76 64M88 64Q100 58 110 64" stroke-width="2.4"/>
        <path d="M79 86H87L83 92Z" fill="${C.pink}" stroke-width="2"/>
        <path d="M70 102Q83 96 96 102" stroke-width="2.4"/>
        <path d="M60 92 36 88M60 96 38 100M106 92 130 88M106 96 128 100" stroke-width="1.6"/>`);

    const owl = ms([150, 196], `
        <path d="M38 36 28 8 58 26Z" fill="#a8794a"/><path d="M112 36 122 8 92 26Z" fill="#a8794a"/>
        <path d="M75 20C122 20 132 70 128 110 124 150 102 172 75 172 48 172 26 150 22 110 18 70 28 20 75 20Z" fill="#a8794a"/>
        <path d="M30 96C22 130 34 156 52 166M120 96C128 130 116 156 98 166" stroke-width="2.4"/>
        <ellipse cx="75" cy="128" rx="32" ry="34" fill="#eadcbf"/>
        <path d="M58 110l4 4 4-4M78 108l4 4 4-4M66 124l4 4 4-4M86 124l4 4 4-4M58 138l4 4 4-4M76 140l4 4 4-4M92 138l4 4 4-4M68 154l4 4 4-4M84 154l4 4 4-4" stroke-width="2"/>
        <circle cx="54" cy="70" r="23" fill="${C.vellum}"/><circle cx="96" cy="70" r="23" fill="${C.vellum}"/>
        <circle cx="54" cy="70" r="14" fill="${C.gold}"/><circle cx="96" cy="70" r="14" fill="${C.gold}"/>
        <circle cx="56" cy="71" r="7.5" fill="${INK}" stroke="none"/><circle cx="98" cy="71" r="7.5" fill="${INK}" stroke="none"/>
        <circle cx="53" cy="67" r="2.4" fill="#fff" stroke="none"/><circle cx="95" cy="67" r="2.4" fill="#fff" stroke="none"/>
        <path d="M75 80 68 94 75 104 82 94Z" fill="#e0a04a"/>
        <path d="M4 180C50 172 100 174 146 178" stroke="#6b4a2c" stroke-width="10"/>
        <path d="M4 180C50 172 100 174 146 178" stroke="${INK}" stroke-width="2" opacity=".5"/>
        <path d="M60 172V182M66 172 68 182M84 172 82 182M90 172V182" stroke-width="3"/>
        ${leaf(120, 176, -40, 1.5, C.green)}${leaf(20, 178, 200, 1.4, C.green)}`);

    // 小龙：页边上经常有的「怪物」，喷着一口小火
    const dragon = ms([260, 176], `
        <path d="M168 122C200 128 232 112 228 88 224 72 204 76 208 90" stroke-width="16"/>
        <path d="M168 122C200 128 232 112 228 88 224 72 204 76 208 90" stroke="${C.green}" stroke-width="10"/>
        <path d="M206 92 196 84 212 80Z" fill="${C.red}"/>
        <path d="M112 92C110 50 140 28 176 20 166 38 174 50 156 58 164 68 150 80 134 84Z" fill="${C.red}"/>
        <path d="M122 84C130 64 146 44 170 26M134 84C142 70 150 62 160 56" stroke-width="2"/>
        <path d="M102 134 96 158H86M146 134 150 158H162M114 136 112 158H102" stroke-width="8"/>
        <path d="M102 134 96 158M146 134 150 158M114 136 112 158" stroke="${C.green}" stroke-width="3"/>
        <ellipse cx="128" cy="116" rx="52" ry="26" fill="${C.green}" transform="rotate(-8 128 116)"/>
        <path d="M90 126C104 138 146 138 170 124" stroke="${C.gold}" stroke-width="5"/>
        <path d="M104 132V124M118 136V126M132 136V126M146 134V124M160 128V120" stroke-width="1.8"/>
        <path d="M92 110C76 88 70 66 78 48" stroke-width="22"/>
        <path d="M92 110C76 88 70 66 78 48" stroke="${C.green}" stroke-width="16"/>
        <path d="M66 40C66 28 84 24 96 32 104 38 100 52 88 54L66 56 50 52 52 44Z" fill="${C.green}"/>
        <path d="M52 48 66 50" stroke-width="2"/>
        <circle cx="80" cy="38" r="4" fill="${C.white}" stroke-width="1.8"/><circle cx="81" cy="38" r="1.8" fill="${INK}" stroke="none"/>
        <path d="M86 30 98 16 94 32" fill="${C.gold}" stroke-width="2"/>
        <path d="M48 50C36 44 24 52 10 46 20 54 12 62 2 62 16 66 30 62 38 58 34 66 40 70 50 60Z" fill="#f0a23a" stroke-width="2.2"/>
        <path d="M44 54C36 54 30 58 22 58" stroke="#fff1b0" stroke-width="3"/>`);

    const sun = ms([200, 200], (() => {
        let rays = '';
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * 360;
            rays += i % 2
                ? `<path transform="rotate(${a} 100 100)" d="M94 42C88 30 104 24 98 12 110 22 104 32 108 42Z" fill="${C.gold}" stroke-width="2.2"/>`
                : `<path transform="rotate(${a} 100 100)" d="M90 44 100 4 110 44Z" fill="${C.gold}" stroke-width="2.2"/>`;
        }
        return rays + `
            <circle cx="100" cy="100" r="58" fill="#f2c24a"/>
            <circle cx="100" cy="100" r="50" stroke="${C.goldD}" stroke-width="1.6" opacity=".6"/>
            <path d="M68 90Q78 84 88 90M112 90Q122 84 132 90" stroke-width="2.6"/>
            <path d="M70 96Q78 100 86 96M114 96Q122 100 130 96" stroke-width="2.4"/>
            <path d="M72 98 70 102M78 99V103M84 98 86 102M116 98 114 102M122 99V103M128 98 130 102" stroke-width="1.4"/>
            <path d="M68 78Q78 70 90 76M110 76Q122 70 132 78" stroke-width="2.2"/>
            <path d="M100 96C96 108 94 114 102 116" stroke-width="2.2"/>
            <circle cx="72" cy="116" r="9" fill="${C.pink}" stroke="none" opacity=".75"/>
            <circle cx="128" cy="116" r="9" fill="${C.pink}" stroke="none" opacity=".75"/>
            <path d="M88 130Q100 138 112 128" fill="${C.red}" stroke-width="2.4"/>`;
    })());

    const banner = ms([340, 110], `
        <path d="M58 34 14 38 30 58 10 80 60 78Z" fill="#e2d1a8"/>
        <path d="M282 34 326 38 310 58 330 80 280 78Z" fill="#e2d1a8"/>
        <path d="M60 78 46 66 58 62ZM280 78 294 66 282 62Z" fill="#bca77a" stroke-width="2"/>
        <path d="M46 22Q170 6 294 22 288 44 294 66 170 50 46 66 52 44 46 22Z" fill="${C.vellum}"/>
        <path d="M60 26Q170 12 280 26" stroke="${C.red}" stroke-width="1.6" opacity=".6"/>`);

    const seal = ms([150, 186], (() => {
        const r = rng(7);
        let d = '';
        for (let i = 0; i <= 36; i++) {
            const a = (i / 36) * Math.PI * 2;
            const rad = 54 + (r() - 0.5) * 7 + (i % 5 === 0 ? 4 : 0);
            d += `${i ? 'L' : 'M'}${f(75 + Math.cos(a) * rad)} ${f(72 + Math.sin(a) * rad)}`;
        }
        return `
            <path d="M58 100 40 180 56 170 64 182 76 104Z" fill="${C.blue}"/>
            <path d="M80 104 92 182 102 170 116 178 96 98Z" fill="${C.blue}"/>
            <path d="${d}Z" fill="#a8322d"/>
            <circle cx="75" cy="72" r="38" stroke="#7a221e" stroke-width="3.5"/>
            <circle cx="75" cy="72" r="32" stroke="#7a221e" stroke-width="1.6" stroke-dasharray="2 5"/>
            ${fleur('#7a221e', 'transform="translate(75 72) scale(.82)" stroke="#5c1714" stroke-width="2"')}
            <path d="M38 50Q50 30 72 26" stroke="#fff" stroke-width="4" opacity=".35"/>`;
    })());

    const quill = ms([170, 214], `
        <path d="M84 166 156 10" stroke-width="3"/>
        <path d="M150 20C170 14 164 60 130 96 116 112 102 128 92 150 96 118 104 90 118 66 128 48 138 30 150 20Z" fill="${C.white}"/>
        <path d="M150 20C120 30 100 70 96 110 94 126 92 140 92 150" fill="${C.white}"/>
        <path d="M140 38 128 34M134 52 116 50M126 68 108 68M118 84 102 86M110 100 98 104M146 46 156 42M138 64 150 64M130 82 142 84M120 100 132 104" stroke-width="1.6"/>
        <path d="M84 166 80 180" stroke-width="3.4"/>
        <path d="M46 150H122L130 204H38Z" fill="#3a3550"/>
        <path d="M40 204H128" stroke-width="4"/>
        <ellipse cx="84" cy="150" rx="38" ry="8" fill="#56507a"/>
        <ellipse cx="84" cy="150" rx="24" ry="4.5" fill="${INK}"/>
        <path d="M54 162 50 196" stroke="#fff" stroke-width="3" opacity=".35"/>`);

    const crown = ms([190, 130], `
        <path d="M22 104 14 34 54 68 95 14 136 68 176 34 168 104Z" fill="${C.gold}"/>
        <path d="M30 96 26 58M95 30V80M160 96 164 58" stroke="#fff" stroke-width="2.4" opacity=".6"/>
        <circle cx="14" cy="30" r="8" fill="${C.gold}"/><circle cx="95" cy="12" r="9" fill="${C.gold}"/><circle cx="176" cy="30" r="8" fill="${C.gold}"/>
        <path d="M18 98H172V122H18Z" fill="${C.goldD}"/>
        <ellipse cx="50" cy="110" rx="9" ry="7" fill="${C.red}"/><ellipse cx="95" cy="110" rx="10" ry="8" fill="${C.blue}"/><ellipse cx="140" cy="110" rx="9" ry="7" fill="${C.red}"/>
        <circle cx="72" cy="110" r="3" fill="${C.white}" stroke-width="1.6"/><circle cx="118" cy="110" r="3" fill="${C.white}" stroke-width="1.6"/>
        <path d="M95 66 88 78 95 90 102 78Z" fill="${C.green}"/>`);

    // 装饰首字母的方框：上面放一个大字，就是手抄本开头的「花体首字母」
    const initial = ms([170, 170], (() => {
        let dots = '';
        for (let y = 36; y <= 134; y += 14) for (let x = 36; x <= 134; x += 14) if ((x + y) % 28 === 16) dots += `<circle cx="${x}" cy="${y}" r="1.8"/>`;
        return `
            ${leaf(14, 14, 225, 1.6, C.gold)}${leaf(156, 14, 315, 1.6, C.gold)}${leaf(14, 156, 135, 1.6, C.gold)}${leaf(156, 156, 45, 1.6, C.gold)}
            <rect x="12" y="12" width="146" height="146" fill="${C.gold}"/>
            <rect x="24" y="24" width="122" height="122" fill="${C.blue}"/>
            <g fill="#fff" stroke="none" opacity=".8">${dots}</g>
            <path d="M24 60C44 60 44 40 34 34M146 110C126 110 126 130 136 136M60 146C60 128 40 128 34 136M110 24C110 42 130 42 136 34" stroke="#fff" stroke-width="2" opacity=".75"/>
            <path d="M16 16H154" stroke="#fff" stroke-width="2" opacity=".6"/>`;
    })());

    const hedera = ms([180, 130], `
        <path d="M92 50C88 26 58 12 38 24 20 36 26 62 46 60 60 58 60 42 48 40" stroke="${C.red}" stroke-width="5"/>
        <path d="M92 50C98 72 118 104 150 122 156 90 150 56 128 44 112 36 100 44 98 54 90 46 76 50 78 62 82 80 112 104 150 122Z" fill="${C.red}"/>
        <path d="M96 58C112 80 130 102 148 120" stroke="#7a221e" stroke-width="2"/>
        <path d="M112 62 122 60M118 76 132 76M126 92 140 94" stroke="#7a221e" stroke-width="1.6"/>`);

    /** 藤蔓花边：一根弯弯的细茎，两边长出小金叶和小圆点（画布边框也用它） */
    function ivyBody(len, seed, scale = 1) {
        const r = rng(seed);
        const H = 60 * scale;
        let d = `M0 ${H / 2}`;
        const seg = 70 * scale;
        const n = Math.max(1, Math.round(len / seg));
        const step = len / n;
        let parts = '';
        const fills = [C.gold, C.blue, C.gold, C.red, C.gold, C.green];
        for (let i = 0; i < n; i++) {
            const x0 = i * step;
            const up = i % 2 ? -1 : 1;
            d += `C${f(x0 + step * 0.35)} ${f(H / 2 + up * 10 * scale)} ${f(x0 + step * 0.65)} ${f(H / 2 - up * 10 * scale)} ${f(x0 + step)} ${f(H / 2)}`;
            // 从茎上卷出去的小须，尾巴上一片叶子
            const tx = x0 + step * (0.4 + r() * 0.2);
            const ty = H / 2;
            const ex = tx + (12 + r() * 10) * scale;
            const ey = ty + up * (18 + r() * 6) * scale;
            parts += `<path d="M${f(tx)} ${f(ty)}C${f(tx + 2 * scale)} ${f(ty + up * 12 * scale)} ${f(ex - 10 * scale)} ${f(ey)} ${f(ex)} ${f(ey)}" stroke-width="${f(1.6 * scale)}"/>`;
            parts += leaf(ex, ey, up > 0 ? 20 + r() * 40 : -20 - r() * 40, 1.25 * scale, fills[(i + seed) % fills.length]);
            // 金色小圆点（手抄本里叫「贝占」）
            const bx = x0 + step * 0.9;
            const by = H / 2 - up * 14 * scale;
            parts += `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(3.4 * scale)}" fill="${C.gold}" stroke-width="${f(1.4 * scale)}"/>`;
            parts += `<path d="M${f(bx - 4 * scale)} ${f(by + up * 3 * scale)}Q${f(bx - 3 * scale)} ${f(H / 2 - up * 4 * scale)} ${f(bx - 12 * scale)} ${f(H / 2)}" stroke-width="${f(1.2 * scale)}"/>`;
        }
        return { H, body: `<path d="${d}" stroke-width="${f(2.2 * scale)}"/>${parts}` };
    }
    const vine = (() => {
        const { H, body } = ivyBody(300, 3);
        return ms([300, H], body);
    })();

    /* ================================================================== 汇总 */

    const PACKS = [
        {
            id: 'y2k',
            name: '像素 Y2K',
            items: [
                ['px-cursor', '鼠标箭头', cursor, 120],
                ['px-hand', '小手光标', hand, 130],
                ['px-heart', '像素爱心', heart, 150],
                ['px-sparkle', '闪闪', sparkle, 130],
                ['px-star', '像素星星', star, 160],
                ['px-butterfly', '蝴蝶', butterfly, 200],
                ['px-phone', '翻盖手机', phone, 140],
                ['px-cd', '光盘', cd, 190],
                ['px-floppy', '软盘', floppy, 170],
                ['px-smiley', '笑脸', smiley, 160],
                ['px-rainbow', '彩虹', rainbow, 260],
                ['px-strawberry', '草莓', strawberry, 150],
                ['px-dialog', '弹窗', dialog, 520],
                ['px-loading', '加载条', loading, 440],
                ['px-new', 'NEW!', burst, 240],
                ['px-omg', 'OMG 对话框', bubble, 280],
                ['px-chrome', '金属星星', chrome, 180],
            ],
        },
        {
            id: 'medieval',
            name: '中世纪手抄本',
            items: [
                ['ms-manicule', '指示手', manicule, 300],
                ['ms-candle', '烛台', candle, 170],
                ['ms-snail', '蜗牛', snail, 280],
                ['ms-rabbit', '拿剑的兔子', rabbit, 240],
                ['ms-cat', '人脸猫', cat, 230],
                ['ms-owl', '猫头鹰', owl, 200],
                ['ms-dragon', '喷火小龙', dragon, 320],
                ['ms-sun', '太阳脸', sun, 240],
                ['ms-crown', '王冠', crown, 220],
                ['ms-quill', '羽毛笔', quill, 200],
                ['ms-seal', '火漆印', seal, 190],
                ['ms-banner', '飘带', banner, 520],
                ['ms-initial', '首字母框', initial, 220],
                ['ms-hedera', '叶形花饰', hedera, 200],
                ['ms-vine', '藤蔓花边', vine, 520],
            ],
        },
    ];

    const list = PACKS.flatMap((p) => p.items.map(([id, name, html, w]) => ({ id, name, html, w, pack: p.id })));
    const byId = Object.fromEntries(list.map((d) => [d.id, d]));
    const get = (id) => byId[id] || null;

    return { PACKS, list, get, ivyBody, px, pxAt, leaf, fleur, C, INK, K };
})();
