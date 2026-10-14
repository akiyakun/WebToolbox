# Docker（NAS で動かす）

WebToolbox を UGREEN NAS の Docker で動かし、家の中の LAN のブラウザから `http://192.168.0.100:8000/` で開けるようにする。

ビルド不要の静的ファイル（`index.html`・`css/`・`js/`）を nginx でそのまま配るだけ。ツールの状態（置いたツール・メモの中身・タイマーなど）は**各ブラウザの localStorage** に保存され、サーバーには何も保存しない。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `Dockerfile` | `nginxinc/nginx-unprivileged:1.30-alpine`（root 以外で動く nginx の安定版）。`index.html`・`css/`・`js/` と `docker/nginx.conf` だけをコピーする |
| `docker/nginx.conf` | nginx の設定。ポート 8080 で待ち受け、`Cache-Control: no-cache` を付ける（更新したらリロードだけで反映される）。死活確認用の `/healthz` |
| `docker-compose.yaml` | 安全設定（読み取り専用のコンテナ、権限を全部外す、など）は cloud-drive-sync と同じ。**つなぐフォルダはない** |
| `.env.example` | 待ち受ける IP アドレスとポートの見本。`.env` にコピーして使う（git に入れない） |
| `.dockerignore` | 許可リスト方式。イメージに入れるのは上の静的ファイルと `docker/nginx.conf` だけ（`CLAUDE.md` や `.git` は配らない） |

- WebToolbox は `WT_BIND_IP:WT_PORT`（NAS の LAN の IP アドレスとポート）だけで待ち受ける。ポートはほかのコンテナと重ならない番号にする
- フォルダをつながないので、cloud-drive-sync や view-logger と違い、**アプリ専用の NAS ユーザーは要らない**（コンテナはイメージ既定の `nginx` ユーザー、UID 101 で動く）

## はじめて動かす手順

### 1. SSH で入る

```bash
ssh <管理者のユーザー名>@192.168.0.100
```

### 2. `.env` を作る

リポジトリのフォルダ（`/volume1/docker/WebToolbox`）に `.env` を作る。

```bash
cd /volume1/docker/WebToolbox
cp .env.example .env
vi .env
```

`WT_BIND_IP` を NAS の LAN の IP アドレスにする。ポートを変えるなら `WT_PORT` も。

### 3. 起動する

```bash
cd /volume1/docker/WebToolbox
sudo docker compose up -d --build
sudo docker compose ps
```

`STATUS` が `Up … (healthy)` になれば成功（起動から 30 秒ほどかかる）。ブラウザで `http://192.168.0.100:8000/` を開く。

開けないとき:
- つながらない → UGOS のファイアウォールを使っていれば、LAN からポート 8000 への接続を許可する

## ふだんの操作

すべて SSH で、リポジトリのフォルダ（`/volume1/docker/WebToolbox`）で実行する。

| したいこと | コマンド |
| --- | --- |
| ログを見る | `sudo docker compose logs -f`（Ctrl+C で抜ける） |
| 再起動する | `sudo docker compose restart` |
| 止める | `sudo docker compose down` |
| プログラムを更新する | リポジトリを更新してから `sudo docker compose up -d --build` |

- ファイルはイメージの中にコピーしているので、**リポジトリを書き換えただけでは反映されない**。`--build` で作り直す
- 更新したら、`docker-compose.yaml` の `image:` のタグ（`webtoolbox:0.1.0`）も上げる
- ブラウザ側は `no-cache` なので、作り直したあとは普通のリロードで新しい版になる

## 気をつけること

### 状態はブラウザごと・アドレスごと

localStorage は「ブラウザ × アドレス（`http://192.168.0.100:8000` など）」ごとに分かれる。

- Mac の `http://localhost:8765`（開発用）で置いたツールやメモは、NAS 版には出てこない
- 同じ NAS 版でも、`192.168.0.100` で開いたときと `nas.local` で開いたときは別の状態になる。**開くアドレスは 1 つに決める**
- PC やブラウザが違えば、それぞれ別の状態になる（共有はされない）

### デスクトップ通知は HTTP では使えない

ブラウザは、デスクトップ通知を「安全なページ」（HTTPS か `localhost`）でしか許可しない。`http://192.168.0.100:8000/` は安全なページではないので、**設定の「デスクトップ通知」はオンにできない**。終了音（`Toolbox.beep()`）と画面の点滅は使える。

通知が要るときは、Mac の開発用（`python3 -m http.server 8765` を `localhost` で開く）を使う。
