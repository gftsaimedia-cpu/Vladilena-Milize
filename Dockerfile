# Giao diện Vue build một lần ở stage riêng; image chạy chỉ mang web/dist (không có node_modules của web, không có mã nguồn web).
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY . .
# NestJS, pg và trình nạp TypeScript (tsx) là phụ thuộc chạy thật; devDependencies (test, kiểm kiểu) không vào image.
RUN npm ci --omit=dev --ignore-scripts
# Exercise the actual image context: the CLI is retained by .dockerignore and its runtime adapter must load from src/.
RUN node --import tsx -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--import','tsx','scripts/ops/pg-backup.ts','__image_context_check__'],{encoding:'utf8'});if(r.status!==1||!r.stderr.includes('Dùng:'))throw new Error('pg-backup CLI/runtime module missing from image build context');"
# Máy chủ phục vụ web/dist khi có (src/platform/http.ts); mã nguồn web/ không cần ở image chạy.
RUN rm -rf /app/web
COPY --from=web /web/dist /app/web/dist
ENV NODE_ENV=production PORT=3000
# Code stays owned by root (read-only for the app); only the data directory belongs to the unprivileged user.
# The directory is created with its owner before VOLUME so a new named volume inherits node:node.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3000
# GET /api/me là route công khai, trả 200 khi máy chủ nhận yêu cầu và mở được DB (không cần cookie, không trả dữ liệu).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/me').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# SIGTERM: src/server.ts đóng êm các luồng SSE rồi thoát; docker stop mặc định chờ 10 giây (compose đặt stop_grace_period).
CMD ["node", "--no-warnings=ExperimentalWarning", "--import", "tsx", "src/server.ts"]
