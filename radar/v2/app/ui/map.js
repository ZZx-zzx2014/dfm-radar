/**
 * 实时地图视图（Leaflet）
 * 职责：瓦片底图 + 实体标记渲染；不负责数据获取
 * @module ui/map
 */
import { el } from '../dom.js';
import { MAP_HALF, MAP_BOUNDS, findMap, project, tileUrl } from '../services/maps.js';
import { KIND_META } from '../services/state.js';

export function createMap() {
  const host = el('div', { class: 'map-host' });
  const empty = el('div', { class: 'map-empty' }, [
    el('div', { class: 'map-empty-title', text: '等待客户端数据' }),
    el('div', { class: 'map-empty-desc', text: '进入对局后，地图与位置会显示在这里' })
  ]);
  const root = el('section', { class: 'map-view', hidden: 'hidden' }, [host, empty.status = empty]);
  document.body.appendChild(root);

  let leaflet = null;
  let tiles = null;
  let markerLayer = null;
  let currentMap = null;
  const pointMap = new Map();   // id -> { layer, kind, label }

  function ensureLeaflet() {
    if (!window.L) return null;
    if (!leaflet) {
      leaflet = window.L.map(host, {
        crs: window.L.CRS.Simple,
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
        minZoom: -2,
        maxZoom: 8,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        maxBoundsViscosity: 0.8
      }).setView([-MAP_HALF, MAP_HALF], 1);
      markerLayer = window.L.layerGroup().addTo(leaflet);
    }
    return leaflet;
  }

  function applyMap(map) {
    if (tiles) { leaflet.removeLayer(tiles); tiles = null; }
    currentMap = map;
    if (!map || !leaflet) return;
    tiles = window.L.tileLayer(tileUrl(map), {
      bounds: window.L.latLngBounds(MAP_BOUNDS),
      minZoom: -2,
      maxZoom: 8,
      minNativeZoom: map.minNativeZoom ?? 0,
      maxNativeZoom: 4,
      noWrap: true,
      tileSize: 256
    }).addTo(leaflet);
    leaflet.fitBounds(window.L.latLngBounds(MAP_BOUNDS), { animate: false });
  }

  /** 渲染实体标记 */
  function renderMarkers(markers, frame) {
    if (!leaflet || !currentMap) return;
    const alive = new Set();

    for (const m of markers || []) {
      const pos = project(currentMap, m.x, m.y, frame);
      if (!pos) continue;
      alive.add(m.id);
      const meta = KIND_META[m.kind] || { color: '#8b939e' };
      let node = pointMap.get(m.id);

      if (!node) {
        const dot = window.L.circleMarker(pos, {
          radius: m.kind === 'ally' ? 5 : 4,
          color: 'transparent',
          fillColor: m.color || meta.color,
          fillOpacity: 0.95
        }).addTo(markerLayer);
        dot.bindTooltip(m.label || m.id || '', { direction: 'top', offset: [0, -8], className: 'map-tip' });
        node = { dot };
        pointMap.set(m.id, node);
      } else {
        node.dot.setLatLng(pos);
      }
      if (m.kind === 'ally') node.dot.bringToFront();
    }

    for (const [id, node] of pointMap) {
      if (!alive.has(id)) { markerLayer.removeLayer(node.dot); pointMap.delete(id); }
    }
  }

  return {
    /** @param {{available:boolean,levelName:string,markers:Array}} st */
    render(st, frame) {
      if (!st || !st.available) { root.hidden = true; empty.hidden = false; return; }
      const l = ensureLeaflet();
      if (!l) { root.hidden = true; return; }
      root.hidden = false;

      const map = findMap(st.levelName);
      if (map && (!currentMap || currentMap.layer !== map.layer)) applyMap(map);
      empty.hidden = !!currentMap;
      if (!map) {
        empty.hidden = false;
        empty.querySelector('.map-empty-title').textContent = '暂不支持这张地图';
        empty.querySelector('.map-empty-desc').textContent = '已识别到「' + st.levelName + '」，但缺少底图配置';
        return;
      }
      renderMarkers(st.markers, frame);
      leaflet.invalidateSize({ pan: false });
    },
    resize() { leaflet && leaflet.invalidateSize({ pan: false }); },
    hide() { root.hidden = true; }
  };
}
