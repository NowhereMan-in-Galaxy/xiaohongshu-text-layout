// 端到端测试：在真实浏览器（Chromium）里打开工具，检查分页、导出和编辑器
// 运行：npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

let server;
let browser;
let base;

before(async () => {
    server = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            const index = path.join(file, 'index.html');
            if (fs.existsSync(index)) return send(index, res);
            res.writeHead(404).end();
            return;
        }
        send(file, res);
    });
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    // 关掉 LCD 亚像素抗锯齿：屏幕上的字边缘会带彩色镶边，而导出的图片用的是灰度抗锯齿（这对图片才是正确的），
    // 不关掉的话「逐像素对比」测试比较的就不是同一种渲染方式
    browser = await chromium.launch({ args: ['--disable-lcd-text'] });
});

function send(file, res) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}

after(async () => {
    await browser?.close();
    server?.close();
});

/** 打开工具。屏蔽网络字体，让测试结果稳定（只用系统字体） */
async function open({ fresh = true, viewport = { width: 1440, height: 900 } } = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    // 智能抠图的运行库平时从 jsDelivr 加载，测试时改用本地 node_modules 里同一版本的文件，不依赖网络
    await context.route(/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/([^?]+)/, (r) => {
        const name = /dist\/([^?]+)/.exec(r.request().url())[1];
        const file = path.join(ROOT, 'node_modules/onnxruntime-web/dist', path.basename(name));
        if (!fs.existsSync(file)) return r.fulfill({ status: 404 });
        const type = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
        return r.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
    await page.goto(base);
    if (fresh) {
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    }
    await page.evaluate(() => window.Studio.ready);
    return { page, context, errors };
}

/** 一篇专门用来「刁难」分页引擎的长文 */
function stressText() {
    const long = '这是一段很长很长的文字，用来测试跨页拆分。'.repeat(18);
    const rows = Array.from({ length: 28 }, (_, i) => `| 第 ${i + 1} 行 | ${'单元格内容'.repeat((i % 3) + 1)} | ${i * 7} |`).join('\n');
    const code = Array.from({ length: 40 }, (_, i) => `console.log("line ${i + 1}");`).join('\n');
    return [
        '# 压力测试标题',
        `开头段落，**加粗的内容会跨越页面边界${'继续加粗'.repeat(40)}直到这里结束**，然后是普通文字。`,
        long,
        'Supercalifragilisticexpialidocious '.repeat(12) + '英文单词不应该被拆开。',
        '## 列表',
        ...Array.from({ length: 14 }, (_, i) => `${i + 1}. 列表项 ${i + 1}：${'内容'.repeat(i * 3)}`),
        '- 无序项',
        '  - 子项 ==高亮的一段文字，看看跨页后高亮还在不在== 结束',
        '- [x] 已完成的待办',
        '- [ ] 未完成的待办',
        '> ' + '引用块里的一段话。'.repeat(30),
        '## 表格',
        '| 名称 | 描述 | 数值 |',
        '| --- | --- | --: |',
        rows,
        '',
        '',
        '',
        '## 代码',
        '```',
        code,
        '```',
        '![截图](assets/screenshots/phone.png)',
        '***',
        '---',
        '### 分页符之后',
        long,
        '#话题一 #话题二',
    ].join('\n');
}

/** 在浏览器里检查所有页面：没有溢出，没有丢字、没有重复 */
async function auditPages(page) {
    return page.evaluate(() => {
        const { model } = Studio.state;
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;left:0;top:0;';
        document.body.appendChild(box);
        const overflow = [];
        let text = '';
        const off = model.cover ? 1 : 0;
        for (let i = off; i < model.total; i++) {
            const pg = Studio.buildPage(i);
            box.replaceChildren(pg);
            const body = pg.querySelector('.pg-body');
            const limit = body.getBoundingClientRect().bottom + 1;
            for (const el of body.children) {
                if (el.getBoundingClientRect().bottom > limit) overflow.push({ page: i, block: el.className });
            }
            // 统计文字时去掉列表标记和续表里重复的表头
            const c = body.cloneNode(true);
            c.querySelectorAll('.mk, table.cont thead').forEach((n) => n.remove());
            text += c.textContent;
        }
        box.remove();

        // 期望的全文：所有块不分页地渲染出来
        const doc = Markdown.parse(Studio.state.text);
        const all = document.createElement('div');
        all.innerHTML = doc.blocks.map((b) => Render.blockHtml(b, new Map())).join('');
        all.querySelectorAll('.mk, .img-missing').forEach((n) => n.remove());
        const strip = (s) => s.replace(/\s+/g, '');
        return { overflow, got: strip(text), want: strip(all.textContent), pages: model.pages.length };
    });
}

test('页面加载没有报错，示例文章正常分页', async () => {
    const { page, context, errors } = await open();
    const total = await page.evaluate(() => Studio.state.model.total);
    assert.ok(total >= 3, `示例文章应该有多页，实际 ${total} 页`);
    assert.equal(await page.locator('#grid .thumb').count(), total);
    assert.deepEqual(errors, []);
    await context.close();
});

test('所有主题 × 所有比例：没有内容溢出，一个字都不丢、不重复', async () => {
    const { page, context, errors } = await open();
    const themes = await page.evaluate(() => Themes.list.map((t) => t.id));
    await page.evaluate((t) => Studio.setText(t), stressText());
    for (const ratio of ['3:4', '1:1', '4:3', '9:16']) {
        for (const theme of themes) {
            await page.evaluate((s) => Studio.setSettings(s), {
                theme, ratio, cover: { enabled: false }, header: '页眉文字', watermark: '@测试',
            });
            const r = await auditPages(page);
            const label = `${theme} ${ratio}`;
            assert.deepEqual(r.overflow, [], `${label} 有内容溢出`);
            assert.equal(r.got, r.want, `${label} 分页后的文字和原文不一致`);
            assert.ok(r.pages > 3, `${label} 页数异常：${r.pages}`);
        }
    }
    assert.deepEqual(errors, []);
    await context.close();
});

test('字号、行距、段距、缩进变化后仍然不溢出', async () => {
    const { page, context } = await open();
    await page.evaluate((t) => Studio.setText(t), stressText());
    for (const s of [
        { fontSize: 30, lineHeight: 1.3, paraSpacing: 0 },
        { fontSize: 60, lineHeight: 2.3, paraSpacing: 1.6, indent: true, align: 'left' },
    ]) {
        await page.evaluate((x) => Studio.setSettings(x), { ...s, cover: { enabled: false } });
        const r = await auditPages(page);
        assert.deepEqual(r.overflow, []);
        assert.equal(r.got, r.want);
    }
    await context.close();
});

test('跨页拆分保留格式，下一页不以标点开头，表格续页重复表头', async () => {
    const { page, context } = await open();
    await page.evaluate((t) => Studio.setText(t), stressText());
    await page.evaluate(() => Studio.setSettings({ theme: 'minimal', ratio: '3:4', cover: { enabled: false } }));
    const r = await page.evaluate(() => {
        const htmls = Studio.state.model.pages.map((p) => p.html);
        const box = document.createElement('div');
        const conts = htmls.flatMap((h) => { box.innerHTML = h; return [...box.querySelectorAll('.cont')].map((e) => e.cloneNode(true)); });
        return {
            badStart: conts.filter((e) => !e.matches('table, pre')).map((e) => e.textContent.trim()[0]).filter((c) => '，。、！？；：'.includes(c)),
            tableHeaders: conts.filter((e) => e.matches('table')).map((e) => e.querySelector('thead')?.textContent || ''),
            brokenWord: htmls.some((h) => /Supercalifragilisticexpialidoc<\/p>/.test(h)),
        };
    });
    const bold = await page.evaluate(async () => {
        await Studio.setText('**' + '整段都是加粗的文字，'.repeat(120) + '**');
        const box = document.createElement('div');
        box.innerHTML = Studio.state.model.pages[1].html;
        const p = box.querySelector('p.cont');
        return p && p.firstElementChild && p.firstElementChild.tagName;
    });
    assert.equal(bold, 'STRONG', '加粗文字跨页后，续页开头应该仍然是加粗');
    assert.deepEqual(r.badStart, [], '续页不应以标点开头');
    assert.ok(r.tableHeaders.length > 0, '长表格应该被拆到多页');
    r.tableHeaders.forEach((h) => assert.match(h, /名称/));
    assert.equal(r.brokenWord, false);
    await context.close();
});

test('分页符 --- 强制换页，标题不会孤零零留在页尾', async () => {
    const { page, context } = await open();
    await page.evaluate(() => Studio.setSettings({ cover: { enabled: false } }));
    await page.evaluate(() => Studio.setText('第一页\n---\n第二页\n---\n---\n第三页'));
    const texts = await page.evaluate(() => Studio.state.model.pages.map((p) => p.html.replace(/<[^>]+>/g, '')));
    assert.deepEqual(texts, ['第一页', '第二页', '第三页']);

    const orphan = await page.evaluate(async () => {
        const filler = '填充文字，'.repeat(30);
        const lines = [];
        for (let i = 0; i < 41; i++) lines.push(i % 4 === 3 ? `## 小标题 ${i}` : filler);
        await Studio.setText(lines.join('\n'));
        return Studio.state.model.pages.filter((p) => /<h2[^>]*>(?:(?!<\/h2>).)*<\/h2>$/.test(p.html)).length;
    });
    assert.equal(orphan, 0, '有页面以标题结尾');
    await context.close();
});

/** 把第 idx 页正常渲染出来截图，再和导出的 PNG 逐像素对比，返回差异比例和尺寸 */
async function fidelity(page, idx) {
    await page.evaluate((i) => {
        const holder = document.createElement('div');
        holder.id = 'fidelity';
        holder.style.cssText = 'position:fixed;left:0;top:0;z-index:9999';
        holder.appendChild(Studio.buildPage(i));
        document.body.appendChild(holder);
    }, idx);
    await page.setViewportSize({ width: 1100, height: 1500 });
    await page.evaluate(() => Promise.all([...document.querySelectorAll('#fidelity img')].map((im) => im.decode().catch(() => { }))));
    const shot = await page.locator('#fidelity > .pg').screenshot();
    await page.evaluate(() => document.getElementById('fidelity').remove());

    return page.evaluate(async ({ i, png }) => {
        const blob = await Studio.exportPage(i, 1);
        const a = await createImageBitmap(blob);
        const b = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
        const read = (img) => {
            const c = new OffscreenCanvas(img.width, img.height);
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = read(a);
        const db = read(b);
        let diff = 0;
        // 行距、段距是小数像素时，屏幕和导出对同一行的取整可能差 1px（肉眼看不出），
        // 所以和上下相邻 1px 的像素比也算一致；换行不同、内容缺失这类真问题照样能查出来
        const W = a.width;
        const far = (k, o) => {
            const j = k + o;
            if (j < 0 || j >= db.length) return true;
            return Math.abs(da[k] - db[j]) + Math.abs(da[k + 1] - db[j + 1]) + Math.abs(da[k + 2] - db[j + 2]) > 60;
        };
        for (let k = 0; k < da.length; k += 4) {
            if (far(k, 0) && far(k, -4 * W) && far(k, 4 * W)) diff++;
        }
        const big = await createImageBitmap(await Studio.exportPage(i, 2));
        return { w: a.width, h: a.height, sw: b.width, sh: b.height, ratio: diff / (a.width * a.height), w2: big.width, h2: big.height };
    }, { i: idx, png: shot.toString('base64') });
}

test('导出的 PNG 尺寸正确，并且和屏幕上的渲染逐像素一致', async () => {
    const { page, context } = await open();
    for (const theme of ['memo', 'cream', 'night', 'grid', 'candy']) {
        await page.evaluate((t) => Studio.setSettings({ theme: t }), theme);
        for (const i of [0, 1]) {
            const result = await fidelity(page, i);
            assert.equal(result.w, 1080);
            assert.equal(result.h, 1440);
            assert.equal(result.w2, 2160);
            assert.equal(result.h2, 2880);
            assert.deepEqual([result.sw, result.sh], [1080, 1440]);
            assert.ok(result.ratio < 0.003, `${theme} 第 ${i + 1} 页：导出图和屏幕渲染差异 ${(result.ratio * 100).toFixed(2)}%`);
        }
    }
    await context.close();
});

/** 在页面里画一张纯色背景的测试图，返回 data URL */
const makeImage = (page, w, h, color, bg = null) => page.evaluate(([w2, h2, c, b]) => {
    const cv = document.createElement('canvas');
    cv.width = w2;
    cv.height = h2;
    const g = cv.getContext('2d');
    g.fillStyle = b || c;
    g.fillRect(0, 0, w2, h2);
    if (b) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(w2 / 2, h2 / 2, Math.min(w2, h2) * 0.3, 0, Math.PI * 2);
        g.fill();
    }
    return cv.toDataURL('image/png');
}, [w, h, color, bg]);

test('图片：宽度百分比、靠左靠右、同一行多张图并排且高度一致', async () => {
    const { page, context, errors } = await open();
    const a = await makeImage(page, 300, 450, '#e88');
    const b = await makeImage(page, 300, 500, '#88e');
    const c = await makeImage(page, 800, 400, '#8c8');
    await page.evaluate((t) => Studio.setText(t), `# 标题\n段落\n![](${a}) ![](${b})\n![说明](${c}){50% right}\n![](${c}){30% left}\n结尾`);
    const r = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const row = document.querySelector('#grid .fig.row');
        const [i1, i2] = [...row.querySelectorAll('img')].map(box);
        const right = document.querySelector('#grid .fig.al-right img');
        const left = document.querySelector('#grid .fig.al-left img');
        const body = box(right.closest('.pg-body'));
        return {
            rowH: [i1.height, i2.height],
            rowFill: (i2.right - i1.left) / (body.width),
            right: [box(right).width / body.width, body.right - box(right).right],
            left: [box(left).width / body.width, box(left).left - body.left],
        };
    });
    assert.ok(Math.abs(r.rowH[0] - r.rowH[1]) < 1, `并排的两张图应该一样高：${r.rowH}`);
    assert.ok(r.rowFill > 0.97, '并排的图应该占满一行');
    assert.ok(Math.abs(r.right[0] - 0.5) < 0.01 && r.right[1] < 1, `50% 靠右：${r.right}`);
    assert.ok(Math.abs(r.left[0] - 0.3) < 0.01 && r.left[1] < 1, `30% 靠左：${r.left}`);

    // 在预览里点图片、拖右下角的圆点调大小，松手后写回 Markdown
    const img = page.locator('#grid .fig.al-left img');
    await img.click();
    const h = page.locator('#grid .obj-h.h-img');
    const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 10, { steps: 6 });
    await page.mouse.up();
    const line = (await page.locator('#editor').inputValue()).split('\n')[4];
    const pct = Number(/\{(\d+)% left\}/.exec(line)?.[1]);
    assert.ok(pct > 30 && pct <= 100, `拖动后宽度应该变大：${line.slice(-20)}`);

    // 工具条：和上一张并排
    await page.waitForFunction(() => !document.querySelector('#objBar').hidden);
    await page.locator('#objBar [data-act="merge"]').click();
    await page.waitForFunction(() => {
        const blocks = Studio.state.model.doc.blocks;
        return blocks.filter((b) => b.type === 'imgrow').length === 2 && !blocks.some((b) => b.type === 'img');
    });
    const merged = (await page.locator('#editor').inputValue()).split('\n')[3];
    assert.equal((merged.match(/!\[/g) || []).length, 2, '两张图应该合到同一行');
    assert.ok(!/%/.test(merged), '并排后不再保留单张图的宽度设置');
    assert.deepEqual(errors.filter((e) => !/Failed to load/.test(e)), []);
    await context.close();
});

test('贴纸：添加、拖动、拖到别的页、调图层，导出和屏幕一致，刷新后还在', async () => {
    const { page, context, errors } = await open();
    const photo = await makeImage(page, 400, 300, '#2a7', '#ffffff');
    await page.evaluate(async (url) => {
        Studio.state.selected = 1;
        Studio.addSticker({ kind: 'emoji', text: '🔥', outline: true });
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'p.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.getElementById('stickerInput');
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    }, photo);
    // 上传后先弹出裁剪框：在图上拖出一个新框，只保留中间部分
    await page.locator('#cropDialog[open]').waitFor();
    const stage = await page.locator('#cropStage').boundingBox();
    await page.mouse.move(stage.x + stage.width * 0.1, stage.y + stage.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * 0.9, stage.y + stage.height * 0.9, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.locator('#cropCut').isChecked(), true, '默认勾选自动抠图');
    await page.locator('#cropDialog button[value="ok"]').click();
    await page.waitForFunction(() => Studio.state.stickers.length === 2 && Studio.state.stickers[1].cut > 0);
    let sts = await page.evaluate(() => Studio.state.stickers);
    assert.equal(sts[0].page, 1);
    assert.notEqual(sts[1].src, sts[1].orig, '上传的图片应该自动抠图');
    assert.ok(Math.abs(sts[1].crop.x - 0.1) < 0.02 && Math.abs(sts[1].crop.w - 0.8) < 0.02, `裁剪范围 ${JSON.stringify(sts[1].crop)}`);
    const dims = await page.evaluate((st) => Studio.imageSize(st.orig), sts[1]);
    assert.ok(Math.abs(dims.w - 320) <= 2 && Math.abs(dims.h - 240) <= 2, `裁剪后的图应该是原图中间 80%：${dims.w}×${dims.h}`);

    // 取消裁剪框不会添加贴纸
    await page.evaluate(async (url) => {
        const dt = new DataTransfer();
        dt.items.add(new File([await (await fetch(url)).blob()], 'p.png', { type: 'image/png' }));
        const input = document.getElementById('stickerInput');
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    }, photo);
    await page.locator('#cropDialog[open]').waitFor();
    await page.locator('#cropDialog button[value="cancel"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => Studio.state.stickers.length), 2);

    // 图层：选中后面那张（在上层），下移一层
    await page.locator(`#grid .stk[data-sid="${sts[1].id}"]`).click();
    await page.locator('#objBar [data-act="down"]').click();
    sts = await page.evaluate(() => Studio.state.stickers);
    assert.equal(sts[0].kind, 'img', '下移一层后应该排到前面（下层）');

    // 形状和白边
    await page.locator('#objBar select[data-act="shape"]').selectOption('heart');
    await page.locator('#objBar [data-act="outline"]').click();
    await page.waitForFunction(() => document.querySelector('#grid .stk.sh-heart.outline'));

    // 拖动贴纸：先在页内挪一下，再拖到封面上
    const stk = page.locator(`#grid .stk[data-sid="${sts[1].id}"]`);
    let bx = await stk.boundingBox();
    const x0 = await page.evaluate((id) => Studio.state.stickers.find((s) => s.id === id).x, sts[1].id);
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
    await page.mouse.down();
    await page.mouse.move(bx.x + bx.width / 2 + 30, bx.y + bx.height / 2, { steps: 5 });
    await page.mouse.up();
    const x1 = await page.evaluate((id) => Studio.state.stickers.find((s) => s.id === id).x, sts[1].id);
    const k = await page.evaluate(() => Studio.state.zoom / 1080);
    assert.ok(Math.abs(x1 - x0 - 30 / k) < 3, `拖动 30px 应该移动 ${30 / k} 页面像素，实际 ${x1 - x0}`);

    const cover = await page.locator('#grid .thumb-frame').first().boundingBox();
    bx = await stk.boundingBox();
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
    await page.mouse.down();
    await page.mouse.move(cover.x + cover.width / 2, cover.y + cover.height * 0.7, { steps: 10 });
    await page.mouse.up();
    assert.equal(await page.evaluate((id) => Studio.state.stickers.find((s) => s.id === id).page, sts[1].id), 0);

    // 导出的图和屏幕一致（形状、白边、表情都要画对）
    for (const i of [0, 1]) {
        const res = await fidelity(page, i);
        assert.ok(res.ratio < 0.003, `带贴纸的第 ${i + 1} 页：导出图和屏幕渲染差异 ${(res.ratio * 100).toFixed(2)}%`);
    }

    // 删除键删除选中的贴纸；刷新后剩下的贴纸还在
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(`#grid .stk[data-sid="${sts[1].id}"]`).click();
    await page.keyboard.press('Delete');
    assert.equal(await page.evaluate(() => Studio.state.stickers.length), 1);
    await page.waitForFunction(() => document.querySelector('#saveState').textContent === '已自动保存');
    await page.reload();
    await page.evaluate(() => window.Studio.ready);
    assert.equal(await page.locator('#grid .stk').count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
});

test('文字和线条：输入文字、改样式，拖端点改长度和方向，导出和屏幕一致', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(() => { Studio.state.selected = 1; });

    // 加文字：直接进入编辑状态，打字后点别处保存
    await page.locator('#textBtn').click();
    await page.locator('#grid .stk.editing').waitFor();
    await page.keyboard.type('划重点');
    await page.locator('#pageInfo').click();
    await page.waitForFunction(() => Studio.state.stickers[0]?.text === '划重点');
    let st = await page.evaluate(() => Studio.state.stickers[0]);
    assert.equal(st.kind, 'text');
    assert.equal(st.page, 1);

    // 双击再改一次，Esc 结束；然后换成红色色块
    const txt = page.locator('#grid .stk.k-text');
    await txt.dblclick();
    await page.locator('#grid .stk.editing').waitFor();
    await page.keyboard.type('一定要看');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => Studio.state.stickers[0].text === '一定要看');
    await txt.click();
    await page.locator('#objBar select[data-act="tstyle"]').selectOption('label');
    await page.locator('#objBar [data-act="color"][data-v="#ff3b30"]').click();
    st = await page.evaluate(() => Studio.state.stickers[0]);
    assert.equal(st.style, 'label');
    assert.equal(st.color, '#ff3b30');
    assert.equal(await page.locator('#grid .stk.k-text .t-label').count(), 1);

    // 拖右下角放大，字号跟着变大
    const fs0 = st.fs;
    const size = await page.locator('#grid .obj-h.h-size').boundingBox();
    await page.mouse.move(size.x + size.width / 2, size.y + size.height / 2);
    await page.mouse.down();
    await page.mouse.move(size.x + 60, size.y + 30, { steps: 5 });
    await page.mouse.up();
    assert.ok(await page.evaluate((f) => Studio.state.stickers[0].fs > f, fs0), '放大后字号应该变大');

    // 虚线箭头：拖右端点到正下方，方向吸附成 90°
    await page.locator('#lineBtn').click();
    await page.locator('#lineMenu [data-line="dashArrow"]').click();
    st = await page.evaluate(() => Studio.state.stickers[1]);
    assert.deepEqual([st.kind, st.dash, st.arrow], ['line', 'dashed', 'end']);
    const k = await page.evaluate(() => Studio.state.zoom / 1080);
    const left = { x: st.x - st.w / 2, y: st.y };
    const frame = await page.locator('#grid .thumb-frame').nth(1).boundingBox();
    const e1 = await page.locator('#grid .obj-h.e1').boundingBox();
    await page.mouse.move(e1.x + e1.width / 2, e1.y + e1.height / 2);
    await page.mouse.down();
    await page.mouse.move(frame.x + (left.x + 2) * k, frame.y + (left.y + 300) * k, { steps: 6 });
    await page.mouse.up();
    st = await page.evaluate(() => Studio.state.stickers[1]);
    assert.equal(st.rot, 90, `角度应该吸附到 90°，实际 ${st.rot}`);
    assert.ok(Math.abs(st.w - 300) < 14, `长度应该约 300，实际 ${st.w}`);
    // 左端点没动
    assert.ok(Math.abs(st.x - left.x) < 3 && Math.abs(st.y - st.w / 2 - left.y) < 4, '另一个端点应该保持不动');
    await page.locator('#objBar [data-act="curve"]').click();
    await page.locator('#objBar select[data-act="arrow"]').selectOption('both');
    assert.equal(await page.locator('#grid .stk.k-line path').count(), 2, '线 + 箭头');

    for (const theme of ['memo', 'night']) {
        await page.evaluate((t) => { Studio.setSettings({ theme: t }); Studio.select(null); }, theme);
        const res = await fidelity(page, 1);
        assert.ok(res.ratio < 0.003, `${theme}：带文字和线条的页面导出差异 ${(res.ratio * 100).toFixed(2)}%`);
    }
    assert.deepEqual(errors, []);
    await context.close();
});

test('自动抠图：去掉和边缘连通的纯色背景，保留主体（包括主体里和背景同色的部分）', async () => {
    const { page, context } = await open();
    const r = await page.evaluate(async () => {
        const cv = document.createElement('canvas');
        cv.width = 300;
        cv.height = 200;
        const g = cv.getContext('2d');
        g.fillStyle = '#f4f4f2';
        g.fillRect(0, 0, 300, 200);
        g.fillStyle = '#3355cc';
        g.fillRect(60, 40, 180, 120);
        g.fillStyle = '#f4f4f2'; // 主体中间一块和背景同色，不应该被去掉
        g.fillRect(130, 80, 40, 40);
        const res = await Studio.cutout(cv.toDataURL('image/png'), 50);
        const im = new Image();
        im.src = res.url;
        await im.decode();
        const c2 = new OffscreenCanvas(res.w, res.h);
        const g2 = c2.getContext('2d');
        g2.drawImage(im, 0, 0);
        const a = (x, y) => g2.getImageData(x, y, 1, 1).data[3];
        return { w: res.w, h: res.h, removed: res.removed, body: a(10, 10), hole: a(res.w / 2, res.h / 2) };
    });
    assert.ok(Math.abs(r.w - 184) <= 4 && Math.abs(r.h - 124) <= 4, `应该裁掉四周的背景：${r.w}×${r.h}`);
    assert.ok(r.removed > 0.55, `背景被去掉的比例 ${r.removed}`);
    assert.equal(r.body, 255);
    assert.equal(r.hole, 255, '主体内部和背景同色的区域不应该被抠掉');
    await context.close();
});

test('智能抠图：真实照片里识别出主体（人像、物品），背景变透明', async () => {
    const { page, context, errors } = await open();
    for (const [name, inside] of [['astronaut', [0.45, 0.25]], ['coffee', [0.5, 0.5]]]) {
        const url = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'tests/fixtures', name + '.jpg')).toString('base64');
        const r = await page.evaluate(async ({ u, at }) => {
            const res = await Studio.aiCutout(u, 50);
            const im = new Image();
            im.src = res.url;
            await im.decode();
            const c = new OffscreenCanvas(res.w, res.h);
            const g = c.getContext('2d');
            g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, res.w, res.h).data;
            // 按原图里的相对位置取透明度（裁掉的部分算全透明）
            const a = (fx, fy) => {
                const x = Math.round(fx * (res.box.W - 1)) - res.box.x;
                const y = Math.round(fy * (res.box.H - 1)) - res.box.y;
                if (x < 0 || y < 0 || x >= res.w || y >= res.h) return 0;
                return d[(y * res.w + x) * 4 + 3];
            };
            return { removed: res.removed, subject: a(at[0], at[1]), corner: a(0.98, 0.03) };
        }, { u: url, at: inside });
        assert.ok(r.removed > 0.2 && r.removed < 0.9, `${name}：去掉的比例 ${r.removed}`);
        assert.ok(r.subject > 200, `${name}：主体应该保留（透明度 ${r.subject}）`);
        assert.ok(r.corner < 30, `${name}：背景应该变透明（透明度 ${r.corner}）`);
    }
    assert.deepEqual(errors, []);
    await context.close();
});

test('编辑器：快捷键加粗、列表自动续行、预览实时更新', async () => {
    const { page, context } = await open();
    await page.evaluate(() => Studio.setText(''));
    const ed = page.locator('#editor');
    await ed.click();
    await page.keyboard.type('你好世界');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('ControlOrMeta+b');
    assert.equal(await ed.inputValue(), '**你好世界**');

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- 第一项');
    await page.keyboard.press('Enter');
    await page.keyboard.type('第二项');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(await ed.inputValue(), '**你好世界**\n- 第一项\n- 第二项\n');

    await page.waitForFunction(() => Studio.state.model.doc.blocks.filter((b) => b.type === 'li').length === 2);
    await context.close();
});

test('草稿自动保存，刷新后还在', async () => {
    const { page, context } = await open();
    await page.locator('#editor').fill('# 我的草稿\n刷新以后应该还在');
    await page.locator('.theme-card[data-theme="night"]').click();
    await page.waitForFunction(() => document.querySelector('#saveState').textContent === '已自动保存');
    await page.reload();
    await page.evaluate(() => window.Studio.ready);
    assert.equal(await page.locator('#editor').inputValue(), '# 我的草稿\n刷新以后应该还在');
    assert.equal(await page.evaluate(() => Studio.state.settings.theme), 'night');
    assert.match(await page.locator('#draftTitle').textContent(), /我的草稿/);
    await context.close();
});

test('手机宽度下可以切换写作 / 预览 / 样式，手机预览能渲染', async () => {
    const { page, context, errors } = await open({ viewport: { width: 390, height: 844 } });
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHScroll, false, '手机宽度下不应该出现横向滚动');
    await page.locator('#mobileTabs [data-pane="preview"]').click();
    await assert.doesNotReject(page.locator('#grid .thumb').first().waitFor({ state: 'visible' }));
    await page.locator('#viewSeg [data-view="phone"]').click();
    await page.locator('.phone .ph-track .ph-page').first().waitFor({ state: 'visible' });
    await page.locator('.phone-switch [data-mode="feed"]').click();
    await page.locator('.ph-mine .pg').waitFor({ state: 'attached' });
    await page.locator('#mobileTabs [data-pane="settings"]').click();
    await page.locator('.theme-card[data-theme="ink"]').click();
    assert.equal(await page.evaluate(() => Studio.state.settings.theme), 'ink');
    assert.deepEqual(errors, []);
    await context.close();
});
