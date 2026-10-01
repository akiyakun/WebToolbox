/* Timer widget. State is stored as absolute end time so it survives reloads. */
(function(){
  const pad = n => String(n).padStart(2,'0');
  const fmt = s => { s = Math.max(0, Math.ceil(s)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60); return (h?pad(h)+':':'')+pad(m)+':'+pad(s%60); };

  function beep(){
    try {
      const ac = new (window.AudioContext||window.webkitAudioContext)();
      [0,.25,.5].forEach(t => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(.2, ac.currentTime+t); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime+t+.2);
        o.start(ac.currentTime+t); o.stop(ac.currentTime+t+.22);
      });
    } catch(e){}
  }

  Toolbox.register({
    type:'timer', title:'タイマー', icon:'⏳', desc:'カウントダウン＋終了アラーム', w:320,
    create(root, st, api){
      const C = 2*Math.PI*80;
      root.innerHTML = `
        <div class="ring-wrap">
          <svg viewBox="0 0 180 180">
            <circle class="ring-bg" cx="90" cy="90" r="80"/><circle class="ring-fg" cx="90" cy="90" r="80" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
          <div class="ring-center">
            <div class="t-inputs">
              <label><small>時</small><input data-k="h" inputmode="numeric" maxlength="2"></label><span class="sep">:</span><label><small>分</small><input data-k="m" inputmode="numeric" maxlength="2"></label><span class="sep">:</span><label><small>秒</small><input data-k="s" inputmode="numeric" maxlength="2"></label>
            </div>
            <div class="time" data-r hidden></div>
          </div>
        </div>
        <div class="row"><button class="ctl primary" data-go>スタート</button><button class="ctl" data-reset>リセット</button></div>`;
      const q = s => root.querySelector(s);
      const inp = {h:q('[data-k=h]'), m:q('[data-k=m]'), s:q('[data-k=s]')};
      const readout = q('[data-r]'), fg = q('.ring-fg'), go = q('[data-go]'), box = root.closest('.widget');

      let total = st.total || 300;      // seconds
      let endAt = st.endAt || 0;        // epoch ms when running
      let left = st.left != null ? st.left : total; // seconds when paused
      let timer = null, done = false;

      const save = () => api.save({total, endAt, left});
      const setInputs = s => { inp.h.value=pad(Math.floor(s/3600)); inp.m.value=pad(Math.floor(s%3600/60)); inp.s.value=pad(s%60); };
      const running = () => endAt > 0;

      function render(){
        const r = running() ? Math.max(0,(endAt-Date.now())/1000) : left;
        const show = running() || left !== total || done;
        readout.hidden = !show; Object.values(inp).forEach(i=>i.closest('.t-inputs').hidden = show);
        readout.textContent = fmt(r);
        fg.style.strokeDashoffset = C * (1 - (total ? r/total : 0));
        go.textContent = running() ? '一時停止' : (left<total && left>0 ? '再開' : 'スタート');
        if(running() && r <= 0) finish();
      }
      function finish(){
        endAt = 0; left = 0; done = true; save(); beep(); box.classList.add('finished');
        document.title = '⏰ 終了！ - WebToolbox'; clearInterval(timer); timer=null; render();
        go.textContent = 'OK'; 
      }
      function clearAlert(){ done=false; box.classList.remove('finished'); document.title='WebToolbox'; }
      function start(){
        if(done){ clearAlert(); left = total; render(); return; }
        if(!running()){
          if(left === total){ // fresh start from inputs
            total = left = (+inp.h.value||0)*3600 + (+inp.m.value||0)*60 + (+inp.s.value||0);
            if(total <= 0) return;
          }
          endAt = Date.now() + left*1000;
          timer = setInterval(render, 200);
        } else {
          left = Math.max(0,(endAt-Date.now())/1000); endAt = 0; clearInterval(timer); timer=null;
        }
        save(); render();
      }
      function reset(){
        clearAlert(); endAt = 0; clearInterval(timer); timer=null; left = total; setInputs(total); save(); render();
      }

      go.onclick = start; q('[data-reset]').onclick = reset;
      Object.values(inp).forEach(i => {
        i.onfocus = () => i.select();
        i.oninput = () => { i.value = i.value.replace(/\D/g,''); total = left = (+inp.h.value||0)*3600 + (+inp.m.value||0)*60 + (+inp.s.value||0); save(); };
        i.onblur = () => setInputs(total);
        i.onkeydown = e => { if(e.key==='Enter') { i.blur(); start(); } };
      });

      setInputs(left === 0 && !running() ? total : total);
      if(running()){ timer = setInterval(render, 200); }
      else if(left <= 0){ left = total; }
      render();
      return { destroy(){ clearInterval(timer); if(done) document.title='WebToolbox'; } };
    }
  });
})();
