/**
 * 加入房间页
 * @module ui/entry
 */
import { el, $ } from '../dom.js';
import { CONFIG } from '../config.js';

const ID = 'entry-screen';

/** 渲染入口页，返回 { show, hide, onJoin } */
export function createEntry({ onJoin }) {
  const slots = [0, 1, 2, 3].map(() => el('span', { class: 'code-slot' }));
  const input = el('input', {
    id: 'room-input', class: 'room-input', inputmode: 'numeric',
    maxlength: '4', placeholder: '0000', autocomplete: 'off'
  });
  const hint = el('div', { class: 'entry-hint', text: '请先在客户端开启共享，获取房间号' });
  const btn = el('button', { class: 'btn btn-primary join-btn', text: '进入雷达' });
  const err = el('div', { class: 'entry-error' });

  const screen = el('section', { id: ID, class: 'entry-screen' }, [
    el('div', { class: 'entry-card' }, [
      el('div', { class: 'entry-eyebrow', text: 'ROOM ACCESS' }),
      el('h1', { class: 'entry-title', text: '加入雷达房间' }),
      el('p', { class: 'entry-sub', text: '输入客户端的房间号，即刻同步实时态势。' }),
      el('label', { class: 'entry-label', text: '4 位房间号' }),
      el('div', { class: 'code-wrap' }, [input, el('div', { class: 'code-slots' }, slots)]),
      btn,
      err,
      hint
    ])
  ]);
  document.body.appendChild(screen);

  function paint() {
    const v = input.value.replace(/\D/g, '').slice(0, 4);
    if (input.value !== v) input.value = v;
    slots.forEach((s, i) => {
      s.textContent = v[i] || '';
      s.classList.toggle('is-active', i === v.length && v.length < 4);
      s.classList.toggle('is-filled', i < v.length);
    });
    btn.disabled = !CONFIG.ROOM_PATTERN.test(v);
  }
  input.addEventListener('input', paint);
  input.addEventListener('focus', paint);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btn.disabled) submit(); });

  async function submit() {
    const v = input.value.trim();
    if (!CONFIG.ROOM_PATTERN.test(v)) { err.textContent = '请输入完整的 4 位房间号'; return; }
    err.textContent = '';
    btn.disabled = true; btn.textContent = '连接中…';
    try { await onJoin(v); } finally { btn.disabled = false; btn.textContent = '进入雷达'; }
  }
  btn.addEventListener('click', submit);
  paint();

  return {
    show() { screen.hidden = false; },
    hide() { screen.hidden = true; },
    error(m) { err.textContent = m || ''; },
    setBusy(b) { btn.disabled = b; },
    focus() { try { input.focus({ preventScroll: true }); } catch (e) {} }
  };
}
