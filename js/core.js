/* WebToolbox core: widget registry + free-position board */
(function(){
  const GRID = 20, KEY = 'webtoolbox.board.v1', SKEY = 'webtoolbox.settings.v1';
  const types = {};
  let items = [];          // {id,type,x,y,z,state}
  const live = {};         // id -> {el, inst}
  let board, topZ = 1, settings = {}, scale = 1;

  const $ = s => document.querySelector(s);
  const snap = v => Math.max(0, Math.round(v / GRID) * GRID);
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
      $('#clear').onclick = () => { if(items.length && confirm('すべてのウィジェットを削除しますか？')) [...items].forEach(i=>remove(i.id)); };
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
      pct = Math.min(150, Math.max(50, Math.round((+pct || 100) / 10) * 10));
      scale = pct / 100;
      document.body.style.zoom = pct === 100 ? '' : scale;
      // Cancel the zoom on the settings panel so the slider doesn't move under the cursor while dragging.
      $('#settings').style.zoom = pct === 100 ? '' : 1 / scale;
      // Only reposition under the topbar while closed, so the open panel never moves under the cursor.
      if($('#settings').hidden) document.documentElement.style.setProperty('--ui-scale', scale);
      range.value = pct; val.textContent = pct + '%';
      settings.scale = pct;
    };
    applyScale(settings.scale);
    range.oninput = () => applyScale(range.value);
    range.onchange = saveSettings;
    $('#toggle-settings').addEventListener('click', () => document.documentElement.style.setProperty('--ui-scale', scale));
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
    const t = types[type];
    // place at first free-ish spot (cascade)
    const n = items.length;
    const item = { id: uid(), type, x: snap(20 + (n%6)*40), y: snap(20 + (n%6)*40), z: ++topZ, state: {} };
    items.push(item);
    mount(item);
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

    el.querySelector('[data-a=close]').onclick = () => remove(item.id);
    el.querySelector('[data-a=full]').onclick = () => el.classList.toggle('full');
    el.addEventListener('pointerdown', () => bringFront(item, el));
    enableDrag(item, el, el.querySelector('.w-head'));
  }

  function bringFront(item, el){
    if(item.z === topZ) return;
    item.z = ++topZ; el.style.zIndex = item.z; persist();
  }

  function enableDrag(item, el, handle){
    handle.addEventListener('pointerdown', e => {
      if(e.target.closest('button') || el.classList.contains('full')) return;
      const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
      handle.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = ev => {
        item.x = Math.max(0, ox + (ev.clientX - sx) / scale);
        item.y = Math.max(0, oy + (ev.clientY - sy) / scale);
        el.style.left = item.x + 'px'; el.style.top = item.y + 'px';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        el.classList.remove('dragging');
        item.x = snap(item.x); item.y = snap(item.y);
        el.style.left = item.x + 'px'; el.style.top = item.y + 'px';
        persist();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function tidy(){
    const maxW = board.clientWidth - 40;
    let x = 20, y = 20, rowH = 0;
    items.forEach(i => {
      const el = live[i.id].el, w = el.offsetWidth, h = el.offsetHeight;
      if(x + w > maxW && x > 20){ x = 20; y += rowH + GRID; rowH = 0; }
      i.x = x; i.y = y; el.style.left = x+'px'; el.style.top = y+'px';
      x += w + GRID; rowH = Math.max(rowH, h);
    });
    persist();
  }

  function refreshEmpty(){ $('#empty').hidden = items.length > 0; }

  window.Toolbox = Toolbox;
})();
