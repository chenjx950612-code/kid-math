FROM node:18-alpine

# 替换为阿里云镜像源（飞牛 NAS 在国内，官方 CDN 偶尔会抽风）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app

# 注意：项目代码通过 docker-compose 的 bind mount（./:/app）挂载进容器，
# 因此这里不再 COPY 代码——一键更新时 git pull 会直接写回宿主机目录，容器重启即生效。
# 仅安装 git 供一键更新使用（alpine 默认不含 git）。
# 阿里云镜像偶发也会失败，加 5 次重试保证容器能起来
RUN for i in 1 2 3 4 5; do \
      apk add --no-cache git && break; \
      echo "apk install failed (attempt $i/5), retrying in 10s..."; \
      sleep 10; \
    done && \
    git config --global --add safe.directory /app

EXPOSE 3333

CMD ["node", "server.js"]