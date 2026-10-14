FROM python:3.12-slim
WORKDIR /app
# 標準ライブラリだけで書いているので、pip install は要らない
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/tmp \
    WT_UMASK=0002
COPY server.py index.html ./
COPY css ./css
COPY js ./js
# NAS の共有フォルダから COPY すると実行権限つき（755）になるので、読み取りだけにそろえる
RUN chmod -R a=rX /app && mkdir /data
# 既定は root 以外。実際には docker-compose.yaml で、このアプリ専用の NAS ユーザー（WT_UID / WT_GID）で動かす
USER 10001:10001
EXPOSE 8000
# /data = app-data/webtoolbox（メモ帳・付箋などの中身）
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000", "--data", "/data"]
