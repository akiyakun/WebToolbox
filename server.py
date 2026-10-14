"""WebToolbox のサーバー（静的ファイルを配る ＋ ツールの中身を保存する）

標準ライブラリだけで動く。ボードの配置やタイマーはブラウザに保存し、
ここに保存するのは「中身を持つツール」（メモ帳・付箋など）の中身だけ。

使い方:
    python3 server.py                          # http://localhost:8765 （中身は ./data に保存）
    python3 server.py --host 0.0.0.0 --port 8000 --data /data   # コンテナの中

API:
    GET /api/docs?after=<rev>   rev が after より新しい中身だけを返す {"epoch", "rev": 最新, "docs": {種類: {"rev", "data"}}}
    PUT /api/docs/<種類>        {"data": ...} を保存して {"rev": 新しい rev} を返す（後から保存したほうが残る）
"""

import argparse
import json
import mimetypes
import os
import re
import shutil
import threading
import time
import uuid
from email.utils import formatdate, parsedate_to_datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.realpath(__file__))
# 配るのはこれだけ（server.py・.env・docs などは配らない）
PUBLIC_FILES = {"index.html"}
PUBLIC_DIRS = ("css", "js")

DOC_NAME = re.compile(r"^[a-z0-9_-]{1,32}$")
MAX_BODY = 1024 * 1024          # 1つの中身の上限（1MB）
MAX_DOCS = 32                   # 中身の種類の数の上限（ログインがないので、NAS の容量をいっぱいにされないように）
BACKUP_EVERY = 60 * 60          # 上書きする前の中身を、1時間に1回まで残す
BACKUP_KEEP = 72                # 種類ごとに残す数

HEADERS = {
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    # 読み込むのは自分のファイルだけ。ほかのサイトの iframe に埋め込ませない
    "Content-Security-Policy": "default-src 'self'; object-src 'none'; base-uri 'none'; "
                               "form-action 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
}


class Store:
    """中身を data/docs/<種類>.json に1つずつ保存する。rev は全体で増え続ける番号"""

    def __init__(self, data_dir):
        self.docs_dir = os.path.join(data_dir, "docs")
        self.backup_dir = os.path.join(data_dir, "backup")
        os.makedirs(self.docs_dir, exist_ok=True)
        self.lock = threading.Lock()
        self.docs = {}
        for name in sorted(os.listdir(self.docs_dir)):
            stem, ext = os.path.splitext(name)
            if ext != ".json" or not DOC_NAME.match(stem):
                continue
            try:
                with open(os.path.join(self.docs_dir, name), encoding="utf-8") as f:
                    doc = json.load(f)
                self.docs[stem] = {"rev": int(doc["rev"]), "data": doc["data"]}
            except (OSError, ValueError, KeyError, TypeError) as e:
                print(f"読み込めない中身を飛ばしました: {name} ({e})", flush=True)
        self.rev = max((d["rev"] for d in self.docs.values()), default=0)
        # データの世代の印。docs/ を消して作り直すと変わるので、ブラウザは手元の番号を捨てて全部取り直す
        epoch_path = os.path.join(self.docs_dir, "epoch")
        try:
            with open(epoch_path, encoding="utf-8") as f:
                self.epoch = f.read().strip()
        except FileNotFoundError:
            self.epoch = ""
        if not self.epoch:
            self.epoch = uuid.uuid4().hex
            with open(epoch_path, "w", encoding="utf-8") as f:
                f.write(self.epoch + "\n")

    def changed_after(self, after):
        with self.lock:
            return self.rev, {k: d for k, d in self.docs.items() if d["rev"] > after}

    def info(self, after):
        rev, docs = self.changed_after(after)
        return {"epoch": self.epoch, "rev": rev, "docs": docs}

    def put(self, name, data):
        """保存して新しい rev を返す。種類が多すぎて新しく作れないときは None"""
        with self.lock:
            if name not in self.docs and len(self.docs) >= MAX_DOCS:
                return None
            path = os.path.join(self.docs_dir, name + ".json")
            self._backup(name, path)
            self.rev += 1
            doc = {"rev": self.rev, "updated": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "data": data}
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(doc, f, ensure_ascii=False, indent=1)
            os.replace(tmp, path)
            self.docs[name] = {"rev": self.rev, "data": data}
            return self.rev

    def _backup(self, name, path):
        """後から保存したほうが残るので、上書きで消えた中身を戻せるように、ときどき控えを取っておく"""
        if not os.path.exists(path):
            return
        folder = os.path.join(self.backup_dir, name)
        os.makedirs(folder, exist_ok=True)
        backups = sorted(f for f in os.listdir(folder) if f.endswith(".json"))
        if backups and time.time() - os.path.getmtime(os.path.join(folder, backups[-1])) < BACKUP_EVERY:
            return
        # copyfile（copy2 ではない）: 控えの更新時刻を「控えを取った時刻」にする。上の 1 時間の判定に使う
        shutil.copyfile(path, os.path.join(folder, time.strftime("%Y%m%d-%H%M%S") + ".json"))
        for old in backups[:max(0, len(backups) + 1 - BACKUP_KEEP)]:
            os.remove(os.path.join(folder, old))


class Handler(BaseHTTPRequestHandler):
    server_version = "WebToolbox"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = 30  # ブラウザが開いたままにした接続を閉じる（1接続に1スレッド使うため）
    store: Store = None
    allowed_hosts: set = set()

    # ---- 共通 ----

    def log_message(self, fmt, *args):
        pass  # アクセスのログは出さない（エラーは別に出す）

    def send(self, status, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(status)
        for k, v in {**HEADERS, **(extra or {})}.items():
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status, obj):
        self.send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def host_ok(self):
        """DNS リバインディング対策: 決めたホスト名で開かれたときだけ答える"""
        host = (self.headers.get("Host") or "").strip().lower()
        host = host[1:host.index("]")] if host.startswith("[") and "]" in host else host.rsplit(":", 1)[0]
        return host in self.allowed_hosts

    def same_origin(self):
        """書き込みは、このページ自身からだけ受け付ける（ほかのサイトからの送信を断る）"""
        if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
            return False
        origin = self.headers.get("Origin")
        return origin is None or urlsplit(origin).netloc.lower() == (self.headers.get("Host") or "").lower()

    # ---- GET / HEAD ----

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/healthz":
            return self.send(HTTPStatus.OK, b"ok\n")
        if not self.host_ok():
            return self.send(HTTPStatus.FORBIDDEN, "このアドレスでは開けません。\n".encode("utf-8"))
        if url.path == "/api/docs":
            try:
                after = int(parse_qs(url.query).get("after", ["0"])[0])
            except ValueError:
                after = 0
            return self.send_json(HTTPStatus.OK, self.store.info(after))
        self.send_static(url.path)

    def send_static(self, path):
        rel = "index.html" if path == "/" else path.lstrip("/")
        parts = rel.split("/")
        allowed = rel in PUBLIC_FILES or (len(parts) > 1 and parts[0] in PUBLIC_DIRS)
        if not allowed or any(p in ("", ".", "..") or p.startswith(".") for p in parts):
            return self.send(HTTPStatus.NOT_FOUND, b"not found\n")
        full = os.path.realpath(os.path.join(ROOT, *parts))
        if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
            return self.send(HTTPStatus.NOT_FOUND, b"not found\n")
        st = os.stat(full)
        etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}"'
        last_modified = formatdate(st.st_mtime, usegmt=True)
        cache = {"ETag": etag, "Last-Modified": last_modified}
        if self.not_modified(etag, st.st_mtime):
            self.send_response(HTTPStatus.NOT_MODIFIED)
            for k, v in {**HEADERS, **cache}.items():
                self.send_header(k, v)
            self.end_headers()
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            body = f.read()
        self.send(HTTPStatus.OK, body, ctype, cache)

    def not_modified(self, etag, mtime):
        inm = self.headers.get("If-None-Match")
        if inm is not None:
            return etag in [t.strip() for t in inm.split(",")]
        ims = self.headers.get("If-Modified-Since")
        if ims:
            try:
                return int(mtime) <= parsedate_to_datetime(ims).timestamp()
            except (TypeError, ValueError):
                return False
        return False

    # ---- PUT ----

    def reject(self, status, error):
        """本文を読まずに断る。読み残した本文が次の要求の頭として読まれないように、接続を閉じる"""
        self.close_connection = True
        self.send(status, json.dumps({"error": error}).encode("utf-8"), "application/json; charset=utf-8",
                  {"Connection": "close"})

    def do_PUT(self):
        url = urlsplit(self.path)
        m = re.fullmatch(r"/api/docs/([^/]+)", url.path)
        if not self.host_ok() or not self.same_origin():
            return self.reject(HTTPStatus.FORBIDDEN, "forbidden")
        if not m or not DOC_NAME.match(m.group(1)):
            return self.reject(HTTPStatus.NOT_FOUND, "not found")
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.reject(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "json only")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            return self.reject(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "too large")
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            data = body["data"]
        except (UnicodeDecodeError, ValueError, KeyError, TypeError):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "bad request"})
        try:
            rev = self.store.put(m.group(1), data)
        except OSError as e:
            print(f"保存できませんでした: {m.group(1)} ({e})", flush=True)
            return self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "save failed"})
        if rev is None:
            print(f"中身の種類が上限（{MAX_DOCS}）に達したため、保存しませんでした: {m.group(1)}", flush=True)
            return self.send_json(HTTPStatus.INSUFFICIENT_STORAGE, {"error": "too many docs"})
        self.send_json(HTTPStatus.OK, {"rev": rev})


def main():
    parser = argparse.ArgumentParser(description="WebToolbox のサーバー")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", default=os.path.join(ROOT, "data"), help="中身の保存先")
    parser.add_argument("--allowed-hosts", default=os.environ.get("WT_ALLOWED_HOSTS", "localhost,127.0.0.1"),
                        help="開くときに使うホスト名（カンマ区切り）")
    args = parser.parse_args()
    # 作るファイルの権限（グループのメンバーも書き換えられるように。NAS で SMB から整理できる）
    if os.environ.get("WT_UMASK"):
        os.umask(int(os.environ["WT_UMASK"], 8))
    try:
        Handler.store = Store(args.data)
    except PermissionError as e:
        raise SystemExit(f"次の場所を読み書きする権限がありません: {e.filename}")
    Handler.allowed_hosts = {h.strip().lower() for h in args.allowed_hosts.split(",") if h.strip()}
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print(f"WebToolbox を起動しました: http://{args.host}:{args.port}/ （中身の保存先: {args.data}）", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
