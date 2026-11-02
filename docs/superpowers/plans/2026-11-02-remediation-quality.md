# B — Khôi phục cổng kiểm tra và spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Thực hiện inline.

**Goal:** Công cụ kiểm tham số chạy được sau refactor, spec phản ánh G9/PostgreSQL và baseline kiểm chứng có thể lặp lại.

**Architecture:** Sửa nguồn dữ liệu của bộ trích tham số, không nới checker để vượt lỗi. Reference được sinh từ code; spec viết tay mô tả hợp đồng còn sống. Ghi giới hạn môi trường riêng với lỗi ứng dụng.

**Tech Stack:** TypeScript, Node test, registry JSON, Prettier, PostgreSQL/PGlite, Vue E2E từ A2.

**Spec:** [Thiết kế hoàn thiện](../specs/2026-11-02-remediation-design.md). Thực hiện sau kế hoạch A; đọc [kế hoạch tổng](2026-11-02-remediation.md).

## Global Constraints

- Giữ `Node >=22.13`, NestJS, PostgreSQL, Kysely và Vue hiện tại.
- Không đổi mặc định tiền lương, không xoá khoá trong `keys.lock.json` hay đánh dấu tất cả nguồn lỗi là ignore.
- Không đổi chính sách đang chờ chủ dự án; `previewToken` còn TODO được báo riêng, không tự triển khai trong lượt sửa này.
- Không coi spec cũ là nguồn để khôi phục AI/SQLite đã gỡ. Mâu thuẫn công thức thật phải được báo trước khi đổi nội dung nghiệp vụ.
- Không ghi token, `.env` hoặc chuỗi kết nối có mật khẩu vào báo cáo.

## Review Focus

- Regex nguồn bị di chuyển, đổi số, mất file: checker phải bắt sai lệch; B1.
- Mục trích corrections không còn caller: ghi rõ ngừng dùng thay vì bịa nguồn mới; B1.
- Từ “flags” có thể là cờ thuế/bảo hiểm hợp lệ: không xoá nhầm khi dọn AI; B2.
- Reference đúng đường dẫn nhưng nghiệp vụ viết tay sai: rà hợp đồng với route thật; B2.
- Windows/WSL, localhost bị chặn, PostgreSQL chưa sẵn: kết quả là chưa kiểm được, không phải pass; B3.

## B1 — Sửa nguồn trích tham số sau khi server tách controller

**Files:** `scripts/params/key-map.ts`, `scripts/params/extract-defaults.ts`, `scripts/params/wired.ts`, `scripts/params/check.ts`; chỉ sửa `scripts/params/hand-defaults.json`, `src/params/registry.data.json`, file dẫn xuất khi có đối chiếu từng khoá. Tham chiếu `src/modules/approvals/approvals.controller.ts`, `src/engine/payroll-params.ts` và caller thực của từng khoá corrections.

**Test:** tạo `test/tools/params-source-map.test.ts`; dùng lại test tham số hiện có.

**Interfaces:** `extract()` tiếp tục trả đúng shape hiện tại; sources không trỏ server entry nếu giá trị thuộc controller. Khoá approvals default/max vẫn 200/500. Với corrections: tra từng khoá ở runtime; nếu không còn caller thì giữ giá trị khoá lịch sử, đánh dấu ngừng dùng trong registry và bỏ nguồn regex giả, không tạo endpoint chỉ để thoả checker.

- [ ] Viết test đỏ với cây nguồn fixture: nguồn cũ ở server mất, nguồn thật ở approvals controller; default/max vẫn 200/500. Nguồn thiếu phải lỗi rõ file và khoá, không tự fallback.
- [ ] Thêm assertion mọi `REGEX_SOURCES.file` tồn tại và mọi pattern khớp chính nguồn đã chỉ định; khoá corrections không caller không được báo `wired:true`.
- [ ] Chạy `node scripts/dev/ts.cjs --test test/tools/params-source-map.test.ts`, xác nhận RED. Chạy `npm run params:check` ghi lỗi đầu tiên hiện tại.
- [ ] Sửa ánh xạ và thông báo `.js` cũ; lần lượt xử lý mọi lỗi tiếp theo bằng nguồn thật. Nếu chuyển hằng sang đọc DEFAULTS, cập nhật controller và extractor trong cùng commit, giữ nguyên giá trị và hành vi. Không cập nhật lock chỉ để che drift.
- [ ] Chạy test mới, `npm run params:check`, typecheck và test approvals/settings. Đối chiếu mặc định lương không đổi; rà diff các file sinh tự động.
- [ ] Commit: `fix(params): restore source extraction after Nest controller migration`.

## B2 — Viết lại phần spec lệch AI/SQLite và thêm kiểm hợp đồng

**Files:** `spec/overview.md`, `spec/platform.md`, `spec/payroll-period.md`, `spec/requests.md`, `spec/data-fixtures.md`, `spec/README.md`; `spec/reference/*` chỉ qua generator. Sửa `PROGRAM.md` theo trạng thái mới, không xoá lịch sử.

**Test:** tạo `test/unit/spec-live-contracts.test.ts`; sửa `test/unit/spec-refs.test.ts`, `test/unit/spec-reference.test.ts` khi cần kiểm bổ sung.

**Interfaces:** vòng đời mới và API `unapproved` theo A; lịch sử `reviewed`/bảng AI được mô tả rõ là tương thích đọc. PostgreSQL dùng migration chuẩn, sandbox reset qua cơ chế PostgreSQL thật. Không còn hướng dẫn thực thi AI/`sqlite_master` như chức năng hiện hành.

- [ ] Viết test đỏ kiểm phần “API hiện hành/vòng đời” không chứa route thực thi AI hoặc `AI_NOT_RUN`; test phải bỏ qua đoạn lịch sử được đánh nhãn, không quét cấm mọi chuỗi `ai`/`reviewed`.
- [ ] Dựng ma trận route/quyền/bước kỳ từ `authz.ts`, controller, `periods.ts`, repository và test A; chỉ sửa mô tả nghiệp vụ khi có bằng chứng tương ứng.
- [ ] Viết lại đoạn lệch, loại dấu `(đã bỏ)` khỏi danh sách API hiện hành, tách ghi chú lịch sử; ghi rõ `decide` cũ chỉ còn tương thích và UI duyệt cả kỳ.
- [ ] Chạy `npm run spec:gen`, `npm run spec:check`, `node scripts/dev/ts.cjs --test test/unit/spec-live-contracts.test.ts test/unit/spec-refs.test.ts test/unit/spec-reference.test.ts` và format. Không dùng kết quả reference để tuyên bố mọi công thức viết tay đã được kiểm.
- [ ] Commit: `docs: align live specifications with PostgreSQL and the G9 payroll workflow`.

## B3 — Baseline có thể lặp lại và kiểm môi trường trước full suite

**Files:** tạo `scripts/dev/check-verification-env.ts`, `docs/superpowers/verification/2026-11-02-baseline.md`; sửa `package.json` thêm `verify:env`, `spec/README.md` ghi cách chạy. Log tạm không commit; biên bản chỉ chứa lệnh/kết quả đã lọc thông tin nhạy cảm.

**Test:** tạo `test/tools/verification-env.test.ts` với dependency injection cho platform, binary resolver, bind probe và URL parser; không kiểm bằng cách giả lập nguyên implementation.

**Interfaces:** `verify:env` chỉ đọc cấu hình, thử bind loopback rồi đóng, kiểm module/binary đúng platform, báo khả năng chạy PGlite/PG/browser; exit khác 0 khi thiếu điều kiện yêu cầu. Không tự cài, mở DB production hoặc in URL có credentials.

- [ ] Viết test đỏ: Windows binary trên Linux được báo đúng; bind `EPERM` là blocker; mật khẩu URL luôn bị che; probe thành công phải đóng listener.
- [ ] Viết preflight có kiểu; hướng dẫn `npm ci` riêng cho root/web trên đúng OS, cài browser Playwright của A2 khi thực thi. Không khuyên tái sử dụng `node_modules` Windows trên WSL.
- [ ] Chạy test preflight; chạy `npm run verify:env` và các gate khả dụng. Ghi baseline toàn bộ test nếu môi trường cho phép; nếu không, giữ ô full suite trống, ghi phần đã chạy.
- [ ] Thống kê TODO/skip theo output thật, phân biệt chính sách chưa chốt, `previewToken`, thiếu môi trường và lỗi triển khai. Không tăng skip/timeout hoặc sửa expected để che test đỏ chưa điều tra.
- [ ] Commit: `chore: document reproducible verification prerequisites and baseline`.

**Cổng B:** checker tham số và spec đạt trên môi trường hợp lệ; baseline được dùng để đối chiếu trong C. Không mở C bằng một baseline đỏ chưa phân loại nguyên nhân.
