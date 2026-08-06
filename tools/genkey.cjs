#!/usr/bin/env node
// 发卡工具：生成离线签名卡密（与 server.js 的 LICENSE_SECRET 保持一致）
// 用法：node tools/genkey.cjs [有效天数]   （默认 365 = 一年）
// 例：
//   node tools/genkey.cjs          → 生成一年卡密
//   node tools/genkey.cjs 730      → 生成两年卡密
// 注意：若 server.js 用环境变量 LICENSE_SECRET 覆盖了密钥，这里也要设同样的环境变量再执行。

const crypto = require('crypto');

const SECRET = process.env.LICENSE_SECRET || 'kid-math-license-v1-2026';
const days = Math.max(1, parseInt(process.argv[2] || '365', 10));

// payload（9 字节二进制）：[版本=1(1字节)] [有效天数 days(4字节)] [序号 seq(4字节)]
// 注意：卡密只含“天数”，不含绝对到期时间——买家激活（创建家庭）那一刻才开始计时
// 编码用 hex（大小写无关，卡密可安全转大写显示）；签名取 HMAC-SHA256 前 16 字节的 hex
const buf = Buffer.alloc(9);
buf.writeUInt8(1, 0);                                  // 版本 v1
buf.writeUInt32BE(days, 1);                            // 有效天数 days
buf.writeUInt32BE(Date.now() % 0xffffffff, 5);         // seq（防同卡密重复绑定）
const b = buf.toString('hex');
const sig = crypto.createHmac('sha256', SECRET).update(b).digest('hex').slice(0, 32);
const raw = (b + '.' + sig).replace(/(.{4})/g, '$1-').replace(/-$/, '');

console.log('卡密：' + 'MATH-' + raw.toUpperCase());
console.log('有效期：' + days + ' 天（自买家激活之日起算，到期日 = 激活日 + ' + days + ' 天）');
