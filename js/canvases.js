/*
 * 画布 —— 「自由排版」模式下每一页的背景
 *
 * 自由排版不写长文：页面上只有你放上去的文字、图片、贴纸和线条，画布只负责背景和氛围。
 * 样式写在 css/pages.css 的「画布」部分（.canvas-xxx），这里只放名字、推荐色和装饰元素。
 */
const Canvases = (() => {
    // 一朵简笔画的云
    const cloud = (cls) => `<svg class="cloud ${cls}" viewBox="0 0 200 100"><path d="M40 88c-20 0-32-12-32-27s13-26 29-25c5-18 21-30 40-30 17 0 31 9 38 23 5-3 11-4 17-4 21 0 36 15 36 33 0 18-14 30-33 30z"/></svg>`;
    const sparkle = (cls) => `<svg class="spk ${cls}" viewBox="0 0 40 40"><path d="M20 0c2 12 8 18 20 20-12 2-18 8-20 20-2-12-8-18-20-20C12 18 18 12 20 0z"/></svg>`;

    const list = [
        {
            id: 'sage',
            name: '莫兰迪绿',
            accents: ['#5f7a5c', '#b5838d', '#6d6875', '#c9a227', '#3d405b', '#ffffff'],
            swatch: ['#c9d4c0', '#5f7a5c'],
        },
        {
            id: 'gingham',
            name: '奶油格子',
            accents: ['#d9826a', '#7a9e7e', '#6b8fb3', '#c9a227', '#8b6b5c', '#3a3326'],
            swatch: ['#fbf1dc', '#f2c9a0'],
        },
        {
            id: 'polka',
            name: '波点',
            accents: ['#c65d7b', '#6d597a', '#e09f3e', '#4a7c8c', '#3a3326', '#ffffff'],
            swatch: ['#f6d6d6', '#fff8ef'],
        },
        {
            id: 'sky',
            name: '云朵天空',
            accents: ['#3d7cc9', '#f28482', '#f6bd60', '#5a8f7b', '#34495e', '#ffffff'],
            swatch: ['#bfe0f5', '#ffffff'],
            deco: cloud('c1') + cloud('c2') + cloud('c3') + cloud('c4'),
        },
        {
            id: 'starry',
            name: '星空',
            accents: ['#f5d67b', '#b8c0ff', '#ffafcc', '#a0e7e5', '#ffffff', '#ffd6a5'],
            swatch: ['#1d2346', '#f5d67b'],
            dark: true,
            deco: sparkle('s1') + sparkle('s2') + sparkle('s3') + sparkle('s4') + '<i class="moon"></i>',
        },
        {
            id: 'kraft',
            name: '牛皮纸',
            accents: ['#3a2e22', '#a23e48', '#ffffff', '#4f6d5a', '#2f4858', '#e9c46a'],
            swatch: ['#c9a67a', '#3a2e22'],
        },
        {
            id: 'cork',
            name: '软木板',
            accents: ['#ffffff', '#3a2e22', '#e63946', '#f4d35e', '#2a9d8f', '#457b9d'],
            swatch: ['#b98b5e', '#6e4b2e'],
        },
        {
            id: 'lined',
            name: '横线本',
            accents: ['#3d5a80', '#e76f51', '#2a9d8f', '#8d6cab', '#1d1d1f', '#e9a23b'],
            swatch: ['#fffdf6', '#9ec5e8'],
            deco: '<i class="holes"></i>',
        },
        {
            id: 'dotted',
            name: '点阵手帐',
            accents: ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#6d597a', '#1d1d1f'],
            swatch: ['#faf6ee', '#c8bfae'],
        },
        {
            id: 'peach',
            name: '蜜桃渐变',
            accents: ['#e76f51', '#9d4edd', '#2a9d8f', '#3a3326', '#ffffff', '#f4a261'],
            swatch: ['#ffd6c9', '#ffe9a8'],
        },
        {
            id: 'checker',
            name: '奶油棋盘',
            accents: ['#6b8f71', '#c65d7b', '#3a3326', '#e09f3e', '#4a7c8c', '#ffffff'],
            swatch: ['#f3ecd9', '#cfdcc4'],
        },
    ];

    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    const get = (id) => byId[id] || list[0];

    return { list, get };
})();
