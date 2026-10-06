/**
 * 中继 WebSocket 客户端
 * 职责：连接管理、心跳、超时检测、指数退避重连、事件分发
 * @module services/relay
 */
import { CONFIG, socketUrl } from '../config.js';

/**
 * @param {object} handlers
 * @param {(room:string)=>void} handlers.onOpen     连接并加入成功
 * @param {(state:object)=>void} handlers.onState   收到状态数据
 * @param {(n:number)=>void} handlers.onPeers       在线人数变化
 * @param {(msg:string)=>void} handlers.onStatus    connecting/connected/reconnecting/idle
 * @param {(msg:string)=>void} handlers.onError     致命错误（不再重连）
 */
export function createRelay(handlers = {}) {
  let ws = null;
  let room = '';
  let attempt = 0;
  let joined = false;
  let heartbeatTimer = null;
  let retryTimer = null;
  let lastRxAt = 0;

  const emit = (fn, ...a) => { try { fn && fn(...a); } catch (e) { console.error('[relay] handler error', e); } };
  const status = (s) => emit(handlers.onStatus, s);

  function cleanup() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  }

  function connect() {
    cleanup();
    let socket;
    try { socket = new WebSocket(socketUrl(room)); }
    catch (e) { return scheduleRetry(); }

    ws = socket;
    let opened = false;
    lastRxAt = Date.now();

    socket.addEventListener('open', () => {
      if (ws !== socket) return;
      opened = true;
      try {
        socket.send(JSON.stringify({ type: 'hello', clientType: 'web', room, clientName: 'dfm-radar', version: 2 }));
      } catch (e) { return scheduleRetry(); }
    });

    socket.addEventListener('message', (ev) => {
      if (ws !== socket) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || typeof msg.type !== 'string') return;
      lastRxAt = Date.now();

      if (msg.type === 'error') {
        const friendly = msg.code === 'room-not-found'
          ? '房间不存在，请确认客户端已开启共享'
          : '连接被拒绝，请确认房间号后重试';
        return fatal(friendly);
      }
      if (msg.type === 'welcome') {
        if (String(msg.room) !== room || joined) return;
        joined = true; attempt = 0;
        emit(handlers.onOpen, room);
        status('connected');
        if (msg.state) emit(handlers.onState, msg.state.nativeState || msg.state);
        if (Number.isInteger(msg.peers)) emit(handlers.onPeers, msg.peers);
        startHeartbeat();
        return;
      }
      if (joined && msg.type === 'native-state') emit(handlers.onState, msg.state);
      else if (joined && msg.type === 'snapshot') emit(handlers.onState, msg.state && msg.state.nativeState);
      if (joined && Number.isInteger(msg.peers) && msg.peers >= 0) emit(handlers.onPeers, msg.peers);
    });

    socket.addEventListener('close', (ev) => {
      if (ws !== socket) return;
      cleanup();
      if (ev && ev.code === 4004) return fatal('房间不存在，请确认客户端已开启共享');
      scheduleRetry();
    });

    socket.addEventListener('error', () => { /* close 会跟进 */ });
  }

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastRxAt > CONFIG.STALE_MS) { scheduleRetry(); return; }
      try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch (e) { scheduleRetry(); }
    }, CONFIG.HEARTBEAT_MS);
  }

  function scheduleRetry() {
    if (!room) return;
    cleanup();
    if (!joined || attempt >= CONFIG.RETRY_MAX) return fatal('暂时无法连接，请检查网络后重试');
    attempt += 1;
    status('reconnecting');
    retryTimer = setTimeout(connect, Math.min(CONFIG.RETRY_BASE_MS * 2 ** (attempt - 1), 12000));
  }

  function fatal(msg) {
    cleanup();
    room = ''; joined = false; attempt = 0;
    status('idle');
    emit(handlers.onError, msg);
  }

  return {
    /** 加入房间 */
    join(r) {
      if (!CONFIG.ROOM_PATTERN.test(String(r))) return false;
      room = String(r); joined = false; attempt = 0;
      status('connecting');
      connect();
      return true;
    },
    /** 离开 */
    leave() { room = ''; joined = false; attempt = 0; cleanup(); status('idle'); },
    get currentRoom() { return room; }
  };
}
