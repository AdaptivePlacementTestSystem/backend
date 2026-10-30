# syntax=docker/dockerfile:1
# Backend NestJS. Build ở giai đoạn 1, chạy ở giai đoạn 2 (không root).

FROM node:24-alpine AS build
WORKDIR /app
# Gói @apt/shared-types cài từ git GitHub -> cần git
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN apk del git
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/node_modules/@apt/shared-types ./node_modules/@apt/shared-types

USER node
EXPOSE 3001
# Liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
