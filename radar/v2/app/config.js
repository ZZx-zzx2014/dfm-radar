/**
 * 应用配置（集中管理，无魔法值）
 * @module config
 */
export const CONFIG = Object.freeze({
  /** 公网中继域名（https 页面必须走 wss 隧道） */
  RELAY_HOST: localStorage.getItem('dfm_relay_host') || 'radar.fcefw.dpdns.org',
  /** 房间聊天域名 */
  CHAT_HOST: localStorage.getItem('dfm_chat_host') || 'chat.fcefw.dpdns.org',
  /** 卡密校验接口 */
  KEY_API: 'https://panel.fcefw.dpdns.org/api/key/verify',
  /** 中继路径 */
  RELAY_PATH: '/ws',
  /** 心跳间隔（毫秒） */
  HEARTBEAT_MS: 12000,
  /** 判定断线无数据阈值（毫秒） */
  STALE_MS: 35000,
  /** 重连退避基数（毫秒） */
  RETRY_BASE_MS: 1000,
  /** 最大重连次数 */
  RETRY_MAX: 5,
  /** 房间号规则 */
  ROOM_PATTERN: /^[0-9]{4}$/,
  /** 存储键 */
  STORE_KEY: { apiToken: 'dfm_key', device: 'dfm_device' }
});

/** 生成 WebSocket 地址：https 页面走 wss 中继，http 页面可直连 */
export function socketUrl(room) {
  const { protocol } = location;
  if (protocol === 'https:') return `wss://${CONFIG.RELAY_HOST}${CONFIG.RELAY_PATH}?room=${room}`;
  return `ws://${location.host}${CONFIG.RELAY_PATH}?room=${room}`;
}

/** 生成聊天地址 */
export function chatUrl(room, name) {
  const q = `room=${room}&name=${encodeURIComponent(name)}`;
  if (location.protocol === 'https:') return `wss://${CONFIG.CHAT_HOST}/chat?${q}`;
  return `ws://${location.host}/chat?${q}`;
}
