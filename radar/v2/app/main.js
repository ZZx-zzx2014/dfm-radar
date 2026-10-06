/**
 * 应用入口：装配各模块（依赖注入，便于替换与测试）
 * @module main
 */
import { ready } from './dom.js';
import { state } from './store.js';
import { createRelay } from './services/relay.js';
import { parseState } from './services/state.js';
import { createChat } from './services/chat.js';
import { createPanel } from './ui/panel.js';
import { createMap } from './ui/map.js';
import { createHud } from './ui/hud.js';
import { createEntry } from './ui/entry.js';
import { requireKey } from './ui/gate.js';

ready(async () => {
  const hud = createHud();
  const panel = createPanel();
  const map = createMap();
  let latest = null;

  const relay = createRelay({
    onStatus: (s) => hud.status(s),
    onOpen: (room) => { state.room = room; state.connected = true; hud.setRoom(room); entry.hide(); setTimeout(() => map.resize(), 60); },
    onState: (raw, frame) => { state.lastMessageAt = Date.now(); latest = parseState(raw); panel.render(latest, state.peers); map.render(latest, raw && raw.nativeState ? raw.nativeState : raw); },
    onPeers: (n) => { state.peers = n; hud.setPeers(n); panel.render(latest, n); },
    onError: (msg) => { entry.show(); entry.error(msg); panel.hide(); map.hide(); relay.leave(); }
  });

  const chat = createChat({
    onMessage: (m) => { if (m && m.type === 'history') hud.setPeers(state.peers); }
  });

  const entry = createEntry({
    onJoin: async (room) => {
      entry.error('');
      const ok = relay.join(room);
      if (!ok) entry.error('房间号格式不正确');
    }
  });

  // ---- 卡密门：通过后才允许进入 ----
  await requireKey({
    onPass: (code, days) => {
      hud.toast('✅ 卡密有效' + (days != null ? ' · 剩 ' + days + ' 天' : ''));
      entry.show();
      entry.focus();
    }
  });
});
