#!/usr/bin/env bash
# ============================================================
#  DFM 雷达 · 公网 wss 中继 一键部署
#
#  跑在【你自己的服务器】上（不是雷达节点那台）。
#  中继会主动连出去到雷达节点 cheap-host1.cheapyun.com 的 5 个端口。
#
#  用法：
#     bash deploy_wss.sh ws.你的域名.com
#  可选环境变量：
#     RADAR_NODE_HOST  默认 cheap-host1.cheapyun.com
#     RELAY_PORT       默认 8899
#
#  做的事（幂等，不覆盖现有 nginx 配置）：
#    1. /opt/radar/relay.py + systemd 服务 radar-relay
#    2. 新增 /etc/nginx/conf.d/radar-wss.conf，TLS 终结 + 反代到中继
#    3. certbot 申请证书
#    4. 自检（本地裸握手 + 到雷达节点的连通性）
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || { echo "用法: bash deploy_wss.sh <域名>  例如 bash deploy_wss.sh ws.enenh.com"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "请用 root 运行： sudo bash deploy_wss.sh $DOMAIN"; exit 1; }

NODE_HOST="${RADAR_NODE_HOST:-cheap-host1.cheapyun.com}"
RELAY_PORT="${RELAY_PORT:-8899}"

echo "==> [1/6] 环境检查"
for c in nginx python3 systemctl; do
  command -v "$c" >/dev/null || { echo "缺少 $c，请先安装"; exit 1; }
done
echo "    domain=$DOMAIN  node_host=$NODE_HOST  relay_port=$RELAY_PORT"
nginx -v 2>&1 | sed 's/^/    /'

echo "==> [2/6] 写入中继 /opt/radar/relay.py"
mkdir -p /opt/radar
sed "s/@NODE_HOST@/${NODE_HOST}/g" > /opt/radar/relay.py <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DFM 雷达 wss 中继：nginx(TLS) -> 本机 @RELAY_PORT@ -> 雷达节点
浏览器给的是 wss://<域名>/ws?room=XXXX，nginx 解密后转发到本进程，
本进程按「房间号 // 1000」挑节点端口转发。
"""
import re, socket, sys, threading, time

NODE_HOST = "@NODE_HOST@"
NODES = {
    1: (NODE_HOST, 12831),
    2: (NODE_HOST, 17681),
    3: (NODE_HOST, 48303),
    4: (NODE_HOST, 13699),
    5: (NODE_HOST, 41092),
}
LISTEN = ("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else @RELAY_PORT@)


def log(m):
    print(time.strftime("%H:%M:%S ") + m, flush=True)


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
            log("%s room=%s 无对应节点" % (peer, room)); c.close(); return

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
            resp.split(b"\r\n", 1)[0].decode("latin1") if resp else "(无响应)"))
        c.sendall(resp)
        up.settimeout(None); c.settimeout(None)
        threading.Thread(target=pipe, args=(c, up), daemon=True).start()
        pipe(up, c)
    except Exception as e:
        log("%s 异常: %s" % (peer, e))
        try: c.close()
        except Exception: pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN); srv.listen(512)
    log("radar relay 已启动 %s:%d -> %s" % (LISTEN[0], LISTEN[1], NODE_HOST))
    n = 0
    while True:
        c, _ = srv.accept(); n += 1
        threading.Thread(target=handle, args=(c, "c%d" % n), daemon=True).start()


if __name__ == "__main__":
    main()
PYEOF
sed -i.bak "s/@RELAY_PORT@/${RELAY_PORT}/g" /opt/radar/relay.py && rm -f /opt/radar/relay.py.bak
chmod +x /opt/radar/relay.py
python3 -m py_compile /opt/radar/relay.py && echo "    relay.py 编译通过"

echo "==> [3/6] 注册 systemd 服务"
cat > /etc/systemd/system/radar-relay.service <<UNITEOF
[Unit]
Description=DFM radar wss relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/radar/relay.py ${RELAY_PORT}
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
echo -n "    radar-relay: "; systemctl is-active radar-relay

echo "==> [4/6] 新增 nginx 站点（独立文件，不动现有配置）"
cat > /etc/nginx/conf.d/radar-wss.conf <<CONFEOF
# DFM 雷达 wss 中继（由 deploy_wss.sh 生成）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /ws {
        proxy_pass http://127.0.0.1:${RELAY_PORT};
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
nginx -t && systemctl reload nginx
echo "    nginx 已重载"

echo "==> [5/6] 申请证书"
if ! command -v certbot >/dev/null; then
  echo "    未安装 certbot。请先安装后重跑本脚本："
  echo "      Debian/Ubuntu: apt install -y certbot python3-certbot-nginx"
  echo "      CentOS/RHEL  : yum install -y certbot python3-certbot-nginx"
  exit 0
fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect 2>&1 | tail -15 || {
  echo "    certbot 失败：确认 $DOMAIN 的 A 记录已指向本机公网 IP，且 80 端口公网可达。"; exit 1; }

echo "==> [6/6] 自检"
python3 - <<'PYEOF'
import socket
try:
    s = socket.create_connection(("127.0.0.1", @RELAY_PORT@), timeout=6)
    req = ("GET /ws?room=4009 HTTP/1.1\r\nHost: 127.0.0.1\r\n"
           "Upgrade: websocket\r\nConnection: Upgrade\r\n"
           "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.sendall(req.encode()); s.settimeout(8)
    line = s.recv(200).decode("latin1", "replace").split("\r\n")[0]
    s.close()
    print("    本地中继自检:", line)
    print("    " + ("✅ 通！" if "101" in line else "⚠️ 没拿到 101，检查能否连外网到雷达节点"))
except Exception as e:
    print("    ❌ 自检失败:", e)
PYEOF
echo
echo "============================================================"
echo " 部署完成"
echo "   网页端填： wss://${DOMAIN}/ws?room="
echo "   健康检查： curl https://${DOMAIN}/health"
echo "   服务日志： journalctl -u radar-relay -f"
echo "============================================================"
