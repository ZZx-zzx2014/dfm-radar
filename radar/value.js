/* ==========================================================================
   DFM 雷达 · 玩家价值面板（追加功能，不改动官方逻辑）
   原理：监听官方页面的 #active-room，房间号一变就另开一条只读连接，
        把该房间的带价物资按「坐标邻近」归给最近的玩家，算出推断价值。
   说明：物资字段里没有归属信息，所以这是【推断值】；且只有部分物资带 price。
   ========================================================================== */
(function () {
  "use strict";

  var NODES = {
    1: ["cheap-host1.cheapyun.com", 12831],
    2: ["cheap-host1.cheapyun.com", 17681],
    3: ["cheap-host1.cheapyun.com", 48303],
    4: ["cheap-host1.cheapyun.com", 13699],
    5: ["cheap-host1.cheapyun.com", 41092]
  };
  var RELAY_WSS = "/ws?room=";                 // https 页面走 wss 中继
  var RELAY_HOST = "imac-1.tailbdb43.ts.net";   // 中继所在主机（Tailscale）
  var SELF_HOSTS = ["imac-1.tailbdb43.ts.net", "127.0.0.1", "localhost"];
  var ADJUST_MS = 12000;                       // 心跳间隔
  var RADIUS_DEFAULT = 3000;                   // 邻近半径（厘米）= 30 米

  var ws = null, curRoom = null, hbTimer = null, lastMsg = 0, attempt = 0, alive = false;

  /* ---------- 面板骨架 ---------- */
  function build() {
    if (document.getElementById("dvp")) return;
    var d = document.createElement("div");
    d.id = "dvp";
    d.innerHTML =
      '<div id="dvp-head">' +
        '<i id="dvp-dot"></i><b>玩家价值</b>' +
        '<span id="dvp-state">等待房间</span>' +
      '</div>' +
      '<div id="dvp-body">' +
        '<div id="dvp-total"><b id="dvp-sum">0</b><em>已知价格合计</em></div>' +
        '<div class="dvp-sec"><h4><span>玩家 · 附近价值（附独占）</span><span>数值 / 件数</span></h4>' +
          '<div id="dvp-players"><div class="dvp-empty">未连接</div></div></div>' +
        '<div class="dvp-sec"><h4><span>带价物资</span><span id="dvp-icount">0 件</span></h4>' +
          '<div id="dvp-items"><div class="dvp-empty">—</div></div></div>' +
        '<div class="dvp-note">半径 <select id="dvp-radius">' +
          '<option value="1000">10 米</option>' +
          '<option value="3000" selected>30 米</option>' +
          '<option value="6000">60 米</option>' +
          '<option value="0">不限</option>' +
        '</select>　按坐标邻近推断，仅供参考</div>' +
      '</div>';
    document.body.appendChild(d);

    document.getElementById("dvp-head").addEventListener("click", function () {
      var d = document.getElementById("dvp");
      var opening = d.classList.contains("dvp-collapsed");
      d.classList.toggle("dvp-collapsed");
      d.classList.toggle("dvp-exp", opening);
      if (opening) {
        var o = document.getElementById("dfc");
        if (o) { o.classList.add("dfc-collapsed"); o.classList.remove("dfc-exp"); }
      }
    });
    var r = document.getElementById("dvp-radius");
    r.addEventListener("change", function () { if (curRoom) connect(curRoom); });
    r.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(v) { return (v || 0).toLocaleString("en-US"); }

  function setState(text, cls) {
    var d = $("dvp-dot"), s = $("dvp-state");
    if (d) d.className = (cls || "");
    if (s) s.textContent = text;
  }

  function nodeForRoom(n) { return (n >= 1000 && n <= 5999) ? Math.floor(n / 1000) : null; }

  function makeUrl(room) {
    // https 页面：浏览器禁止 ws://，只能走 wss 中继
    if (location.protocol === "https:") {
      var base = (SELF_HOSTS.indexOf(location.hostname) >= 0)
        ? ("wss://" + location.host)
        : ("wss://" + RELAY_HOST);
      return base + RELAY_WSS + room;
    }
    // http / file 页面：直连节点
    var nid = nodeForRoom(parseInt(room, 10));
    if (!nid) return null;
    var n = NODES[nid];
    return "ws://" + n[0] + ":" + n[1] + "/ws?room=" + room;
  }

  /* ---------- 连接管理 ---------- */
  function disconnect(silent) {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (ws) {
      try { ws.onclose = ws.onmessage = ws.onerror = null; ws.close(); } catch (e) {}
      ws = null;
    }
    alive = false;
    if (!silent) setState("未连接", "bad");
  }

  function connect(room) {
    disconnect(true);
    var url = makeUrl(room);
    if (!url) { setState("房间号无效", "bad"); return; }
    attempt = 0;
    open(room, url);
  }

  function open(room, url) {
    setState(attempt ? ("重连中 #" + attempt) : "连接中…");
    try { ws = new WebSocket(url); }
    catch (e) { setState("连接失败", "bad"); retry(room); return; }

    ws.onopen = function () {
      attempt = 0; alive = true; lastMsg = Date.now();
      setState("已连接", "on");
      try {
        ws.send(JSON.stringify({
          type: "hello", clientType: "web", room: room,
          clientName: "dfm-radar", version: 2
        }));
      } catch (e) {}
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () {
        if (!ws || ws.readyState !== 1) return;
        if (Date.now() - lastMsg > 35000) { try { ws.close(); } catch (e) {} return; }
        try { ws.send(JSON.stringify({ type: "heartbeat" })); } catch (e) {}
      }, ADJUST_MS);
    };

    ws.onmessage = function (ev) {
      lastMsg = Date.now();
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === "error") { setState(d.code === "room-not-found" ? "房间不存在" : "服务端错误", "bad"); return; }
      if (d.type === "welcome") { render((d.state || {}).nativeState); return; }
      if (d.type === "native-state") { render(d.state); return; }
      if (d.type === "snapshot") { render((d.state && d.state.nativeState) || d.state); return; }
    };

    ws.onclose = function () { alive = false; setState("已断开", "bad"); retry(room); };
    ws.onerror = function () { if (alive) setState("连接错误", "bad"); };
  }

  function retry(room) {
    if (room !== curRoom) return;
    attempt++;
    if (attempt > 6) { setState("放弃重连", "bad"); return; }
    setTimeout(function () {
      if (room !== curRoom) return;
      var u = makeUrl(room);
      if (u) open(room, u);
    }, Math.min(1200 * attempt, 6000));
  }

  /* ---------- 渲染 ---------- */
  function render(ns) {
    if (!ns) return;
    var mk = ns.markers || [];
    var players = mk.filter(function (m) { return m.kind === "ally" || m.kind === "player"; });
    var items = mk.filter(function (m) { return m.kind === "item" && m.price; })
                  .sort(function (a, b) { return b.price - a.price; });

    var radius = parseInt(($("dvp-radius") || {}).value || RADIUS_DEFAULT, 10);
    function d2(a, b) {
      var dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
      return dx * dx + dy * dy + dz * dz;
    }
    /* 两种口径同时算：
       ① 附近 —— 半径内所有物资都算（同一件可同时算给多个玩家）
       ② 独占 —— 每件只算给距离最近的那个玩家 */
    var near = {}, excl = {};
    players.forEach(function (p) { near[p.id] = { p: p, sum: 0, n: 0 }; excl[p.id] = 0; });
    items.forEach(function (it) {
      players.forEach(function (p) {
        var dd = d2(p, it);
        if (radius > 0 && Math.sqrt(dd) > radius) return;
        near[p.id].sum += it.price; near[p.id].n++;
      });
      var best = null, bd = Infinity;
      players.forEach(function (p) { var dd = d2(p, it); if (dd < bd) { bd = dd; best = p; } });
      if (best && !(radius > 0 && Math.sqrt(bd) > radius)) excl[best.id] += it.price;
    });
    var rows = Object.keys(near).map(function (k) {
      return { p: near[k].p, sum: near[k].sum, n: near[k].n, ex: excl[k] || 0 };
    }).sort(function (a, b) { return b.sum - a.sum; });

    var total = items.reduce(function (s, x) { return s + x.price; }, 0);
    if ($("dvp-sum")) $("dvp-sum").textContent = fmt(total);

    var pb = $("dvp-players");
    if (pb) {
      if (!rows.length) {
        pb.innerHTML = '<div class="dvp-empty">' +
          (ns.available === false ? "房间已建，玩家尚未进场" : (players.length ? "暂无带价物资可归属" : "暂无玩家")) +
          '</div>';
      } else {
        var max = rows[0].sum || 1;
        pb.innerHTML = rows.map(function (r) {
          var p = r.p, ally = p.kind === "ally";
          var color = ally ? "var(--dfm-ally, #4fd1b0)" : "var(--dfm-enemy, #ef6b73)";
          return '<div class="dvp-row"><i class="dvp-chip" style="background:' + color + '"></i>' +
                 '<span class="dvp-name"><span class="dvp-tag ' + (ally ? "dvp-ally" : "dvp-enemy") + '">' +
                 (ally ? "友" : "敌") + '</span> ' + esc(p.label) +
                 '<div class="dvp-bar"><i style="width:' + Math.round(100 * r.sum / max) +
                 '%;background:' + color + '"></i></div></span>' +
                 '<span class="dvp-val" style="color:' + color + '">' + fmt(r.sum) +
                 '<em>独占 ' + fmt(r.ex) + ' · ' + r.n + '件</em></span></div>';
        }).join("");
      }
    }

    var ib = $("dvp-items");
    if ($("dvp-icount")) $("dvp-icount").textContent = items.length + " 件";
    if (ib) {
      ib.innerHTML = items.length
        ? items.slice(0, 40).map(function (x) {
            return '<div class="dvp-row"><span class="dvp-name">' + esc(x.label) +
                   '</span><span class="dvp-val">' + fmt(x.price) + '</span></div>';
          }).join("")
        : '<div class="dvp-empty">暂无带价物资</div>';
    }
  }

  /* ---------- 监听官方页面的房间号 ---------- */
  var lastSeen = null;
  function watchRoom() {
    var el = $("active-room");
    if (el) {
      var v = (el.textContent || "").trim();
      if (!/^\d{4}$/.test(v)) v = null;
      if (v !== lastSeen) {
        lastSeen = v;
        curRoom = v;
        if (v) connect(v); else { disconnect(true); setState("等待房间"); clearPanel(); }
      }
    }
    setTimeout(watchRoom, 600);
  }
  function clearPanel() {
    ["dvp-players", "dvp-items"].forEach(function (id) {
      var e = $(id); if (e) e.innerHTML = '<div class="dvp-empty">未连接</div>';
    });
    if ($("dvp-sum")) $("dvp-sum").textContent = "0";
  }

  /* ---------- 深链：?room=1234 自动进入房间 ---------- */
  function deepLink() {
    var m = /[?&]room=(\d{4})/.exec(location.search);
    if (!m) return;
    var inp = document.getElementById("room-code");
    var btn = document.getElementById("join-button");
    if (!inp || !btn) return;
    inp.value = m[1];
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(function () { try { btn.click(); } catch (e) {} }, 500);
  }

  function boot() {
    build();
    render(null);
    setState("等待房间");
    if (window.innerWidth <= 720) {
      var p = document.getElementById("dvp"); if (p) p.classList.add("dvp-collapsed");
    }
    watchRoom();
    setTimeout(deepLink, 900);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
