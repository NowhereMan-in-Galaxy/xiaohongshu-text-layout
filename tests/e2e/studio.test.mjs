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
    browser = await chromium.launch();
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

test('导出的 PNG 尺寸正确，并且和屏幕上的渲染逐像素一致', async () => {
    const { page, context } = await open();
    for (const theme of ['cream', 'night', 'grid', 'candy']) {
        await page.evaluate((t) => Studio.setSettings({ theme: t }), theme);
        for (const i of [0, 1]) {
            // 1. 让浏览器正常渲染这一页，截图
            await page.evaluate((idx) => {
                const holder = document.createElement('div');
                holder.id = 'fidelity';
                holder.style.cssText = 'position:fixed;left:0;top:0;z-index:9999';
                holder.appendChild(Studio.buildPage(idx));
                document.body.appendChild(holder);
            }, i);
            await page.setViewportSize({ width: 1100, height: 1500 });
            const shot = await page.locator('#fidelity > .pg').screenshot();
            await page.evaluate(() => document.getElementById('fidelity').remove());

            // 2. 用导出功能生成图片，逐像素对比
            const result = await page.evaluate(async ({ idx, png }) => {
                const blob = await Studio.exportPage(idx, 1);
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
                for (let k = 0; k < da.length; k += 4) {
                    if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) diff++;
                }
                const big = await createImageBitmap(await Studio.exportPage(idx, 2));
                return { w: a.width, h: a.height, sw: b.width, sh: b.height, ratio: diff / (a.width * a.height), w2: big.width, h2: big.height };
            }, { idx: i, png: shot.toString('base64') });

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
