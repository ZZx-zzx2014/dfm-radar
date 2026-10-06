/**
 * 卡密校验服务
 * @module services/keys
 */
import { CONFIG } from '../config.js';
import { deviceId, session } from '../store.js';

/**
 * 校验卡密
 * @param {string} code 卡密
 * @returns {Promise<{ok:boolean,msg:string,remainDays?:number}>}
 */
export async function verify(code) {
  try {
    const res = await fetch(CONFIG.KEY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || '').trim().toUpperCase(), device: deviceId() })
    });
    const data = await res.json();
    if (data && data.ok) session.key = code.trim().toUpperCase();
    else session.key = null;
    return data && typeof data === 'object' ? data : { ok: false, msg: '校验失败' };
  } catch (e) {
    return { ok: false, msg: '网络异常，无法校验卡密' };
  }
}

/** 校验已保存的卡密（静默） */
export async function verifySaved() {
  const code = session.key;
  if (!code) return { ok: false, msg: '未保存卡密' };
  return verify(code);
}
