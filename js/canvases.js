/*
 * 画布 —— 「自由排版」模式下每一页的背景
 *
 * 自由排版不写长文：页面上只有你放上去的文字、图片、贴纸和线条，画布只负责背景和氛围。
 * 样式写在 css/pages.css 的「画布」部分（.canvas-xxx），这里放名字、推荐色和画布上固定的装饰。
 * 两张画布各有一套配套贴纸（js/decos.js）。
 */
const Canvases = (() => {
    const { K, C, INK } = Decos;

    /* ---------------- 像素 Y2K：整页是一个老电脑的窗口，底下一条任务栏 ---------------- */

    const tiny = (rows, pal, cls) => Decos.px(rows, pal).replace('class="stk-in deco px"', `class="${cls}"`);
    const SPARK = ['..K..', '..K..', 'KKWKK', '..K..', '..K..'];
    const HEART = ['.KK.KK.', 'KPPKPPK', 'KPPPPPK', '.KPPPK.', '..KPK..', '...K...'];

    const pixelDeco = `
        <div class="px-win">
            <div class="px-bar"><span class="px-title">♥ my_diary.exe</span>
                <span class="px-btns"><i>_</i><i>□</i><i>×</i></span></div>
        </div>
        ${tiny(SPARK, { K: '#fff', W: '#ffe45c' }, 'px-spk s1')}
        ${tiny(SPARK, { K: '#fff', W: '#ff9ccf' }, 'px-spk s2')}
        ${tiny(SPARK, { K: '#fff', W: '#8fd3ff' }, 'px-spk s3')}
        <div class="px-task">
            <span class="px-start">✿ start</span>
            <span class="px-tray">${tiny(HEART, { K, P: '#ff6fb1' }, 'px-heart')}</span>
        </div>`;

    /* ---------------- 中世纪手抄本：羊皮纸 + 朱红界线 + 左边的金色边条和常春藤 ---------------- */

    /** 一段横着的藤蔓；vertical 时转成竖的 */
    function vineSvg(len, seed, vertical) {
        const { H, body } = Decos.ivyBody(len, seed, 1.15);
        const g = `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" fill="none">${body}</g>`;
        return vertical
            ? `<svg width="${H}" height="${len}" viewBox="0 0 ${H} ${len}"><g transform="rotate(90) translate(0 ${-H})">${g}</g></svg>`
            : `<svg width="${len}" height="${H}" viewBox="0 0 ${len} ${H}">${g}</svg>`;
    }

    const boss = `<svg class="ms-boss" viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" fill="${C.gold}" stroke="${INK}" stroke-width="2.5"/><rect x="11" y="11" width="18" height="18" fill="${C.blue}" stroke="${INK}" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="${C.red}"/></svg>`;

    const manuscriptDeco = `
        <i class="ms-rule"></i>
        <i class="ms-bar"></i>
        <span class="ms-vine v-top">${vineSvg(820, 5)}</span>
        <span class="ms-vine v-bottom">${vineSvg(820, 11)}</span>
        <span class="ms-vine v-left">${vineSvg(1900, 2, true)}</span>
        <span class="ms-boss-wrap b-top">${boss}</span>
        <span class="ms-boss-wrap b-bottom">${boss}</span>`;

    const list = [
        {
            id: 'pixel',
            name: '像素 Y2K',
            accents: ['#ff4f9a', '#7a5cff', '#3b1f4a', '#00a6c7', '#ffb800', '#ffffff'],
            swatch: ['#f5d2ff', '#ff78c4'],
            deco: pixelDeco,
        },
        {
            id: 'manuscript',
            name: '中世纪手抄本',
            accents: ['#b8432f', '#2f5597', '#2b1d14', '#a57a22', '#557f4e', '#ffffff'],
            swatch: ['#f3e7cc', '#b8432f'],
            deco: manuscriptDeco,
        },
        // 下面四张都叠了真实的纸 / 金属纹理（js/assets.js）
        {
            id: 'pearl',
            name: '珠光银',
            accents: ['#3a3d4a', '#b0527a', '#4a6fa5', '#7a6aa8', '#ffffff', '#9a7b3c'],
            swatch: ['#dfe1e8', '#c9b8d8'],
            deco: '<i class="tex"></i><i class="sheen"></i>',
        },
        {
            id: 'dotgrid',
            name: '点阵本',
            accents: ['#2e2c29', '#d0503c', '#3f6fb5', '#4c8a5a', '#b07d2b', '#8a5bb0'],
            swatch: ['#faf8f2', '#b9b3a7'],
            deco: '<i class="tex"></i><i class="gutter"></i><span class="dg-head">No. <u></u>Date <u></u></span>',
        },
        {
            id: 'sticky',
            name: '便利贴',
            accents: ['#3b3320', '#d0503c', '#2f5fa8', '#4c7a3a', '#8a4fa8', '#ffffff'],
            swatch: ['#e9e5dd', '#fbe38c'],
            deco: '<i class="tex"></i><i class="lift l"></i><i class="lift r"></i><i class="note"></i>',
        },
        {
            id: 'notes',
            name: '备忘录',
            accents: ['#e3a008', '#ff3b30', '#007aff', '#34c759', '#af52de', '#1c1c1e'],
            swatch: ['#ffffff', '#e3a008'],
            deco: () => '<i class="tex"></i>' + Themes.IOS.status + Themes.IOS.nav + `<div class="ios-date">${Themes.memoDate()}</div>` + Themes.IOS.tool,
        },
    ];

    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    const get = (id) => byId[id] || list[0];

    return { list, get };
})();
