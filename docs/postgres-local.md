# PostgreSQL cục bộ cho phát triển và kiểm thử

Hai dịch vụ PostgreSQL 16 có volume, tài khoản và cổng riêng, chỉ mở trên loopback: `55432` cho dev (`luong_dev`) và `55433` cho test (`luong_test`, control database `luong_test_control`). Chúng không dùng cấu hình hay volume của `deploy/docker-compose.yml`.

Cần Docker Compose, `openssl` và Node.js theo `package.json`. Chạy các lệnh từ thư mục gốc dự án.

## 1. Dựng dịch vụ

Tạo mật khẩu một lần và giữ file này: đổi biến môi trường không đổi mật khẩu trong volume đã khởi tạo. `.env.postgres-local` đã được `.gitignore` bỏ qua, không chia sẻ nội dung.

```sh
if [ ! -e .env.postgres-local ]; then
  umask 077
  printf 'LOCAL_PG_DEV_PASSWORD=%s\nLOCAL_PG_TEST_PASSWORD=%s\n' \
    "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .env.postgres-local
fi
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml up -d --wait
set -a; . ./.env.postgres-local; set +a
```

Nếu volume đã có từ trước với mật khẩu khác file này, kết nối sẽ báo `password authentication failed`. Đặt lại mật khẩu mà giữ dữ liệu:

```sh
docker exec luong-postgres-local-postgres-dev-1 psql -U luong_dev -d luong_dev -c "ALTER USER luong_dev PASSWORD '${LOCAL_PG_DEV_PASSWORD}'"
docker exec luong-postgres-local-postgres-test-1 psql -U luong_test -d luong_test_control -c "ALTER USER luong_test PASSWORD '${LOCAL_PG_TEST_PASSWORD}'"
```

## 2. Chạy ứng dụng trên DB dev

Schema nằm ở `migrations/postgres/schema.sql`. `npm run db:reset-dev` đưa DB dev về trống rồi nạp lại schema; nó từ chối mọi URL không phải DB trên máy này có tên kết thúc bằng `_dev`. BE tạo tài khoản `admin` khi khởi động lần đầu trên DB trống, mật khẩu lấy từ `ADMIN_PASSWORD`.

```sh
export DATABASE_URL="postgresql://luong_dev:${LOCAL_PG_DEV_PASSWORD}@127.0.0.1:55432/luong_dev"
npm run db:reset-dev
ADMIN_PASSWORD='<mật khẩu admin dev>' npm start        # BE ở http://localhost:3000
(cd web && npm run dev)                                  # FE ở http://127.0.0.1:5173, proxy /api sang BE
```

Đăng nhập: `POST /api/v2/auth/login` (xem `docs/api/v2-contract.md`).

## 3. Kiểm thử

Test BE dùng control database riêng của dịch vụ test; mỗi file test tạo một database tạm và chỉ xoá database do chính nó tạo. Không đặt `PG_TEST_URL` trỏ vào DB dev hoặc DB ứng dụng.

```sh
PG_TEST_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" npm test
```

Test giao diện với BE thật (`web/tests/api`) cần DB dev trống mỗi lần chạy: xem mục "Tests against the real backend" trong `web/tests/README.md`.

`npm run sandbox` mở một BE thử trên DB tạm của dịch vụ test:

```sh
SANDBOX_PG_CONTROL_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" npm run sandbox
```

## 4. Dừng dịch vụ

Dừng mà giữ dữ liệu và mật khẩu:

```sh
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml stop
```

Đừng dùng `down -v` khi cần giữ dữ liệu dev. Nếu đổi cổng bằng `LOCAL_PG_DEV_PORT` hoặc `LOCAL_PG_TEST_PORT`, sửa cổng tương ứng trong các URL ở trên.
