# Hạ tầng PostgreSQL riêng cho từng tiến trình kiểm thử

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo nền cho test và sandbox dùng các database PostgreSQL tạm, do công cụ kiểm thử sở hữu và dọn dẹp; ứng dụng cuối cùng chỉ nhận `DATABASE_URL`.

**Architecture:** Một công cụ quản lý database tạm tạo tên ngẫu nhiên có tiền tố theo mục đích trên máy chủ test được chỉ định riêng, chỉ dọn database đã CREATE thành công và đóng pool khi lỗi. Một runner về sau tạo database cho từng file test ở tiến trình cha, truyền URL đó làm `DATABASE_URL` cho tiến trình con, chờ kết thúc và dọn kể cả test thất bại. Sandbox và diễn tập khôi phục dùng cùng nguyên tắc tạo database riêng. Chuyển từng công cụ/test khỏi `DB_PATH`, `PG_TEST_URL` của ứng dụng và PGlite; không xoá các test nghiệp vụ chỉ vì cách dựng DB thay đổi.

**Tech Stack:** PostgreSQL 16, `pg`, TypeScript, Node.js >= 22.13, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Global Constraints

- `PG_TEST_URL` hoặc cấu hình admin cho sandbox chỉ được dùng bởi công cụ test/sandbox; không phải lựa chọn DB thứ hai của ứng dụng sau chuyển đổi.
- Công cụ chỉ tạo và xoá database do chính lần chạy tạo thành công; tên lấy từ bộ sinh ngẫu nhiên, không lấy tên từ người dùng ghép vào SQL.
- Không in URL, mật khẩu, dữ liệu cá nhân hay dùng database dev/vận hành làm đích test.
- Không sử dụng PGlite sau khi hoàn thành nền; test DB và dev DB độc lập.

## Review Focus

1. CREATE thất bại hoặc tên đã tồn tại: không DROP database có sẵn, đóng kết nối admin.
2. Lỗi giữa test hoặc lúc khởi động: database đã tạo được dọn; nếu DROP thất bại phải báo lỗi và vẫn đóng admin pool.
3. Hai file test, tiến trình con và sandbox: mỗi đối tượng dùng đúng DB được tạo riêng, không kế thừa URL app thật.
4. Dừng tiến trình bằng SIGINT/SIGTERM: runner thu dọn DB đã sở hữu; SIGKILL hoặc mất máy có thể để lại DB và phải nhận diện được để dọn thủ công an toàn.
5. Test nghiệp vụ cũ dùng DB_PATH, kịch bản demo và backup/restore cần được chuyển thật sự; không chỉ xoá dependency hoặc đổi nhãn test.

## Task 1: Công cụ sở hữu database tạm

**Files:**
- Create: `scripts/dev/temporary-postgres.ts`
- Create: `test/db/temporary-postgres.test.ts`
- Modify: `test/db/fresh-schema-guard.test.ts` sau khi helper được kiểm chứng.

- [x] Viết test PostgreSQL thật cho tạo DB ngẫu nhiên, ghi/đọc độc lập, đóng và xác nhận DB đã bị xoá; kiểm trường hợp CREATE trùng tên hoặc thất bại không DROP DB khác; kiểm dọn khi callback ném lỗi và đóng lặp.
- [x] Chạy RED, implement helper với URL admin bắt buộc và loại mục đích nằm trong danh sách cố định; chỉ lưu tên nội bộ đã tạo thành công, dọn pool trong `finally`, chờ backend đóng trước khi dùng FORCE có giới hạn. Từ chối tên control database không thuộc bộ nhận diện dành cho test/sandbox/drill/scenario trước khi kết nối.
- [x] Chạy GREEN trên máy chủ test riêng; dùng helper trong một fixture PostgreSQL hiện có, chạy lại kiểm thử schema và typecheck.

## Task 2: Runner PostgreSQL thử nghiệm

**Files:**
- Create: `scripts/test/postgres-runner.ts`
- Create: `test/db/postgres-runner.test.ts`
- Create: fixture test con trong `test/fixtures/postgres-runner/`.

- [x] Viết test chạy runner thật với hai fixture đồng thời trên PostgreSQL: mỗi file nhận URL DB khác nhau, `DATABASE_URL` kế thừa bị thay, `DB_PATH` và `PG_TEST_URL` không lọt vào ứng dụng; cả hai DB được dọn sau khi chạy.
- [x] Viết test fixture lỗi và tín hiệu dừng: runner trả mã lỗi, chờ tiến trình con kết thúc và dọn mọi DB đã tạo; lỗi cleanup được báo, không in URL/mật khẩu. Kiểm thêm child bỏ qua SIGTERM và descendant sống sau leader.
- [x] Chạy RED và implement runner chỉ nhận file test được truyền rõ, có giới hạn concurrency; tiến trình cha sở hữu DB, child chỉ nhận URL DB đó cùng biến admin test riêng để các fixture cần tạo DB bổ sung có thể dùng. Runner tiếp tục là lệnh thử riêng, chưa thay `npm test` tới khi toàn bộ test được chuyển.
- [x] Chạy GREEN, typecheck, review độc lập; kiểm không còn database tạm sau mỗi test. Runner hiện hỗ trợ WSL/Linux/macOS, từ chối Windows native vì chưa dọn được cả cây tiến trình an toàn.

## Task 3: Chặn chạy test nhầm database ứng dụng

**Files:**
- Create: `test/helpers/require-isolated-database.ts`
- Create: `test/unit/require-isolated-database.test.ts`
- Modify: `scripts/test/postgres-runner.ts`, fixture runner và `test/api/contract-web.test.ts`.

- [x] Viết test cho guard: chỉ chấp nhận database tên ngẫu nhiên do runner cấp, cùng máy chủ/tài khoản với control DB test riêng; từ chối URL thiếu, sai máy chủ, tên không khớp, `DB_PATH` hoặc `PG_TEST_URL` kế thừa; không in URL/mật khẩu.
- [x] Chạy RED, implement guard chạy trước khi nạp `src/platform/db`; runner truyền tên DB được tạo và URL control chỉ cho test. Có nhánh tương thích tạm cho `PG_TEST_URL` của runner cũ khi không có cấu hình DB khác.
- [x] Chuyển một test hợp đồng API thật sang guard và runner. Chạy nó trên PostgreSQL thật, xác nhận test vẫn đạt và database tạm được dọn. Các test khác chưa chuyển vẫn tiếp tục dùng cơ chế cũ cho đến các task tiếp theo.

## Task 4: Chuyển nhóm dùng API fixture chung

**Files:**
- Modify: `test/helpers/api-fixture.ts` và các test `test/api`, `test/unit` trực tiếp nạp fixture này và còn đặt `DB_PATH=:memory:`.

- [x] Chạy một test dùng fixture chung qua runner mới và xác nhận RED do `DB_PATH` cũ xung đột với URL DB tạm.
- [x] Cho fixture gọi guard trước khi nạp DB, đợi đóng kết nối ở `stop()`; thay các phép gán `DB_PATH=:memory:` trực tiếp của nhóm này bằng guard tại cùng vị trí, không thay nội dung nghiệp vụ test.
- [x] Chạy các test API đại diện qua runner và runner cũ với `PG_TEST_URL` test riêng; sau đó chạy 56 file dùng fixture chung: 439 test đạt, không bỏ qua. Giữ nguyên các test migration/file-path/PGlite đặc biệt để xử lý riêng.

## Task 5: Cho test hạ tầng nhận control URL từ runner

**Files:**
- Create: `test/helpers/postgres-control.ts` và test cấu hình không kết nối DB.
- Modify: các test PostgreSQL trong `test/db` đang đọc trực tiếp `PG_TEST_URL`.

- [x] Chạy một test schema qua runner mới và xác nhận RED vì tiến trình con không nhận `PG_TEST_URL` của ứng dụng.
- [x] Thêm helper lấy `TEST_PG_CONTROL_URL` do runner cấp hoặc `PG_TEST_URL` của runner cũ; kiểm protocol/tên `luong_test_control`, không in URL. Chuyển các test PostgreSQL sang helper, giữ nguyên dữ liệu và kiểm thử nghiệp vụ.
- [x] Chạy các test schema, manager, runner và đồng thời tạm ứng qua runner mới; kiểm không còn database tạm.

## Task 6: Chuyển test trực tiếp đặt DB_PATH đơn giản

**Files:**
- Modify: các test trong `test/api` và `test/unit` có đúng một phép gán DB_PATH ở cấp file, không dùng DB_PATH cho subprocess/kiểm tra migration.

- [x] Chạy một test repository trực tiếp qua runner mới và xác nhận RED do `DB_PATH` xung đột.
- [x] Thay đúng phép gán cấp file bằng guard test; giữ nguyên hành vi test, không sửa các test có DB_PATH động, test sandbox, PGlite socket hoặc test chuyển dữ liệu cũ.
- [x] Chạy nhóm 70 file đã chuyển trên PostgreSQL thật: 673/673 test đạt, không bỏ qua. Lượt đầu phát hiện loader TypeScript không truyền xuống tiến trình con; thêm test tái hiện, sửa runner rồi chạy lại cả nhóm. Test phân công hàng loạt đạt ngưỡng PostgreSQL, thao tác chính khoảng 8 giây. Xác nhận không còn DB test tạm.

## Các task tiếp theo cần hoàn thiện sau Task 1

- Chuyển script `test`, `test:unit`, `test:api` sang runner sau khi mọi test tương thích.
- Chuyển toàn bộ test khỏi `DB_PATH`/PGlite và bảo đảm test chạy trực tiếp không vô tình dùng URL vận hành.
- Chuyển sandbox, backup/drill, seed/demo và scenario sang PostgreSQL riêng, từng nhóm có test thực.
- Chuyển `PostgresDatabase` và `src/platform/db.ts` sang chỉ `pg.Pool`/`DATABASE_URL`; bỏ PGlite, socket và dependency sau khi mọi caller đã chuyển. Chạy toàn bộ suite trên PostgreSQL thật.
