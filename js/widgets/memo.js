/* Memo widget: plain-text notepad, no auto wrap, scrolls both ways. Registered in 1-column and 2-column widths. */
(function(){
  function create(root, st, api){
    root.classList.add('memo-body');
    root.innerHTML = `<textarea class="memo" wrap="off" spellcheck="false" placeholder="メモを入力…"></textarea>`;
    const ta = root.querySelector('textarea');
    ta.value = st.text || '';
    ta.oninput = () => api.save({ text: ta.value });
    return { destroy(){} };
  }

  // 2-column width = two 250px columns + the 20px grid gap, so it lines up with other tools after tidying.
  Toolbox.register({ type:'memo',  title:'メモ帳', icon:'📝', desc:'1列幅のメモ', w:250, h:253, create });
  Toolbox.register({ type:'memo2', title:'メモ帳（ワイド）', icon:'📝', desc:'2列幅のメモ', w:520, h:253, create });
})();
