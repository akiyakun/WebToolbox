/* WebToolbox core: widget registry + column-grid board (no overlapping) */
(function(){
  const KEY = 'webtoolbox.board.v1', SKEY = 'webtoolbox.settings.v1';
  // Board grid: 250px columns with 20px gaps, 20px padding. Widgets are 1 or 2 columns wide (250 / 520px).
  const GAP = 20, COL = 250, PITCH = COL + GAP, PAD = 20;
  const types = {};
  let items = [];          // {id,type,x,y,z,state}
  const live = {};         // id -> {el, inst}
  let board, topZ = 1, settings = {}, scale = 1;

  const $ = s => document.querySelector(s);
  const colX = c => PAD + c * PITCH;
  const toCol = x => Math.max(0, Math.round((x - PAD) / PITCH));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch(e){} };

  const Toolbox = {
    register(def){ types[def.type] = def; },

    beep(){
      try {
        const ac = new (window.AudioContext||window.webkitAudioContext)();
        [0,.25,.5].forEach(t => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(.2, ac.currentTime+t); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+t+.2);
          o.start(ac.currentTime+t); o.stop(ac.currentTime+t+.22);
        });
      } catch(e){}
    },

    // Desktop notification; no-op unless enabled in settings and permitted by the browser.
    notify(title, body){
      if(!settings.notify) return;
      showNotification(title, body);
    },

    start(){
      board = $('#board');
      setupSettings();
      try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){ items = []; }
      items = items.filter(i => types[i.type]);
      topZ = items.reduce((m,i)=>Math.max(m,i.z||1),1);
      items.forEach(mount);
      settle();
      buildPalette();
      refreshEmpty();
      const popups = [['#palette','#toggle-palette'], ['#settings','#toggle-settings']];
      popups.forEach(([p, b]) => $(b).onclick = () => {
        const el = $(p), open = el.hidden;
        popups.forEach(([o]) => $(o).hidden = true);
        el.hidden = !open;
      });
      document.addEventListener('pointerdown', e => {
        popups.forEach(([p, b]) => { if(!$(p).hidden && !e.target.closest(`${p}, ${b}`)) $(p).hidden = true; });
      });
      $('#tidy').onclick = tidy;
      $('#clear').onclick = () => {
        if(!items.length) return;
        const warn = items.some(i => closeWarning(i.id)) ? '\n入力済みのメモも削除されます。' : '';
        if(confirm('すべてのウィジェットを削除しますか？' + warn)) [...items].forEach(i => remove(i.id));
      };
      document.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.widget.full').forEach(w=>w.classList.remove('full')); });
    }
  };

  // No `tag`: a shared tag makes macOS replace the previous notification silently, with no banner.
  function showNotification(title, body){
    if(!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const n = new Notification(title, { body });
      n.onclick = () => { window.focus(); n.close(); };
      return true;
    } catch(e){ return false; }
  }

  function setupSettings(){
    try { settings = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch(e){ settings = {}; }
    const box = $('#set-notify'), msg = $('#notify-msg'), test = $('#notify-test'), status = $('#notify-status');
    const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch(e){} };
    const say = t => { msg.textContent = t; msg.hidden = !t; };
    const supported = 'Notification' in window;
    if(!supported){ settings.notify = false; box.disabled = true; say('このブラウザではデスクトップ通知が使えません。'); }
    else if(settings.notify && Notification.permission === 'denied'){ settings.notify = false; }
    box.checked = !!settings.notify;
    const PERM = { granted:'許可済み', denied:'ブロック中', default:'未設定' };
    const refresh = () => {
      test.disabled = !box.checked;
      status.textContent = supported ? 'ブラウザの通知許可: ' + PERM[Notification.permission] : '';
    };
    refresh();
    $('#toggle-settings').addEventListener('click', refresh);
    test.onclick = () => say(showNotification('WebToolbox', 'テスト通知です')
      ? '送信しました。表示されない場合は macOS のシステム設定 →「通知」で Google Chrome Helper (Alerts) の「通知を許可」を一度オフ→オンにし、Chrome を再起動してください。集中モードがオンの場合も表示されません。'
      : '送信できませんでした。ブラウザの通知許可を確認してください。');

    const range = $('#set-scale'), val = $('#scale-val');
    const applyScale = pct => {
      pct = Math.min(150, Math.max(50, Math.round((+pct || 100) / 5) * 5));
      scale = pct / 100;
      document.body.style.zoom = pct === 100 ? '' : scale;
      document.documentElement.style.setProperty('--zoom', scale);
      // Cancel the zoom on the settings panel so the slider doesn't move under the cursor while dragging.
      $('#settings').style.zoom = pct === 100 ? '' : 1 / scale;
      // Only reposition under the topbar while closed, so the open panel never moves under the cursor.
      if($('#settings').hidden) document.documentElement.style.setProperty('--ui-scale', scale);
      range.value = pct; val.textContent = pct + '%';
      $('#scale-down').disabled = pct <= 50; $('#scale-up').disabled = pct >= 150;
      settings.scale = pct;
    };
    applyScale(settings.scale);
    range.oninput = () => applyScale(range.value);
    range.onchange = saveSettings;
    $('#toggle-settings').addEventListener('click', () => document.documentElement.style.setProperty('--ui-scale', scale));
    $('#scale-down').onclick = () => { applyScale(scale * 100 - 5); saveSettings(); };
    $('#scale-up').onclick = () => { applyScale(scale * 100 + 5); saveSettings(); };
    $('#scale-reset').onclick = () => { applyScale(100); saveSettings(); };

    box.onchange = async () => {
      say('');
      if(box.checked){
        let perm = Notification.permission;
        if(perm === 'default') perm = await Notification.requestPermission();
        if(perm !== 'granted'){
          box.checked = false;
          say('通知がブロックされています。ブラウザのアドレスバー左のサイト設定から通知を許可してください。');
        } else {
          showNotification('WebToolbox', '通知がオンになりました');
        }
      }
      settings.notify = box.checked; saveSettings(); refresh();
    };
  }

  function buildPalette(){
    const list = $('#palette-list');
    Object.values(types).forEach(t => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML = `<span class="ic">${t.icon}</span><span><b>${t.title}</b><small>${t.desc||''}</small></span>`;
      b.onclick = () => add(t.type);
      list.appendChild(b);
    });
  }

  function add(type){
    const item = { id: uid(), type, x: PAD, y: PAD, z: ++topZ, state: {} };
    const others = items.map(rectOf);
    items.push(item);
    mount(item);
    const { x, y } = firstFree(rectOf(item), others);
    moveTo(item, x, y);
    persist(); refreshEmpty();
  }

  function remove(id){
    const l = live[id]; if(!l) return;
    l.inst && l.inst.destroy && l.inst.destroy();
    l.el.remove(); delete live[id];
    items = items.filter(i => i.id !== id);
    persist(); refreshEmpty();
  }

  function mount(item){
    const t = types[item.type];
    const el = document.createElement('section');
    el.className = 'widget';
    el.style.cssText = `left:${item.x}px;top:${item.y}px;width:${t.w||280}px;${t.h?`height:${t.h}px;`:''}z-index:${item.z||1}`;
    el.innerHTML = `
      <div class="w-head"><span>${t.icon}</span><span class="w-title">${t.title}</span>
        <button class="w-btn" data-a="full" title="拡大表示">⛶</button>
        <button class="w-btn" data-a="close" title="閉じる">✕</button></div>
      <div class="w-body"></div>`;
    board.appendChild(el);
    const api = { save(state){ item.state = state; persist(); }, el };
    const inst = t.create(el.querySelector('.w-body'), item.state || {}, api);
    live[item.id] = { el, inst };

    el.querySelector('[data-a=close]').onclick = () => {
      const msg = closeWarning(item.id);
      if(msg && !confirm(msg)) return;
      remove(item.id);
    };
    el.querySelector('[data-a=full]').onclick = () => el.classList.toggle('full');
    el.addEventListener('pointerdown', () => bringFront(item, el));
    enableDrag(item, el, el.querySelector('.w-head'));
  }

  // A widget can return a message from inst.closeWarning() when closing it would lose something (e.g. memo text).
  function closeWarning(id){
    const inst = live[id] && live[id].inst;
    return inst && inst.closeWarning ? inst.closeWarning() : '';
  }

  function bringFront(item, el){
    if(item.z === topZ) return;
    item.z = ++topZ; el.style.zIndex = item.z; persist();
  }

  function enableDrag(item, el, handle){
    handle.addEventListener('pointerdown', e => {
      if(e.target.closest('button') || el.classList.contains('full')) return;
      const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
      const others = items.filter(i => i !== item).map(rectOf), me = rectOf(item);
      handle.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      // The widget follows the cursor freely; the ghost shows the grid slot it will land in.
      const ghost = document.createElement('div');
      ghost.className = 'drop-ghost';
      ghost.style.cssText = `width:${me.w}px;height:${me.h}px`;
      board.appendChild(ghost);
      let target = { x: item.x, y: item.y };
      const move = ev => {
        const fx = Math.max(0, ox + (ev.clientX - sx) / scale), fy = Math.max(0, oy + (ev.clientY - sy) / scale);
        el.style.left = fx + 'px'; el.style.top = fy + 'px';
        const x = colX(toCol(fx));
        target = { x, y: freeY({ ...me, x }, fy, others) };
        ghost.style.left = target.x + 'px'; ghost.style.top = target.y + 'px';
      };
      move(e);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        el.classList.remove('dragging');
        ghost.remove();
        moveTo(item, target.x, target.y);
        persist();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  /* ---- grid layout ---- */

  // Size comes from the type width and the rendered height (remembered so a fullscreen widget keeps its board size).
  function rectOf(i){
    const l = live[i.id];
    if(!l.el.classList.contains('full')) l.h = l.el.offsetHeight;
    return { x: i.x, y: i.y, w: types[i.type].w, h: l.h };
  }
  // True if the boxes overlap or sit closer than GAP. Neighbouring columns (exactly GAP apart) don't collide.
  const hits = (a, b) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

  // The free y closest to wantY for box r (its x fixed). A free slot is always at the top or just below another widget.
  function freeY(r, wantY, others){
    const cands = [PAD, Math.max(PAD, Math.round(wantY / GAP) * GAP)];
    others.forEach(o => cands.push(o.y + o.h + GAP, o.y - GAP - r.h));
    let best = null;
    cands.forEach(y => {
      if(y < PAD || others.some(o => hits({ ...r, y }, o))) return;
      if(best === null || Math.abs(y - wantY) < Math.abs(best - wantY)) best = y;
    });
    return best;
  }

  // Top-most, then left-most free slot among the columns visible on screen (fits if it ends within 8px of the edge).
  function firstFree(r, others){
    const maxRight = board.clientWidth - 8;
    let best = null;
    for(let c = 0; c === 0 || colX(c) + r.w <= maxRight; c++){
      const x = colX(c), y = freeY({ ...r, x }, PAD, others);
      if(best === null || y < best.y) best = { x, y };
    }
    return best;
  }

  function moveTo(i, x, y){
    i.x = x; i.y = y;
    const el = live[i.id].el;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }

  // Visual order: top to bottom, then left to right.
  const byPosition = () => [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  // Snap saved positions onto the grid, keeping each widget near where it was and resolving overlaps.
  function settle(){
    const placed = [];
    byPosition().forEach(i => {
      const r = rectOf(i), x = colX(toCol(i.x));
      moveTo(i, x, freeY({ ...r, x }, i.y, placed));
      placed.push(rectOf(i));
    });
    persist();
  }

  // Re-pack everything into the top-left, keeping the current visual order.
  function tidy(){
    const placed = [];
    byPosition().forEach(i => {
      const { x, y } = firstFree(rectOf(i), placed);
      moveTo(i, x, y);
      placed.push(rectOf(i));
    });
    persist();
  }

  function refreshEmpty(){ $('#empty').hidden = items.length > 0; }

  window.Toolbox = Toolbox;
})();
