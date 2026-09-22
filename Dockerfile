# syntax=docker/dockerfile:1

# 依赖层：源码之外的所有 npm 依赖（含 devDependencies，供测试与构建）
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 一次性核验服务：容器启动时执行 代码测试 + 构建检查 + HTTP 冒烟
FROM base AS verify
COPY . .
CMD ["sh", "scripts/verify.sh"]

# 静态产物构建
FROM base AS build
COPY . .
RUN npm run build

# 静态 Web：nginx 托管构建产物，提供 /health 健康检查
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
