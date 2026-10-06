/**
 * 本地状态与持久化封装
 * @module store
 */
import { CONFIG } from './config.js';

/** 安全的 localStorage 读写（隐私模式下不抛错） */
const safe = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

/** 设备标识（首次生成后固定） */
export function deviceId() {
  let d = safe.get(CONFIG.STORE_KEY.device);
  if (!d) {
    d = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    safe.set(CONFIG.STORE_KEY.device, d);
  }
  return d;
}

export const session = {
  get key() { return safe.get(CONFIG.STORE_KEY.apiToken); },
  set key(v) { v ? safe.set(CONFIG.STORE_KEY.apiToken, v) : safe.remove(CONFIG.STORE_KEY.apiToken); }
};

/** 应用运行时状态 */
export const state = {
  room: '',
  connected: false,
  peers: 0,
  lastMessageAt: null
};
