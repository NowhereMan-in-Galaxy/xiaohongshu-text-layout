// 运行：npm test （或 node --test tests/unit）
const test = require('node:test');
const assert = require('node:assert/strict');
const Markdown = require('../../js/markdown.js');
const { parse, parseInline, adjustBreak, safeImageSrc } = Markdown;

const types = (src) => parse(src).blocks.map((b) => b.type);

test('行内格式：加粗 / 斜体 / 下划线 / 删除线 / 荧光笔 / 代码', () => {
    assert.equal(parseInline('**粗**'), '<strong>粗</strong>');
    assert.equal(parseInline('*斜*'), '<em>斜</em>');
    assert.equal(parseInline('__下__'), '<u>下</u>');
    assert.equal(parseInline('~~删~~'), '<del>删</del>');
    assert.equal(parseInline('==亮=='), '<mark>亮</mark>');
    assert.equal(parseInline('`a<b`'), '<code>a&lt;b</code>');
});

test('行内格式可以嵌套', () => {
    assert.equal(parseInline('**加粗里有==高亮==**'), '<strong>加粗里有<mark>高亮</mark></strong>');
    assert.equal(parseInline('*斜体里有**加粗**呀*'), '<em>斜体里有<strong>加粗</strong>呀</em>');
});

test('没有闭合的标记按原样输出，a == b 这类写法不会被误判', () => {
    assert.equal(parseInline('**没闭合'), '**没闭合');
    assert.equal(parseInline('a == b'), 'a == b');
    assert.equal(parseInline('5 * 3 * 2'), '5 * 3 * 2');
    assert.equal(parseInline('\\*不是斜体\\*'), '*不是斜体*');
});

test('HTML 会被转义，防止注入', () => {
    assert.equal(parseInline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(parseInline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('兼容旧版颜色语法，只接受十六进制颜色', () => {
    assert.equal(parseInline('[color:#ff4757]红[/color]'), '<span class="c" style="color:#ff4757">红</span>');
    assert.equal(parseInline('[color:red;background:url(x)]坏[/color]'), '[color:red;background:url(x)]坏[/color]');
});

test('#话题 标签，不误伤 C#', () => {
    assert.equal(parseInline('旅行 #云南攻略'), '旅行 <span class="tag">#云南攻略</span>');
    assert.equal(parseInline('#大理[话题]#'), '<span class="tag">#大理</span>');
    assert.equal(parseInline('我会 C#'), '我会 C#');
    assert.equal(parseInline('第 #1 名'), '第 #1 名');
});

test('链接只保留文字，不输出 URL', () => {
    assert.equal(parseInline('[官网](javascript:alert(1))'), '<span class="lnk">官网</span>');
});

test('每一行都是独立的段落，单个空行不产生额外留白', () => {
    assert.deepEqual(types('第一段\n第二段\n\n第三段'), ['p', 'p', 'p']);
});

test('连续多个空行会产生留白块（第一个空行是正常分段，之后每多一个空行多一行留白）', () => {
    const { blocks } = parse('A\n\n\n\nB');
    assert.deepEqual(blocks.map((b) => b.type), ['p', 'spacer', 'p']);
    assert.equal(blocks[1].size, 2);
});

test('标题级别：#### 及以下按三级标题处理，#话题 不是标题', () => {
    const { blocks, title } = parse('# 大标题\n## 二\n#### 四\n#话题');
    assert.deepEqual(blocks.map((b) => b.level || b.type), [1, 2, 3, 'p']);
    assert.equal(title, '大标题');
});

test('--- 是分页符，*** 是分隔线', () => {
    assert.deepEqual(types('A\n---\nB\n***\nC'), ['p', 'pagebreak', 'p', 'hr', 'p']);
});

test('有序列表自动连续编号，被其它内容打断后重新开始', () => {
    const { blocks } = parse('1. a\n1. b\n\n1. c\n段落\n3. d\n4. e');
    const nums = blocks.filter((b) => b.type === 'li').map((b) => b.number);
    assert.deepEqual(nums, [1, 2, 3, 3, 4]);
});

test('无序列表、待办清单、嵌套层级', () => {
    const { blocks } = parse('- 一\n  - 二\n• 三\n- [x] 完成\n- [ ] 未完成');
    assert.deepEqual(blocks.map((b) => [b.depth, b.task]), [[0, null], [1, null], [0, null], [0, true], [0, false]]);
});

test('引用：连续的 > 行合并成一个块', () => {
    const { blocks } = parse('> 第一行\n> 第二行\n正文');
    assert.equal(blocks[0].type, 'quote');
    assert.equal(blocks[0].html, '第一行<br>第二行');
    assert.equal(blocks[1].type, 'p');
});

test('表格：表头、对齐方式、缺失的单元格补齐', () => {
    const { blocks } = parse('| 名称 | 价格 |\n|:--|--:|\n| 咖啡 | 18 |\n| 蛋糕 |');
    const t = blocks[0];
    assert.equal(t.type, 'table');
    assert.deepEqual(t.header, ['名称', '价格']);
    assert.deepEqual(t.align, ['', 'right']);
    assert.deepEqual(t.rows, [['咖啡', '18'], ['蛋糕', '']]);
});

test('代码块内容原样保留并转义', () => {
    const { blocks } = parse('```js\nif (a < b) {}\n**不加粗**\n```\n后面');
    assert.equal(blocks[0].type, 'code');
    assert.equal(blocks[0].lang, 'js');
    assert.equal(blocks[0].html, 'if (a &lt; b) {}\n**不加粗**');
    assert.equal(blocks[1].type, 'p');
});

test('图片：只接受安全的地址', () => {
    assert.deepEqual(types('![猫](img:abc123)'), ['img']);
    assert.deepEqual(types('![猫](https://example.com/cat.png)'), ['img']);
    assert.deepEqual(types('![坏](javascript:alert(1))'), ['p']);
    assert.equal(safeImageSrc('data:image/svg+xml;base64,AAAA'), null);
    assert.equal(safeImageSrc('../../etc/passwd.png'), null);
});

test('字数统计忽略 Markdown 标记和空白', () => {
    assert.equal(parse('# 标题\n**加粗** 文字').stats.chars, 6);
});

test('断行：下一页不以标点开头', () => {
    const text = '今天天气很好，我们去公园';
    const k = text.indexOf('，');
    assert.equal(adjustBreak(text, k), k - 1);
});

test('断行：不把英文单词拦腰截断', () => {
    const text = '我喜欢 JavaScript 语言';
    const k = text.indexOf('Script');
    assert.equal(adjustBreak(text, k), text.indexOf('Java'));
});

test('断行：前一页不以左括号结尾', () => {
    const text = '这是一个「引号」例子';
    const k = text.indexOf('引');
    assert.equal(adjustBreak(text, k), k - 1);
});

test('图片行：宽度、对齐、同一行多张图并排', () => {
    const { imageLine, formatImages } = Markdown;
    assert.deepEqual(imageLine('![猫](img:a){40% left}'), [{ src: 'img:a', alt: '猫', width: 40, align: 'left' }]);
    assert.deepEqual(imageLine('![](img:a){右}')[0].align, 'right');
    assert.equal(imageLine('![](img:a){5%}')[0].width, 10, '宽度最小 10%');
    assert.equal(imageLine('![](img:a) ![](img:b)').length, 2);
    assert.equal(imageLine('文字 ![](img:a)'), null, '混着文字的不是图片行');
    assert.equal(imageLine('![](img:a) ![](javascript:x)'), null, '有不安全的地址就整行不当图片');
    const line = '![猫](img:a){55% right} ![](img:b)';
    assert.equal(formatImages(imageLine(line)), line, '写回去和原来一样');
    assert.equal(formatImages([{ src: 'img:a', alt: '', width: 100, align: 'center' }]), '![](img:a)', '默认值不写出来');

    const blocks = Markdown.parse('![](img:a) ![](img:b)\n![](img:c){50%}').blocks;
    assert.deepEqual(blocks.map((b) => b.type), ['imgrow', 'img']);
    assert.equal(Markdown.parse('![](img:a) ![](img:b)\n![](img:c)').stats.images, 3);
});
