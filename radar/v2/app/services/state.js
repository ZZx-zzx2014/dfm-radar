/**
 * 游戏状态解析（纯函数，无副作用，便于单测）
 * 原始数据结构：
 *   { nativeState: { available, levelName, markers:[{id,kind,label,x,y,z}], updatedAtMs, ... } }
 * @module services/state
 */

/** 地图英文名 → 中文名（未知则原样返回） */
export const MAP_NAMES = Object.freeze({
  Brakkesh: '巴克什',
  SpaceCenter: '航天基地',
  TidalPrison: '潮汐监狱',
  ZeroDam: '零号大坝',
  LongbowValley: '长弓溪谷',
  Valley: '长弓溪谷',
  Dam: '零号大坝'
});

/** 实体类别 → 展示信息 */
export const KIND_META = Object.freeze({
  ally:   { label: '队友', color: '#4fd1b0' },
  player: { label: '玩家', color: '#e3b341' },
  bot:    { label: '人机', color: '#8b939e' },
  item:   { label: '物品', color: '#4a8fe0' }
});

const EMPTY = Object.freeze({ available: false, mapName: '', levelName: '', counts: { ally: 0, player: 0, bot: 0, item: 0, other: 0 }, markers: [] });

/**
 * 解析原始状态
 * @param {object|undefined} raw 中继消息里的 state
 * @returns {{available:boolean, levelName:string, mapName:string, counts:object, markers:Array}}
 */
export function parseState(raw) {
  if (!raw) return EMPTY;
  const ns = raw.nativeState || raw;
  if (!ns || ns.available !== true) return EMPTY;

  const markers = Array.isArray(ns.markers) ? ns.markers : [];
  const counts = { ally: 0, player: 0, bot: 0, item: 0, other: 0 };
  for (const m of markers) {
    if (counts[m && m.kind] !== undefined) counts[m.kind] += 1;
    else counts.other += 1;
  }
  return {
    available: true,
    levelName: ns.levelName || '',
    mapName: MAP_NAMES[ns.levelName] || ns.levelName || '未知地图',
    coordinatesValid: !!ns.coordinatesValid,
    updatedAtMs: ns.updatedAtMs || Date.now(),
    markers,
    counts
  };
}

/** 我方（队友）marker 列表 */
export const allies = (st) => (st.markers || []).filter((m) => m.kind === 'ally');

/** 敌方（玩家类）marker 列表 */
export const enemies = (st) => (st.markers || []).filter((m) => m.kind === 'player');
