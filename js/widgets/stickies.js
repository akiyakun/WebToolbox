/* Stickies: one board of sticky notes (a doc tool, so the notes are kept when closed and shared between devices).
   Each note has a checkbox that turns it grey; colour and deleting via the right-click menu on the note. */
(function(){
  const COLORS = [
    { key:'yellow', label:'黄色',   value:'#fde68a' },
    { key:'orange', label:'オレンジ', value:'#fed7aa' },
    { key:'pink',   label:'ピンク',  value:'#fbcfe8' },
    { key:'purple', label:'紫',     value:'#ddd6fe' },
    { key:'blue',   label:'水色',   value:'#bae6fd' },
    { key:'green',  label:'緑',     value:'#bbf7d0' },
  ];
  const colorOf = key => (COLORS.find(c => c.key === key) || COLORS[0]).value;
  const uid = () => Math.random().toString(36).slice(2, 9);
  const normalize = notes => (Array.isArray(notes) ? notes : []).map(n => ({
    id: String(n.id || uid()), text: String(n.text || ''), color: COLORS.some(c => c.key === n.color) ? n.color : 'yellow', done: !!n.done
  }));

  Toolbox.register({
    type:'stickies', title:'付箋', icon:'🗒️', desc:'付箋を何枚も貼れるボード。右クリックで色変更・削除', w:250, h:379, doc:true,
    create(root, st, api){
      root.classList.add('sn-body');
      root.innerHTML = `<div class="sn-list"></div><button class="pill sn-add">＋ 付箋を追加</button>`;
      const list = root.querySelector('.sn-list');
      let notes = normalize(st.notes);
      const save = () => api.save({ notes: notes.map(n => ({ ...n })) });
      const find = id => list.querySelector(`.sn[data-id="${CSS.escape(id)}"]`);

      function noteEl(n){
        const el = document.createElement('div');
        el.className = 'sn' + (n.done ? ' done' : '');
        el.dataset.id = n.id;
        el.style.setProperty('--sticky', colorOf(n.color));
        el.innerHTML = `<input type="checkbox" class="sticky-check" title="完了"><textarea class="sticky-text" rows="2" spellcheck="false" placeholder="付箋…"></textarea>`;
        const check = el.querySelector('input'), ta = el.querySelector('textarea');
        check.checked = n.done; ta.value = n.text;
        check.onchange = () => { n.done = check.checked; el.classList.toggle('done', n.done); save(); };
        ta.oninput = () => { n.text = ta.value; save(); };
        return el;
      }
      function render(){
        list.replaceChildren(...notes.map(noteEl));
        if(!notes.length) list.innerHTML = '<p class="sn-empty">付箋はまだありません</p>';
      }
      function focusNote(id, a, b){
        const ta = find(id) && find(id).querySelector('textarea');
        if(!ta) return;
        ta.focus();
        ta.setSelectionRange(a == null ? ta.value.length : a, b == null ? ta.value.length : b);
      }
      function addNote(){
        const n = { id: uid(), text: '', color: notes.length ? notes[notes.length - 1].color : 'yellow', done: false };
        notes.push(n); render(); save();
        find(n.id).scrollIntoView({ block: 'nearest' });
        focusNote(n.id);
      }
      function remove(n){
        if(!n.done && n.text.trim() && !confirm('この付箋はまだチェックされていません。\n削除しますか？')) return;
        notes = notes.filter(x => x !== n); render(); save();
      }

      root.querySelector('.sn-add').onclick = addNote;
      render();
      return {
        menu(e){
          const el = e && e.target.closest('.sn'), n = el && notes.find(x => x.id === el.dataset.id);
          const sections = [];
          if(n){
            sections.push(COLORS.map(c => ({ label: c.label, swatch: c.value, active: c.key === n.color,
              action: () => { n.color = c.key; el.style.setProperty('--sticky', c.value); save(); } })));
            sections.push([{ label: 'この付箋を削除', danger: true, action: () => remove(n) }]);
          }
          const more = [{ label: '付箋を追加', action: addNote }];
          if(notes.some(x => x.done)) more.push({ label: 'チェック済みをすべて削除', action: () => { notes = notes.filter(x => !x.done); render(); save(); } });
          sections.push(more);
          return sections;
        },
        // Notes changed on another device: redraw, keeping the note being typed in focused.
        load(data){
          const active = document.activeElement, el = active && root.contains(active) && active.closest('.sn');
          const at = el && { id: el.dataset.id, a: active.selectionStart, b: active.selectionEnd };
          const top = list.scrollTop;
          notes = normalize(data && data.notes);
          render();
          list.scrollTop = top;
          if(at) focusNote(at.id, at.a, at.b);
        },
        destroy(){}
      };
    }
  });
})();
