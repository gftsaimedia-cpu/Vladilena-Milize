# Từ chối cấu hình database mâu thuẫn trong giai đoạn chuyển đổi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngăn `DATABASE_URL` âm thầm thắng cấu hình database test hoặc PGlite được đặt đồng thời, trước khi nền PostgreSQL-only được hoàn thành.

**Architecture:** Kiểm tra các biến chọn database tại `src/platform/db.ts` trước khi khởi tạo `PostgresDatabase`. Trường hợp mâu thuẫn phải dừng với thông báo chỉ nêu tên biến, không in giá trị. Trong giai đoạn chuyển đổi, tổ hợp `PG_TEST_URL` và `DB_PATH` vẫn giữ hành vi hiện tại: nhiều test đang đặt `DB_PATH=:memory:` và sử dụng `PG_TEST_URL` để tạo database PostgreSQL test riêng. Cả hai đường cũ sẽ được loại theo thiết kế PostgreSQL-only đã duyệt.

**Tech Stack:** Node.js >= 22.13, TypeScript, `node:test`, `node:vm`.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Task 1: Không mở database khi các lựa chọn mâu thuẫn

**Files:**
- Create: `test/unit/database-config-isolation.test.ts`
- Modify: `src/platform/db.ts`

- [x] Viết test thực thi phần khởi tạo thực của `src/platform/db.ts` trong `vm`, chặn ngay constructor của adapter DB để không mở kết nối. Kiểm tra `DATABASE_URL` đi cùng `DB_PATH` hoặc `PG_TEST_URL` đều bị từ chối trước constructor, thông báo không chứa URL; kiểm tra các cấu hình đơn và tổ hợp test cũ vẫn chọn đúng adapter.
- [x] Chạy test, xác nhận các trường hợp mâu thuẫn thất bại do constructor được gọi trước khi có rào chắn.
- [x] Thêm kiểm tra tối thiểu trước constructor; hướng dẫn người dùng bỏ cấu hình không chủ đích, không in bí mật.
- [x] Chạy lại test, kiểm tra kiểu, kiểm tra kiến trúc và định dạng ở các file thay đổi. Rà biến môi trường rỗng và cấu hình test cũ.
- [x] Ghi rõ đây là rào chắn tạm, chưa biến hệ thống thành PostgreSQL-only và không thay thế test PostgreSQL thật.

## Task 2: Đảm bảo bộ đo tải dọn database tạm nếu khởi tạo lỗi

**Files:**
- Create: `test/unit/loadtest-db-isolation.test.ts`
- Modify: `scripts/loadtest/run.ts`

- [x] Thực thi phần khởi tạo thật của bộ đo tải với `pg.Pool` giả: khi đã tạo database nhưng việc nạp ứng dụng thất bại, phải đóng pool và xoá đúng database vừa tạo; URL, đường dẫn và URL test kế thừa không được quyết định DB ứng dụng hoặc được `.env` nạp lại.
- [x] Kiểm tra trường hợp `CREATE DATABASE` thất bại: đóng pool nhưng không xoá database nào, kể cả khi tên ngẫu nhiên trùng một DB đã tồn tại.
- [x] Quan sát test thất bại, sau đó đưa toàn bộ giai đoạn tạo/seed/chạy vào vùng cleanup, đánh dấu database chỉ sau khi CREATE thành công, và đặt cấu hình cũ rỗng khi chủ động dùng DB tạm.
- [x] Kiểm tra thêm server thoát bằng signal và lỗi spawn bất đồng bộ; không gửi IPC tới child đã chết hay chờ một sự kiện exit đã qua.
- [x] Chạy lại test và typecheck; không mở socket hoặc thao tác với DB thật trong test đơn vị này. PostgreSQL thật vẫn cần được kiểm riêng.
