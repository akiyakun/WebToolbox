/* Stopwatch widget. Persists accumulated time + start timestamp so it keeps running across reloads. */
(function(){
  const pad = (n,l=2) => String(n).padStart(l,'0');
  function fmt(ms){
    const t = Math.floor(ms), h = Math.floor(t/3600000), m = Math.floor(t%3600000/60000), s = Math.floor(t%60000/1000), c = Math.floor(t%1000/10);
    return (h?pad(h)+':':'') + pad(m) + ':' + pad(s) + '<small>.' + pad(c) + '</small>';
  }
  const plain = ms => fmt(ms).replace(/<[^>]+>/g,'');

  Toolbox.register({
    type:'stopwatch', title:'ストップウォッチ', icon:'⏱️', desc:'ラップ記録つき', w:250, h:379,
    create(root, st, api){
      root.innerHTML = `
        <div class="time sw-time" data-t></div>
        <div class="row"><button class="ctl primary" data-go>スタート</button><button class="ctl" data-lap>ラップ</button><button class="ctl" data-reset>リセット</button></div>
        <div class="laps" data-laps></div>`;
      const q = s => root.querySelector(s);
      let acc = st.acc || 0, startAt = st.startAt || 0, laps = st.laps || [], raf = null;
      const now = () => acc + (startAt ? Date.now()-startAt : 0);
      const save = () => api.save({acc, startAt, laps});

      function renderLaps(){
        const splits = laps.map((t,i)=> t-(laps[i-1]||0));
        const min = Math.min(...splits), max = Math.max(...splits);
        q('[data-laps]').innerHTML = laps.map((t,i)=>{
          const cls = laps.length>2 ? (splits[i]===min?'best':splits[i]===max?'worst':'') : '';
          return `<div class="lap ${cls}"><span>Lap ${i+1}</span><b>${plain(splits[i])}</b><span>${plain(t)}</span></div>`;
        }).reverse().join('');
      }
      function tick(){ q('[data-t]').innerHTML = fmt(now()); if(startAt) raf = requestAnimationFrame(tick); }
      function render(){
        cancelAnimationFrame(raf); tick();
        q('[data-go]').textContent = startAt ? '停止' : (acc ? '再開' : 'スタート');
        q('[data-lap]').disabled = !startAt;
        q('[data-reset]').disabled = !acc && !startAt;
        renderLaps();
      }
      q('[data-go]').onclick = () => { if(startAt){ acc = now(); startAt = 0; } else startAt = Date.now(); save(); render(); };
      q('[data-lap]').onclick = () => { laps.push(now()); save(); renderLaps(); };
      q('[data-reset]').onclick = () => { acc = 0; startAt = 0; laps = []; save(); render(); };
      render();
      return { destroy(){ cancelAnimationFrame(raf); } };
    }
  });
})();
