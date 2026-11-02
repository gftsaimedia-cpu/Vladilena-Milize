# A — Sửa luồng duyệt kỳ sau G9 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Thực hiện inline.

**Goal:** Một thao tác duyệt toàn kỳ trên Vue, xử lý đủ phiếu mọi trang và giữ đúng lý do loại phiếu lỗi.

**Architecture:** Giữ giao dịch duyệt cả kỳ hiện có. Gỡ luồng chọn/duyệt từng phiếu khỏi UI; service frontend có DTO duyệt riêng; API cũ chỉ còn để tương thích.

**Tech Stack:** Vue 3, TypeScript, Node test, PostgreSQL/PGlite, Kysely; Playwright cho Vue E2E.

**Spec:** [Thiết kế hoàn thiện](../specs/2026-11-02-remediation-design.md), phần “Hợp đồng duyệt lương”. Đọc [kế hoạch tổng](2026-11-02-remediation.md).

## Global Constraints

- Giữ `Node >=22.13`, NestJS, PostgreSQL, Kysely và Vue hiện tại.
- Không đổi công thức, schema lịch sử, quyền, cơ chế `rev` hoặc chính sách backend cảnh báo thay vì chặn.
- Không xoá bảng AI/cột `reviewed_*`; không xoá cờ thuế/bảo hiểm của khoản điền thêm.
- Tích hợp có chủ đích hai diff frontend đang có; không ghi đè chúng bằng checkout.
- Giữ API `PUT /periods/:month/payslips/decide` cho client cũ trong đợt này; UI mới không gọi API đó.

## Review Focus

- 20 phiếu, trang có 14 dòng: API duyệt cả 20; A1/A2.
- 201 phiếu lỗi: tải đủ hai trang lỗi; A2.
- Phiếu `pending` và kỳ `reviewed` từ dữ liệu cũ: hiển thị và duyệt tiếp; A1/A3.
- `rev` đổi trước lúc submit, lỗi mạng hoặc bấm hai lần: không thành công giả; A2.
- Lý do có khoảng trắng/Unicode, sai người hoặc quá 300 ký tự: truyền đúng dữ liệu và hiển thị lỗi hiện có; A2.

## A1 — Hợp đồng phiếu chưa duyệt và bỏ phụ thuộc duyệt lô ở UI

**Files:**

- Modify: `src/data/payroll.repository.ts`, `src/domain/period/periods.ts`.
- Modify: `web/src/builders/admin-payroll/payroll.ts`, `web/src/services/admin-payroll.ts`, `web/src/views/admin/payroll/PayrollView.vue`, `web/src/views/admin/payroll/scenarios.ts`, `web/src/views/admin/payroll/parts/PayrollDialogs.vue`, `web/src/views/admin/payroll/parts/PayrollTable.vue`.
- Delete sau khi kiểm hết import: `web/src/views/admin/payroll/parts/ApproveBatchDialog.vue`, `SelectionBanner.vue` trong cùng thư mục.
- Create: `test/api/period-unapproved-filter.test.ts`, `test/unit/web-payroll-workflow.test.ts`, `test/helpers/web-module.ts`.

**Interfaces:** thêm giá trị lọc `unapproved` vào `PayslipFilter.status`; SQL lọc `draft|pending`, không đổi giá trị lưu DB. Builder xuất số `unapproved`; Vue giữ nút duyệt kỳ và xem phiếu, bỏ chọn/duyệt/trả lại từng phiếu. `web-module.ts` bundle module TS bằng esbuild hiện có, resolve alias web, inject API mock theo đường dẫn tuyệt đối; không so sánh chuỗi implementation.

- [ ] Viết test đỏ: seed `draft`, `pending`, `approved`, `error`; lọc `unapproved` chỉ trả hai trạng thái đầu với total/phân trang đúng. Test builder giữ tổng toàn kỳ khi danh sách đang lọc/trang 2.
- [ ] Chạy `node scripts/dev/ts.cjs --test test/api/period-unapproved-filter.test.ts test/unit/web-payroll-workflow.test.ts`; xác nhận fail đúng hợp đồng chưa có.
- [ ] Thêm bộ lọc vào repository và nối service/builder; gỡ selection, export `approveBatch`/`approveOne`/`returnPayslips` nếu đã hết caller trong web. Tên trạng thái kịch bản đổi sang nghĩa cả kỳ, không giữ “đã duyệt 50” làm điều kiện nghiệp vụ.
- [ ] Chạy lại hai test, `npm run typecheck:web`, `npm --prefix web run build`; kỳ `calculated` có phiếu nháp luôn có nút duyệt kỳ.
- [ ] Commit đúng các file task: `fix(payroll): use whole-period approval in the web workflow`.

## A2 — Dialog tải đủ lỗi, gửi lý do và phiên bản đã hiển thị

**Files:**

- Create: `web/src/services/payroll-approval.ts` (DTO và thao tác duyệt), `test/unit/web-payroll-approval.test.ts`.
- Modify: `web/src/services/admin-payroll.ts`, `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue`, `PayrollDialogs.vue` cùng thư mục.
- Modify/Test: `test/api/period-lifecycle.test.ts`, `test/api/period-flow-warns.test.ts`.
- Create: `web/playwright.config.ts`, `web/test/e2e/payroll-period-approval.spec.ts`; sửa `web/package.json`, `web/package-lock.json` để có `@playwright/test` và script `test:e2e`.
- Create: `scripts/dev/seed-payroll-e2e.ts` dùng DB thử mới và API thật; không đọc/ghi DB mặc định của app.

**Interfaces:**

```ts
type ExcludedPayslip = { username: string; reason: string };
type PeriodApprovalInput = { rev: number; excludeErrors: ExcludedPayslip[] };
// errors: Array<{ username: string; name: string; shortProblem: string }>
// getPeriodApprovalSummary(month: string): Promise<PeriodApprovalSummary>
// approvePeriod(month: string, input: PeriodApprovalInput): Promise<PeriodStepResult>
```

Các DTO phản hồi khai báo từ payload thật của period, không dùng `any`. Module mới nhận HTTP qua `services/http.ts`; không cache rev độc lập với summary. Re-export hai hàm từ `admin-payroll.ts` nếu caller cũ cần.

- [ ] Viết test đỏ service: phiếu lỗi ở trang 2 vẫn có trong summary; 201 lỗi tải đủ, không trùng. Request approve mang `rev:7` và đúng `excludeErrors`, không bị thay thành rev mới bằng một GET ngầm. API `409` được trả nguyên cho UI.
- [ ] Viết API test: duyệt kỳ có 20 phiếu nháp, một phiếu lỗi được loại kèm lý do Unicode; kiểm đủ phiếu hợp lệ approved, phiếu lỗi giữ note, audit và run final nhất quán. Lỗi giữa giao dịch rollback cả kỳ.
- [ ] Chạy test mới để ghi RED; dùng clock cố định của helper dự án, không đặt assert thời gian sát mép.
- [ ] Viết service tải phiếu lỗi bằng `status=error&pageSize=200&page=n` đến đủ total; dialog dùng summary thay `data.failed` của trang, không chặn vì có phiếu nháp. Lý do trim 10–300 ký tự; chặn submit lặp khi busy, lỗi giữ dữ liệu nhập, `409` yêu cầu tải lại.
- [ ] Tạo E2E thật: đăng nhập, tính kỳ 20 phiếu khi bảng đang lọc/trang 2, duyệt trực tiếp; lỗi ngoài trang hiện tại vẫn nhập/lưu lý do; rev thay đổi báo lỗi. Assert không có request `/payslips/decide` hoặc AI từ Vue.
- [ ] Chạy các test unit/API liên quan, `npm --prefix web run test:e2e`, typecheck và build web. Seed E2E phải từ chối DB không rỗng và dọn tài nguyên thử của chính nó.
- [ ] Commit: `fix(payroll): submit complete period approval details and add Vue regressions`.

## A3 — Gỡ mã AI còn hoạt động, kiểm tương thích dữ liệu cũ

**Files:** `src/platform/db.ts`, `src/domain/period/periods.ts`, `src/data/payroll.repository.ts`, `src/platform/warnings.ts`, `src/modules/periods/periods.controller.ts`, `src/platform/authz.ts` (chỉ sửa nếu phát hiện route AI còn đăng ký).

**Test:** tạo `test/api/period-legacy-compatibility.test.ts`; sửa test kỳ/phiếu hiện có nếu thay kỳ vọng AI đã bỏ. Không xoá test chỉ vì nó phát hiện hành vi cũ chưa dọn.

**Interfaces:** `reviewed`/`pending`/`flags_json` là dữ liệu cũ vẫn đọc được; `decidePayslips` cũ giữ HTTP, rev và số tiền nhưng không phát `PAYSLIP_FLAGGED`. Không có route thực thi AI được đăng ký; bảng lịch sử không đổi.

- [ ] Viết test đỏ: kỳ `reviewed` duyệt tiếp; phiếu `pending` và phiếu có `flags_json` duyệt cả kỳ và qua API cũ mà không có mã cảnh báo AI; bảng AI trước/sau không bị xoá.
- [ ] Viết test manifest route/quyền: không còn route AI hoặc capability `ai.review.*`; gọi URL cũ không được 2xx và không ghi dữ liệu, chấp nhận 403/404 theo cổng quyền hiện tại.
- [ ] Chạy RED, bỏ nhánh thực thi AI/cờ AI đang sống; chỉ giữ ánh xạ đọc lịch sử. Giữ nguyên xác nhận cờ thuế/bảo hiểm của `pay_entries`.
- [ ] Chạy test tương thích, toàn bộ test period và E2E A2; rà không có request AI từ frontend.
- [ ] Commit: `fix(payroll): remove remaining AI execution while preserving historical records`.

**Cổng A:** full suite không thêm lỗi so với baseline có giải thích, ba lỗi UI audit có hồi quy; cập nhật `PROGRAM.md` theo kết quả thật. Không dùng riêng test builder để tuyên bố dialog/trình duyệt đạt.
