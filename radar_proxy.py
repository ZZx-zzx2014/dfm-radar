#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DFM 雷达 · 本地中继（只绑 127.0.0.1）

用途：浏览器禁止 https 页面连接 ws://（混合内容拦截），但**回环地址（127.0.0.1）豁免**。
所以让网页连 ws://127.0.0.1:8898，由本中继转发到对应雷达节点。

浏览器 -> ws://127.0.0.1:8898/ws?room=XXXX  ->  cheap-host1.cheapyun.com:<对应端口>

停止：Ctrl-C，或 `pkill -f radar_proxy.py`
"""
import re
import socket
import threading

NODES = {
    1: ("cheap-host1.cheapyun.com", 12831),
    2: ("cheap-host1.cheapyun.com", 17681),
    3: ("cheap-host1.cheapyun.com", 48303),
    4: ("cheap-host1.cheapyun.com", 13699),
    5: ("cheap-host1.cheapyun.com", 41092),
}
LISTEN = ("127.0.0.1", 8898)


def pipe(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try:
                s.close()
            except Exception:
                pass


def handle(c):
    try:
        head = c.recv(8192)
        m = re.search(rb"room=(\d{3,4})", head)
        if not m:
            c.close()
            return
        nid = int(m.group(1)) // 1000
        if nid not in NODES:
            c.close()
            return
        host, port = NODES[nid]
        # 改写 Host，避免 nginx 按 server_name 路由到别的站点
        head = re.sub(rb"(?im)^Host:.*$", ("Host: %s:%d" % (host, port)).encode(), head)
        up = socket.create_connection((host, port), timeout=6)
        up.sendall(head)
        threading.Thread(target=pipe, args=(c, up), daemon=True).start()
        pipe(up, c)
    except Exception:
        try:
            c.close()
        except Exception:
            pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN)
    srv.listen(256)
    print("本地中继已启动: ws://%s:%d/ws?room=XXXX" % LISTEN, flush=True)
    while True:
        c, _ = srv.accept()
        c.settimeout(45)
        threading.Thread(target=handle, args=(c,), daemon=True).start()


if __name__ == "__main__":
    main()
