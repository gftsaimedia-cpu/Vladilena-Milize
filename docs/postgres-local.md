# PostgreSQL cục bộ cho phát triển và kiểm thử

Cấu hình này dành riêng cho máy phát triển. Hai dịch vụ PostgreSQL 16 có volume, tài khoản và cổng riêng: `55432` cho dev và `55433` cho test; cả hai chỉ mở trên loopback. Nó không dùng cấu hình hay volume của `deploy/docker-compose.yml`.

Cần Docker Compose, `openssl` và Node.js theo yêu cầu trong `package.json`. Chạy các lệnh sau từ thư mục gốc dự án trong terminal có quyền kết nối Docker. Tạo mật khẩu một lần; giữ lại file này khi khởi động lại vì đổi biến môi trường không đổi mật khẩu trong volume đã khởi tạo. `.env.postgres-local` đã được `.gitignore` bỏ qua; không chia sẻ nội dung file.

```sh
if [ ! -e .env.postgres-local ]; then
  umask 077
  printf 'LOCAL_PG_DEV_PASSWORD=%s\nLOCAL_PG_TEST_PASSWORD=%s\n' \
    "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .env.postgres-local
fi
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml up -d --wait
```

Kiểm tra hai dịch vụ:

```sh
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml ps
```

Trong cùng terminal, nạp các mật khẩu vào môi trường mà không in chúng:

```sh
set -a
. ./.env.postgres-local
set +a
```

Với mã hiện tại, chạy ứng dụng phát triển trên DB dev bằng lệnh dưới. Các biến cũ được đặt rỗng để file `.env` của ứng dụng không tự nạp lựa chọn DB khác vào tiến trình này:

```sh
DATABASE_URL="postgresql://luong_dev:${LOCAL_PG_DEV_PASSWORD}@127.0.0.1:55432/luong_dev" \
  DB_PATH= PG_TEST_URL= npm start
```

Với bộ test hiện tại, dùng máy chủ test, không truyền URL dev. `PG_TEST_URL` là DB điều khiển riêng; bộ kết nối test hiện tại tạo database tạm cho mỗi tiến trình và xoá database do tiến trình đó tạo khi đóng.

```sh
DATABASE_URL= DB_PATH= \
  PG_TEST_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" \
  node scripts/dev/ts.cjs --test --test-concurrency=4 'test/**/*.test.ts'
```

Bộ test và sandbox đang được chuyển đổi; hướng dẫn `PG_TEST_URL` này mô tả mã hiện tại, chưa phải giao diện cuối cùng của thiết kế PostgreSQL-only. Một số test hiện vẫn dùng PGlite. Chỉ coi việc chuyển đổi hoàn tất sau khi suite mới chạy trên PostgreSQL thật.

Dừng hai dịch vụ mà giữ dữ liệu và mật khẩu:

```sh
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml stop
```

Đừng dùng `down -v` khi cần giữ dữ liệu dev. Nếu thay cổng bằng `LOCAL_PG_DEV_PORT` hoặc `LOCAL_PG_TEST_PORT`, cũng phải sửa cổng tương ứng trong URL ở các lệnh trên.
