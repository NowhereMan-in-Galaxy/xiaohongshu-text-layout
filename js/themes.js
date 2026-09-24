/*
 * 主题清单 —— 样式写在 css/pages.css，这里只放名字、推荐色和装饰元素
 *
 * 想新增主题？在这里加一项，再到 pages.css 里写一个 .theme-xxx 就好。
 */
const Themes = (() => {
    const list = [
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
            id: 'grid',
            name: '学习笔记',
            desc: '方格纸 + 荧光笔，学霸同款',
            accents: ['#2f6feb', '#e5484d', '#12a150', '#7c4dff', '#f76b15', '#1d1d1f'],
            swatch: ['#ffffff', '#2f6feb'],
            deco: '<i class="clip"></i>',
            coverDeco: '<i class="clip"></i>',
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
