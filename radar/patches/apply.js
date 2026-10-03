#!/usr/bin/env node
/**
 * 雷达前端 · 补丁重放器（幂等）
 *
 *   node patches/apply.js            # 施加补丁（已施加的会跳过）
 *   node patches/apply.js --check     # 只检查，不写文件
 *   node patches/apply.js --list      # 列出补丁状态
 *
 * 设计原则：
 *   1. 每个补丁用 `mark` 判断是否已施加（幂等）
 *   2. `find` 必须唯一匹配，否则报错退出（避免误伤）
 *   3. 施加后对 .js 文件做 node --check
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const LIST = argv.includes('--list');

/* ============================================================
   补丁定义
   ============================================================ */
const PATCHES = [
  {
    id: 'P1',
    name: 'https 页面走 wss 中继',
    file: 'assets/chunk-4OMNVZPZ.js',
    desc: '原本 socket 地址永远直连雷达节点，https 下 wss://节点 不可用；改为 https 走 Cloudflare 隧道中继',
    mark: 'dfm_relay_host',
    find: 'return(o.protocol==="https:"?"wss:":"ws:")+"//"+t.host+":"+t.port+"/ws?room="+i}',
    replace: 'return(function(){var R="radar.fcefw.dpdns.org";try{var q=/[?&]relay=([^&]+)/.exec(location.search);'
           + 'if(q){R=decodeURIComponent(q[1]);localStorage.setItem("dfm_relay_host",R)}else{var v=localStorage.getItem("dfm_relay_host");if(v)R=v}}'
           + 'catch(e){}return o.protocol==="https:"?"wss://"+R+"/ws?room="+i:"ws://"+t.host+":"+t.port+"/ws?room="+i})()}'
  },
  {
    id: 'P5',
    name: '聊天走公网域名',
    file: 'chat.js',
    desc: '聊天地址原本用 location.host（GitHub Pages 无 /chat 接口）；改为 https 走 chat.fcefw.dpdns.org',
    mark: 'dfm_chat_host',
    find: 'var scheme = (location.protocol === "https:") ? "wss:" : "ws:";',
    replace: 'var CHAT_HOST=(function(){try{var q=/[?&]chathost=([^&]+)/.exec(location.search);'
           + 'if(q){var h=decodeURIComponent(q[1]);localStorage.setItem("dfm_chat_host",h);return h}'
           + 'var v=localStorage.getItem("dfm_chat_host");if(v)return v}catch(e){}return "chat.fcefw.dpdns.org"})();\n'
           + '    var scheme = (location.protocol === "https:") ? "wss:" : "ws:";'
  },
  {
    id: 'P4',
    name: '引入商业主题',
    file: 'index.html',
    desc: '加载 theme-pro.css（设计令牌 + 组件精修）',
    mark: 'theme-pro.css',
    find: '<link rel="stylesheet" href="./chat.css?v=8">',
    replace: '<link rel="stylesheet" href="./chat.css?v=8">\n  <link rel="stylesheet" href="./theme-pro.css?v=1">'
  }
];

/* ============================================================
   工具
   ============================================================ */
const color = (s, c) => `\x1b[${c}m${s}\x1b[0m`;
const ok = (s) => color('✓ ' + s, 32);
const bad = (s) => color('✗ ' + s, 31);
const warn = (s) => color('! ' + s, 33);

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}
function syntaxOk(rel) {
  const p = path.join(ROOT, rel);
  if (!/\.js$/.test(rel)) return true;
  try { execFileSync('node', ['--check', p], { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
}

/* ============================================================
   主流程
   ============================================================ */
let applied = 0, skipped = 0, failed = 0;

for (const p of PATCHES) {
  const src = read(p.file);
  if (src === null) { console.log(warn(`${p.id} ${p.name} — 文件不存在: ${p.file}`)); failed++; continue; }

  // 已施加？
  if (src.includes(p.mark)) {
    console.log(ok(`${p.id} ${p.name} — 已是最新（跳过）`));
    skipped++;
    continue;
  }
  // 能否匹配？
  const idx = src.indexOf(p.find);
  if (idx < 0) {
    console.log(bad(`${p.id} ${p.name} — 未匹配到目标片段（文件可能已变更或结构不同）`));
    failed++;
    continue;
  }
  if (src.indexOf(p.find, idx + 1) >= 0) {
    console.log(bad(`${p.id} ${p.name} — 目标片段出现多次，拒绝施加（避免误伤）`));
    failed++;
    continue;
  }

  if (CHECK || LIST) { console.log(warn(`${p.id} ${p.name} — 待施加（--check 未修改）`)); continue; }

  // 施加
  const out = src.slice(0, idx) + p.replace + src.slice(idx + p.find.length);
  fs.writeFileSync(path.join(ROOT, p.file), out, 'utf8');

  if (!syntaxOk(p.file)) {
    console.log(bad(`${p.id} ${p.name} — 施加后语法校验失败，已回滚`));
    fs.writeFileSync(path.join(ROOT, p.file), src, 'utf8');
    failed++;
    continue;
  }
  console.log(ok(`${p.id} ${p.name} — 已施加`));
  applied++;
}

console.log('\n' + color('──────────── 汇总 ────────────', 90));
console.log(`  新施加 ${applied} ｜ 已存在 ${skipped} ｜ 失败 ${failed}`);
if (failed) {
  console.log(color('  ⚠️ 有补丁未成功，请检查文件是否被上游更新覆盖', 33));
  process.exit(1);
}
console.log(color('  ✅ 全部补丁就绪', 32));
