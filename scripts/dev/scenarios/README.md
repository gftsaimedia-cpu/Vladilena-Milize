# Scenario PostgreSQL (01/2026 → 02/2027)

Chạy generate, verify và server trên Linux, macOS hoặc WSL. Các lệnh dừng ngay trên Node Windows để tránh mất bước cleanup bất đồng bộ khi tiến trình nhận Ctrl+C.

Scenario dùng PostgreSQL tạm do chính tiến trình tạo và sở hữu. Trước khi chạy, đặt `SCENARIO_PG_CONTROL_URL` tới một control database riêng tên `luong_scenario_control` hoặc `luong_test_control`. Công cụ không lấy control URL từ `DATABASE_URL` hay `PG_TEST_URL`.

- Dựng dữ liệu bằng API thật: `node --import tsx scripts/dev/scenarios/generate.ts` → `out/scenario-year.pgbak.gz`, `out/events.jsonl`, `out/cases.json`, `out/probes.json`. `--smoke` tạo nhanh 3 nhân vật × 2 tháng; `--only u1,u2`, `--from`, `--to`, `--variant`, `--no-early` vẫn áp dụng. `--out-dir` chọn thư mục artifact riêng bên trong `scripts/dev/scenarios/out`; `--out` đổi tên snapshot trong thư mục đó. Khi dựng thành công ở thư mục mặc định, snapshot làm việc cũ và `clock.json` bị bỏ để khớp bản dựng mới.
- Đối chiếu snapshot: `node --import tsx scripts/dev/scenarios/verify.ts` → `out/report.md`, `out/report.json`. `--db` nhận đường dẫn snapshot `.pgbak.gz`; `--out-dir` chọn thư mục artifact tương ứng. Verify restore vào PostgreSQL tạm riêng, chạy API và kiểm tra trigger, rồi đóng DB. Snapshot nguồn không bị thay đổi.
- Xem giao diện: `node --import tsx scripts/dev/scenarios/server.ts` → `http://127.0.0.1:3300`. Server nạp `scenario-year.run.pgbak.gz` nếu đã có, hoặc khởi tạo từ snapshot dựng. Nó chỉ bind loopback. Khi dừng bằng Ctrl+C hoặc SIGTERM, server lưu trạng thái đang làm thành snapshot làm việc và lưu giờ ở `clock.json`. `--fresh` khởi tạo lại từ snapshot dựng; `--at YYYY-MM-DDTHH:mm` chọn giờ bắt đầu nhưng không lùi giờ đã lưu. `--out-dir` chọn bộ artifact khác trong `out`.
- `/__scenario` liệt kê nhân vật; `/__scenario/as/<tài khoản>` mở giao diện của người đó. `POST /__scenario/clock {"local":"YYYY-MM-DDTHH:mm"}` và `POST /__scenario/user {"username":"…"}` (cũng nhận alias `/__sandbox/clock` và `/__sandbox/user`) cần header `x-scenario-control: 1` hoặc `x-sandbox-control: 1`, cùng Origin.

Mỗi lệnh tạo DB PostgreSQL tạm riêng và chỉ xóa DB được tạo bởi chính lệnh đó. Snapshot và báo cáo nằm trong `out/` (không đưa vào git). Nếu tiến trình server bị buộc dừng thay vì shutdown bình thường, snapshot làm việc cuối có thể chưa ghi được; snapshot dựng vẫn còn nguyên.
