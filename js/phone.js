/*
 * 手机预览 —— 模拟笔记发出去以后的样子
 *   笔记页：左右滑动看图，下面是标题和正文
 *   发现页：双列信息流里，你的封面和别人的笔记放在一起，够不够吸引人一眼就知道
 * （只是示意，不代表任何 App 的真实界面）
 */
const Phone = (() => {
    const esc = Markdown.escapeHtml;

    const ICON = {
        back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
        share: '<svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v12M7 8l5-5 5 5"/></svg>',
        heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.8 6.4 4.5 8.6 4.3 10.4 5.6 12 7.6c1.6-2 3.4-3.3 5.6-3.1 3.4.3 5.2 3.8 3.6 6.9C19 15.6 12 20 12 20z"/></svg>',
        star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
        chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    };

    /** 用在假信息流里的「别人家的笔记」 */
    const FAKE = [
        { t: '周末去哪儿｜城市里的小众公园合集', h: 1.33, c: ['#cfe3d4', '#9cc5a8'] },
        { t: '一周通勤穿搭不重样', h: 1.25, c: ['#f4d8cd', '#e8a992'] },
        { t: '懒人版番茄牛腩，电饭煲就能做', h: 1, c: ['#f7e3b5', '#eab861'] },
        { t: '书桌改造前后对比', h: 1.33, c: ['#dcd6f2', '#aa9ee0'] },
        { t: '猫咪第一次见到雪', h: 1.1, c: ['#d7e7f5', '#9cc2e6'] },
    ];

    function scaled(pageEl, width, w, h) {
        const s = width / w;
        const box = document.createElement('div');
        box.className = 'ph-page';
        box.style.width = width + 'px';
        box.style.height = Math.round(h * s) + 'px';
        pageEl.style.transform = `scale(${s})`;
        pageEl.style.transformOrigin = '0 0';
        box.appendChild(pageEl);
        return box;
    }

    function statusBar() {
        return `<div class="ph-status"><b>9:41</b><span class="ph-sig"><i></i><i></i><i></i><i></i></span></div>`;
    }

    function noteView(root, data) {
        const W = 360;
        const [w, h] = data.size;
        const slideH = Math.round(h * (W / w));
        root.innerHTML = `
            ${statusBar()}
            <div class="ph-nav">
                <span class="ph-ic">${ICON.back}</span>
                <span class="ph-avatar">${esc(data.author.slice(0, 1) || '我')}</span>
                <span class="ph-name">${esc(data.author || '我的账号')}</span>
                <span class="ph-follow">关注</span>
                <span class="ph-ic">${ICON.share}</span>
            </div>
            <div class="ph-scroll">
                <div class="ph-carousel" style="height:${slideH}px">
                    <div class="ph-track"></div>
                    <span class="ph-count">1/${data.pages.length}</span>
                </div>
                <div class="ph-dots">${data.pages.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
                <div class="ph-content">
                    <h3>${esc(data.title)}</h3>
                    <p>${esc(data.desc)}</p>
                    ${data.tags.length ? `<p class="ph-tags">${data.tags.map((t) => esc(t)).join(' ')}</p>` : ''}
                    <p class="ph-date">刚刚</p>
                </div>
                <div class="ph-comments">
                    <p>共 0 条评论</p>
                    <div class="ph-cbox"><span class="ph-avatar sm">我</span><span>爱评论的人运气都不差</span></div>
                </div>
            </div>
            <div class="ph-bottom">
                <span class="ph-input">说点什么…</span>
                <span class="ph-act">${ICON.heart}<b>赞</b></span>
                <span class="ph-act">${ICON.star}<b>收藏</b></span>
                <span class="ph-act">${ICON.chat}<b>评论</b></span>
            </div>`;

        const track = root.querySelector('.ph-track');
        data.pages.forEach((p) => track.appendChild(scaled(p, W, w, h)));
        const count = root.querySelector('.ph-count');
        const dots = [...root.querySelectorAll('.ph-dots i')];
        track.addEventListener('scroll', () => {
            const i = Math.round(track.scrollLeft / W);
            count.textContent = `${i + 1}/${data.pages.length}`;
            dots.forEach((d, j) => d.classList.toggle('on', j === i));
        }, { passive: true });
    }

    function feedView(root, data) {
        const colW = 172;
        const [w, h] = data.size;
        // 信息流里的封面最高按 3:4 裁切显示
        const coverH = Math.min(Math.round(h * (colW / w)), Math.round(colW * 4 / 3));
        const card = (inner, title, name, likes) => `
            <div class="ph-card">${inner}
                <p class="ph-ct">${title}</p>
                <div class="ph-cm"><span class="ph-avatar xs">${esc(name.slice(0, 1))}</span><span class="ph-cn">${esc(name)}</span><span class="ph-like">${ICON.heart}${likes}</span></div>
            </div>`;
        const fake = (f) => card(
            `<div class="ph-fakeimg" style="height:${Math.round(colW * f.h)}px;background:linear-gradient(160deg,${f.c[0]},${f.c[1]})"></div>`,
            esc(f.t), '路人甲', Math.floor(f.h * 997) % 900 + 100,
        );
        const mine = card('<div class="ph-mine"></div>', esc(data.title), data.author || '我的账号', '1.2w');
        root.innerHTML = `
            ${statusBar()}
            <div class="ph-feedtop"><span>关注</span><b>发现</b><span>附近</span><span class="ph-ic">${ICON.search}</span></div>
            <div class="ph-scroll ph-feed">
                <div class="ph-col">${fake(FAKE[0])}${mine}${fake(FAKE[3])}</div>
                <div class="ph-col">${fake(FAKE[1])}${fake(FAKE[2])}${fake(FAKE[4])}</div>
            </div>`;
        const slot = root.querySelector('.ph-mine');
        slot.style.height = coverH + 'px';
        slot.appendChild(scaled(data.pages[0], colW, w, h));
    }

    /**
     * @param {HTMLElement} container
     * @param {{mode:'note'|'feed', pages:HTMLElement[], size:[number,number], title:string, desc:string, tags:string[], author:string}} data
     */
    function render(container, data) {
        container.innerHTML = `
            <div class="phone-switch seg">
                <button data-mode="note" class="${data.mode === 'note' ? 'on' : ''}">笔记页</button>
                <button data-mode="feed" class="${data.mode === 'feed' ? 'on' : ''}">发现页</button>
            </div>
            <div class="phone"><div class="phone-screen"></div></div>
            <p class="phone-tip">${data.mode === 'feed' ? '你的封面在信息流里够显眼吗？' : '左右滑动图片试试'}</p>`;
        const screen = container.querySelector('.phone-screen');
        if (data.mode === 'feed') feedView(screen, data);
        else noteView(screen, data);
    }

    return { render };
})();
