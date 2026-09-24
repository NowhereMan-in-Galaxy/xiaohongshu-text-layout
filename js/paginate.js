/*
 * 分页引擎 —— 这个工具最核心的部分
 *
 * 旧版本是「估算」每页能放多少字，字体一变就会估错，导致文字被裁掉。
 * 现在的做法是：在一个看不见的「测量台」上，用和导出完全相同的页面，
 * 把内容一块一块真实地放进去，放不下了就换页。
 *
 *  - 段落 / 列表项 / 引用 / 代码放不下时，用二分查找找出这一页最多能放多少字，
 *    剩下的部分带着原有格式（加粗、颜色……）接到下一页
 *  - 表格按行拆分，下一页自动重复表头
 *  - 标题不会孤零零地留在页面底部
 *  - 断点遵守中文排版的避头尾规则，不拆英文单词
 */
const Paginator = (() => {
    let stage = null;

    function getStage() {
        if (!stage) {
            stage = document.createElement('div');
            stage.className = 'measure-stage';
            stage.setAttribute('aria-hidden', 'true');
            document.body.appendChild(stage);
        }
        return stage;
    }

    /** 正文区最后一个元素的底边没有超出正文区，就说明放得下 */
    function fits(body) {
        const last = body.lastElementChild;
        if (!last) return true;
        return last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 0.5;
    }

    /** 可以按字拆分的块，返回承载文字的那个元素 */
    function textBox(el) {
        if (el.matches('p, blockquote')) return el;
        if (el.matches('.li')) return el.querySelector('.lic');
        if (el.matches('pre')) return el.querySelector('code');
        return null;
    }

    /** 收集元素里所有文字节点，以及每个节点在全文中的起始位置 */
    function textIndex(root) {
        const nodes = [];
        let total = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const n = walker.currentNode;
            nodes.push({ node: n, start: total });
            total += n.data.length;
        }
        return { nodes, total, text: nodes.map((n) => n.node.data).join('') };
    }

    function locate(idx, k) {
        for (let i = idx.nodes.length - 1; i >= 0; i--) {
            const n = idx.nodes[i];
            if (k >= n.start) return { node: n.node, offset: Math.min(k - n.start, n.node.data.length) };
        }
        return { node: idx.nodes[0].node, offset: 0 };
    }

    /** 用 Range 截取前 k 个字（或第 k 个字之后）的内容，自动保留外层的格式标签 */
    function slice(src, idx, k, head) {
        const range = document.createRange();
        const at = locate(idx, k);
        if (head) {
            range.setStart(src, 0);
            range.setEnd(at.node, at.offset);
        } else {
            range.setStart(at.node, at.offset);
            range.setEnd(src, src.childNodes.length);
        }
        return range.cloneContents();
    }

    /**
     * 把 el 拆成「这一页放得下的部分」和「剩下的部分」
     * 调用前 el 已经在 body 末尾；返回剩下的部分（没拆成功返回 null，且 el 被移除）
     */
    function splitText(el, body) {
        const box = textBox(el);
        if (!box) { el.remove(); return null; }
        const src = box.cloneNode(true);
        const idx = textIndex(src);
        if (idx.total < 2) { el.remove(); return null; }

        const put = (k) => box.replaceChildren(slice(src, idx, k, true));
        let lo = 1;
        let hi = idx.total - 1;
        let best = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            put(mid);
            if (fits(body)) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }

        let k = best;
        if (k > 0) {
            k = el.matches('pre') ? codeBreak(idx.text, k) : Markdown.adjustBreak(idx.text, k);
        }
        // 这一页只能放下零星几个字时，干脆整块移到下一页
        if (k <= 0 || idx.text.slice(0, k).trim().length < 2) {
            box.replaceChildren(...src.cloneNode(true).childNodes);
            el.remove();
            return null;
        }

        put(k);
        let rest = k;
        while (rest < idx.total && /\s/.test(idx.text[rest]) && !el.matches('pre')) rest++;

        const tail = el.cloneNode(true);
        tail.classList.add('cont');
        tail.removeAttribute('id');
        textBox(tail).replaceChildren(slice(src, idx, rest, false));
        el.classList.add('split');
        return tail;
    }

    /** 代码块尽量在换行处断开 */
    function codeBreak(text, k) {
        const nl = text.lastIndexOf('\n', k - 1);
        return nl > 0 ? nl + 1 : k;
    }

    /** 表格按行拆分，下一页重复表头 */
    function splitTable(el, body) {
        const rows = [...el.tBodies[0].rows];
        if (rows.length < 2) { el.remove(); return null; }
        // keep = 留在这一页的行数，从后往前一行行挪走，直到放得下
        let keep = rows.length;
        while (keep > 1) {
            rows[--keep].remove();
            if (fits(body)) break;
        }
        if (!fits(body)) {
            el.tBodies[0].replaceChildren(...rows);
            el.remove();
            return null;
        }
        const tail = el.cloneNode(true);
        tail.tBodies[0].replaceChildren(...rows.slice(keep).map((r) => r.cloneNode(true)));
        tail.classList.add('cont');
        return tail;
    }

    function trySplit(el, body) {
        if (el.matches('table')) return splitTable(el, body);
        return splitText(el, body);
    }

    function pageInfo(body) {
        const lines = [...body.children].map((c) => Number(c.dataset.line)).filter((n) => !Number.isNaN(n));
        return {
            html: body.innerHTML,
            first: lines.length ? Math.min(...lines) : null,
            last: lines.length ? Math.max(...lines) : null,
        };
    }

    /**
     * 分页主流程
     * @param {{type:string, html:string}[]} blocks 已渲染成 HTML 的块
     * @param {() => HTMLElement} makeShell 创建一个空白页面外壳
     * @returns {{html:string, first:number|null, last:number|null}[]}
     */
    function paginate(blocks, makeShell) {
        const st = getStage();
        const pages = [];
        const tpl = document.createElement('template');
        let body;

        const newPage = () => {
            const page = makeShell();
            st.replaceChildren(page);
            body = page.querySelector('.pg-body');
        };

        const closePage = () => {
            // 页尾的留白没有意义，删掉
            while (body.lastElementChild && body.lastElementChild.matches('.sp')) body.lastElementChild.remove();
            // 标题不要孤零零地留在页尾，和后面的内容一起挪到下一页
            const carry = [];
            while (body.children.length > 1 && body.lastElementChild.matches('.h')) {
                carry.unshift(body.lastElementChild);
                body.lastElementChild.remove();
            }
            if (body.children.length) pages.push(pageInfo(body));
            newPage();
            carry.forEach((c) => body.appendChild(c));
        };

        newPage();
        for (const b of blocks) {
            if (b.type === 'pagebreak') {
                if (body.children.length) closePage();
                continue;
            }
            tpl.innerHTML = b.html;
            let el = tpl.content.firstElementChild;
            if (!el) continue;
            if (b.type === 'spacer' && !body.children.length) continue;

            body.appendChild(el);
            for (let guard = 0; el && !fits(body) && guard < 500; guard++) {
                if (b.type === 'spacer') { el.remove(); break; }
                const wasAlone = body.children.length === 1;
                const tail = trySplit(el, body);
                if (tail) {
                    closePage();
                    el = tail;
                    body.appendChild(el);
                } else if (wasAlone) {
                    // 一整页都放不下（比如超长的一行），只能硬放，超出部分会被裁掉
                    body.appendChild(el);
                    break;
                } else {
                    closePage();
                    body.appendChild(el);
                }
            }
        }
        if (body.children.length) pages.push(pageInfo(body));
        st.replaceChildren();
        return pages.length ? pages : [{ html: '', first: null, last: null }];
    }

    /** 在测量台上执行一个函数（比如封面标题字号自适应） */
    function measure(el, fn) {
        const st = getStage();
        st.replaceChildren(el);
        try {
            return fn(el);
        } finally {
            st.replaceChildren();
        }
    }

    return { paginate, measure, fits };
})();
