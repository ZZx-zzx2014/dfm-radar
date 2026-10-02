#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DFM 雷达 · 本地中继（只绑 127.0.0.1）

浏览器 -> ws://127.0.0.1:8898/ws?room=XXXX  ->  cheap-host1.cheapyun.com:<对应端口>

用途：让 https 页面也能连（回环地址），绕过浏览器对 ws:// 的混合内容拦截。
停止：pkill -f radar_proxy.py
日志：/tmp/radar_proxy.log
"""
import re
import socket
import sys
import threading
import time

NODES = {
    1: ("cheap-host1.cheapyun.com", 12831),
    2: ("cheap-host1.cheapyun.com", 17681),
    3: ("cheap-host1.cheapyun.com", 48303),
    4: ("cheap-host1.cheapyun.com", 13699),
    5: ("cheap-host1.cheapyun.com", 41092),
}
LISTEN = ("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8898)
LOG = "/tmp/radar_proxy.log"


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


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


def handle(c, peer):
    try:
        c.settimeout(20)
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = c.recv(4096)
            if not chunk:
                log("%s 断开：未收到完整握手（收到 %d 字节）" % (peer, len(head)))
                c.close()
                return
            head += chunk
            if len(head) > 65536:
                break

        first = head.split(b"\r\n", 1)[0].decode("latin1")
        m = re.search(rb"room=(\d{3,4})", head)
        if not m:
            log("%s 无 room 参数 -> 关闭 | %s" % (peer, first))
            c.close()
            return
        room = m.group(1).decode()
        nid = int(room) // 1000
        if nid not in NODES:
            log("%s room=%s 无对应节点 -> 关闭" % (peer, room))
            c.close()
            return
        host, port = NODES[nid]

        up = socket.create_connection((host, port), timeout=8)
        up.settimeout(8)
        head = re.sub(rb"(?im)^Host:.*$", ("Host: %s:%d" % (host, port)).encode(), head)
        up.sendall(head)
        resp = b""
        while b"\r\n\r\n" not in resp:
            d = up.recv(4096)
            if not d:
                break
            resp += d
        status = resp.split(b"\r\n", 1)[0].decode("latin1") if resp else "(无响应)"
        log("%s room=%s -> %s:%d | 上游: %s" % (peer, room, host, port, status))
        c.sendall(resp)

        up.settimeout(None)
        c.settimeout(None)
        threading.Thread(target=pipe, args=(c, up), daemon=True).start()
        pipe(up, c)
    except Exception as e:
        log("%s 异常: %s: %s" % (peer, type(e).__name__, e))
        for s in (c,):
            try:
                s.close()
            except Exception:
                pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN)
    srv.listen(256)
    log("本地中继已启动 ws://%s:%d/ws?room=XXXX" % LISTEN)
    n = 0
    while True:
        c, addr = srv.accept()
        n += 1
        c.settimeout(30)
        threading.Thread(target=handle, args=(c, "conn#%d" % n), daemon=True).start()


if __name__ == "__main__":
    main()
