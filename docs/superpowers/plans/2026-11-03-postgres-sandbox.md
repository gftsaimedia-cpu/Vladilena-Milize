# Kế hoạch chuyển sandbox sang PostgreSQL

Sandbox chỉ được dùng database tạm do tiến trình khởi động của chính nó tạo trên máy chủ PostgreSQL dành riêng cho thử nghiệm. Tên control database giúp bắt lỗi cấu hình; người vận hành vẫn phải trỏ URL đó vào máy chủ thử nghiệm riêng.

## 1. Chặn sandbox mở nhầm database

- [x] Viết test chạy mã khởi động server đến sát ranh giới nạp DB: thiếu tên/URL, tên sai mẫu, control DB sai hoặc URL khác máy chủ/tài khoản/tùy chọn đều bị từ chối; không in mật khẩu.
- [x] Chỉ nhận URL database tạm khớp với control URL và tên do bootstrap truyền; xoá `DB_PATH`, `PG_TEST_URL` kế thừa trước khi nạp DB.

## 2. Quản lý vòng đời DB tạm

- [x] Bootstrap yêu cầu `SANDBOX_PG_CONTROL_URL` trỏ tới `luong_sandbox_control` hoặc `luong_test_control`; không dùng URL ứng dụng kế thừa. Tạo DB tên ngẫu nhiên qua `TemporaryPostgres`, chuyển URL đó cho server, dọn đúng DB đã tạo khi server thoát hoặc nhận tín hiệu.
- [x] Kiểm thử trên PostgreSQL thật: server dùng DB sandbox độc lập ngay cả khi kế thừa URL/path ứng dụng, không khởi động với control URL sai, và DB do bootstrap tạo bị xoá sau khi dừng hoặc server lỗi lúc khởi động.
- [x] Chuyển các test sandbox hiện tại sang bootstrap, giữ các kiểm tra reset/chấm công/lương và tránh cố định cổng khi chạy song song.

## 3. Xác minh và ghi tài liệu

- [x] Kiểm tra reset với quyền của chủ DB, giữ audit và dọn đủ trạng thái liên quan mà không cần tắt trigger bằng siêu người dùng. Đã chạy thử với role tạm có `CREATEDB` và không phải superuser; role được xoá sau thử nghiệm. Test bảo toàn audit đạt.
- [x] Ghi rõ cách cấu hình, quyền cần thiết và giới hạn dọn dẹp khi tiến trình bị SIGKILL hoặc máy bị tắt. Chạy test liên quan trên PostgreSQL thật, typecheck và review trước khi commit.
- [ ] Phần diễn tập backup vẫn phải chuyển khỏi PGlite ở một task riêng; không kết luận toàn bộ sandbox/PostgreSQL-only hoàn tất khi đường này còn dùng PGlite.
