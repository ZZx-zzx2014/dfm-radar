/**
 * 地图配置与坐标投影
 *
 * 数据来源：客户端上报的 `levelName`（如 Brakkesh / SpaceCenter）
 * 瓦片来源：官方图床 `{TILE_BASE}{layer}/{z}_{x}_{y}.jpg`
 *
 * 投影算法说明：
 *   客户端坐标为「世界坐标（厘米）」。需先按上报的坐标空间换算到与地图一致的基准，
 *   再线性映射到 CRS.Simple 的 [-256, 256] 区间（与瓦片金字塔对应）。
 *
 * @module services/maps
 */

/** 瓦片基址 */
export const TILE_BASE = 'https://game.gtimg.cn/images/dfm/cp/a20240729directory/img/';

/** 地图尺寸常量：CRS.Simple 下的半幅 */
export const MAP_HALF = 128;
export const MAP_BOUNDS = [[-256, 0], [0, 256]];

/** 地图表（id / 名称 / 图层 / 别名 / 世界原点 / 中心 / 边长 / 旋转） */
export const MAPS = Object.freeze([
  { id: 'daba',     name: '零号大坝', layer: 'map_db',   aliases: ['Dam_Iris', '零号大坝'],      origin: [357100, -770800],  center: [358155.7, 750191.75], size: [81086.3, 80988.5],      rotation: 0, minNativeZoom: 0 },
  { id: 'cgxg',     name: '长弓溪谷', layer: 'map_yc',   aliases: ['Forrest', '长弓溪谷'],        origin: [328800, -640600],  center: [329000, 640000],      size: [112800, 112800],        rotation: 0, minNativeZoom: 2 },
  { id: 'htjd',     name: '航天基地', layer: 'map_htjd', aliases: ['SpaceCenter', '航天基地'],    origin: [668200, -452923],  center: [669337, 446449.75],   size: [65442.9, 65442.9],      rotation: 0, minNativeZoom: 2 },
  { id: 'bks',      name: '巴克什',   layer: 'map_bks2', aliases: ['Brakkesh', '巴克什'],         origin: [378400, -449400],  center: [380000, 456000],      size: [60000, 60000],          rotation: 0, minNativeZoom: 2 },
  { id: 'cxjy',     name: '潮汐监狱', layer: 'map_cxjy', aliases: ['Tide', '潮汐监狱'],           origin: [53150, -52650],    center: [],                    size: [36596.4, 36596.4],      rotation: 0, minNativeZoom: 2 },
  { id: 'az3',      name: '核电站',   layer: 'map_az3',  aliases: ['AZ-5', '核电站'],             origin: [197518.9, -204814], center: [],                   size: [80999.179688, 80831.398438], rotation: 0, minNativeZoom: 2 }
].map((m) => Object.freeze(m)));

/** 名称归一化（去 _Level 后缀、统一小写） */
const norm = (s) => String(s ?? '').trim().replace(/_Level.*$/i, '').toLowerCase();

/**
 * 按 levelName 查地图配置
 * @param {string} levelName 客户端上报的地图名
 * @returns {object|null}
 */
export function findMap(levelName) {
  const key = norm(levelName);
  if (!key) return null;
  return MAPS.find((m) => [m.id, m.layer, ...(m.aliases || [])]
    .filter(Boolean).some((o) => norm(o) === key)) || null;
}

/**
 * 世界坐标 → 地图坐标（CRS.Simple 的 [-256,256] 区间）
 * @param {object} map   地图配置
 * @param {number} x     世界坐标 x
 * @param {number} y     世界坐标 y
 * @param {object} [frame] 状态帧（coordinateSpace / worldOrigin）
 * @returns {[number,number]|null} [lat, lng]
 */
export function project(map, x, y, frame) {
  if (!map || !map.layer || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let wx = x;
  let wy = y;

  if (frame && frame.coordinateSpace === 'persistent-cm') {
    wx = x - map.origin[0];
    wy = y - map.origin[1];
  } else if (frame && frame.worldOrigin) {
    wx = x + frame.worldOrigin[0] - map.origin[0];
    wy = y + frame.worldOrigin[1] - map.origin[1];
  }

  const r = (wx + map.origin[0] - map.center[0]) * MAP_HALF / map.size[0];
  const n = (wy + map.origin[1] + map.center[1]) * MAP_HALF / map.size[1];

  if (map.rotation === 90) return [-MAP_HALF - r, MAP_HALF - n];
  if (map.rotation === -90) return [-MAP_HALF + r, MAP_HALF + n];
  return [-MAP_HALF - n, MAP_HALF + r];
}

/** 瓦片 URL 模板 */
export const tileUrl = (map) => `${TILE_BASE}${map.layer}/{z}_{x}_{y}.jpg`;
