#!/usr/bin/env bash
# ============================================================
#  DFM 雷达 · 公网 wss 中继 一键部署
#  在「雷达节点所在的那台服务器」上以 root 运行
#
#  用法：
#     bash deploy_wss.sh ws.你的域名.com
#
#  做的事（全部幂等，不覆盖你现有的 nginx 配置）：
#    1. 部署 TCP 中继到 /opt/radar/relay.py，监听 127.0.0.1:8899
#    2. 注册 systemd 服务 radar-relay（开机自启 + 崩溃自动重启）
#    3. 新增 nginx 站点 /etc/nginx/conf.d/radar-wss.conf，把 /ws 反代到中继
#    4. 用 certbot 申请证书并启用 https
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "用法: bash deploy_wss.sh <域名>   例如 bash deploy_wss.sh ws.enenh.com"
  exit 1
fi
if [ "$(id -u)" != "0" ]; then
  echo "请用 root 运行（sudo -i 或 sudo bash deploy_wss.sh $DOMAIN）"
  exit 1
fi

echo "==> [1/6] 环境检查"
for c in nginx python3; do
  command -v "$c" >/dev/null || { echo "缺少 $c，请先安装"; exit 1; }
done
echo "    nginx: $(nginx -v 2>&1)"
echo "    python3: $(python3 --version 2>&1)"

echo "==> [2/6] 写入中继 /opt/radar/relay.py"
mkdir -p /opt/radar
cat > /opt/radar/relay.py <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DFM 雷达 wss 中继：nginx(TLS) -> 本机 8899 -> 对应节点端口"""
import re, socket, sys, threading, time

NODES = {
    1: ("127.0.0.1", 12831),
    2: ("127.0.0.1", 17681),
    3: ("127.0.0.1", 48303),
    4: ("127.0.0.1", 13699),
    5: ("127.0.0.1", 41092),
}
LISTEN = ("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8899)

def log(m):
    print(time.strftime("%H:%M:%S ") + m, flush=True)

def pipe(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d: break
            b.sendall(d)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try: s.close()
            except Exception: pass

def handle(c, peer):
    try:
        c.settimeout(20)
        head = b""
        while b"\r\n\r\n" not in head:
            ch = c.recv(4096)
            if not ch:
                c.close(); return
            head += ch
            if len(head) > 65536: break
        m = re.search(rb"room=(\d{3,4})", head)
        if not m:
            c.close(); return
        room = m.group(1).decode()
        nid = int(room) // 1000
        if nid not in NODES:
            c.close(); return
        host, port = NODES[nid]
        up = socket.create_connection((host, port), timeout=8)
        up.settimeout(8)
        head = re.sub(rb"(?im)^Host:.*$", ("Host: %s:%d" % (host, port)).encode(), head)
        up.sendall(head)
        resp = b""
        while b"\r\n\r\n" not in resp:
            d = up.recv(4096)
            if not d: break
            resp += d
        log("%s room=%s -> %s:%d | %s" % (peer, room, host, port,
             resp.split(b"\r\n", 1)[0].decode("latin1") if resp else "(no resp)"))
        c.sendall(resp)
        up.settimeout(None); c.settimeout(None)
        threading.Thread(target=pipe, args=(c, up), daemon=True).start()
        pipe(up, c)
    except Exception as e:
        log("%s 异常 %s" % (peer, e))
        try: c.close()
        except Exception: pass

def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN); srv.listen(512)
    log("radar relay 已启动 %s:%d" % LISTEN)
    n = 0
    while True:
        c, _ = srv.accept()
        n += 1
        threading.Thread(target=handle, args=(c, "c%d" % n), daemon=True).start()

if __name__ == "__main__":
    main()
PYEOF
chmod +x /opt/radar/relay.py

echo "==> [3/6] 注册 systemd 服务"
cat > /etc/systemd/system/radar-relay.service <<'UNITEOF'
[Unit]
Description=DFM radar wss relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/radar/relay.py 8899
Restart=always
RestartSec=2
User=root

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable radar-relay >/dev/null 2>&1 || true
systemctl restart radar-relay
sleep 1
systemctl is-active radar-relay && echo "    radar-relay 运行中"

echo "==> [4/6] 新增 nginx 站点（不触碰现有配置文件）"
cat > /etc/nginx/conf.d/radar-wss.conf <<CONFEOF
# DFM 雷达 wss 中继（由 deploy_wss.sh 生成）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /ws {
        proxy_pass http://127.0.0.1:8899;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /health {
        return 200 "radar-relay ok\n";
        add_header Content-Type text/plain;
    }
}
CONFEOF
nginx -t
systemctl reload nginx
echo "    nginx 配置已生效"

echo "==> [5/6] 申请证书"
if ! command -v certbot >/dev/null; then
  echo "    未安装 certbot。请先安装（Debian/Ubuntu: apt install -y certbot python3-certbot-nginx）后重跑本脚本。"
  echo "    当前 http 已可用；装完 certbot 再跑一次即可。"
  exit 0
fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect -m admin@"$DOMAIN" 2>&1 | tail -20 || {
  echo "    certbot 失败：请确认域名 $DOMAIN 的 A 记录已指向本机公网 IP，且 80 端口可从公网访问。"
  exit 1
}

echo "==> [6/6] 自检"
curl -sS -m 8 "https://${DOMAIN}/health" && echo
echo
echo "============================================================"
echo " 部署完成！网页端填写："
echo "   wss://${DOMAIN}/ws?room="
echo " 自检命令： systemctl status radar-relay --no-pager"
echo "           tail -f /var/log/nginx/access.log"
echo "============================================================"
