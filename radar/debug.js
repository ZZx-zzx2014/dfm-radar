/* 3D 加载诊断（临时）—— 捕获 fetch / Worker / 运行时错误，显示在页面顶部 */
(function () {
  "use strict";
  var recs = [], box = null;

  function show() {
    if (!box) {
      box = document.createElement("div");
      box.id = "dfd";
      box.style.cssText = [
        "position:fixed", "left:8px", "right:8px", "top:8px", "z-index:99999",
        "background:rgba(0,0,0,.88)", "color:#ffd040",
        "font:11.5px/1.5 ui-monospace,Menlo,monospace",
        "padding:8px 10px", "border-radius:9px", "white-space:pre-wrap",
        "max-height:44vh", "overflow:auto", "border:1px solid rgba(255,208,64,.45)"
      ].join(";");
      box.addEventListener("click", function () { box.remove(); box = null; recs = []; });
      document.body.appendChild(box);
    }
    box.textContent = "【3D 诊断 · 点我关闭】\n" + recs.join("\n");
  }
  function add(s) {
    recs.push(String(s).slice(0, 220));
    if (recs.length > 10) recs.shift();
    show();
  }

  /* 1) fetch */
  var of = window.fetch;
  if (of) {
    window.fetch = function (u, o) {
      var url = (typeof u === "string") ? u : (u && u.url) || "";
      return of.apply(this, arguments).then(
        function (r) { if (/models|worker|\.json/i.test(url)) add("fetch " + url + "  →  " + r.status); return r; },
        function (e) { add("fetch " + url + "  →  失败 " + e.name + ": " + e.message); throw e; }
      );
    };
  }

  /* 2) Worker */
  var OW = window.Worker;
  if (OW) {
    window.Worker = function (u, o) {
      add('new Worker("' + u + '")');
      try {
        var w = new OW(u, o);
        w.addEventListener("error", function (e) {
          add("Worker error: " + (e.message || e.filename || "?"));
        });
        return w;
      } catch (e) {
        add("Worker 构造失败: " + e.name + ": " + e.message);
        throw e;
      }
    };
    window.Worker.prototype = OW.prototype;
  }

  /* 3) 全局错误 */
  window.addEventListener("error", function (e) {
    var f = (e.filename || "").split("/").pop();
    add("error: " + (e.message || "?") + (f ? "  @" + f + ":" + (e.lineno || 0) : ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    add("reject: " + (r && r.name ? (r.name + ": " + r.message) : String(r)));
  });
})();
