/* ==========================================================================
   DFM 雷达 · 房间聊天（追加功能）
   进入房间后自动连到「同房间号」的聊天频道；换房间自动切换频道。
   后端：服务器上的 chat_server.py（nginx 用 /chat 反代）
   ========================================================================== */
(function () {
  "use strict";

  var HISTORY_SHOWN = 60, MAX_LINES = 300;
  var ws = null, room = null, name = null, alive = false, retryN = 0, retryTimer = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hhmm(ts) {
    var d = ts ? new Date(ts * 1000) : new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function getName() {
    try {
      var v = localStorage.getItem("dfm_chat_name");
      if (v) return v;
    } catch (e) {}
    return "玩家" + Math.floor(1000 + Math.random() * 9000);
  }
  function saveName(v) {
    try { localStorage.setItem("dfm_chat_name", v); } catch (e) {}
  }

  /* ---------- 面板 ---------- */
  function build() {
    if ($("dfc")) return;
    var d = document.createElement("div");
    d.id = "dfc";
    d.className = "dfc-off";
    d.innerHTML =
      '<div id="dfc-head">' +
        '<i id="dfc-dot"></i>' +
        '<b>房间聊天</b>' +
        '<button id="dfc-name" title="点击改昵称"></button>' +
        '<span class="dfc-n" id="dfc-cnt"></span>' +
      '</div>' +
      '<div id="dfc-body">' +
        '<div id="dfc-list"></div>' +
        '<div id="dfc-foot">' +
          '<input id="dfc-input" maxlength="300" placeholder="说点什么…" autocomplete="off">' +
          '<button id="dfc-send">发送</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);

    $("dfc-head").addEventListener("click", function (e) {
      if (e.target.id === "dfc-name") return;
      var opening = d.classList.contains("dfc-collapsed");
      d.classList.toggle("dfc-collapsed");
      d.classList.toggle("dfc-exp", opening);
      if (opening) {
        var o = document.getElementById("dvp");
        if (o) { o.classList.add("dvp-collapsed"); o.classList.remove("dvp-exp"); }
      }
    });
    $("dfc-name").addEventListener("click", function (e) {
      e.stopPropagation();
      var v = prompt("你的昵称（最多 16 字）", name);
      if (v === null) return;
      v = String(v).trim().slice(0, 16);
      if (!v) return;
      name = v; saveName(v); $("dfc-name").textContent = name;
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: "hello", name: name })); } catch (err) {}
      }
    });
    $("dfc-send").addEventListener("click", send);
    $("dfc-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); send(); }
    });
  }

  function sys(text) {
    var l = $("dfc-list"); if (!l) return;
    var el = document.createElement("div");
    el.className = "dfc-m sys";
    el.textContent = text;
    l.appendChild(el);
    trim(l); scroll();
  }
  function line(n, t, ts, me) {
    var l = $("dfc-list"); if (!l) return;
    var el = document.createElement("div");
    el.className = "dfc-m" + (me ? " me" : "");
    var initial = String(n == null ? "?" : n).trim().slice(0, 1) || "?";
    el.innerHTML =
      '<span class="dfc-av">' + esc(initial) + '</span>' +
      '<span class="dfc-col">' +
        '<span class="dfc-meta"><span class="who">' + esc(n) + '</span> ' + hhmm(ts) + '</span>' +
        '<span class="txt">' + esc(t) + '</span>' +
      '</span>';
    l.appendChild(el);
    trim(l); scroll();
  }
  function trim(l) { while (l.children.length > MAX_LINES) l.removeChild(l.firstChild); }
  function scroll() { var l = $("dfc-list"); if (l) l.scrollTop = l.scrollHeight; }
  function setState(cls, txt) {
    var d = $("dfc-dot"); if (d) d.className = cls || "";
    var c = $("dfc-cnt"); if (c && txt != null) c.textContent = txt;
  }

  /* ---------- 连接 ---------- */
  function url(r) {
    var scheme = (location.protocol === "https:") ? "wss:" : "ws:";
    return scheme + "//" + location.host + "/chat?room=" + r + "&name=" + encodeURIComponent(name);
  }

  function close(silent) {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (ws) {
      try { ws.onclose = ws.onmessage = ws.onerror = null; ws.close(); } catch (e) {}
      ws = null;
    }
    alive = false;
    if (!silent) setState("bad", "已断开");
  }

  function open(r) {
    setState("", "连接中…");
    try { ws = new WebSocket(url(r)); }
    catch (e) { setState("bad", "连不上"); return; }
    ws.onopen = function () {
      retryN = 0; alive = true;
      setState("on", "已连接");
      try { ws.send(JSON.stringify({ type: "hello", name: name })); } catch (e) {}
      line("系统", "已进入 " + r + " 号房间的聊天", null, false);
    };
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === "history") {
        (d.items || []).slice(-HISTORY_SHOWN).forEach(function (it) {
          line(it.n, it.t, it.ts, it.n === name);
        });
        return;
      }
      if (d.type === "msg") { line(d.n, d.t, d.ts, d.n === name); return; }
      if (d.type === "sys") { sys(d.t); return; }
    };
    ws.onclose = function () {
      alive = false;
      if (r !== room) return;
      retryN++;
      setState("bad", "重连中 #" + retryN);
      retryTimer = setTimeout(function () { if (r === room) open(r); }, Math.min(1500 * retryN, 8000));
    };
    ws.onerror = function () { if (alive) setState("bad", "连接错误"); };
  }

  function send() {
    var i = $("dfc-input"); if (!i) return;
    var t = i.value.trim();
    if (!t) return;
    if (!ws || ws.readyState !== 1) { sys("还没连上，稍等一下"); return; }
    try { ws.send(JSON.stringify({ type: "msg", text: t })); } catch (e) { sys("发送失败"); return; }
    i.value = "";
  }

  /* ---------- 跟随官方页面的房间号 ---------- */
  var last = null;
  function watch() {
    var el = $("active-room");
    if (el) {
      var v = (el.textContent || "").trim();
      if (!/^\d{4}$/.test(v)) v = null;
      if (v !== last) {
        last = v; room = v;
        var panel = $("dfc");
        if (v) {
          panel.classList.remove("dfc-off");
          $("dfc-list").innerHTML = "";
          close(true);
          open(v);
        } else {
          panel.classList.add("dfc-off");
          close(true);
        }
      }
    }
    setTimeout(watch, 600);
  }

  function boot() {
    name = getName();
    build();
    if (window.innerWidth <= 720) {
      var p = $("dfc"); if (p) p.classList.add("dfc-collapsed");
    }
    $("dfc-name").textContent = name;
    watch();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
