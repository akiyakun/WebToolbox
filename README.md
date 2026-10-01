# WebToolbox

ブラウザでサッと使える小物ツール集。ビルド不要、`index.html` を開くだけ（または `python3 -m http.server`）。

- ウィジェットをボード上に自由配置（ドラッグ移動・位置は localStorage に自動保存）
- 収録ツール: タイマー / ストップウォッチ / ListTimer（一覧からタップで即スタート、終了時刻つき）

## ツールの追加方法
`js/widgets/xxx.js` で `Toolbox.register({type,title,icon,desc,w,create(root,state,api)})` を呼び、`index.html` に script タグを足すだけ。
`api.save(state)` で状態を保存できます。
