# Chuẩn hoá dữ liệu duyệt tạm ứng

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ tài liệu `settings.advance_approvals_<tháng>` đang ghi đè toàn bộ nhân sự; lưu yêu cầu tạm ứng thành các dòng có ràng buộc, giữ hợp đồng API và không mất cập nhật khi ghi đồng thời.

**Architecture:** Migration tạo bảng phiên bản tháng và bảng yêu cầu theo người/tháng, không chuyển dữ liệu cũ theo quyết định của chủ dự án. Repository đọc phiên bản và các dòng trong một câu SQL nhất quán, ghi đúng dòng thay đổi; class nghiệp vụ giữ trạng thái/rev và bọc thao tác trong giao dịch với advisory lock theo tháng. Giao dịch lồng vào giao dịch của handler để thay đổi và audit cùng commit. Mỗi thay đổi đơn tăng rev tháng một lần, duyệt lô có thay đổi cũng tăng một lần; duyệt lô rỗng không ghi. Bản ghi rút có status null vẫn giữ rev. Một cột identity giữ thứ tự thêm người của tài liệu cũ; timestamp dùng `TIMESTAMPTZ` và được trả về ISO UTC như API hiện tại.

**Tech Stack:** PostgreSQL 16, TypeScript, Kysely, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-02-postgres-data-design.md`.

## Global Constraints

- Không nhập dữ liệu lịch sử; schema cũ không có dấu tương thích phải bị từ chối trước migration.
- Lưu `month`, `username`, `status`, `rev`, `requested_at`, `requested_by`, `decided_at`, `decided_by`, `reason` vào cột có kiểu và ràng buộc. Không lưu lại dữ liệu tạm ứng hoạt động dưới dạng JSON hay key/value.
- Lưu và audit cùng giao dịch, event chỉ sau commit. Giữ điều kiện, quyền, lỗi stale, timestamp, thứ tự hiển thị, số tiền tính từ engine và hành vi bản chụp lương.
- Test đồng thời dùng ít nhất hai kết nối PostgreSQL độc lập vào database được tạo riêng cho test; test không sửa DB dev/vận hành.

## Review Focus

1. Hai người tạo yêu cầu cùng tháng: cả hai thành công, hai dòng và rev tháng 2; không mất cập nhật ngay cả khi cùng khởi động.
2. Hai thay đổi cùng người với `expectedRev` giống nhau: đúng một thay đổi thành công, thay đổi kia báo stale; một lần tăng rev.
3. Duyệt lô cạnh thao tác khác: rev tháng được kiểm sau khoá, lô cũ bị từ chối; lô rỗng không tăng rev/không tạo dòng.
4. Giao dịch lỗi sau khi đổi yêu cầu: cả hai bảng lẫn audit rollback; dữ liệu không nằm trong `settings`.
5. Rút rồi xin lại, thứ tự danh sách và thời điểm/đối tượng JSON API phải tương đương; status null vẫn giữ rev và không hiện như yêu cầu đang hoạt động.
6. Cửa sổ xin tạm ứng, quyền, khoá kỳ, tính lương và snapshot/backup vẫn đúng; các test cũ kiểm `settings` phải chuyển sang kiểm trạng thái nghiệp vụ thực.

## Task 1: Test và schema

**Files:**
- Create: `test/db/advance-approval-concurrency.test.ts`
- Create: `migrations/postgres/0003_advance_approvals.sql`
- Modify: `scripts/docs/gen-db-types.ts`, `src/data/schema.generated.ts`

- [x] Viết test đồng thời trên PostgreSQL thật, tái hiện lỗi hiện tại với hai giao dịch đọc tài liệu cùng lúc; cả hai thành công nhưng test yêu cầu hai người phải còn đủ. Kiểm rollback, ràng buộc và rev sau khi có schema mới.
- [x] Chạy test và quan sát RED do dữ liệu người bị ghi đè.
- [x] Tạo bảng `advance_approval_months` (`month` hợp lệ, `rev >= 0`) và `advance_approval_entries` (`id` identity, `month`/`username` unique, khoá ngoại tháng và nhân sự, status hợp lệ hoặc null, rev dương, timestamp/lý do riêng); tạo chỉ mục theo tháng/thứ tự và trạng thái. Migration từ chối nếu bất ngờ gặp tài liệu tạm ứng cũ.
- [x] Cập nhật generator để ánh xạ `TIMESTAMPTZ` sang `Date` đúng với PostgreSQL/PGlite; sinh lại schema và kiểm `db:types --check`.

## Task 2: Repository, giao dịch và API

**Files:**
- Create: `src/data/advance-approvals.repository.ts`
- Modify: `src/data/index.ts`, `src/platform/db.ts`, `src/domain/advance/advance-approvals.ts`, `src/domain/advance/index.ts`
- Modify: `scripts/dev/sandbox-server.ts`, `test/api/advance-request-window.test.ts` và test liên quan khi cần.

- [x] Implement repository một nguồn dữ liệu, join nhất quán, upsert đúng người và tăng rev tháng trong giao dịch; dùng `store.lock` theo tháng.
- [x] Chuyển class nghiệp vụ sang repository; mỗi thao tác ghi bọc `store.transaction` để cả lối gọi trực tiếp và handler đều có khoá giao dịch; giữ nguyên các bước chuyển và lỗi.
- [x] Chuyển test race sang các class/repository thật trên hai kết nối, điều phối có thể quan sát việc chờ khoá; kiểm 6 Review Focus, cả rollback và lô không đổi.
- [x] Xoá việc đọc/ghi `advance_approvals_*` trong `settings`; cập nhật test cửa sổ xin tạm ứng và reset sandbox theo bảng mới.
- [x] Chạy test PostgreSQL thật, suite API tạm ứng/lương/period/audit liên quan, schema guard, backup/restore, typecheck và kiến trúc; ghi kết quả và review độc lập trước khi kết luận nhóm này hoàn tất. **Đã chạy: 8 test đồng thời/rollback/backup, 10 test tạm ứng, 9 test cửa sổ, 6 test tạm ứng trên phiếu/ngày lễ, 9 test snapshot, 20 test khoá kỳ, 13 test audit, 9 test schema, 11 test sandbox, typecheck và 9 test kiến trúc.**
