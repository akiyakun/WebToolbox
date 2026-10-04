/* Sticky note: no title bar (drag the note itself), checkbox on the left turns it grey,
   colour and closing via the right-click menu. */
(function(){
  const COLORS = [
    { key:'yellow', label:'黄色',   value:'#fde68a' },
    { key:'orange', label:'オレンジ', value:'#fed7aa' },
    { key:'pink',   label:'ピンク',  value:'#fbcfe8' },
    { key:'purple', label:'紫',     value:'#ddd6fe' },
    { key:'blue',   label:'水色',   value:'#bae6fd' },
    { key:'green',  label:'緑',     value:'#bbf7d0' },
  ];

  Toolbox.register({
    type:'sticky', title:'付箋', icon:'🗒️', desc:'2行の付箋。右クリックで色変更・閉じる', w:250, h:60, headless:true,
    create(root, st, api){
      let color = COLORS.some(c => c.key === st.color) ? st.color : 'yellow';
      let done = !!st.done;
      api.el.classList.add('sticky');
      root.classList.add('sticky-body');
      root.innerHTML = `<input type="checkbox" class="sticky-check" title="完了"><textarea class="sticky-text" rows="2" spellcheck="false" placeholder="付箋…"></textarea>`;
      const check = root.querySelector('input'), ta = root.querySelector('textarea');
      ta.value = st.text || '';
      const save = () => api.save({ text: ta.value, color, done });
      const render = () => {
        api.el.style.setProperty('--sticky', COLORS.find(c => c.key === color).value);
        api.el.classList.toggle('done', done);
        check.checked = done;
      };
      check.onchange = () => { done = check.checked; render(); save(); };
      ta.oninput = save;
      render();
      return {
        menu: () => [COLORS.map(c => ({ label: c.label, swatch: c.value, active: c.key === color,
          action: () => { color = c.key; render(); save(); } }))],
        // Clicking the note without dragging starts typing at the end of the text.
        tap(){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); },
        closeWarning: () => ta.value.trim() ? '付箋に入力された内容があります。\n閉じると内容は削除されます。閉じますか？' : '',
        destroy(){}
      };
    }
  });
})();
