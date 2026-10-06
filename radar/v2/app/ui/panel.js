/**
 * 数据面板：地图 / 在线 / 实体统计
 * @module ui/panel
 */
import { el } from '../dom.js';
import { KIND_META } from '../services/state.js';

export function createPanel() {
  const mapName = el('div', { class: 'panel-map', text: '等待识别地图' });
  const statsBox = el('div', { class: 'panel-stats' });
  const listBox = el('div', { class: 'panel-list' });

  const root = el('aside', { class: 'panel', hidden: 'hidden' }, [
    el('div', { class: 'panel-head' }, [
      el('span', { class: 'panel-eyebrow', text: 'LIVE STATE' }),
      mapName
    ]),
    statsBox,
    el('div', { class: 'panel-sub', text: '实体统计' }),
    listBox
  ]);
  document.body.appendChild(root);

  function stat(label, value, cls) {
    return el('div', { class: 'panel-stat ' + (cls || '') }, [
      el('b', { text: String(value) }),
      el('span', { text: label })
    ]);
  }

  return {
    /** @param {{available:boolean,mapName:string,counts:object,markers:Array}} st */
    render(st, peers) {
      if (!st || !st.available) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      mapName.textContent = st.mapName || '等待识别地图';

      statsBox.replaceChildren(
        stat('在线人数', peers == null ? '—' : peers, 'is-accent'),
        stat('队友', st.counts.ally, st.counts.ally ? 'is-accent' : ''),
        stat('玩家', st.counts.player, st.counts.player ? 'is-warn' : ''),
        stat('人机', st.counts.bot),
        stat('物品', st.counts.item, st.counts.item ? 'is-info' : '')
      );

      // 只列队友与玩家（最有价值的实体），最多 10 条
      const interesting = st.markers.filter((m) => m.kind === 'ally' || m.kind === 'player').slice(0, 10);
      if (!interesting.length) {
        listBox.replaceChildren(el('div', { class: 'panel-empty', text: '暂无可显示的实体' }));
        return;
      }
      listBox.replaceChildren(...interesting.map((m) => {
        const meta = KIND_META[m.kind] || { label: m.kind, color: '#8b939e' };
        return el('div', { class: 'panel-row' }, [
          el('span', { class: 'panel-dot', style: 'background:' + (m.color || meta.color) }),
          el('span', { class: 'panel-label', text: m.label || m.id || '未知' }),
          el('span', { class: 'panel-kind', text: meta.label })
        ]);
      }));
    },
    hide() { root.hidden = true; }
  };
}
