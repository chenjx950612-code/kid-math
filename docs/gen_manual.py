# -*- coding: utf-8 -*-
"""小学算术练习系统 - 使用手册 PDF 生成脚本"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem, HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

# ---- 字体 ----
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
FONT = 'STSong-Light'

BASE = os.path.dirname(os.path.abspath(__file__))
# 脚本本身位于 docs/ 目录，PDF 直接生成到该目录
OUT = os.path.join(BASE, '小学算术练习系统-使用手册.pdf')
os.makedirs(BASE, exist_ok=True)

# ---- 配色（与系统主题一致）----
PURPLE = colors.HexColor('#7c4dff')
CORAL = colors.HexColor('#ff6b6b')
TEAL = colors.HexColor('#26c6da')
INK = colors.HexColor('#2b2b3a')
SOFT = colors.HexColor('#f4f1ff')
GREEN = colors.HexColor('#2e9e5b')

# ---- 样式 ----
ss = getSampleStyleSheet()
def mk(name, **kw):
    kw.setdefault('fontName', FONT)
    return ParagraphStyle(name, parent=ss['Normal'], **kw)

title_style = mk('T', fontSize=26, leading=34, textColor=PURPLE, alignment=TA_CENTER, spaceAfter=6)
sub_style = mk('S', fontSize=13, leading=20, textColor=colors.grey, alignment=TA_CENTER)
h1 = mk('H1', fontSize=17, leading=24, textColor=PURPLE, spaceBefore=14, spaceAfter=8)
h2 = mk('H2', fontSize=13.5, leading=20, textColor=CORAL, spaceBefore=10, spaceAfter=5)
body = mk('B', fontSize=10.5, leading=17, textColor=INK, spaceAfter=6, alignment=TA_LEFT)
bullet = mk('BU', fontSize=10.5, leading=16, textColor=INK)
note = mk('N', fontSize=10, leading=15, textColor=INK)
small = mk('SM', fontSize=9, leading=13, textColor=colors.grey)
cell = mk('C', fontSize=10, leading=14, textColor=INK)
cellb = mk('CB', fontSize=10, leading=14, textColor=colors.white)

def P(t, s=body): return Paragraph(t, s)

def callout(text, bg=SOFT, border=PURPLE):
    t = Table([[P(text, note)]], colWidths=[165*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 1, border),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBEFORE', (0, 0), (0, -1), 4, border),
    ]))
    return t

def bullets(items):
    return ListFlowable(
        [ListItem(P(i, bullet), leftIndent=6) for i in items],
        bulletType='bullet', start='•', leftIndent=14, bulletColor=PURPLE,
    )

def section_table(rows, header=True, colw=None):
    data = []
    for r in rows:
        data.append([P(c, cellb if (header and r is rows[0]) else cell) for c in r])
    t = Table(data, colWidths=colw or [40*mm, 125*mm], hAlign='LEFT')
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), PURPLE) if header else ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d9d2f5')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, SOFT]),
    ]
    t.setStyle(TableStyle(style))
    return t

# ---- 内容 ----
story = []

# 封面
story.append(Spacer(1, 40*mm))
story.append(P('小学算术练习系统', title_style))
story.append(P('使用手册', sub_style))
story.append(Spacer(1, 6*mm))
story.append(HRFlowable(width='40%', thickness=2, color=CORAL, spaceBefore=4, spaceAfter=10, hAlign='CENTER'))
story.append(P('适合 1–6 年级 · 多家庭隔离 · 积分激励 · iPad 可添加到主屏幕', sub_style))
story.append(Spacer(1, 30*mm))
story.append(P('版本：v1.0 ｜ 更新日期：2026-08-05', small))
story.append(P('部署方式：飞牛 NAS（Docker） / 任意 Node 服务器', small))
story.append(PageBreak())

# 1. 系统简介
story.append(P('一、系统简介', h1))
story.append(P('本系统是一套面向小学生的算术练习与积分激励工具。家长为每个孩子建立档案，孩子通过练习赚取积分，再用积分兑换家长设置的奖励（贴纸、糖果、动画时间等），形成"练习→积分→兑换"的正向循环。', body))
story.append(P('核心特点：', h2))
story.append(bullets([
    '按年级出题，不超纲（1 年级不出现乘除法，3 年级起才接触乘除）。',
    '三种练习模式：练习、计时、闯关，逐步提升难度。',
    '积分激励 + 礼品兑换，错题自动收入错题本可订正。',
    '多家庭隔离：每个家庭独立数据，适合多娃家庭或分享给朋友使用。',
    'iPad 可添加到主屏幕，孩子像用 App 一样点开即用。',
    '飞牛 NAS 自托管，数据完全掌握在自己手里。',
]))
story.append(PageBreak())

# 2. 首次使用与家庭
story.append(P('二、首次使用：创建或加入家庭', h1))
story.append(P('系统采用"家庭"作为数据隔离单位。每个家庭用一组 4–8 位数字 PIN 来标识。第一次打开系统时，会看到两个入口：', body))
story.append(P('① 创建家庭（首次使用）', h2))
story.append(bullets([
    '选择"创建家庭"，输入一个 4–8 位的数字 PIN（例如 1234）。',
    '该 PIN 即为此后进入本家庭的钥匙，请牢记。',
    '创建后系统会自动生成默认礼品清单，可直接使用或自行修改。',
]))
story.append(P('② 加入已有家庭（家人 / 朋友）', h2))
story.append(bullets([
    '家人（如另一台手机、另一半的设备）打开系统后，选择"加入家庭"。',
    '输入同一个家庭 PIN，即可进入同一个家庭，看到相同的孩子和积分数据。',
    '多台设备、多个家长输入同一 PIN = 同一个家庭 = 同一份数据。',
]))
story.append(callout('💡 提示：PIN 是全局唯一的。如果两个家庭恰好想用同一个 PIN，系统会拒绝后者。旧版数据（若有）会在首次启动时自动迁移进一个默认家庭。'))
story.append(callout('🔓 保持登录：家长 PIN 只需在本机验证一次，之后系统会记住登录状态，手机 / 平板从后台切回或重新打开都不再要求输入 PIN。若要把设备交给孩子或借给他人，请在「设置 → 切换/退出家庭」中退出，下次打开将重新要求 PIN。', bg=colors.HexColor('#e8f0ff'), border=TEAL))
story.append(PageBreak())

# 3. 家长面板
story.append(P('三、家长面板功能', h1))
story.append(P('在首页选择"家长"，输入本家庭的 PIN 即可进入家长面板。', body))

story.append(P('3.1 添加与管理孩子', h2))
story.append(bullets([
    '点击"添加孩子"，填写昵称（≤12 字）、选择头像、选择年级（1–6）。',
    '"改年级"按钮可调整孩子所在年级，题目难度随之变化。',
    '"删除"按钮可移除孩子，该孩子的练习记录、积分、错题将一并清除（不可恢复）。',
]))

story.append(P('3.2 礼品管理', h2))
story.append(bullets([
    '点击"添加礼品"，填写名称、图标（emoji）、所需积分，开启"启用"即上架。',
    '礼品列表按所需积分从小到大排列，方便孩子选择。',
    '可随时上/下架礼品，或删除不再发放的礼品。',
]))

story.append(P('3.3 积分兑换管理', h2))
story.append(bullets([
    '孩子兑换礼品后，会在此出现一条待发放记录。',
    '家长实际发放奖品后，点击"标记已发放"即可核销。',
]))

story.append(P('3.4 修改家长 PIN', h2))
story.append(bullets([
    '在设置中输入旧 PIN 和新 PIN（4–8 位数字）。',
    '新 PIN 不能与系统中其他家庭重复。',
    '默认 PIN 为 1234，建议首次使用后立即修改。',
]))

story.append(P('3.5 切换 / 退出家庭', h2))
story.append(bullets([
    '在设置中可"退出当前家庭"，返回到家庭选择页。',
    '之后可用其他 PIN 加入另一个家庭（例如切换到朋友的家庭）。',
]))

story.append(P('3.6 查看统计与错题本', h2))
story.append(bullets([
    '进入某个孩子的详情，可看到总题数、正确率、积分、近期积分流水。',
    '错题本自动汇总孩子答错的题目，供针对性订正。',
]))
story.append(PageBreak())

# 4. 孩子使用
story.append(P('四、孩子如何使用', h1))
story.append(P('在首页选择对应孩子的头像即可进入。', body))

story.append(P('4.1 三种练习模式', h2))
story.append(section_table([
    ['模式', '说明'],
    ['练习', '普通练习，不计时。答对 +2，答错 −1。'],
    ['计时', '限时练习，答对除基础分外，按速度加成：≤3 秒 +2，≤6 秒 +1。'],
    ['闯关', '达到 80% 正确率即通关，额外 +10 分。'],
], colw=[30*mm, 135*mm]))

story.append(P('4.2 积分规则', h2))
story.append(section_table([
    ['行为', '积分'],
    ['答对一题', '+2'],
    ['答错一题', '−1（积分可暂时为负）'],
    ['计时速度加成', '≤3 秒 +2，≤6 秒 +1'],
    ['闯关通关（正确率≥80%）', '额外 +10'],
    ['错题订正正确', '+1'],
    ['兑换礼品', '扣除对应积分'],
], colw=[55*mm, 110*mm]))
story.append(callout('⚠️ 每日积分上限：每个孩子每天获得的积分（实际净增）累计最多 100 分。注意是按"实际加到孩子账户上的积分"封顶——做错的题 -1 会真实减少当天净增，不会虚占额度，所以孩子要真正攒到 100 分才会封顶。达到上限后不再增加（扣分仍生效），第二天本地时间零点自动重置为 0。该上限是为了防止孩子一天刷太多积分。', bg=colors.HexColor('#fff4e6'), border=CORAL))

story.append(P('4.3 礼品兑换', h2))
story.append(bullets([
    '在"礼品店"选择想兑换的礼品，积分足够时点击兑换。',
    '礼品店列表按所需积分从小到大排列。',
    '兑换后等待家长在面板中发放实物奖励。',
]))

story.append(P('4.4 错题订正', h2))
story.append(bullets([
    '在错题本中选择一道错题，重做一遍。',
    '订正正确得 +1 分，并自动移出错题本。',
]))
story.append(PageBreak())

# 5. iPad 主屏幕
story.append(P('五、iPad / iPhone 添加到主屏幕', h1))
story.append(P('系统已配置可爱风图标，可像 App 一样放在主屏幕：', body))
story.append(bullets([
    '用 Safari 打开系统网址。',
    '点击底部工具栏的"分享"按钮（方框带向上箭头）。',
    '向下滑动，选择"添加到主屏幕"。',
    '可自定义名称（如"算术乐园"），点击"添加"。',
    '主屏幕即出现可爱图标，孩子点开即用，体验接近原生 App。',
]))
story.append(callout('✅ 添加后，系统会全屏运行、隐藏浏览器地址栏，孩子不会被其它网页干扰。'))

# 6. 一键更新
story.append(P('六、一键更新系统', h1))
story.append(bullets([
    '家长面板 → 设置 → 点击"🔄 一键更新系统"。',
    '输入超级管理员密码（部署时设定，默认 061204）。',
    '系统从 GitHub 拉取最新代码并自动重启，所有打开的页面会自动刷新到最新版。',
    '若已是最新版本，会提示"已经是最新版本"，不会误重启。',
]))
story.append(PageBreak())

# 7. 多家庭数据隔离（重点）
story.append(P('七、多家庭数据隔离说明（重点）', h1))
story.append(P('这是很多用户关心的问题：不同家庭的数据会不会搞混？答案是——不会。', body))
story.append(P('隔离机制', h2))
story.append(bullets([
    '所有数据按"家庭"分桶存储，每个家庭拥有自己独立的一份数据对象。',
    '每一次接口请求都通过请求头中的家庭 ID 来识别身份；缺失或无效的家庭 ID 会被拒绝（返回 401），根本读不到任何数据。',
    '家庭 PIN 全局唯一：两个家庭无法使用同一个 PIN，从根本上避免串号。',
]))
story.append(P('下表列出每个家庭完全独立的数据维度：', body))
story.append(section_table([
    ['数据维度', '是否独立'],
    ['孩子档案（昵称/头像/年级）', '✅ 独立'],
    ['积分余额与每日累计', '✅ 独立'],
    ['礼品清单', '✅ 独立'],
    ['练习记录与答题明细', '✅ 独立'],
    ['错题本', '✅ 独立'],
    ['积分兑换记录', '✅ 独立'],
    ['家长 PIN', '✅ 独立且全局唯一'],
], colw=[90*mm, 75*mm]))
story.append(callout('🔒 结论：每个家庭的练习题、积分、礼品、错题、兑换完全互不干扰。A 家庭的孩子积分不会因为 B 家庭的操作而变化；A 家庭也看不到 B 家庭的任何数据。多台设备只要输入同一 PIN，就是同一份数据；输入不同 PIN，就是不同的、隔离的家庭。', bg=colors.HexColor('#e8f8ee'), border=GREEN))
story.append(PageBreak())

# 8. 部署与维护
story.append(P('八、部署与日常维护（飞牛 NAS 简版）', h1))
story.append(P('部署（首次）', h2))
story.append(bullets([
    'SSH 进入飞牛，克隆仓库：git clone https://github.com/chenjx950612-code/kid-math.git',
    '进入目录：cd kid-math',
    '启动：docker compose up -d',
    '浏览器访问：http://飞牛IP:3333',
]))
story.append(P('升级', h2))
story.append(bullets([
    '最简单：网页内点"一键更新系统"（需超级管理员密码）。',
    '或 SSH 执行：cd kid-math && git pull && docker compose up -d --build',
]))
story.append(P('数据备份', h2))
story.append(bullets([
    '所有数据位于 kid-math/data/data.json。',
    '升级前建议先复制此文件备份，以防迁移异常。',
]))
story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width='100%', thickness=0.6, color=colors.grey))
story.append(P('本手册配套系统源码：https://github.com/chenjx950612-code/kid-math  ｜  如遇问题可查阅仓库 README 或联系维护者。', small))

# ---- 生成 ----
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=22*mm, rightMargin=22*mm, topMargin=20*mm, bottomMargin=18*mm,
    title='小学算术练习系统 使用手册', author='kid-math',
)
def footer(canvas, d):
    canvas.saveState()
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.grey)
    canvas.drawString(22*mm, 10*mm, '小学算术练习系统 · 使用手册')
    canvas.drawRightString(A4[0]-22*mm, 10*mm, '第 %d 页' % d.page)
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('PDF 已生成：', OUT)
print('文件大小：', round(os.path.getsize(OUT)/1024, 1), 'KB')
