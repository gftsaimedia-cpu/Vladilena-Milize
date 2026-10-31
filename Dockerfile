# Giao diện Vue build một lần ở stage riêng; image chạy chỉ mang web/dist (không có node_modules của web, không có mã nguồn web).
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Trang cũ trong public/ vẫn nằm cùng máy chủ nên liên kết "trang cũ" của giao diện Vue trỏ cùng nguồn gốc ("/" = không thêm tiền tố).
ARG VITE_LEGACY_ORIGIN=/
ENV VITE_LEGACY_ORIGIN=$VITE_LEGACY_ORIGIN
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY . .
# Máy chủ phục vụ web/dist khi có (lib/http.js); mã nguồn web/ không cần ở image chạy.
RUN rm -rf /app/web
COPY --from=web /web/dist /app/web/dist
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/luong.sqlite
# Code stays owned by root (read-only for the app); only the data directory belongs to the unprivileged user.
# The directory is created with its owner before VOLUME so a new named volume inherits node:node.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3000
# GET /api/me là route công khai, trả 200 khi máy chủ nhận yêu cầu và mở được DB (không cần cookie, không trả dữ liệu).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/me').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# SIGTERM: server.js đóng êm các luồng SSE rồi thoát; docker stop mặc định chờ 10 giây (compose đặt stop_grace_period).
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
