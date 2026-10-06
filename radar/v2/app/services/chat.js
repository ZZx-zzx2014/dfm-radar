/**
 * 房间聊天服务
 * @module services/chat
 */
import { chatUrl } from '../config.js';

export function createChat(handlers = {}) {
  let ws = null, room = '';
  const emit = (fn, ...a) => { try { fn && fn(...a); } catch (e) {} };

  function open(name) {
    close();
    try { ws = new WebSocket(chatUrl(room, name)); } catch (e) { return emit(handlers.onStatus, 'failed'); }
    ws.addEventListener('open', () => emit(handlers.onStatus, 'open'));
    ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      emit(handlers.onMessage, msg);
    });
    ws.addEventListener('close', () => { emit(handlers.onStatus, 'closed'); ws = null; });
    ws.addEventListener('error', () => {});
  }
  function close() { if (ws) { try { ws.close(); } catch (e) {} ws = null; } }

  return {
    join(r, name) { room = String(r); open(name); },
    send(text) {
      const t = String(text || '').trim();
      if (!t || !ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify({ type: 'chat', text: t }));
      return true;
    },
    leave() { room = ''; close(); }
  };
}
