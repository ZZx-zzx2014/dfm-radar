# 雷达前端 · 补丁目录（patches/）

## ⚠️ 为什么需要这个目录

雷达前端 `radar/assets/*.js` 是**构建产物**（Vite 打包 + 压缩），不是手写源码。
原始源码未随仓库提供，因此对前端的修改只能以**补丁**形式施加于构建产物之上。

> 这是权宜之计，不是终态。终态见文末「演进路线」。

**风险**：直接改压缩代码容易出现隐蔽错误（本项目已发生过 2 次：脚本嵌套、`return` 位置错误）。
**对策**：所有补丁必须
1. 在本目录留下记录（目标文件 / 原始片段 / 替换片段 / 原因）
2. 通过 `apply.js` **幂等重放**（可重复执行，不会重复注入）
3. 施加后必须通过语法校验与页面自检

---

## 补丁清单

| # | 文件 | 位置 | 目的 | 引入时间 |
|---|---|---|---|---|
| P1 | `assets/chunk-4OMNVZPZ.js` | socket URL 构造 | **https 页面走 wss 中继**（原本直连节点，https 下必失败） | 2026-10-03 |
| P2 | `index.html` | 内联脚本 | 卡密验证门（`?diag=1` 控制诊断浮层） | 2026-10-03 |
| P3 | `index.html` | 徽标 | 当前房间号浮标（点击复制） | 2026-10-03 |
| P4 | `index.html` | `<link>` | 商业主题 `theme-pro.css` | 2026-10-03 |
| P5 | `chat.js` | socket URL 构造 | 聊天走 `chat.fcefw.dpdns.org`（https 页面） | 2026-10-03 |
| P6 | `index.html` | 版本号 | `?v=N` 破缓存（HTML→app.js→chunk 三级） | 2026-10-03 |
| P7 | `theme-pro.css` | 新增文件 | 商业级设计令牌与组件精修 | 2026-10-03 |

---

## 关键约束（踩过的坑）

### 1. 脚本必须放在 `<body>` 内，或用 DOMContentLoaded 守卫
```js
/* ❌ 错误：脚本在 <head>，此时 document.body 为 null */
document.body.appendChild(mask);

/* ✅ 正确 */
function boot() { document.body.appendChild(mask); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
```
> 症状：弹框不出现、`appendChild of null` 报错。

### 2. 内联脚本里不能出现字面量 `<script>` / `</script>`
```html
<script>
  var s = '<script>';   <!-- ❌ 会提前终止脚本，后续代码被当文本渲染 -->
  var s = '<' + 'script>';  <!-- ✅ -->
</script>
```

### 3. `return` 只能在函数内部
```js
if (!flag) return;          // ❌ 顶层 return = 语法错误 → 整块脚本失效
(function(){ if(!flag) return; })();   // ✅
```

### 4. 修改后必须逐块语法校验
`patches/apply.js` 内置该步骤；手工改动也必须执行：
```bash
node --check <提取出来的脚本>
```

---

## 使用方法

```bash
# 幂等重放全部补丁（可反复执行）
node patches/apply.js

# 只检查不修改
node patches/apply.js --check
```

---

## 演进路线（终态）

| 阶段 | 做法 | 收益 |
|---|---|---|
| 现在 | 补丁作用于构建产物 | 可行但脆弱 |
| **A2（建议）** | 用**原生 ES Module 重写入口页**（加入房间页） | 无构建、可读、可维护 |
| A | 全量重写前端（地图/3D/聊天/价值面板） | 彻底摆脱构建产物 |

> 目标：**源码可读、改动可审、无需打补丁**。
