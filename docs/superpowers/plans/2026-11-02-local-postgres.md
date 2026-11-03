# PostgreSQL cục bộ tách biệt cho dev và test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuẩn bị hai máy chủ PostgreSQL cục bộ tách biệt để phát triển và chạy test mà không dùng database vận hành.

**Architecture:** Một file Docker Compose riêng, có project name riêng, chạy PostgreSQL 16 cho dev và cho test trên hai cổng loopback và hai volume khác nhau. Test dùng tài khoản test có quyền tạo/xoá database test tạm; không cấp URL dev cho test. Mật khẩu được tạo và giữ trong file `.env` đã được Git bỏ qua.

**Tech Stack:** Docker Compose, PostgreSQL 16, shell, Node.js.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Task 1: Chuẩn bị môi trường cục bộ

**Files:**
- Create: `deploy/docker-compose.postgres-local.yml`
- Create: `docs/postgres-local.md`

- [x] Khai báo hai dịch vụ PostgreSQL riêng, hai volume và cổng chỉ nghe `127.0.0.1`; bắt buộc cung cấp mật khẩu riêng, không lưu mật khẩu mặc định trong file.
- [x] Viết hướng dẫn tạo file mật khẩu chỉ khi chưa tồn tại; khởi động, kiểm tra readiness, chọn `DATABASE_URL` cho dev và `PG_TEST_URL` cho bộ test hiện hành; không yêu cầu in mật khẩu hoặc URL.
- [x] Kiểm định cấu hình Compose và đối chiếu việc cách ly cổng, tên dịch vụ, volume, URL; không xoá volume hay DB sẵn có. `docker compose config --quiet` đạt với mật khẩu giả.
- [ ] Khi môi trường cho phép Docker/socket, khởi động hai dịch vụ, xác nhận chúng là hai PostgreSQL riêng, chạy thử test phù hợp, kiểm tra có thể dừng mà không xoá dữ liệu. **Đã khởi động, xác nhận PostgreSQL 16.15 riêng và chạy test; chưa thử dừng/khởi động lại.**
