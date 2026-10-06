/**
 * 卡密验证门（阻塞式）
 * @module ui/gate
 */
import { el, $ } from '../dom.js';
import * as keys from '../services/keys.js';

const ID = 'gate-mask';

/** 显示验证门；onPass(code, remainDays) 在通过后调用 */
export function showGate({ onPass, initialMessage = '' } = {}) {
  if ($('#' + ID)) return;
  const input = el('input', {
    id: 'gate-input', class: 'gate-input', placeholder: 'XXXX-XXXX-XXXX',
    autocomplete: 'off', spellcheck: 'false', maxlength: '20'
  });
  const msg = el('div', { class: 'gate-msg', text: initialMessage });
  const btn = el('button', { class: 'btn btn-primary gate-btn', text: '验证并进入' });

  const mask = el('div', { id: ID, class: 'gate-mask' }, [
    el('div', { class: 'gate-card' }, [
      el('div', { class: 'gate-icon', text: '🔑' }),
      el('h2', { class: 'gate-title', text: '请输入卡密' }),
      el('p', { class: 'gate-desc', text: '本工具需要有效卡密才能使用（一个卡密绑定一台设备）' }),
      input,
      btn,
      msg
    ])
  ]);
  document.body.appendChild(mask);
  input.focus();

  async function submit() {
    const code = input.value.trim().toUpperCase();
    if (code.length < 8) { msg.textContent = '请输入完整卡密'; msg.classList.add('is-error'); return; }
    btn.disabled = true;
    msg.classList.remove('is-error');
    msg.textContent = '验证中…';
    const r = await keys.verify(code);
    btn.disabled = false;
    if (r.ok) {
      hideGate();
      onPass && onPass(code, r.remainDays);
    } else {
      msg.textContent = r.msg || '卡密无效';
      msg.classList.add('is-error');
    }
  }
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

export function hideGate() {
  const m = $('#' + ID);
  if (m) m.remove();
}

/** 启动时检查：已保存卡密静默校验，否则弹门 */
export async function requireKey({ onPass }) {
  const saved = (await import('../store.js')).session.key;
  if (saved) {
    const r = await keys.verifySaved();
    if (r.ok) return onPass && onPass(saved, r.remainDays);
  }
  showGate({ onPass });
}
