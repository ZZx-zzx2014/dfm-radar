/* ==========================================================================
   DFM 雷达 · 3D 模型跨域修复
   ---------------------------------------------------------------------------
   背景：模型清单请求被发往「雷达节点」 http://cheap-host1.cheapyun.com:<port>/models/<名字>，
        而节点的 CORS 头是写死的：
            Access-Control-Allow-Origin: http://enenh.com
        所以从这里（http://172.16.128.114:9191）跨域请求会被浏览器拦掉 —— Safari 报 "Load failed"。

   修法：把发往节点的 /models/ 请求改写成「同源」路径 /models/...，
        由本机 nginx 反代到节点（服务端之间没有 CORS 限制），浏览器端就成了同源请求。

   注意：模型本体（*.cmecloud.cn 的临时签名直链）本身 CORS 是 `*`，不需要处理。
   ========================================================================== */
(function () {
  "use strict";
  var NODE_MODELS = /^https?:\/\/cheap-host1\.cheapyun\.com:\d+\/models\//i;

  var of = window.fetch;
  if (of) {
    window.fetch = function (input, init) {
      var url = (typeof input === "string") ? input : (input && input.url) || "";
      if (NODE_MODELS.test(url)) {
        var same = url.replace(NODE_MODELS, "/models/");
        if (window.__dfmLog) window.__dfmLog("patch 改写: " + url + "  →  " + same);
        if (typeof input === "string") {
          input = same;
        } else {
          try { input = new Request(same, input); }
          catch (e) { input = same; }
        }
      }
      return of.call(this, input, init);
    };
  }

  /* 顺带把 Worker 的同类请求也管住（若模型在 worker 里取） */
  var OX = window.XMLHttpRequest;
  if (OX) {
    var open = OX.prototype.open;
    OX.prototype.open = function (method, url) {
      if (typeof url === "string" && NODE_MODELS.test(url)) {
        url = url.replace(NODE_MODELS, "/models/");
        if (window.__dfmLog) window.__dfmLog("patch xhr 改写 → " + url);
      }
      return open.apply(this, arguments);
    };
  }
})();
