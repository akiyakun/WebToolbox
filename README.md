# WebToolbox

ブラウザでサッと使える小物ツール集。ビルド不要、`python3 server.py` で起動して `http://localhost:8765` を開く（`index.html` を直接開いても動く）。NAS の Docker でも動かせる（[docs/docker.md](docs/docker.md)）。

- ツールをボード上の列グリッドに配置（ドラッグ移動・配置はブラウザに自動保存）
- 収録ツール: タイマー / ストップウォッチ / ListTimer（一覧からタップで即スタート、終了時刻つき） / メモ帳（1列幅・2列幅） / 付箋
- メモ帳・付箋の中身はサーバーに保存され、家と会社など別の端末でも同じものが見られる（閉じても消えない）

## ツールの追加方法
`js/widgets/xxx.js` で `Toolbox.register({type,title,icon,desc,w,create(root,state,api)})` を呼び、`index.html` に script タグを足すだけ。
`api.save(state)` で状態を保存できます。書いた内容を持つツールは `doc: true` にすると、サーバーに保存され端末どうしで共有されます。詳しくは [AGENTS.md](AGENTS.md)。
