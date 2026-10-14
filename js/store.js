/* WebToolbox store: contents of "doc" tools (memo, stickies, …), one document per tool type.
   Served by server.py: saved on the server and shared between devices (the last save wins).
   Opened from file:// or a plain static server: kept in this browser only.
   Either way a copy lives in localStorage, so the board shows instantly and edits survive while offline. */
(function(){
  const KEY = 'webtoolbox.docs.v1';
  const POLL_MS = 4000, PUSH_DELAY = 600, RETRY_MS = 5000;

  // docs: type -> data, revs: type -> server rev we last saw, dirty: types with unsaved local edits,
  // rev: newest server rev we have seen, server: true once this origin has answered /api/docs.
  let s = { docs: {}, revs: {}, dirty: [], rev: 0, server: false };
  try { s = { ...s, ...JSON.parse(localStorage.getItem(KEY)) }; } catch(e){}
  let online = true, pushTimer = null, pollTimer = null, pushing = false;
  const listeners = [], statusListeners = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch(e){} };
  const isDirty = t => s.dirty.includes(t);
  const setStatus = on => { if(online !== on){ online = on; statusListeners.forEach(f => f(status())); } };
  const status = () => ({ server: s.server, online, unsaved: s.dirty.length > 0 });

  async function api(path, opts){
    const r = await fetch(path, { cache: 'no-store', ...opts });
    if(!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    return r.json();
  }

  // Take in what changed on the server. While the page is open our own unsaved edits win (they are pushed
  // next), and an answer older than what we already have (a poll that crossed our save) is ignored.
  // On the first fetch, edits left over from last time lose to anything saved on the server since then:
  // that save is newer (or it is our own, sent while the tab was closing).
  function apply(res, first){
    // The server's numbers went back (its data was reset or restored from a backup): forget ours.
    if((res.rev || 0) < s.rev){ s.rev = 0; s.revs = {}; }
    Object.entries(res.docs || {}).forEach(([t, d]) => {
      if(d.rev <= (s.revs[t] || 0)) return;
      if(isDirty(t)){ if(!first) return; s.dirty = s.dirty.filter(x => x !== t); }
      s.revs[t] = d.rev;
      if(JSON.stringify(s.docs[t]) === JSON.stringify(d.data)) return;
      s.docs[t] = d.data;
      listeners.forEach(f => f(t, d.data));
    });
    s.rev = Math.max(s.rev, res.rev || 0);
    persist();
  }

  async function poll(){
    if(!s.server) return;
    try {
      const after = s.rev, res = await api('api/docs?after=' + after);
      apply(res);
      // After a reset only part of the documents came back; fetch them all.
      if(res.rev < after) apply(await api('api/docs?after=0'));
      setStatus(true);
    }
    catch(e){ setStatus(false); }
  }

  async function push(){
    clearTimeout(pushTimer); pushTimer = null;
    if(!s.server || pushing || !s.dirty.length) return;
    pushing = true;
    try {
      for(const t of [...s.dirty]){
        const sent = s.docs[t];
        const res = await api('api/docs/' + encodeURIComponent(t), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: sent })
        });
        s.revs[t] = Math.max(s.revs[t] || 0, res.rev);
        // Still dirty if it was edited again while this save was on its way.
        if(s.docs[t] === sent) s.dirty = s.dirty.filter(x => x !== t);
        persist();
      }
      setStatus(true);
    } catch(e){
      setStatus(false);
      pushTimer = setTimeout(push, RETRY_MS);
    } finally {
      pushing = false;
      statusListeners.forEach(f => f(status()));
    }
    if(s.dirty.length && !pushTimer) pushTimer = setTimeout(push, PUSH_DELAY);
  }

  const ToolboxStore = {
    get(type){ return s.docs[type]; },

    set(type, data){
      s.docs[type] = data;
      if(s.server && !isDirty(type)) s.dirty.push(type);
      persist();
      if(!s.server) return;
      clearTimeout(pushTimer); pushTimer = setTimeout(push, PUSH_DELAY);
      statusListeners.forEach(f => f(status()));
    },

    // Called with (type, data) when another device changed a document.
    onChange(fn){ listeners.push(fn); },
    onStatus(fn){ statusListeners.push(fn); fn(status()); },
    status,

    // Find out whether this page is served by server.py and fetch everything once. Resolves either way
    // (at the latest after `timeout` ms), so the board can start even when the server is slow or down.
    connect(timeout = 3000){
      const first = (async () => {
        if(location.protocol === 'file:') return;
        try {
          const res = await api('api/docs?after=0');
          s.server = true; setStatus(true);
          apply(res, true);
          push();
        } catch(e){
          // 404 etc.: a plain static server, so keep everything in this browser.
          // No answer at all: the server we used before is down; keep the edits and retry later.
          if(e.status) { s.server = false; s.dirty = []; persist(); }
          else if(s.server) setStatus(false);
        }
        if(!s.server) return;
        pollTimer = setInterval(() => { if(!document.hidden) poll(); }, POLL_MS);
        const now = () => { if(!document.hidden){ poll(); push(); } };
        document.addEventListener('visibilitychange', now);
        window.addEventListener('focus', now);
        window.addEventListener('online', now);
        // Last chance to send edits made just before closing the tab.
        window.addEventListener('pagehide', () => {
          s.dirty.forEach(t => {
            try {
              fetch('api/docs/' + encodeURIComponent(t), { method: 'PUT', keepalive: true,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: s.docs[t] }) });
            } catch(e){}
          });
        });
      })();
      return Promise.race([first, new Promise(r => setTimeout(r, timeout))]);
    }
  };

  window.ToolboxStore = ToolboxStore;
})();
