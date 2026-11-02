# Chỉ khởi tạo schema mới trên database phù hợp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trước khi thay schema nghiệp vụ, ngăn phiên bản mới tự chạy migration lên database cũ hoặc database không thuộc ứng dụng; khởi tạo database mới an toàn khi nhiều tiến trình cùng khởi động.

**Architecture:** `PostgresDatabase` kiểm tra các quan hệ trong schema `public` trước khi ghi. Database trống được đánh dấu dòng nhận diện phiên bản schema trong `schema_migrations` rồi khởi tạo; database đã có dấu đúng được nâng cấp bằng migration đã biết; mọi database có cấu trúc nhưng thiếu dấu hoặc có migration lạ bị từ chối trước khi ghi. Dùng PostgreSQL advisory transaction lock và một giao dịch cho kiểm tra cùng các migration để hai tiến trình không cùng khởi tạo và lỗi có thể hoàn tác. Dấu là kiểm tra tương thích, không phải cơ chế phân quyền. Trong thời gian chuyển tiếp, adapter PGlite cũ vẫn phải hoạt động cho tới khi được thay bằng PostgreSQL trong kế hoạch nền tiếp theo.

**Tech Stack:** PostgreSQL 16, `pg`, TypeScript, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Global Constraints

- Không tự xoá, chuyển đổi hay sửa database cũ; không đưa bí mật vào thông báo lỗi.
- Test chỉ tạo database tên ngẫu nhiên trên máy chủ `PG_TEST_URL` riêng; chỉ xoá database mà test vừa tạo thành công.
- Migration và đánh dấu khởi tạo phải cùng giao dịch; khoá phải được giữ trên cùng kết nối.
- PostgreSQL thật là bằng chứng bắt buộc; đường PGlite chỉ là tương thích tạm thời.

## Review Focus

1. Database trống: schema và dấu tương thích đều có sau khi khởi động; có thể mở lại không chạy lại migration.
2. Database của ứng dụng cũ đã có `schema_migrations` nhưng chưa có dấu mới: từ chối, không chèn dấu, không sửa dữ liệu.
3. Database có bảng không liên quan và chưa có `schema_migrations`: từ chối, không tạo thêm bảng.
4. Hai tiến trình mở một database mới cùng lúc: cả hai thành công, migration không chạy hai lần.
5. Dấu hoặc danh sách migration không nhận diện được: từ chối, không âm thầm bỏ qua migration của phiên bản khác.

## Task 1: Kiểm tra và khởi tạo an toàn

**Files:**
- Create: `test/db/fresh-schema-guard.test.ts`
- Modify: `src/data/postgres-database.ts`
- Modify: `test/unit/postgres-pool.test.ts` nếu test đếm chính xác số dòng metadata.

- [x] Viết test PostgreSQL thật cho 5 Review Focus. Tạo từng database ngẫu nhiên qua kết nối điều khiển test; dùng `try/finally` đóng mọi pool và chỉ xoá DB đã tạo thành công. Kiểm nguyên vẹn dữ liệu/bảng cũ sau lần từ chối.
- [x] Chạy test trên PostgreSQL test riêng và quan sát RED vì mã hiện tại tự áp migration lên schema không nhận diện hoặc không có dấu nhận diện.
- [x] Sửa `#migrate()` để mở một giao dịch trên một kết nối, lấy advisory lock, kiểm tra relations và dấu trước ghi, áp các migration theo thứ tự và ghi dấu trong cùng giao dịch. Nếu lỗi thì rollback, giữ nguyên database ban đầu.
- [x] Mở rộng test và guard cho schema khác, function/type không có bảng và cấu hình `search_path` của kết nối; đảm bảo mọi kết nối dùng schema đã kiểm tra.
- [x] Chạy test GREEN trên PostgreSQL thật, test PostgreSQL pool, typecheck và các test API đại diện. PostgreSQL-only và chuẩn hoá các nhóm dữ liệu vẫn còn phải thực hiện.

## Task 2: Đóng database test tạm an toàn

**Files:**
- Create: `test/db/isolated-database-close.test.ts`
- Modify: `src/data/postgres-database.ts`

- [x] Viết test PostgreSQL thật: khi kết nối khác đang đóng êm, `close()` chờ trước khi xoá thay vì dùng FORCE ngay; khi `CREATE DATABASE` thất bại thì không gửi bất kỳ lệnh DROP nào.
- [x] Chạy test RED, sau đó chờ các backend tự đóng trong thời gian giới hạn trước khi dọn DB và chỉ DROP nếu tiến trình đã tạo DB thành công. Vẫn đóng admin pool kể cả lỗi.
- [x] Chạy lại test cùng kiểm thử đồng thời tạm ứng; xác nhận không còn lỗi bất đồng bộ hoặc database tạm bị bỏ lại.
