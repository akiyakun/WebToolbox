/* Memo widget: plain-text notepad, no auto wrap, scrolls both ways. Registered in 1-column and 2-column widths,
   each a doc tool with its own text (kept when closed, shared between devices through the server). */
(function(){
  function create(root, st, api){
    root.classList.add('memo-body');
    root.innerHTML = `<textarea class="memo" wrap="off" spellcheck="false" placeholder="メモを入力…"></textarea>`;
    const ta = root.querySelector('textarea');
    ta.value = st.text || '';
    ta.oninput = () => api.save({ text: ta.value });
    return {
      // Text changed on another device: replace it, keeping the caret and scroll position where they were.
      load(data){
        const text = (data && data.text) || '';
        if(text === ta.value) return;
        const { selectionStart: a, selectionEnd: b, scrollTop, scrollLeft } = ta;
        ta.value = text;
        if(document.activeElement === ta) ta.setSelectionRange(Math.min(a, text.length), Math.min(b, text.length));
        ta.scrollTop = scrollTop; ta.scrollLeft = scrollLeft;
      },
      destroy(){}
    };
  }

  // 2-column width = two 250px columns + the 20px grid gap, so it lines up with other tools after tidying.
  Toolbox.register({ type:'memo',  title:'メモ帳', icon:'📝', desc:'1列幅のメモ', w:250, h:253, doc:true, create });
  Toolbox.register({ type:'memo2', title:'メモ帳（ワイド）', icon:'📝', desc:'2列幅のメモ', w:520, h:253, doc:true, create });
})();
