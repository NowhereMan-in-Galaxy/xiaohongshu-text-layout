/*
 * 主题清单 —— 样式写在 css/pages.css，这里只放名字、推荐色和装饰元素
 *
 * 想新增主题？在这里加一项，再到 pages.css 里写一个 .theme-xxx 就好。
 * deco / coverDeco 可以是一段 HTML，也可以是返回 HTML 的函数（比如要显示当天日期）。
 */
const Themes = (() => {
    // 苹果「备忘录」截图的样子：状态栏、黄色的「‹ 备忘录」、日期、底部工具栏
    const SVG = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const IOS = {
        status: '<div class="ios-status"><b>9:41</b><span>'
            + '<svg viewBox="0 0 54 34" width="54" height="34" fill="currentColor"><rect x="0" y="22" width="9" height="12" rx="2.5"/><rect x="15" y="15" width="9" height="19" rx="2.5"/><rect x="30" y="8" width="9" height="26" rx="2.5"/><rect x="45" y="0" width="9" height="34" rx="2.5"/></svg>'
            + '<svg viewBox="0 0 48 34" width="48" height="34" fill="currentColor"><path d="M24 34l-7-8.4a10.5 10.5 0 0 1 14 0z"/><path d="M24 14.5c5.6 0 10.7 2.1 14.5 5.6l-4.3 5.1A15.7 15.7 0 0 0 24 21.3c-3.9 0-7.5 1.4-10.2 3.9l-4.3-5.1c3.8-3.5 8.9-5.6 14.5-5.6z"/><path d="M24 0c9.6 0 18.3 3.7 24 9.6l-4.4 5.2C38.6 9.9 31.7 7 24 7S9.4 9.9 4.4 14.8L0 9.6C5.7 3.7 14.4 0 24 0z"/></svg>'
            + '<svg viewBox="0 0 80 36" width="80" height="36"><rect x="2" y="2" width="68" height="32" rx="10" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="3"/><rect x="7" y="7" width="52" height="22" rx="6" fill="currentColor"/><path d="M74 12v12c3-1 4.5-3 4.5-6s-1.5-5-4.5-6z" fill="currentColor" fill-opacity=".4"/></svg>'
            + '</span></div>',
        nav: '<div class="ios-nav"><span class="back">' + SVG(28, 50, '<path d="M24 4L4 25l20 21" stroke-width="6.5"/>') + '备忘录</span><span class="acts">'
            + SVG(46, 58, '<path d="M23 36V4M11 15L23 3l12 12M14 24H6v31h34V24h-8"/>')
            + SVG(58, 58, '<circle cx="29" cy="29" r="26"/><circle cx="16.5" cy="29" r="1.5" fill="currentColor"/><circle cx="29" cy="29" r="1.5" fill="currentColor"/><circle cx="41.5" cy="29" r="1.5" fill="currentColor"/>')
            + '</span></div>',
        tool: '<div class="ios-tool">'
            + SVG(56, 56, '<circle cx="28" cy="28" r="25"/><path d="M16 29l8 8 16-17"/>')
            + SVG(60, 56, '<path d="M6 18a4 4 0 0 1 4-4h8l4-6h16l4 6h8a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"/><circle cx="30" cy="30" r="9"/>')
            + SVG(56, 56, '<circle cx="28" cy="28" r="25"/><path d="M20 40l3-9 14-14a4 4 0 0 1 6 6L29 37z"/>')
            + SVG(56, 56, '<path d="M26 9H10a4 4 0 0 0-4 4v33a4 4 0 0 0 4 4h33a4 4 0 0 0 4-4V30"/><path d="M22 34l2-9L45 4a4.2 4.2 0 0 1 6 6L30 31z"/>')
            + '</div><i class="ios-home"></i>',
    };
    const memoDate = () => {
        const d = new Date();
        const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
    };

    const list = [
        {
            id: 'grid',
            name: '学习笔记',
            desc: '方格纸 + 荧光笔，学霸同款',
            accents: ['#2f6feb', '#e5484d', '#12a150', '#7c4dff', '#f76b15', '#1d1d1f'],
            swatch: ['#ffffff', '#2f6feb'],
        },
        {
            id: 'memo',
            name: '备忘录',
            desc: '像 iPhone 备忘录截图，真实感拉满',
            accents: ['#e3a008', '#ff3b30', '#007aff', '#34c759', '#af52de', '#1c1c1e'],
            swatch: ['#ffffff', '#e3a008'],
            deco: IOS.status + IOS.nav + IOS.tool,
            // 封面顶上多一行灰色日期（每次打开按当天日期显示）
            coverDeco: () => IOS.status + IOS.nav + `<div class="ios-date">${memoDate()}</div>` + IOS.tool,
        },
        {
            id: 'cream',
            name: '奶油手帐',
            desc: '点阵纸 + 和纸胶带，温柔日常',
            accents: ['#e8804a', '#e0607e', '#6aa37b', '#5b8bd9', '#9a78d6', '#c9a227'],
            swatch: ['#fbf5ea', '#e8804a'],
            deco: '<i class="tape"></i><i class="tape b"></i>',
        },
        {
            id: 'minimal',
            name: '极简白',
            desc: '干净克制，干货清单首选',
            accents: ['#ff2442', '#1d1d1f', '#2f6feb', '#0f9d58', '#ff7a00', '#8e44ef'],
            swatch: ['#ffffff', '#ff2442'],
        },
        {
            id: 'magazine',
            name: '杂志',
            desc: '衬线大标题，适合观点长文',
            accents: ['#b23a2a', '#1b1a17', '#2f5d8a', '#3d7a4f', '#b8862b', '#7a3b69'],
            swatch: ['#f3efe6', '#1b1a17'],
            deco: '<i class="rule-top"></i><i class="rule-bottom"></i>',
            coverDeco: '<i class="rule-top"></i><div class="masthead"><span>LONG READ</span><span>长文</span></div>',
        },
        {
            id: 'candy',
            name: '糖果卡片',
            desc: '渐变底 + 圆角卡片，活泼可爱',
            accents: ['#ff6b9a', '#ff8a3d', '#8b6cff', '#23b5a6', '#3d8bff', '#f25f5c'],
            swatch: ['#ffe0ea', '#ff6b9a'],
            deco: '<i class="panel"></i>',
        },
        {
            id: 'sticky',
            name: '便利贴',
            desc: '桌面上的一张黄色便签',
            accents: ['#e4572e', '#2f6feb', '#2b8a3e', '#8f3fbf', '#3a3326', '#d6336c'],
            swatch: ['#ffee8f', '#e4572e'],
            deco: '<i class="note"></i><i class="tape"></i>',
        },
        {
            id: 'night',
            name: '夜读',
            desc: '深色背景，深夜情绪长文',
            accents: ['#f5c451', '#7cc4ff', '#ff8fab', '#8ce99a', '#b197fc', '#ffa94d'],
            swatch: ['#15161b', '#f5c451'],
            dark: true,
            deco: '<i class="stars"></i>',
            coverDeco: '<i class="stars"></i><i class="moon"></i>',
        },
        {
            id: 'terminal',
            name: '终端',
            desc: '代码编辑器窗口，技术分享',
            accents: ['#3fb950', '#58a6ff', '#d2a8ff', '#ffa657', '#ff7b72', '#f0f6fc'],
            swatch: ['#0e1116', '#3fb950'],
            dark: true,
            deco: '<div class="bar"><i></i><i></i><i></i><b>note.md</b></div>',
        },
        {
            id: 'ink',
            name: '水墨',
            desc: '宣纸、毛笔、朱砂印章',
            accents: ['#b8372d', '#2b2622', '#3d6b5a', '#2d4f7c', '#9a6a2f', '#6b3a5d'],
            swatch: ['#f2ecdf', '#b8372d'],
            coverDeco: '<i class="brushline"></i><div class="seal">长<br>文</div>',
        },
    ];

    const byId = Object.fromEntries(list.map((t) => [t.id, t]));
    const get = (id) => byId[id] || list[0];

    /** 生成一张纸张噪点纹理（用 canvas 画，存成 CSS 变量供主题使用） */
    function installNoise() {
        try {
            const size = 180;
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(size, size);
            let seed = 7;
            const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = 90 + rand() * 80;
                img.data[i] = v;
                img.data[i + 1] = v * 0.92;
                img.data[i + 2] = v * 0.8;
                img.data[i + 3] = rand() < 0.5 ? rand() * 26 : 0;
            }
            ctx.putImageData(img, 0, 0);
            document.documentElement.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`);
        } catch (e) {
            console.warn('噪点纹理生成失败', e);
        }
    }

    return { list, get, installNoise };
})();
