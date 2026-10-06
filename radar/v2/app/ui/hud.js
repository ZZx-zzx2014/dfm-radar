/**
 * 顶部状态栏 + 房间徽标
 * @module ui/hud
 */
import { el, $ } from '../dom.js';

const LABEL = {
  idle: '未连接',
  connecting: '正在连接',
  connected: '实时同步',
  reconnecting: '重连中',
  failed: '连接失败'
};

export function createHud() {
  const dot = el('span', { class: 'hud-dot' });
  const text = el('span', { class: 'hud-text', text: LABEL.idle });
  const room = el('span', { class: 'hud-room', text: '----' });
  const peers = el('span', { class: 'hud-peers', text: '0' });
  const badge = el('div', { class: 'room-badge', style: 'display:none' });

  const bar = el('div', { class: 'hud' }, [
    el('div', { class: 'hud-chip' }, [dot, text]),
    el('div', { class: 'hud-chip' }, [el('span', { class: 'hud-key', text: '房间' }), room]),
    el('div', { class: 'hud-chip' }, [el('span', { class: 'hud-key', text: '在线' }), peers])
  ]);
  document.body.appendChild(bar);
  document.body.appendChild(badge);
  badge.title = '点击复制房间号';

  badge.addEventListener('click', async () => {
    const r = badge.dataset.room;
    if (!r) return;
    try { await navigator.clipboard.writeText(r); badge.textContent = '✅ 已复制 ' + r; }
    catch (e) { badge.textContent = '房间 ' + r; }
    setTimeout(() => { badge.textContent = '📡 当前房间 ' + r; }, 1200);
  });

  return {
    status(s) {
      dot.className = 'hud-dot is-' + s;
      text.textContent = LABEL[s] || s;
    },
    setRoom(r) {
      room.textContent = r || '----';
      if (r) { badge.dataset.room = r; badge.textContent = '📡 当前房间 ' + r; badge.style.display = 'block'; }
      else badge.style.display = 'none';
    },
    setPeers(n) { peers.textContent = String(n == null ? 0 : n); },
    toast(msg) {
      const t = el('div', { class: 'toast', text: msg });
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('is-show'));
      setTimeout(() => { t.classList.remove('is-show'); setTimeout(() => t.remove(), 220); }, 1800);
    }
  };
}
