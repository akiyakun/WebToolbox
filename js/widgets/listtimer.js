/* ListTimer: pick a duration from a list (tap = start) and see the end clock time next to each row. */
(function(){
  const pad = n => String(n).padStart(2,'0');
  const clock = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dur = sec => { const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
  const left = sec => dur(Math.max(0, Math.ceil(sec)));
  const UNITS = [1,3,5], COUNT = 60;

  Toolbox.register({
    type:'listtimer', title:'ListTimer', icon:'📋', desc:'一覧から選んでワンタップでスタート', w:320, h:407,
    create(root, st, api){
      root.classList.add('lt-body');
      const C = 2*Math.PI*80;
      root.innerHTML = `
        <div data-list-view style="display:flex;flex-direction:column;flex:1;min-height:0">
          <div class="lt-tabs">${UNITS.map(u=>`<button class="lt-tab" data-u="${u}">${u}分単位</button>`).join('')}</div>
          <div class="lt-list" data-list></div>
        </div>
        <div class="lt-run" data-run hidden>
          <div class="ring-wrap"><svg viewBox="0 0 180 180"><circle class="ring-bg" cx="90" cy="90" r="80"/><circle class="ring-fg" cx="90" cy="90" r="80" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
            <div class="ring-center"><div class="time" data-r></div><div class="lt-end">終了 <b data-end></b></div></div></div>
          <div class="row"><button class="ctl" data-cancel>キャンセル</button><button class="ctl primary" data-pause>一時停止</button></div>
        </div>`;
      const q = s => root.querySelector(s), box = root.closest('.widget');
      let unit = UNITS.includes(st.unit) ? st.unit : 1;
      let total = st.total || 0, endAt = st.endAt || 0, paused = st.paused || 0; // paused: seconds left while paused
      let tick = null, done = false;
      const active = () => total > 0;
      const save = () => api.save({unit, total, endAt, paused});

      function renderList(){
        root.querySelectorAll('.lt-tab').forEach(b => b.classList.toggle('on', +b.dataset.u === unit));
        const now = Date.now(), list = q('[data-list]'), top = list.scrollTop;
        list.innerHTML = Array.from({length:COUNT}, (_,i) => {
          const sec = (i+1)*unit*60;
          return `<button class="lt-row" data-s="${sec}"><span class="d">${dur(sec)}</span><span class="e">${clock(now+sec*1000)}</span></button>`;
        }).join('');
        list.scrollTop = top;
      }
      function updateClocks(){
        const now = Date.now();
        root.querySelectorAll('.lt-row').forEach(r => { const t = clock(now + r.dataset.s*1000); const e = r.lastChild; if(e.textContent !== t) e.textContent = t; });
      }
      function renderRun(){
        const r = endAt ? Math.max(0,(endAt-Date.now())/1000) : paused;
        q('[data-r]').textContent = left(r);
        q('.ring-fg').style.strokeDashoffset = C * (1 - r/total);
        q('[data-end]').textContent = clock(endAt ? endAt : Date.now()+paused*1000);
        q('[data-pause]').textContent = done ? 'OK' : (endAt ? '一時停止' : '再開');
        if(endAt && r <= 0) finish();
      }
      function show(){
        q('[data-list-view]').hidden = active(); q('[data-run]').hidden = !active();
        if(active()) renderRun(); else renderList();
      }
      function finish(){
        endAt = 0; paused = 0; done = true; Toolbox.beep(); box.classList.add('finished');
        document.title = '⏰ 終了！ - WebToolbox'; stopTick(); renderRun();
      }
      function clearAlert(){ done = false; box.classList.remove('finished'); document.title = 'WebToolbox'; }
      function stopTick(){ clearInterval(tick); tick = null; }
      function startTick(){ stopTick(); tick = setInterval(() => active() ? renderRun() : updateClocks(), 1000); }
      function cancel(){ clearAlert(); total = endAt = paused = 0; save(); show(); }

      q('[data-list]').onclick = e => {
        const row = e.target.closest('.lt-row'); if(!row) return;
        total = +row.dataset.s; endAt = Date.now() + total*1000; paused = 0; save(); show();
      };
      root.querySelectorAll('.lt-tab').forEach(b => b.onclick = () => { unit = +b.dataset.u; save(); renderList(); });
      q('[data-cancel]').onclick = cancel;
      q('[data-pause]').onclick = () => {
        if(done) return cancel();
        if(endAt){ paused = Math.max(0,(endAt-Date.now())/1000); endAt = 0; }
        else { endAt = Date.now() + paused*1000; paused = 0; }
        save(); renderRun();
      };

      show(); startTick();
      return { destroy(){ stopTick(); if(done) document.title = 'WebToolbox'; } };
    }
  });
})();
