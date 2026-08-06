// 生成《小学算术练习系统 · 用户使用手册》Word 文档
// 运行：NODE_PATH=<workspace>/node_modules node docs/generate_usermanual.cjs
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, LevelFormat, BorderStyle, WidthType,
  ShadingType, PageBreak, Header, Footer, PageNumber,
} = require('docx');

const FONT = 'Microsoft YaHei';

// ---------- 辅助函数 ----------
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 320 },
    children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
  });
}
function bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60, line: 300 },
    children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
  });
}
function numbered(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { after: 60, line: 300 },
    children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
  });
}
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function makeTable(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: 'FDE9D9', type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: FONT, size: 22 })] })],
    })),
  });
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((c, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: String(c), font: FONT, size: 21 })] })],
    })),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [headerRow, ...bodyRows] });
}

// ---------- 内容 ----------
const children = [];

// 封面
children.push(new Paragraph({ spacing: { before: 1600 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '小学算术练习系统', font: FONT, size: 52, bold: true, color: 'E8743B' })] }));
children.push(new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '用户使用手册', font: FONT, size: 36, bold: true, color: '4A3B2A' })] }));
children.push(new Paragraph({ spacing: { before: 320 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '让算术练习变得有趣又高效', font: FONT, size: 24, color: '9B8A76' })] }));
children.push(new Paragraph({ spacing: { before: 120 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '适用年级：小学 1 ～ 6 年级', font: FONT, size: 22, color: '9B8A76' })] }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 一、产品简介
children.push(h1('一、产品简介'));
children.push(p('小学算术练习系统是一款专为小学生设计的趣味算术练习工具。孩子可以按自己的年级选择对应课程，用三种好玩的模式刷题攒积分，再用积分兑换家长准备的礼物，让练习更有动力。'));
children.push(p('系统严格按照小学课标出题，绝不超纲，覆盖一年级到六年级的全部算术内容。一个家庭可创建多个孩子账号，互不影响、数据隔离。'));

// 二、核心功能一览
children.push(h1('二、核心功能一览'));
children.push(bullet('多孩子 / 多家庭：一个家庭可添加多个小朋友，各有独立头像、年级与积分。'));
children.push(bullet('三种练习模式：练习模式、计时模式、闯关模式，满足不同练习需求。'));
children.push(bullet('积分激励：答对得分、每日封顶 100 分，既鼓励又防止沉迷。'));
children.push(bullet('错题本：做错的题目自动收集，订正正确后自动移出，针对性巩固。'));
children.push(bullet('礼品店：家长设置奖品与所需积分，孩子用积分兑换，把努力变成奖励。'));
children.push(bullet('家长面板：管理孩子、管理奖品、查看统计、修改密码、卡密续费。'));
children.push(bullet('年费授权：一张激活卡密对应一个家庭，有效期一年，激活当天起算。'));

// 三、快速开始（激活）
children.push(h1('三、快速开始：激活与创建家庭'));
children.push(p('首次打开系统网页后，按以下步骤创建你的家庭：'));
children.push(numbered('在首页点「创建家庭」。'));
children.push(numbered('设置一串家庭 PIN（4～8 位数字），全家人共用，请记好。'));
children.push(numbered('输入卖家提供给你的激活卡密，格式类似：MATH-XXXX-XXXX-XXXX。'));
children.push(numbered('点「创建家庭」，提示成功即激活完成，有效期一年（从当天起算）。'));
children.push(p('提示：一张卡密只能绑定一个家庭，但一个家庭内不限制设备数量。家人换手机或平板，只需用 PIN「加入家庭」即可，无需新卡密。', { italics: true, color: '9B8A76' }));

// 四、孩子怎么用
children.push(h1('四、孩子怎么用'));
children.push(numbered('首页选择自己的头像（没有的话请家长先在家长面板添加）。'));
children.push(numbered('选择所在年级（一年级～六年级）。'));
children.push(numbered('选择要练的题型，例如「20 以内加法」「乘法口诀」等。'));
children.push(numbered('选择一种玩法：练习 / 计时 / 闯关。'));
children.push(numbered('开始做题，页面会实时显示对错与积分变化。'));
children.push(numbered('错题会自动进入错题本，在错题本里订正，订正正确后就会移出。'));
children.push(numbered('攒够积分后，去「礼品店」兑换家长准备好的礼物。'));

// 五、家长怎么用
children.push(h1('五、家长怎么用'));
children.push(p('在首页或孩子界面点「切换到家长」，输入家庭 PIN 即可进入家长面板。'));
children.push(bullet('孩子管理：添加 / 删除孩子，设置头像与年级。'));
children.push(bullet('礼品管理：添加礼物，并设置兑换所需的积分。'));
children.push(bullet('兑换记录：查看孩子兑换了哪些礼物。'));
children.push(bullet('统计：查看每个孩子的做题正确率与累计积分。'));
children.push(bullet('设置：修改家长 PIN；卡密到期前在此续费。'));

// 六、三种玩法模式
children.push(h1('六、三种玩法模式'));
children.push(h2('练习模式'));
children.push(p('稳扎稳打的日常练习。每答对一题得 1 分，答错不得分也不扣分，适合巩固基础。'));
children.push(h2('计时模式'));
children.push(p('限时挑战，越快答对加分越多：3 秒以内答对得 2 分，超过 3 秒答对得 1 分，答错不得分。锻炼孩子的反应速度。'));
children.push(h2('闯关模式'));
children.push(p('关卡挑战，按正确率计分：'));
children.push(bullet('正确率达到 80% 及以上即通关，按答对题数给分；'));
children.push(bullet('全部答对（100%）额外奖励 5 分；'));
children.push(bullet('正确率不足 80% 视为未通关，本关不计分（答对也不加分），鼓励孩子认真完成。'));

// 七、积分规则速查
children.push(h1('七、积分规则速查表'));
children.push(makeTable(
  ['场景', '得分'],
  [
    ['练习模式 答对', '+1'],
    ['练习模式 答错', '0（不扣）'],
    ['计时模式 ≤3 秒答对', '+2'],
    ['计时模式 >3 秒答对', '+1'],
    ['计时模式 答错', '0'],
    ['闯关 正确率 < 80%', '0（未通关）'],
    ['闯关 80%～99%', '按答对题数'],
    ['闯关 100%（全对）', '答对题数 +5'],
    ['错题订正', '0'],
    ['每日上限', '100 分 / 天'],
  ],
  [5000, 4360]
));
children.push(p('说明：每天累计得分最高 100 分，达到上限后当天不再加分，次日自动重置。', { italics: true, color: '9B8A76' }));

// 八、各年级题型（课标范围）
children.push(h1('八、各年级题型（严格按课标，不超纲）'));
children.push(makeTable(
  ['年级', '包含题型'],
  [
    ['一年级', '20 以内加减、100 以内加减'],
    ['二年级', '100 以内加减混合、乘法口诀、表内除法'],
    ['三年级', '万以内加减、多位数×一位数、除数是一位数、混合运算'],
    ['四年级', '三位数×两位数、除数是两位数、小数加减'],
    ['五年级', '小数乘除、分数加减（同分母）'],
    ['六年级', '分数乘法、百分数、四则混合'],
  ],
  [2400, 6960]
));

// 九、常见问题
children.push(h1('九、常见问题（FAQ）'));
children.push(h2('Q1：激活时提示「卡密无效」？'));
children.push(p('请仔细核对卡密的每一个字符，注意不要多复制空格；仍不行请联系卖家重新发卡。'));
children.push(h2('Q2：换手机 / 平板了怎么办？'));
children.push(p('同一家庭无需新卡密，直接用家庭 PIN 在首页「加入家庭」即可，卡密绑定的是家庭而非设备。'));
children.push(h2('Q3：忘记家庭 PIN 了？'));
children.push(p('在本机家长面板的「设置」里可以修改（需验证原 PIN）。如忘记原 PIN，请联系卖家协助。'));
children.push(h2('Q4：卡密到期了？'));
children.push(p('系统会提前提示剩余天数。到期后联系卖家续费，在续费页输入新卡密即可继续使用，数据不受影响。'));
children.push(h2('Q5：答错会扣分吗？'));
children.push(p('不会。答错只是不得分，不扣分，保护孩子的积极性。'));

// 十、温馨提示
children.push(h1('十、温馨提示'));
children.push(bullet('每天积分上限 100 分，既给足激励又避免沉迷，建议每天坚持一点点。'));
children.push(bullet('题目严格按小学课标范围，不超纲，可放心使用。'));
children.push(bullet('鼓励孩子先练「练习模式」打基础，再用「计时 / 闯关」挑战自我。'));
children.push(bullet('家长可结合礼品店，把积分兑换变成孩子的小目标，让练习更有成就感。'));

children.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '— 祝您和孩子的算术练习之旅愉快！ —', font: FONT, size: 22, color: 'E8743B' })] }));

// ---------- 文档 ----------
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: 'E8743B' },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: '4A3B2A' },
        paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '小学算术练习系统 · 用户使用手册', font: FONT, size: 16, color: 'B0A088' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '第 ', font: FONT, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 }), new TextRun({ text: ' 页', font: FONT, size: 16 })] })] }) },
    children,
  }],
});

const out = path.join(__dirname, '用户使用手册.docx');
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log('已生成：', out, '大小', buf.length, '字节'); });
