# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./
COPY prisma ./prisma/

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 生产阶段
FROM node:18-alpine

WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache curl

# 复制 package.json
COPY package*.json ./
COPY prisma ./prisma/

# 安装生产依赖
RUN npm ci --only=production

# 生成 Prisma 客户端
RUN npx prisma generate

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# 启动应用（先执行迁移）
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
