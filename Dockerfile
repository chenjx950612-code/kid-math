FROM node:18-alpine

WORKDIR /app

# 注意：项目代码通过 docker-compose 的 bind mount（./:/app）挂载进容器，
# 因此这里不再 COPY 代码——一键更新时 git pull 会直接写回宿主机目录，容器重启即生效。
# 仅安装 git 供一键更新使用（alpine 默认不含 git）。
RUN apk add --no-cache git

EXPOSE 3333

CMD ["node", "server.js"]
