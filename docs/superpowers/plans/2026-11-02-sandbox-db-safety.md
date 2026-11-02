# Ngăn sandbox chọn nhầm database — kế hoạch lát an toàn đầu tiên

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngăn sandbox hiện tại kết nối hoặc xoá PostgreSQL được kế thừa từ môi trường trước khi hoàn tất chuyển sandbox sang PostgreSQL cách ly.

**Architecture:** Trước lần nạp DB đầu tiên, xoá hai biến có độ ưu tiên cao hơn và ép DB sandbox hiện tại vào bộ nhớ. Test chạy phần khởi tạo thật trong một môi trường giả và quan sát cấu hình ngay tại ranh giới nạp DB; không mở DB hoặc socket. Đây là thay đổi tạm thời để loại rủi ro, không phải hoàn thành mục tiêu bỏ PGlite.

**Tech Stack:** Node.js >= 22.13, TypeScript, `node:test`, `node:vm`.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Global Constraints

- Sandbox không được dùng `DATABASE_URL` hoặc `PG_TEST_URL` được kế thừa khi mở DB và đặt lại dữ liệu.
- Không kết nối, đọc, ghi hoặc xoá database thật trong lúc test.
- Lát an toàn này chỉ sửa sandbox hiện tại; giai đoạn tiếp theo thay toàn bộ PGlite bằng PostgreSQL riêng cho dev/test/sandbox theo spec đã duyệt.
- Không chạm các DB, file `.env` thật, remote Git hoặc triển khai.

## Review Focus

1. Cả `DATABASE_URL` và `PG_TEST_URL` có sẵn: trước khi nạp `src/platform/db`, sandbox phải loại cả hai và chọn DB RAM tạm.
2. Chỉ `PG_TEST_URL` có sẵn: không được tạo hoặc xoá database test trên máy chủ theo biến kế thừa.
3. `DB_PATH` bên ngoài có sẵn: sandbox phải thay bằng `:memory:`.
4. Không biến DB nào có sẵn: sandbox vẫn chuẩn bị DB RAM như trước.
5. Các biến không thuộc chọn DB không bị mất; test không dùng giá trị bí mật thực tế.

---

### Task 1: Rào chắn cấu hình sandbox hiện tại

**Files:**
- Create: `test/unit/sandbox-db-isolation.test.ts`
- Modify: `scripts/dev/sandbox-server.ts`

**Interfaces:**
- Consumes: môi trường tiến trình sandbox và ranh giới `require('../../src/platform/db')` hiện tại.
- Produces: môi trường tại ranh giới nạp DB có `DB_PATH=':memory:'`, không có `DATABASE_URL` hoặc `PG_TEST_URL`; các biến khác giữ nguyên.

- [ ] **Step 1: Viết test thất bại.** Nạp phần khởi tạo thực của `scripts/dev/sandbox-server.ts` tới đúng lần require `src/platform/db` trong `vm`, với `process.env` giả. Chặn require DB và ghi lại biến môi trường tại ranh giới, không thực sự nạp DB. Kiểm đủ 5 trường hợp Review Focus; ví dụ môi trường giả gồm `DATABASE_URL='postgres://example.invalid/real'`, `PG_TEST_URL='postgres://example.invalid/test'`, `DB_PATH='/fake/old'`, `KEEP_ME='yes'` phải cho kết quả `{ DATABASE_URL: undefined, PG_TEST_URL: undefined, DB_PATH: ':memory:', KEEP_ME: 'yes' }`.
- [ ] **Step 2: Chạy test và xác nhận RED.** `node --import tsx --test test/unit/sandbox-db-isolation.test.ts`; phải thất bại vì URL PostgreSQL kế thừa còn có tại ranh giới, không phải vì mở socket hay lỗi test.
- [ ] **Step 3: Sửa tối thiểu.** Trong `scripts/dev/sandbox-server.ts`, trước khi nạp `src/platform/db`, xoá `process.env.DATABASE_URL` và `process.env.PG_TEST_URL`; giữ việc đặt `DB_PATH=':memory:'` cho sandbox cũ.
- [ ] **Step 4: Chạy lại test và xác nhận GREEN.** Chạy lại lệnh ở Step 2; mọi trường hợp phải đạt. Chạy các kiểm tra liên quan có thể thực hiện không cần socket; ghi rõ nếu full suite bị hệ thống chặn.
- [ ] **Step 5: Rà lại phạm vi.** Xác nhận không có DB thật bị mở và không có thay đổi ngoài test/sandbox. Ghi rõ lát này chưa loại PGlite và chưa hoàn thành chuyển đổi DB.

## Các kế hoạch tiếp theo

Viết và thực hiện kế hoạch PostgreSQL-only cho driver, test, sandbox, seed và backup; tiếp đó chia kế hoạch chuẩn hoá theo các nhóm trong spec (chấm công/lịch, tạm ứng/quyền/cài đặt, tham số/danh mục, khoản sửa và bản chụp). Mỗi nhóm cần test trên PostgreSQL thật. Chỉ sau nền DB mới đi tiếp sang rà backend, rồi frontend.
