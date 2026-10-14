FROM nginxinc/nginx-unprivileged:1.30-alpine
# ビルド不要の静的ファイルなので、nginx でそのまま配る。状態はブラウザの localStorage にあり、サーバーには何も保存しない
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
# NAS の共有フォルダから COPY すると実行権限つき（755）になるので、読み取りだけにそろえる
USER root
# 作業用プロセスは CPU の数ではなく 2 つに固定（静的ファイルにはこれで足り、pids_limit・mem_limit の中に収まる）
RUN chmod -R a=rX /usr/share/nginx/html /etc/nginx/conf.d/default.conf \
 && sed -i 's/^worker_processes .*/worker_processes 2;/' /etc/nginx/nginx.conf \
 && grep -q '^worker_processes 2;' /etc/nginx/nginx.conf
# root 以外（イメージ既定の nginx ユーザー、UID 101）。ファイルを書く場所はないので、NAS のユーザーは要らない
USER 101
EXPOSE 8080
