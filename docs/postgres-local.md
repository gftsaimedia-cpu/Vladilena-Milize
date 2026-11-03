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

Chạy ứng dụng phát triển trên DB dev bằng URL tường minh dưới đây. Biến đã đặt trong môi trường được `src/env.ts` giữ nguyên khi đọc `.env`:

```sh
DATABASE_URL="postgresql://luong_dev:${LOCAL_PG_DEV_PASSWORD}@127.0.0.1:55432/luong_dev" npm start
```

Với bộ test, dùng máy chủ test, không truyền URL dev. `PG_TEST_URL` là control database riêng. Runner tạo một database tạm cho mỗi file test và chỉ xoá database do chính runner tạo.

```sh
PG_TEST_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" npm test
```

`PG_TEST_URL` phải trỏ tới control database riêng, không phải database dev hoặc ứng dụng. Runner tạo database ngẫu nhiên riêng cho mỗi file test và chỉ xoá các database do chính lần chạy đó tạo.

Để chạy riêng một số file, gọi trực tiếp runner PostgreSQL trên WSL/Linux hoặc macOS. Runner cấp cho mỗi file một DB ngẫu nhiên, rồi đóng và xoá đúng DB đó:

```sh
PG_TEST_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" \
  node --no-warnings=ExperimentalWarning --import tsx scripts/test/postgres-runner.ts --concurrency=2 \
  test/api/contract-web.test.ts test/unit/db-types.test.ts
```

Runner hiện từ chối chạy trực tiếp trên Windows vì chưa có cơ chế dọn toàn bộ cây tiến trình tương đương; trên Windows hãy chạy trong WSL. Tên `luong_test_control` giúp phát hiện cấu hình nhầm, nhưng không tự chứng minh máy chủ là máy test: URL vẫn phải trỏ tới dịch vụ test riêng ở trên.

Sandbox dùng PostgreSQL riêng, tạo một DB tạm mới trên dịch vụ test và không dùng URL ứng dụng kế thừa:

```sh
SANDBOX_PG_CONTROL_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" \
  npm run sandbox
```

Với cấu hình Docker cục bộ ở trên, sandbox dùng `luong_test_control`. Nếu tự tạo máy chủ riêng, có thể dùng control DB `luong_sandbox_control`. Tài khoản phải có quyền `CREATEDB`, sở hữu DB tạm do nó tạo và có thể kết nối control DB; reset sandbox không cần siêu người dùng. Trên Windows chạy qua WSL. Sandbox dọn DB của nó khi server thoát hoặc nhận SIGINT/SIGTERM; SIGKILL hoặc máy tắt đột ngột có thể để lại DB tên `luong_sandbox_` theo sau bởi 24 ký tự hex.

Scenario generation, verification và server dùng `SCENARIO_PG_CONTROL_URL`, một PostgreSQL control DB riêng có quyền `CREATEDB`; không dùng `DATABASE_URL` hay `PG_TEST_URL` làm fallback. Với cấu hình Docker cục bộ ở trên, dùng `luong_test_control`; nếu tự tạo máy chủ riêng, có thể tạo `luong_scenario_control`. Các lệnh scenario hiện hỗ trợ WSL/Linux và macOS, không chạy trực tiếp trên Windows:

```sh
SCENARIO_PG_CONTROL_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" \
  node --import tsx scripts/dev/scenarios/generate.ts --smoke --out-dir scripts/dev/scenarios/out/local-smoke
```

Các lệnh `scripts/dev/scenarios/verify.ts` và `server.ts` dùng cùng control URL; server có thể mở snapshot hiện tại với `--fresh` và dọn database làm việc do chính lần chạy tạo khi thoát.

Seed mẫu ở gốc yêu cầu database PostgreSQL riêng và guard tường minh; không dùng URL của app hoặc biến chọn DB cũ:

```sh
DATABASE_URL="postgresql://luong_dev:${LOCAL_PG_DEV_PASSWORD}@127.0.0.1:55432/luong_dev" \
  SEED_ALLOW_REAL_DB=1 npm run seed
```

Backup drill và công cụ demo cũng cần control database riêng có `CREATEDB`; không dùng `DATABASE_URL` của ứng dụng làm control URL:

```sh
DRILL_PG_CONTROL_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" npm run pg:drill -- --backup=backups/example.pgbak.gz
DEMO_PG_CONTROL_URL="postgresql://luong_test:${LOCAL_PG_TEST_PASSWORD}@127.0.0.1:55433/luong_test_control" node scripts/dev/ts.cjs scripts/db/demo/serve-demo.ts --snapshot=backups/demo/example.pgbak.gz
```

Nếu tự tạo máy chủ riêng, có thể dùng control DB `luong_drill_control` cho backup drill và `luong_demo_control` cho demo. Các lệnh này tạo và dọn database tạm của riêng lần chạy.

Dừng hai dịch vụ mà giữ dữ liệu và mật khẩu:

```sh
docker compose --env-file .env.postgres-local -f deploy/docker-compose.postgres-local.yml stop
```

Đừng dùng `down -v` khi cần giữ dữ liệu dev. Nếu thay cổng bằng `LOCAL_PG_DEV_PORT` hoặc `LOCAL_PG_TEST_PORT`, cũng phải sửa cổng tương ứng trong URL ở các lệnh trên.
